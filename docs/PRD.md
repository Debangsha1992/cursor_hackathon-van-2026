# PaperPilot AI — Product Requirements Document

> Status: Draft — synthesized from grilling session on 2026-05-10, revised after the corpus-and-retrieval pivot. Q7 (Nia indexing scope) is now resolved; see "Knowledge corpus and Nia retrieval" in Implementation Decisions.

> Disclaimer (applies to the product itself, not this document): PaperPilot AI is for paper-trading education and simulation only. It does not provide financial advice and does not execute real-money trades.

---

## Problem Statement

Builders of AI trading agents have no honest way to evaluate whether their agent is *behaviorally* ready to be entrusted with capital. Existing tools answer the wrong question: they measure whether a strategy made money on a backtest. They do not measure whether the agent obeyed its own configured risk rules, explained its decisions, avoided overtrading, or behaved consistently with its declared strategy. The result is that agents that perform well on backtests get promoted to production while quietly violating risk limits, ignoring stop-loss rules, or compounding overconfidence into drawdowns. Bot-builders are forced to invent ad-hoc spreadsheets and one-off scripts to audit their own agents, and there is no shared vocabulary, scoring system, or persistent audit log they can point a capital partner or compliance reviewer at.

## Solution

PaperPilot AI is a behavior-audit and discipline-coach environment for AI trading agents. An agent is registered with PaperPilot, given an HMAC secret, and configured with explicit risk policy (max risk per trade, max trades per day, declared strategy type). The agent then submits paper trades — directly via API, or indirectly via TradingView Pine alerts — and PaperPilot returns a deterministic compliance score (0–100), a list of explicit violation codes against the agent's declared policy, a *citation-grounded* prose explanation produced by a generic large language model whose context is constructed at request time by retrieving relevant excerpts from a curated corpus of finance literature (López de Prado's *Advances in Financial Machine Learning*, Kakushadze & Serur's *151 Trading Strategies*, and any further books added to the corpus). A repeating-violation memory loop deducts further points when an agent commits the same violation 3+ times in its last 20 trades. Bot owners see a dashboard of score over time, top violation codes, and trade-by-trade audit reports with inline citations. A free tier permits 5 AI-narrated audits per month; a $9/month Pro tier (via AllScale) raises the limit to 100. The product never authorizes live deployment, never executes real-money trades, and never claims an agent is "ready for capital." Its only job is to grade behavior against the rules the agent claims to follow, and to ground every recommendation in canonical published literature rather than LLM common knowledge.

## User Stories

### Bot owner — registration & onboarding

1. As a bot owner, I want to sign in with a magic link, so that I can start auditing my agent without creating a password.
2. As a bot owner, I want to register my trading agent and provide its name, declared strategy type, max risk per trade, max trades per day, and max allowed drawdown, so that PaperPilot has the policy it will audit against.
3. As a bot owner, I want to receive a one-time HMAC secret on registration, so that my agent can sign trade submissions.
4. As a bot owner, I want PaperPilot to never display my secret again after registration, so that the secret cannot be casually leaked from the dashboard.
5. As a bot owner, I want to see my registered bot's policy in the dashboard, so that I can verify the audit baseline matches my intent.

### Bot — trade submission (HMAC-authenticated)

6. As a registered bot, I want to submit a paper trade via `POST /api/bots/trades` with `X-PaperPilot-Bot-Id`, `X-PaperPilot-Timestamp`, and `X-PaperPilot-Signature` headers, so that the request is authenticated and replay-protected.
7. As a registered bot, I want my trade rejected with `401 Unauthorized` when my signature is wrong, my timestamp is more than 300 seconds off, or my bot id is unknown, so that bad credentials never produce audit records.
8. As a registered bot, I want my trade rejected with `400 Bad Request` when the JSON is malformed or required fields (`symbol`, `side`, `entryPrice`, `quantity`) are missing or out of physical range, so that nonsense never enters the audit log.
9. As a registered bot, I want my trade *accepted* with violations and a low score when I omit `signalReason`, `confidenceScore`, or `stopLoss`, so that my owner can see the bad behavior in the dashboard rather than have it silently dropped.
10. As a registered bot, I want my trade *accepted* with a `BOT_STRATEGY_MISMATCH` violation when my submitted `strategyType` does not match my registered strategy (and my registered strategy is not "custom"), so that my owner sees the inconsistency.
11. As a registered bot, I want a synchronous response containing my compliance score, violation codes, and prose explanation within 10 seconds, so that I can include the feedback in my own logs.

### Bot — trade submission (TradingView shared-secret bridge)

12. As a bot owner using TradingView Pine alerts, I want to configure a webhook URL with a shared secret that submits trades on my agent's behalf, so that I can audit Pine-driven agents without modifying their code.
13. As a TradingView-driven trade, I want to be persisted with `source='tradingview_webhook'` and `trust_tier='shared_secret'`, so that the dashboard distinguishes lower-trust ingestion from HMAC-signed direct submissions.
14. As a bot owner, I want TradingView-bridged trades audited by the same rule engine and same scoring as direct API submissions, so that the audit is consistent regardless of ingestion path.

### Bot owner — viewing audit results

