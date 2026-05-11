import { randomUUID } from "node:crypto";
import { buildOrchestratorGraph, type OrchestratorGraph } from "@/lib/orchestrator/graph";
import type { OrchestratorDeps, CoachNarrator } from "@/lib/orchestrator/deps";
import { createInMemoryOrderBook } from "@/lib/market/orderBook";
import type { Manifest } from "@/lib/corpus/manifestLoader";
import type { NiaClient } from "@/lib/corpus/niaRetriever";
import type { MarketEvent } from "@/lib/market/types";
import type { ScoreBand } from "@/lib/trading/scoreCalculator";
import type { StrategyType } from "@/lib/trading/types";
import { createMarketEventBus, type MarketEventBus } from "./eventBus";
import type { PaperPilotRepo } from "./handlers";
import type { TaskValue } from "./envelope";

// Bounded ring buffer of recent market events, exposed to the dashboard via
// `/api/dashboard/market`. Keeps the hackathon demo alive on first paint.
const MAX_HISTORY = 100;
const MAX_AUDIT_HISTORY = 200;

export interface MarketHistory {
  record(event: MarketEvent): void;
  recent(): MarketEvent[];
  pendingInterrupts(): Array<{ taskId: string; botId: string; reason: string }>;
  recordInterrupt(entry: { taskId: string; botId: string; reason: string }): void;
  clearInterrupt(taskId: string): void;
}

// Per-bot audit results emitted by `auditPipeline.auditTrade`. The TradingView
// webhook routes record into this buffer after every successful audit so the
// `/api/dashboard/scorecards` endpoint can show real per-bot history without
// running the pipeline again on the read path. Capacity is process-local —
// the same caveat that already applies to MarketHistory.
export interface AuditEntry {
  ts: number;
  botId: string;
  score: number;
  band: ScoreBand;
  violationCodes: string[];
  strategyType: StrategyType;
  symbol?: string;
}

export interface AuditHistory {
  recordAudit(entry: AuditEntry): void;
  recentAudits(opts?: { botId?: string; limit?: number }): AuditEntry[];
}

function createMarketHistory(): MarketHistory {
  const events: MarketEvent[] = [];
  const interrupts = new Map<string, { taskId: string; botId: string; reason: string }>();
  return {
    record(event) {
      events.push(event);
      if (events.length > MAX_HISTORY) events.shift();
    },
    recent() {
      return events.slice();
    },
    pendingInterrupts() {
      return [...interrupts.values()];
    },
    recordInterrupt(entry) {
      interrupts.set(entry.taskId, entry);
    },
    clearInterrupt(taskId) {
      interrupts.delete(taskId);
    },
  };
}

function createAuditHistory(): AuditHistory {
  const entries: AuditEntry[] = [];
  return {
    recordAudit(entry) {
      entries.push(entry);
      if (entries.length > MAX_AUDIT_HISTORY) entries.shift();
    },
    recentAudits(opts) {
      const filtered = opts?.botId
        ? entries.filter((e) => e.botId === opts.botId)
        : entries.slice();
      if (typeof opts?.limit === "number" && opts.limit >= 0) {
        return filtered.slice(-opts.limit);
      }
      return filtered;
    },
  };
}

// Module-level singleton runtime. The Next.js dev/build environment may
// import this from multiple route modules; a single instance keeps the order
// book and event bus shared across them.
export interface A2ARuntime {
  graph: OrchestratorGraph;
  orchestratorDeps: OrchestratorDeps;
  eventBus: MarketEventBus;
  repo: PaperPilotRepo;
  history: MarketHistory;
  auditHistory: AuditHistory;
  orderBook: ReturnType<typeof createInMemoryOrderBook>;
  nextId: () => string;
  now: () => number;
}

let runtimeSingleton: A2ARuntime | null = null;

export interface BuildRuntimeOpts {
  niaClient: NiaClient;
  coach: CoachNarrator;
  repo: PaperPilotRepo;
  manifest?: Manifest;
}

// Build the singleton runtime. The first caller provides the I/O dependencies
// the hackathon demo cannot stub (Nia, the coach LLM, the Supabase repo);
// subsequent callers receive the same instance.
export function getOrCreateA2ARuntime(opts: BuildRuntimeOpts): A2ARuntime {
  if (runtimeSingleton) return runtimeSingleton;

  const now = () => Date.now();
  const nextId = () => randomUUID();

  const orderBook = createInMemoryOrderBook({ now, nextId });
  const eventBus = createMarketEventBus();
  const history = createMarketHistory();
  const auditHistory = createAuditHistory();

  // Tee events from the bus into the history ring buffer.
  (async () => {
    for await (const event of eventBus.subscribe()) {
      history.record(event);
    }
  })();

  const orchestratorDeps: OrchestratorDeps = {
    orderBook,
    niaClient: opts.niaClient,
    manifest: opts.manifest ?? emptyManifest(),
    coach: opts.coach,
    now,
    nextId,
  };

  const graph = buildOrchestratorGraph();
  runtimeSingleton = {
    graph,
    orchestratorDeps,
    eventBus,
    repo: opts.repo,
    history,
    auditHistory,
    orderBook,
    nextId,
    now,
  };
  return runtimeSingleton;
}

// Used only by tests that want a fresh runtime.
export function __resetA2ARuntime() {
  runtimeSingleton = null;
}

// Convenience accessor for callers that only need access to the singleton's
// in-memory state (history / auditHistory / pending interrupts) and don't
// care about Nia or the coach LLM. Used by the dashboard and the TradingView
// webhooks. The first hit through the regular dashboard path may have already
// supplied real I/O deps; this helper just bootstraps with stubs if not.
export function getOrCreateA2ARuntimeWithStubs(): A2ARuntime {
  return getOrCreateA2ARuntime({
    niaClient: { async search() { return []; } },
    coach: {
      async narrate() {
        return {
          prose: "",
          excerpts: [],
          llmFallbackUsed: true,
          llmLatencyMs: 0,
        };
      },
    },
    repo: createInMemoryRepo(),
  });
}

// Manifest is optional at boot — if absent the niaRetriever returns empty
// excerpts and the coach narrator falls through to its template.
function emptyManifest(): Manifest {
  return {
    version: 0,
    sources: [],
    retrieval: {
      default_top_k: 4,
      default_mode: "universal",
      citation_format: "{title_short}, p.{page}",
    },
    query_composition: {
      template: "{trade.strategyType}: {violation_codes_joined}",
      fallback_template: "{trade.strategyType}",
    },
  };
}

// ---------------------------------------------------------------------------
// Default in-memory repo for the hackathon demo. Real Supabase wiring lives
// in a future migration of `paperPilotRepo.ts`; tests inject their own.
// ---------------------------------------------------------------------------

export function createInMemoryRepo(): PaperPilotRepo {
  const tasks = new Map<string, TaskValue>();
  return {
    async loadBotProfile() {
      return null;
    },
    async recentTradesForBot() {
      return [];
    },
    async recentViolationsForBot() {
      return [];
    },
    async saveTaskSnapshot(task) {
      tasks.set(task.id, task);
    },
    async loadTaskSnapshot(taskId) {
      return tasks.get(taskId) ?? null;
    },
  };
}
