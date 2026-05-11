-- =============================================================================
-- Bots initial schema
-- =============================================================================
-- Defines the `bots` table referenced by every downstream migration. Each row
-- is one registered trading agent owned by one Supabase Auth user. The HMAC
-- secret used to sign POST /api/bots/trades and POST /api/a2a payloads is
-- stored ONLY as `sha256(secret)` so a database leak cannot impersonate the
-- agent. The TradingView shared secret is a SEPARATE credential at a lower
-- trust tier - Pine alerts can't compute HMAC, so we accept the inferior
-- per-bot shared-secret scheme for the TradingView ingestion path and stamp
-- those trades trust_tier='shared_secret' in the audit log.
-- =============================================================================

CREATE TABLE IF NOT EXISTS bots (
  bot_id                       text PRIMARY KEY,
  owner_user_id                uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bot_name                     text NOT NULL,
  strategy_type                text NOT NULL CHECK (strategy_type IN (
                                  'trend_following', 'mean_reversion', 'breakout',
                                  'momentum', 'range_trading', 'custom'
                                )),
  max_risk_per_trade_pct       numeric NOT NULL CHECK (max_risk_per_trade_pct > 0 AND max_risk_per_trade_pct <= 50),
  max_trades_per_day           integer NOT NULL CHECK (max_trades_per_day > 0 AND max_trades_per_day <= 1000),
  max_drawdown_pct             numeric NOT NULL CHECK (max_drawdown_pct > 0 AND max_drawdown_pct <= 100),
  bot_type                     text NOT NULL CHECK (bot_type IN ('rule_based', 'ai_agent', 'hybrid')),
  -- HMAC secret stored only as its sha256 hash. The plaintext is shown to the
  -- bot owner exactly once at registration and never persisted.
  secret_hash                  text NOT NULL,
  -- TradingView webhook shared secret. Stored in plaintext (lower trust tier)
  -- because Pine alerts cannot compute HMAC and the bot owner needs to retrieve
  -- it later to paste into TradingView's alert message body. Recoverable from
  -- the integrations page only after the owner re-authenticates.
  tradingview_shared_secret    text NOT NULL,
  created_at                   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bots_owner_idx
  ON bots (owner_user_id, created_at DESC);

ALTER TABLE bots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bots_owner_select ON bots;
CREATE POLICY bots_owner_select ON bots
  FOR SELECT
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS bots_owner_insert ON bots;
CREATE POLICY bots_owner_insert ON bots
  FOR INSERT
  WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS bots_owner_update ON bots;
CREATE POLICY bots_owner_update ON bots
  FOR UPDATE
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS bots_owner_delete ON bots;
CREATE POLICY bots_owner_delete ON bots
  FOR DELETE
  USING (owner_user_id = auth.uid());