15. As a bot owner, I want to view the most recent audit report for my bot, including the deterministic compliance score, every triggered violation code with severity and message, and the LLM-generated prose explanation, so that I understand exactly why my agent's score is what it is.
16. As a bot owner, I want each report to clearly indicate when the LLM prose came from a fallback template (because the LLM was unavailable or timed out), so that I can trust the system did not silently fabricate explanations.
16a. As a bot owner, I want every prose recommendation in the coach report to carry an inline citation (book title, author, and page or section) when it is derived from the indexed corpus, so that I can independently verify the advice and trust that the system is not hallucinating finance lore.
16b. As a bot owner, I want the coach report to omit citations rather than invent them when no relevant excerpt was retrieved, so that the absence of a citation is itself a meaningful signal.
17. As a bot owner, I want my dashboard to show my bot's score sparkline over the last 20 trades, so that I can see whether discipline is improving or degrading.
18. As a bot owner, I want my dashboard to show the top three recurring violation codes, so that I know which patterns to fix first.
19. As a bot owner, I want the dashboard to surface the history-modifier deduction with the codes that triggered it, so that I understand why a single trade can have a worse score than its violations alone would suggest.
20. As a bot owner, I want the score band label (Exemplary / Solid / Notable gaps / Pattern of risk failures / Severe) displayed alongside the numeric score, so that I get an at-a-glance read.
21. As a bot owner, I want the score band's narrative to never recommend live deployment, so that the system does not implicitly authorize what it explicitly forbids.

### Backtester (also demo seeder)

22. As a bot owner, I want to run a moving-average crossover backtest against deterministic sample BTC candle data, so that I can see how a candidate strategy would score against PaperPilot's rule engine over many trades.
23. As a bot owner, I want backtest output to include total trades, win rate, average reward-to-risk, max drawdown, full violation list, and aggregate compliance score, so that I can compare strategies on behavior quality, not just P/L.
24. As a demo presenter, I want a "seed demo data" command that runs the backtester against the demo bot and persists the resulting trades, violations, and coach reports to Supabase, so that the dashboard renders alive on first paint at the demo.

### Free / Pro usage and billing

25. As a free-tier user, I want my first 5 AI-narrated audits per calendar month to succeed, so that I can evaluate the product without paying.
26. As a free-tier user, I want my 6th audit attempt in a month to return `402 Payment Required` with an upgrade URL, so that the paywall is unmistakable.
27. As a free-tier user, I want clicking the upgrade modal to take me to AllScale's hosted checkout, so that I never see another payment provider's UI.
28. As an upgrading user, I want my Pro tier to activate as soon as AllScale's webhook reports the checkout completed, so that I do not need to refresh or wait for a polling interval.
29. As an upgrading user, I want my current month's audit counter to be reset on Pro activation, so that I immediately have access to my full Pro quota.
30. As a Pro user, I want my limit raised to 100 AI-narrated audits per month, so that I can audit production-volume agents.
31. As any user, I want the dashboard to display my current tier, my used/total audits this month, and a clear upgrade or manage-subscription link, so that I always know my entitlement state.

### Safety and trust

32. As a bot owner, I want the system to refuse to claim my bot is "ready" for live trading regardless of score, so that PaperPilot cannot be misread as a green-light to deploy.
33. As a bot owner, I want the LLM to never inflate a compliance score, so that the score I see is reproducible and code-defensible.
34. As a bot owner, I want every trade payload, every violation, and every coach report stored in a Postgres audit log, so that I can produce a paper-trail for any conversation with a capital partner.
35. As a bot owner, I want the system to reject obvious replay attacks via the timestamp-skew window, so that captured payloads cannot be reused to inflate audit counts.
36. As a bot owner, I want my secret stored only as `sha256(secret)` in the database, so that a database leak does not expose the ability to impersonate my agent.

### Demo experience (judge-facing)

37. As a demo presenter, I want the dashboard to load on a pre-seeded `polyclaw-demo` bot with ~30–50 historical audits, so that the page is alive on first paint.
38. As a demo presenter, I want a single "Submit sample trade" button that fires an HMAC-signed bad-trade payload server-side, so that the live audit is reproducible and does not rely on form input.
39. As a demo presenter, I want the paywall flow demonstrable end-to-end with an AllScale test card in under 60 seconds, so that the live payment beat lands.
40. As a judge, I want to be able to read a one-paragraph closing on the dashboard that explicitly disclaims live-trading authorization, so that the product's safety position is unambiguous.

## Implementation Decisions

### Architectural framing

PaperPilot AI is positioned as a **behavior-audit and discipline-coach** environment, not a "training gym" and not a "paper-trading P/L journal." The product does not retrain agents, does not update agent weights, does not emit feedback into agent memory beyond what the agent voluntarily reads from PaperPilot's audit API. The only "memory" claim is a SQL query against the violation log of the agent's last 20 trades — surfaced as a deduction modifier, never as agent state.

### Audience

**Bots-only MVP.** Human-trader features (manual journal, mental-state tracking, FOMO/revenge entry detection) are documented as future work. The `human_profiles` table is dropped from the initial migration. The `humanRuleEngine` and `humanCoach` modules are not built. The `/journal` page is not built.

### Compliance scoring rubric (deterministic)

The compliance score is a deterministic 0–100 computed from rule-engine violations. The LLM does not influence the numeric score under any circumstance. The rubric has five categories totalling 100 points, plus two negative modifiers:

