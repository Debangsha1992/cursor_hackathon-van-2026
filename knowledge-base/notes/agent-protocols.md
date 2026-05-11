# Agent-protocol design rationale

> Companion to the PaperPilot AI multi-agent orchestration layer. Captures
> *why* we picked A2A v1.0 + LangGraph over the obvious alternatives, and how
> this layer interacts with the rest of the codebase.

## Problem we are solving

PaperPilot started as a synchronous audit endpoint: an agent submits a paper
trade via `POST /api/bots/trades` with HMAC headers, and PaperPilot replies
with a compliance score and a coach report. That model works for one bot in
isolation. It does not work when:

1. Multiple agents act as counterparties in a shared paper market (a buy
   from agent A needs to match a sell from agent B, with PaperPilot routing
   the fill and auditing both sides).
2. PaperPilot needs to *push back* to an agent — e.g. block a high-confidence
   no-stop-loss order at the door and demand justification before the order
   reaches the book.
3. Agents want to subscribe to market events (counterparty fills, regime
   change advisories, coaching nudges) without polling.

So we needed (a) a bidirectional wire format and (b) a stateful orchestrator
that can suspend, ask the agent for input, and resume.

## Why A2A v1.0

The wire-format question reduced to four candidates:

| Option | Verdict |
|---|---|
| Bespoke WebSocket / our own framing | Cheapest to ship today; locks every counterparty into our private protocol. |
| Model Context Protocol (MCP) | Designed for *agent ↔ tool*, not agent ↔ agent. Wrong abstraction for counterparty trading; multi-agent semantics only landed in MCP v2 beta in March 2026 and even then are positioned as orchestration support, not the primary fabric. |
| LangGraph remote graphs | Tied to one framework. We want agents that were built outside this repo (OpenAI Agents SDK, AutoGen, CrewAI, custom) to talk to PaperPilot without rewriting them. |
| **A2A v1.0** (Google, released March 2026) | Framework-agnostic. Native streaming via SSE. Native `INPUT_REQUIRED` interrupt state. Native push-notification webhook channel. Capability discovery via `AgentCard`. JSON-RPC 2.0 transport that runs natively over the existing Next.js route surface. Adoption is broad enough that a counterparty agent built on any 2026 framework can connect for free. |

A2A wins on interoperability without losing anything we need. The framing
overhead (a JSON-RPC envelope) is trivial.

## Why LangGraph

The orchestrator question reduced to:

- **Hand-rolled finite state machine.** Doable. The cost is reinventing
  suspend / resume on a `taskId` (we have to persist the state machine
  across HTTP requests so an agent's clarification reply can pick up where
  the audit left off). That is essentially LangGraph's
  `BaseCheckpointSaver`.
- **LangGraph.** Production-grade in 2026 (Uber, Klarna, LinkedIn, JPMorgan;
  34.5M monthly downloads). Its `interrupt()` primitive maps 1:1 onto A2A's
  `TASK_STATE_INPUT_REQUIRED`. The checkpointer makes resume a free
  affordance, not something we have to design. Per-thread state isolation
  is enforced by `thread_id`, which we wire to the A2A `taskId`.

So LangGraph is the orchestrator, the A2A `taskId` is the LangGraph
`thread_id`, and `INPUT_REQUIRED` is a graph interrupt.

## How the layers fit

```
External agent
  │  HMAC headers + JSON-RPC body
  ▼
Next.js /api/a2a route (src/app/api/a2a/route.ts)
  │  verifyA2AEnvelope → dispatchJsonRpc
  ▼
A2A handlers (src/lib/a2a/handlers.ts)
  │  routes the skill to the orchestrator or the market broadcast
  ▼
LangGraph orchestrator (src/lib/orchestrator/graph.ts)
  │  RECEIVE → AUDIT → CLARIFY (interrupt) → MATCH → FINALIZE
  ▼
Existing pure modules (botRuleEngine, scoreCalculator, historyModifier,
niaRetriever, llmCoachNarrator) — unchanged from the original PRD
  ▼
Order book (src/lib/market/orderBook.ts) + paper fills
```

