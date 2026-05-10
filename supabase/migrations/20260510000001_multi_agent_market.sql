-- =============================================================================
-- Multi-agent paper market schema
-- =============================================================================
-- Adds the persistence backbone for the A2A orchestration layer:
--   * paper_orders          - the order book itself, append + status updates
--   * paper_fills           - immutable executed fills (taker + maker rows)
--   * agent_sessions        - long-lived market-event subscriptions
--   * a2a_tasks             - persisted A2A Task snapshots (for tasks/get)
--   * a2a_push_configs      - per-task push-notification webhook targets
--   * langgraph_checkpoints - LangGraph BaseCheckpointSaver storage
--
-- All owner-scoped tables get Row-Level Security keyed on bots.owner_user_id.
-- The HMAC-authenticated A2A route uses the service-role key server-side
-- because the bot has already been authenticated by signature; user-scoped
-- dashboard reads are scoped via RLS.
-- =============================================================================

CREATE TABLE IF NOT EXISTS paper_orders (
  order_id              text PRIMARY KEY,
  bot_id                text NOT NULL REFERENCES bots(bot_id) ON DELETE CASCADE,
  task_id               text NOT NULL,
  symbol                text NOT NULL,
  side                  text NOT NULL CHECK (side IN ('buy','sell')),
  order_type            text NOT NULL CHECK (order_type IN ('limit','market')),
  limit_price           numeric,
  quantity              numeric NOT NULL CHECK (quantity > 0),
  remaining_quantity    numeric NOT NULL CHECK (remaining_quantity >= 0),
  status                text NOT NULL CHECK (status IN ('open','partially_filled','filled','canceled','rejected')),
  placed_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS paper_orders_book_idx
  ON paper_orders (symbol, side, status, limit_price, placed_at)
  WHERE status IN ('open','partially_filled');

CREATE INDEX IF NOT EXISTS paper_orders_bot_idx
  ON paper_orders (bot_id, placed_at DESC);

CREATE INDEX IF NOT EXISTS paper_orders_task_idx
  ON paper_orders (task_id);

CREATE TABLE IF NOT EXISTS paper_fills (
  fill_id           text PRIMARY KEY,
  symbol            text NOT NULL,
  taker_order_id    text NOT NULL REFERENCES paper_orders(order_id) ON DELETE CASCADE,
  taker_bot_id      text NOT NULL,
  taker_side        text NOT NULL CHECK (taker_side IN ('buy','sell')),
  maker_order_id    text NOT NULL REFERENCES paper_orders(order_id) ON DELETE CASCADE,
  maker_bot_id      text NOT NULL,
  price             numeric NOT NULL CHECK (price > 0),
  quantity          numeric NOT NULL CHECK (quantity > 0),
  filled_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS paper_fills_symbol_time_idx
  ON paper_fills (symbol, filled_at DESC);

CREATE INDEX IF NOT EXISTS paper_fills_taker_idx
  ON paper_fills (taker_bot_id, filled_at DESC);

CREATE INDEX IF NOT EXISTS paper_fills_maker_idx
  ON paper_fills (maker_bot_id, filled_at DESC);

CREATE TABLE IF NOT EXISTS agent_sessions (
  session_id    text PRIMARY KEY,
  bot_id        text NOT NULL REFERENCES bots(bot_id) ON DELETE CASCADE,
  opened_at     timestamptz NOT NULL DEFAULT now(),
  closed_at     timestamptz,
  user_agent    text
);

CREATE INDEX IF NOT EXISTS agent_sessions_bot_idx
  ON agent_sessions (bot_id, opened_at DESC);

CREATE TABLE IF NOT EXISTS a2a_tasks (
  task_id       text PRIMARY KEY,
  context_id    text NOT NULL,
  bot_id        text NOT NULL REFERENCES bots(bot_id) ON DELETE CASCADE,
  status_state  text NOT NULL,
  artifacts     jsonb NOT NULL DEFAULT '[]'::jsonb,
  history       jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS a2a_tasks_bot_idx
  ON a2a_tasks (bot_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS a2a_tasks_context_idx
  ON a2a_tasks (context_id);

CREATE TABLE IF NOT EXISTS a2a_push_configs (
  config_id        text PRIMARY KEY,
  task_id          text NOT NULL REFERENCES a2a_tasks(task_id) ON DELETE CASCADE,
  url              text NOT NULL,
  token            text,
  signing_secret   text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS a2a_push_configs_task_idx
  ON a2a_push_configs (task_id);

-- LangGraph BaseCheckpointSaver storage. The serialized checkpoint blob is
-- opaque to PaperPilot; we just key it by thread_id (== A2A taskId) and a
-- monotonically-increasing checkpoint_id.
CREATE TABLE IF NOT EXISTS langgraph_checkpoints (
  thread_id         text NOT NULL,
  checkpoint_id     text NOT NULL,
  parent_id         text,
  channel_values    bytea,
  channel_versions  jsonb,
  versions_seen     jsonb,
  pending_sends     jsonb,
  metadata          jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, checkpoint_id)
);

CREATE INDEX IF NOT EXISTS langgraph_checkpoints_thread_idx
  ON langgraph_checkpoints (thread_id, created_at DESC);

-- =============================================================================
-- Row-Level Security
-- =============================================================================

ALTER TABLE paper_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_fills ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE a2a_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE a2a_push_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS paper_orders_owner_select ON paper_orders;
CREATE POLICY paper_orders_owner_select ON paper_orders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bots b
      WHERE b.bot_id = paper_orders.bot_id
        AND b.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS paper_fills_owner_select ON paper_fills;
CREATE POLICY paper_fills_owner_select ON paper_fills
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bots b
      WHERE (b.bot_id = paper_fills.taker_bot_id OR b.bot_id = paper_fills.maker_bot_id)
        AND b.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS agent_sessions_owner_select ON agent_sessions;
CREATE POLICY agent_sessions_owner_select ON agent_sessions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bots b
      WHERE b.bot_id = agent_sessions.bot_id
        AND b.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS a2a_tasks_owner_select ON a2a_tasks;
CREATE POLICY a2a_tasks_owner_select ON a2a_tasks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bots b
      WHERE b.bot_id = a2a_tasks.bot_id
        AND b.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS a2a_push_configs_owner_select ON a2a_push_configs;
CREATE POLICY a2a_push_configs_owner_select ON a2a_push_configs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM a2a_tasks t
      JOIN bots b ON b.bot_id = t.bot_id
      WHERE t.task_id = a2a_push_configs.task_id
        AND b.owner_user_id = auth.uid()
    )
  );

-- =============================================================================
-- Matching helper - takes an advisory lock keyed on the symbol so concurrent
-- placements never race. The application layer can call this in a transaction
-- around its read-match-mutate cycle to mirror the in-memory book's semantics.
-- =============================================================================

CREATE OR REPLACE FUNCTION acquire_book_lock(p_symbol text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('book:' || p_symbol));
END;
$$;