| Category | Max | Detection rules |
|---|---|---|
| Risk Policy Compliance | 30 | Stop loss present (12); implied risk ≤ profile.maxRiskPerTradePercent (10); R:R ≥ 1.5 when TP set (8) |
| Strategy Consistency | 20 | trade.strategyType matches profile.strategyType, or profile is "custom" (12); signalReason aligns with declared strategy, LLM-checked (8) |
| Decision Quality | 20 | signalReason length ≥ 30 chars and non-template (8); confidenceScore in [0,1] (6); confidenceScore < 0.9 OR justified by signal strength (6) |
| Frequency Discipline | 15 | botTradesToday ≤ profile.maxTradesPerDay (15); exceeded by 1–2 (7); exceeded by 3+ (0) |
| Calibration & Regime Fit | 15 | marketRegime declared (5); strategy appropriate for declared regime, LLM-checked (5); rolling confidence vs realized hit-rate within 0.2 (5) |
| History Modifier | up to −10 | Same violation code recurred 3+ times in last 20 trades |

Bands: 90–100 Exemplary · 75–89 Solid · 60–74 Notable gaps · 40–59 Pattern of risk failures · 0–39 Severe. **No band ever reads "ready for live."**

### LLM strategy

**Architecture — multi-agent, two-tier:**

The system uses two distinct LLMs in well-defined roles. They are not interchangeable.

| Role | Service | Endpoint | Auth env vars | Talks to |
|---|---|---|---|---|
| Generic conversational layer | **Clōd** (OpenAI-compatible gateway brokering 30+ models) | `https://api.clod.io/v1/chat/completions` | `CLOD_API_BASE`, `CLOD_API_KEY`, `CLOD_MODEL` (default `"GPT 4o"`) | The user (via `/api/chat`) and the strategy-interrogator counterparty bot (via `/api/agents/interrogate`) |
| Finance / pinescript expert | Self-hosted vLLM serving `DragonLLM/Qwen-Open-Finance-R-8B` on Lightning AI | `https://8000-01kra09xhrmykak0km0x5hhyc5.cloudspaces.litng.ai/v1/chat/completions` | `OPENAI_API_BASE`, `OPENAI_API_KEY`, `OPENAI_MODEL` | Only Clōd — never the user directly |

**Tool-use bridge:** Clōd is given exactly one function tool, `consult_finance_expert(mode, pineCode?, description?, question?, declaredStrategyType?, focusedQuestion?, context?)`, where `mode ∈ {"pinescript","strategy","question"}`. Whenever a user (or counterparty bot) question touches Pine Script v5 analysis, strategy evaluation, or substantive trading-finance, Clōd is instructed to call this tool, receive a sanitised specialist analysis from the vLLM, and re-narrate it in plain English. The user never sees the vLLM's raw output.

**Code locations:**
- `src/lib/llm/clodClient.ts` — OpenAI-compatible Clōd client with first-class tool-call support.
- `src/lib/llm/financeExpert.ts` — Semantic façade over the Lightning AI vLLM (`analyzePineScript`, `evaluateStrategy`, `answerFinanceQuestion`).
- `src/lib/llm/multiAgentChat.ts` — The Clōd↔expert orchestrator. Bounded tool-round loop, deterministic fallback when Clōd errors or hangs.
- `src/app/api/chat/route.ts` — User-facing entry point.
- `src/app/api/agents/interrogate/route.ts` — Wires the multi-agent stack as the `LlmChat` driving the bot-interrogation JSON protocol.

**Boundary:** The LLM stack produces *prose only* on the chat path and *JSON protocol replies* on the interrogator path. The deterministic compliance score is unchanged; no LLM ever influences a numeric score. A `fallbackUsed: boolean` flag and a per-turn `steps[]` trace are surfaced on every chat reply so the UI shows when Clōd was unable to reach a definitive answer or when the expert was consulted.

**Reliability rules:**
- All Clōd and vLLM calls run under a 30-second default timeout; callers may pass an `AbortSignal` to override.
- The tool-round budget is capped (default 4 on `/api/chat`, 2 inside the strategy interrogator) to bound worst-case latency.
- If Clōd throws, returns empty content with no tool call, or exceeds the round budget, a deterministic fallback reply is substituted and `fallbackUsed=true` is set.
- A post-hoc sanitiser redacts forbidden phrases (`ready for live`, `deploy this bot`, `guaranteed return`, `profitable strategy`) from every LLM-emitted string before it leaves the orchestrator.

**Why this split:** the previously planned HF-router + Llama-3.3-70B path was retired once a user-supplied Clōd key landed. Clōd's catalog includes the same generic instruction-tuned models (GPT-4o, Claude, DeepSeek V3, Llama 3.x, Qwen 2.5, etc.) behind one OpenAI-compatible endpoint, so swapping the conversational layer is now a single env var change. The fine-tuned `DragonLLM/Qwen-Open-Finance-R-8B`, served by the user's own Lightning AI deployment, is reachable and is now used in exactly the role it was trained for — Pine Script + trading-strategy specialist consulted by a generic reasoner — instead of being asked to drive a multi-turn natural-language dialogue.

### Knowledge corpus and Nia retrieval