Every A2A stream event flows back up through the same channel — the
dispatcher converts graph stream updates into A2A `TaskStatusUpdateEvent`
and `TaskArtifactUpdateEvent` frames, which the route layer encodes as SSE.

## How HMAC interacts with A2A

A2A does not mandate an auth scheme — it declares one in `securitySchemes`
on the AgentCard and expects clients to honor it. We reuse the existing
HMAC primitive (`<timestamp>.<raw-body>` signed with the bot secret) for
two reasons:

1. The wire-format already requires a raw body for JSON-RPC; signing it is
   trivial and reuses code we have battle-tested in `hmacVerifier.ts`.
2. We don't want a second credential model. Bot owners already manage one
   HMAC secret. Anything they previously did with `POST /api/bots/trades`
   they can now do over A2A by re-routing the same payload into the
   `submit_trade_intent` skill.

`verifyA2AEnvelope` extends `verifyBotRequest` with one extra check: if the
agent embeds a `botId` inside `params.message.parts[*].data`, it must match
the `X-PaperPilot-Bot-Id` header. This stops a header from being replayed
against an envelope that names a different bot.

## Tradeoffs we accepted

- **In-memory order book + in-memory event bus for MVP.** The Supabase
  migration in `supabase/migrations/20260510000001_multi_agent_market.sql`
  defines the durable schema; the live wiring is a future task. For the
  hackathon demo a single Next.js process is fine, and the in-memory book
  is plenty fast.
- **No gRPC binding.** A2A allows JSON-RPC, gRPC, or HTTP/REST. We ship
  JSON-RPC + SSE only. gRPC is additive.
- **Cancel-replace is "cancel then place".** No atomic cancel-replace
  semantics. Sufficient for the demo.
- **Single symbol.** BTC only. Multi-symbol risk is out of scope.

## Where MCP fits (future work)

MCP is the correct layer for letting agents *query* PaperPilot for tools
and data — "give me my recent violations", "give me current book state",
"give me a summary of the corpus". The Open-Finance-Lab agentic-trading
reference (Feb 2026) uses exactly this split: A2A between agents, MCP for
tool/data access. We will add an MCP server in a future milestone; nothing
about the current A2A surface forecloses it.

## File map

| File | Role |
|---|---|
| `src/lib/a2a/envelope.ts` | Zod schemas for A2A v1.0 types and JSON-RPC 2.0. |
| `src/lib/a2a/agentCard.ts` | Builds the public `AgentCard` JSON. |
| `src/lib/a2a/skills.ts` | Skill descriptors. |
| `src/lib/a2a/server.ts` | JSON-RPC dispatcher. |
| `src/lib/a2a/transport.ts` | SSE writer + signed push-notification dispatcher. |
| `src/lib/a2a/handlers.ts` | Concrete `A2AHandlers` impl bridging to orchestrator + market. |
| `src/lib/a2a/runtime.ts` | Singleton runtime: graph + order book + event bus. |
| `src/lib/a2a/skills/*.ts` | Per-skill streaming + unary implementations. |
| `src/lib/orchestrator/graph.ts` | LangGraph state machine. |
| `src/lib/orchestrator/state.ts` | LangGraph annotation root. |
| `src/lib/orchestrator/nodes/*.ts` | Per-node implementations. |
| `src/lib/market/matcher.ts` | Pure price-time-priority matcher. |
| `src/lib/market/orderBook.ts` | In-memory order book; Supabase impl future. |
| `src/app/api/a2a/route.ts` | Public JSON-RPC entry. |
| `src/app/api/a2a/stream/[taskId]/route.ts` | SSE replay channel. |
| `src/app/.well-known/agent-card.json/route.ts` | Public AgentCard publication. |
| `supabase/migrations/20260510000001_multi_agent_market.sql` | Durable schema. |