The bot-coach grounds every prose explanation in excerpts retrieved from a curated corpus of canonical finance literature. The retrieval layer is [Nia](https://docs.trynia.ai/) (`https://apigcp.trynia.ai/v2`, Bearer-token auth via `NIA_API_KEY`).

**Corpus** (initial, expandable):

- *Advances in Financial Machine Learning* — López de Prado, 2018 — primary source for overfitting, backtest leakage, multiple testing, purged cross-validation, meta-labeling. Cited when the trade triggers `BOT_OVERCONFIDENCE`, `BOT_POOR_RISK_REWARD`, `BOT_STRATEGY_MISMATCH`, or when the history modifier fires (recurring violations strongly correlate with overfit logic).
- *151 Trading Strategies* — Kakushadze & Serur, 2018 — primary source for canonical strategy taxonomy, formula references, asset-class coverage. Cited on every audit as the always-on strategy-consistency reference, and pulled most heavily on `BOT_STRATEGY_MISMATCH` and `BOT_MISSING_REASONING`.

**Corpus location:** `knowledge-base/` at repo root. The folder contains:

- `manifest.yaml` — registry of every indexed source with `id`, `title`, `authors`, `year`, `license`, `local_path`, `pages`, `topical_tags`, `when_to_retrieve` rules, `nia_source_id`, and a one-paragraph summary.
- `notes/<id>.md` — per-source markdown notes describing what each book covers and how it should inform the coach.
- `sources/*.pdf` — local PDFs, **gitignored** (some are copyrighted; the manifest plus notes are the committed contract).
- `README.md` — explains the structure and the procedure for adding a new book (drop PDF in `sources/`, append to manifest, write notes, re-run indexer).

**Retrieval flow at audit time:**

1. `botRuleEngine` computes the deterministic compliance score and violation list.
2. `niaRetriever` composes a query from the trade context (`strategyType`, `signalReason`, `marketRegime`, violation codes, recurring codes) using the template in `manifest.yaml` → `query_composition.template`.
3. `niaRetriever` calls `POST /v2/search?mode=universal` against the Nia source ids declared in the manifest, with `top_k = 4` by default.
4. The returned excerpts are formatted as a `Reference excerpts` block in the coach LLM's system prompt with citations in the form `{authors_short} ({year}), {title_short}, p.{page}`.
5. The coach LLM is instructed to weave inline citations into its prose where excerpts informed the recommendation, and to omit citations rather than fabricate them when no relevant excerpt was retrieved.
6. Citations and the originating excerpt ids are persisted on `coach_reports.report_json` so they can be re-rendered and audited later.

**Indexing procedure (one-time per book):** run a `pnpm index-corpus` script that reads `manifest.yaml`, uploads each `local_path` PDF to Nia via the `/v2/sources` endpoint as `research_paper`, captures the returned `nia_source_id`, and writes it back to the manifest. The same script can be re-run idempotently when a new book is added; it skips entries whose `nia_source_id` is already populated unless `--force-refresh` is passed.

**Guardrails enforced post-retrieval:** the manifest declares forbidden output phrases (e.g., "ready for live", "deploy this bot", "guaranteed return"). After the LLM responds, a sanitization pass strips/redacts any forbidden phrase and appends the required paper-trading-only disclaimer. This guarantees the safety language stays correct even if a retrieval excerpt happens to phrase something in a way the LLM might mirror.

**Adding a new book:** add the PDF to `sources/`, append a `manifest.yaml` entry with topical tags and `when_to_retrieve` rules, write a notes file, re-run `pnpm index-corpus`. No code changes required; the retriever's behavior is fully data-driven by the manifest.

### Bot intake authentication

**Strict identity, lenient quality.** Bots register via `POST /api/bots`, receive a one-time secret, and must include three headers on every trade submission: `X-PaperPilot-Bot-Id`, `X-PaperPilot-Timestamp` (Unix seconds, ±300s skew window), `X-PaperPilot-Signature` (hex-encoded HMAC-SHA256 of `<timestamp>.<raw-body-bytes>` using the per-bot secret).

- **401** for: signature mismatch, unknown bot id, timestamp drift > 300s.
- **400** for: malformed JSON, missing `symbol`/`side`/`entryPrice`/`quantity`, physically invalid values (negative price, non-positive quantity).
- **200 with violations** for: missing `signalReason`, missing/invalid `confidenceScore`, `strategyType` mismatch, exceeded `maxTradesPerDay`. These are exactly the behaviors PaperPilot exists to catch — they must enter the audit log, not be bounced.

Secrets stored only as `sha256(secret)`.

### TradingView ingestion

A separate `POST /api/webhooks/tradingview` route accepts Pine alert payloads with a per-user shared secret (Pine alerts cannot compute HMAC). All trades from this path are persisted with `source='tradingview_webhook'` and `trust_tier='shared_secret'`. The dashboard distinguishes these from direct HMAC-signed submissions (`trust_tier='hmac'`). The same `botRuleEngine` and `scoreCalculator` apply.

### Persistence

**Supabase Postgres.** Five tables in the initial migration. Row-Level Security on owner-scoped tables (`bots`, `trades`, `coach_reports`, `usage_counters`); the bot intake route uses the service-role key server-side because HMAC has already authenticated the bot.

```
bots(bot_id pk, owner_user_id fk, bot_name, strategy_type, max_risk_per_trade_pct,
     max_trades_per_day, max_drawdown_pct, bot_type, secret_hash, created_at)

trades(id pk, actor_type='bot', user_id, bot_id fk, symbol, asset_type, side,
       entry_price, exit_price, quantity, stop_loss, take_profit,
       signal_reason, strategy_type, confidence_score, market_regime,
       source, trust_tier, opened_at, closed_at)

violations(id pk, trade_id fk on delete cascade, code, severity, message, detected_at)
  index on (trade_id), index on (code, detected_at desc)

coach_reports(trade_id pk fk, coach_type, score, report_json jsonb,
              llm_provider, llm_latency_ms, llm_fallback_used, created_at)

usage_counters(user_id, year_month, ai_reviews_used, primary key (user_id, year_month))

-- Added for the multi-agent paper market (see "Multi-agent paper market"):
paper_orders(order_id pk, bot_id fk, task_id, symbol, side, order_type,
             limit_price, quantity, remaining_quantity, status, placed_at)

paper_fills(fill_id pk, symbol, taker_order_id fk, taker_bot_id, taker_side,
            maker_order_id fk, maker_bot_id, price, quantity, filled_at)

agent_sessions(session_id pk, bot_id fk, opened_at, closed_at, user_agent)

a2a_tasks(task_id pk, context_id, bot_id fk, status_state,
          artifacts jsonb, history jsonb, updated_at)

a2a_push_configs(config_id pk, task_id fk, url, token, signing_secret, created_at)

langgraph_checkpoints(thread_id, checkpoint_id, parent_id,
                      channel_values bytea, channel_versions jsonb,
                      versions_seen jsonb, pending_sends jsonb, metadata jsonb,
                      created_at, primary key (thread_id, checkpoint_id))
```

Auth: Supabase Auth, magic-link only. No password flow.

### History-modifier query

The "memory loop" is exactly one query against the last-20-trades window for the bot, joining to `violations`, grouping by code, filtering `having count(*) >= 3`. Returned codes drive the −10 deduction and populate `behaviorWarnings` in the coach report. There is no separate "agent memory" service or fine-tune.

### Backtester scope and double duty

Single strategy: moving-average crossover. Single symbol: BTC. Static deterministic candle data shipped as JSON in `public/sample-candles/btc.json`. RSI threshold and AAPL data are out of MVP. The backtester is also the demo seeder: a `pnpm seed-demo` command runs the backtester against the `polyclaw-demo` bot and persists ~30–50 trades, violations, and coach reports through the same write path production uses, so the dashboard renders pre-populated for the live demo.

### Billing (AllScale)

**Real hosted checkout.** One product (PaperPilot Pro), one price (USD $9/month). Test mode for demo. Two server routes: `POST /api/billing/checkout` (creates AllScale session, returns redirect URL) and `POST /api/billing/webhook` (verifies AllScale signature, flips `tier='pro'`, resets current month's `usage_counters`). The success-redirect URL is *not trusted* to flip tier — only the signed webhook is. AllScale subscription-lapse / `expires_at` enforcement is **out of MVP**; the demo runs in test mode and lapse handling is documented as future work.

### Pages

Four pages: `/bots` (list + register + submit-trade form), `/dashboard` (last-10 trades, score sparkline, top-3 violation codes, **and the multi-agent market panel — see below**), `/billing` (tier + usage + upgrade), and a "Run demo" button collapsed into the dashboard rather than a separate `/demo` page. The original plan's `/journal` and `/demo` pages are dropped from MVP.

### API routes (the entire surface)

`POST /api/bots` · `POST /api/bots/trades` · `POST /api/webhooks/tradingview` · `POST /api/billing/checkout` · `POST /api/billing/webhook` · `POST /api/backtest` · **`POST /api/a2a`** (A2A v1.0 JSON-RPC entry — see "Multi-agent paper market") · **`GET /api/a2a/stream/:taskId`** (A2A SSE channel) · **`GET /.well-known/agent-card.json`** (A2A capability discovery) · `GET /api/dashboard/market` (read-only snapshot for the dashboard market panel). No `/api/admin/prewarm` route — replaced with a `pnpm prewarm` shell script.

### Multi-agent paper market (added 2026-05-10)

The single-bot synchronous flow still ships exactly as described above. In addition, PaperPilot exposes a **bidirectional, streaming, multi-agent orchestration layer** so independent agents can act as counterparties in a shared paper market and PaperPilot can push back to them mid-flight.

- **Wire protocol:** [A2A v1.0](https://a2aproject.github.io/A2A/latest/specification/) (Google's Agent-to-Agent protocol, released March 2026). JSON-RPC 2.0 over HTTPS for unary calls; Server-Sent Events for streaming task updates; outbound signed webhooks for push notifications when the agent is offline. The chosen transport binding is JSON-RPC + SSE; gRPC is out of MVP.
- **Capability discovery:** `GET /.well-known/agent-card.json` publishes the `AgentCard` declaring three skills — `submit_trade_intent` (audit + match a paper trade), `respond_to_clarification` (resume an interrupted task), and `subscribe_to_market_events` (long-lived broadcast channel for counterparty fills and regime changes).
- **Auth:** the existing HMAC headers (`X-PaperPilot-Bot-Id` / `Timestamp` / `Signature`) wrap the JSON-RPC body. `hmacVerifier` extends to verify A2A envelopes with one extra check: any `botId` embedded inside `params.message.parts[*].data` must match the header `botId`. No new credential model; the same secret a bot uses for `POST /api/bots/trades` works here.
- **Orchestrator:** [LangGraph](https://github.com/langchain-ai/langgraphjs) drives one state machine per `taskId`. Nodes are `audit` → conditional → `clarify` (interrupt) or `match` or `reject` → `finalize`. `audit` calls the existing `botRuleEngine` + `historyModifier` + `scoreCalculator`. `finalize` calls `niaRetriever` + the coach narrator. **No existing deep module changes shape — they are graph nodes' dependencies, not graph implementations.** The LangGraph `interrupt()` primitive maps 1:1 onto A2A's `TASK_STATE_INPUT_REQUIRED`; the checkpointer makes resume cheap.
- **Market state:** minimal price-time-priority order book backed by Supabase tables (`paper_orders`, `paper_fills`, plus checkpointer storage in `langgraph_checkpoints` and task snapshots in `a2a_tasks` / `a2a_push_configs`). MVP supports BTC only. The in-process implementation (`createInMemoryOrderBook`) is sufficient for the hackathon demo; the Supabase migration `supabase/migrations/20260510000001_multi_agent_market.sql` defines the durable schema and the `acquire_book_lock` advisory lock function used by the production implementation.
- **Coach grounding stays intact.** The `finalize` graph node calls `niaRetriever` and the coach narrator exactly as the single-bot flow does today. Every multi-agent audit carries the same citation-grounded prose, and the same forbidden-phrase guardrails apply.
- **Dashboard impact:** the `/dashboard` page gains a "Multi-agent paper market" panel: live order book, recent fills ticker, and a "Pending clarifications" feed showing every agent currently parked at `INPUT_REQUIRED`.
- **Bot-per-user expansion.** The original MVP scoped to "one bot per user." The multi-agent market requires several registered bots so they can act as counterparties — the bot registration table already supports multiple bots per owner, and the dashboard simply renders the user's full bot list when count > 1.
- **Design rationale** is documented in [knowledge-base/notes/agent-protocols.md](../knowledge-base/notes/agent-protocols.md): why A2A over MCP/WebSocket, why LangGraph over a hand-rolled FSM, where MCP fits in a future milestone.

### Module decomposition

**Deep modules** (pure, single-responsibility, behind narrow interfaces; the testable core):

- `botRuleEngine` — `(trade, profile, recentTrades, recentViolations) → RuleViolation[]`. Single source of truth for every violation code. No I/O.
- `scoreCalculator` — `(violations, profile) → { score, band, breakdown }`. Composes the 100-point rubric. Independent of detection.
- `historyModifier` — `(recentViolations) → { recurringCodes, modifier }`. The entire "memory loop" claim, in one function.
- `hmacVerifier` — `(headers, rawBody, getSecretHashByBotId) → { ok, botId } | { error }`. Replay window + signature compare.
- `usageGate` — `(userId, currentMonthCount, tier) → { allowed, used, limit, upgradeUrl? }`.
- `backtester` — `(strategy, candles, profile) → { trades, summary, violations }`.
- `paperTradeMetrics` — `(trades) → { sparklineSeries, topViolationCodes, currentScore }`.
- `tradingViewAdapter` — `(rawAlert, sharedSecret) → BotPaperTrade | error`.
- `niaRetriever` — `(tradeContext, manifest) → { excerpts: { sourceId, page, text, citation }[], queryUsed }`. Composes the query from `manifest.yaml`'s `query_composition.template`, calls Nia `/v2/search?mode=universal`, returns top-K excerpts ready to be inlined into the coach prompt. Pure orchestration; the only I/O is to Nia.
- `matcher` — `(incoming, book, now, nextFillId) → { fills, resultingTaker, consumedMakers }`. Pure price-time-priority matching for the multi-agent paper market. No I/O.
- `orderBook` — `place / cancel / snapshot` interface; in-memory implementation included for the MVP demo, Supabase implementation deferred to a follow-up. Wraps `matcher` with order-state mutation and a per-symbol lock.
- `orchestrator/graph` — LangGraph `StateGraph` composing audit / clarify / match / reject / finalize nodes. Nodes are pure functions of state + injected deps. Interrupts emit A2A `INPUT_REQUIRED` events; checkpointer makes resume free.

**Adapters** (thin, low logic, low test value):

- `llmCoachNarrator` — wraps the HF router call (primary: Llama 3.3 70B; fallback: Qwen 2.5 72B) with 8s timeout + Zod parse + retry-on-fallback + deterministic template substitute; emits `{ prose, llm_fallback_used, llm_latency_ms, citations[] }`. Uses the OpenAI SDK with `baseURL` set to the HF router.
- `niaClient` — thin REST wrapper for `/v2/sources` (index PDFs) and `/v2/search` (retrieve). Used by both `niaRetriever` (per-audit) and `pnpm index-corpus` (one-time per book).
- `a2a/server` (JSON-RPC dispatcher) + `a2a/transport` (SSE writer + signed-webhook push-notification dispatcher) + `a2a/handlers` (concrete bridge to the orchestrator graph and order book). Wire-level concerns only; no business logic.
- `corpusManifestLoader` — reads and validates `knowledge-base/manifest.yaml`, returns the typed manifest for `niaRetriever` and the indexer script. Pure parse + Zod-validate.
- `allscaleClient` — `createCheckoutSession(userId, priceId)`, `verifyWebhookSignature(headers, body)`.
- Supabase repositories per table (`bots`, `trades`, `violations`, `coachReports`, `usage`). Routes import these; no raw SQL outside repos.

**Routes** are HTTP plumbing only — Zod-validate, call adapters and deep modules in sequence, persist, respond. No business logic in route handlers.

### .cursor/rules/ files (committed before any feature code)

`project.md`, `financial-safety.md`, `bot-safety.md`, `sponsor-integrations.md`, `coding-standards.md`. Bot-safety rule explicitly forbids any "ready for live" language in code, prompts, or UI; financial-safety rule forbids any real-money trading code paths and broker credential storage.

## Testing Decisions

**What makes a good test in this codebase:** tests assert *external behavior* of a module given an input. They never assert which internal helper was called, never mock things the module owns, and never reach across module boundaries. The deep modules above are pure functions with explicit dependencies — tests are simple input/output assertions, no spies, no fixtures-as-shared-state. Coverage is not a metric; the goal is that every violation code has a regression test and every security-critical branch in `hmacVerifier` is exercised.

**Test runner:** Vitest. **Prior art:** none in this greenfield repo; the rule-engine tests become the convention everything else follows.

**Modules tested:**

- `botRuleEngine` — at least one test per violation code (BOT_NO_STOP_LOSS, BOT_MISSING_REASONING, BOT_INVALID_CONFIDENCE, BOT_OVERCONFIDENCE, BOT_OVERTRADING, BOT_POOR_RISK_REWARD, BOT_STRATEGY_MISMATCH, plus history-modifier composition). Edge cases for boundary values on confidence and risk-per-trade.
- `scoreCalculator` — each band tested at boundaries; score floor 0; score ceiling 100; pattern penalty applied; history modifier applied; idempotent on repeated invocation with same input.
- `hmacVerifier` — valid signature; wrong signature; expired timestamp (drift > 300s); replay (same timestamp reused); unknown bot id; malformed signature header; case sensitivity on hex encoding.
- `historyModifier` — empty input, no recurrence, exactly-3 recurrence (boundary), multi-code recurrence; ensures −10 floor.
- `usageGate` — free under limit, free at limit, free at limit + 1, pro under, pro at 100, pro at 101; correct upgrade URL surfaced when blocked.
- `tradingViewAdapter` — valid alert; missing fields; malformed JSON; wrong shared secret; correct `trust_tier` stamping.
- `niaRetriever` — query template renders correctly given a fully populated trade context; renders the fallback template when violations array is empty; respects `when_to_retrieve` rules in the manifest (a source is queried only when its trigger conditions are met); top_k cap is enforced; excerpts are returned with the manifest's citation format applied.
- `corpusManifestLoader` — happy path on the committed `manifest.yaml`; rejects malformed YAML; rejects entries missing required fields; correctly reports `nia_source_id == 'TBD'` so the indexer knows to ingest.

**Modules with golden / light tests only:**

- `backtester` — one golden test on the seeded BTC candle file: snapshot of resulting trades + summary. Catches regressions cheaply.
- `paperTradeMetrics` — empty input, single trade, 50 trades; assert sparkline length and top-violation ordering.

**Modules not unit-tested (deliberate):**

- `llmCoachNarrator` — adapter; integration-tested manually with a mocked HF router response on demo eve.
- `niaClient` — adapter; verified end-to-end via the indexer script run during corpus ingestion.
- `allscaleClient` — adapter; verified with AllScale sandbox before demo.
- Supabase repositories — verified implicitly via the route-level happy path on demo eve.
- Route handlers — they are wiring; deep modules they call are tested.

## Out of Scope

- Real-money trade execution against any exchange or broker.
- Live brokerage integrations, exchange API key storage, seed phrase or private key handling.
- Pine Script source-code parsing or static analysis (the P2 interpretation). Only Pine *alert* webhook intake (P1) ships.
- Human-trader features: manual journal, mental-state tracking, emotional-discipline coach, FOMO/revenge-trade detection. Documented as future work.
- A second LLM (FinGPT) for sentiment scoring. Cut from MVP.
- Backtester support for RSI threshold strategy or AAPL/stock candle data.
- Multi-bot UI per user; one bot per user account is sufficient for MVP.
- Trade exit/close flow with realized P/L. Trades are *planned* trades; the score is computed at entry; `closed_at` and `exit_price` columns exist but are not driven by MVP.
- Drawdown charting, candlestick charts, equity-curve visualizations.
- A multi-step onboarding wizard. Default profile + an edit page is the entire UX.
- AllScale subscription-lapse enforcement (`expires_at`). Test-mode demo only; lapse handling deferred.
- A separate `/api/admin/prewarm` route. Replaced with a `pnpm prewarm` shell script run before live demos.
- Email notifications, webhook signature rotation flow, multi-tenant team/org features.

## Further Notes

### Resolved item — Q7: Nia indexing scope (was TBD, now decided)

The corpus is two books, both stored under `knowledge-base/sources/` and registered in `knowledge-base/manifest.yaml`:

- *Advances in Financial Machine Learning* — López de Prado, 2018. **Copyrighted; PDF gitignored.** Used for overfitting, backtest leakage, multiple testing, and ML-driven strategy critique. Triggered on `BOT_OVERCONFIDENCE`, `BOT_POOR_RISK_REWARD`, `BOT_STRATEGY_MISMATCH`, and any history-modifier firing.
- *151 Trading Strategies* — Kakushadze & Serur, 2018, SSRN. **Open-access.** Always-on retrieval target for strategy-consistency. Triggered most heavily on `BOT_STRATEGY_MISMATCH` and `BOT_MISSING_REASONING`.

Retrieval is via Nia `/v2/search?mode=universal`, top-K = 4, with the query template defined in the manifest's `query_composition.template`. Retrieved excerpts are injected into the coach LLM's system prompt as a `Reference excerpts` block with citations in `{authors_short} ({year}), {title_short}, p.{page}` form. The full implementation is documented under "Knowledge corpus and Nia retrieval" in Implementation Decisions.

The corpus is designed to grow: adding a new book is purely a manifest + notes + re-run-indexer operation, with no code changes. Future additions to consider (out of MVP): a risk-management primer, a market-microstructure text, and a broker/exchange API documentation set.

### Open question — which generic LLM to commit to

**Resolved.** The conversational layer is now Clōd (`https://api.clod.io/v1`), which proxies 30+ models behind one OpenAI-compatible endpoint and one API key. Default is `CLOD_MODEL="GPT 4o"` because it has the most reliable tool-calling behaviour in the catalog; switching to `"Claude"`, `"DeepSeek V3"`, `"Llama 3.1 8B"`, or any other Clōd-listed model is a single env var change. The Lightning AI vLLM serving `DragonLLM/Qwen-Open-Finance-R-8B` is the dedicated finance / pinescript expert, reached over its own OpenAI-compatible endpoint and used only as the `consult_finance_expert` tool Clōd may call.

### Open question — Nia API key

The integration assumes a `NIA_API_KEY` available in the env. Obtain via `npx nia-wizard@latest` or by signing up at app.trynia.ai. This is required before the corpus can be indexed; until it is set, the coach falls through to the deterministic prose template and `llm_fallback_used = true`.

### Sponsor coverage map

- **Cursor** — primary IDE; `.cursor/rules/*` enforce safety language and architectural boundaries at edit-time. Demoed by briefly showing the rules file on stage.
- **Nia by Nozomio** — **central to the product.** The context-retrieval layer that grounds every coach prose recommendation in canonical finance literature. Indexes the corpus under `knowledge-base/`. Cited inline in every audit report. Demoed by clicking through to the citation source on a sample report.
- **Greptile** — code review on two pull requests: (1) HMAC verification + replay protection, (2) usage-gate + AllScale webhook flow. The "paper-trading-only audit" PR was cut to recover budget.
- **AllScale** — real hosted checkout, $9/month test-mode product, webhook-driven tier flip and counter reset.

### Demo narrative (3 minutes)

(0:00–0:20) Hook: "Most trading tools test whether a strategy made money. PaperPilot tests whether the AI agent behaved responsibly — and grounds every recommendation in canonical finance literature." (0:20–0:45) Open dashboard cold on `polyclaw-demo` with seeded data; point at score 64, three repeating codes, declining sparkline. (0:45–1:35) Click "Submit sample trade"; HMAC-signed bad payload (high confidence, no SL, R:R 0.6) fires; card renders score, violations, and the citation-grounded prose; click the inline citation to expose the López de Prado excerpt that Nia retrieved. *"Notice we are not improvising — every recommendation cites a source we indexed."* (1:35–2:00) Point at the history-modifier line (`BOT_NO_STOP_LOSS recurred 4× — −10`); explain it is one SQL query, not "agent memory." (2:00–2:40) Free tier is 5/5; submit again → 402 → AllScale modal → real test card → webhook flips tier → counter resets → re-submit succeeds. (2:40–3:00) Closing: "PaperPilot does not teach trading agents how to make money. It tests whether they obey the rules they claim to follow, and grounds every critique in published finance research. We refuse — in code, in our `.cursor/rules/` files, in our LLM prompts, and in our retrieval guardrails — to ever say a bot is ready for live trading."

### Build order (48-hour budget — revised for corpus + retrieval)

Friday evening (4 hrs): repo skeleton; Supabase project + migration; `.cursor/rules/*`; HF token validation already done; sign up for Nia and obtain `NIA_API_KEY`; `pnpm prewarm` script.
Saturday morning (5 hrs): types, `botRuleEngine`, `scoreCalculator`, `historyModifier`, `usageGate`, `hmacVerifier`, `corpusManifestLoader` + tests for all of these.
Saturday midday (4 hrs): Supabase repositories; magic-link auth; `POST /api/bots` register; `POST /api/bots/trades` with HMAC verify; `niaClient` wrapper; `pnpm index-corpus` script ingests both PDFs into Nia (one-time).
Saturday evening (4 hrs): `niaRetriever` + tests; `llmCoachNarrator` (HF router primary + fallback + 8s timeout + template substitute); coach report write path with citations persisted; `coach_reports.llm_fallback_used` plumbing; backtester + golden test.
Saturday night (3 hrs): `/bots` page; `pnpm seed-demo` populates the dashboard via the backtester (each seeded trade exercises the full retrieval path so seeded reports also have citations).
Sunday morning (5 hrs): `/dashboard` (with citation-click drill-down); `/billing` + AllScale checkout + webhook + tier flip; TradingView webhook intake; collapse "Run demo" button into dashboard.
Sunday midday (3 hrs): Greptile reviews on the two PRs (HMAC, usage-gate); polish citation rendering on the dashboard.
Sunday afternoon (2 hrs): pre-warm HF and verify Nia indexes are warm; dry-run demo five times; fix top three breakages.

Total: ~30 hours of build, ~2 hours of presentation prep. Corpus indexing and retrieval are absorbed into the same time-box because (a) `niaRetriever` replaces what was previously the more complex custom-HF-client work, and (b) the OpenAI SDK pattern simplifies `llmCoachNarrator`.

### Vocabulary the product enforces

Allowed: "compliance score," "behavior warning," "continue paper testing," "violated risk rule," "policy mismatch," "low-trust source." Forbidden in code, prompts, and UI: "ready for live," "deploy this bot," "guaranteed return," "profitable strategy," "buy/sell/hold" any real asset. The two `.cursor/rules` files (`financial-safety.md`, `bot-safety.md`) encode this vocabulary at edit-time.

### Triage label

`ready-for-agent` — synthesized from a complete grilling pass with explicit user ratification of audience, scoring rubric, persistence, billing, demo plan, modules, and test scope. Q7 (Nia) is the only open item and is documented above.
