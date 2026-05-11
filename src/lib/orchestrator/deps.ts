import type { OrderBook } from "@/lib/market/orderBook";
import type { Manifest } from "@/lib/corpus/manifestLoader";
import type { NiaClient, RetrieveResult } from "@/lib/corpus/niaRetriever";
import type { CoachReport } from "./state";
import type { RuleViolation } from "@/lib/trading/types";

// Coach narrator port. Keeps the orchestrator independent of the actual HF
// router; tests provide a deterministic stub.
export interface CoachNarrator {
  narrate(input: {
    violations: RuleViolation[];
    excerpts: RetrieveResult;
    score: number;
    band: string;
    recurringCodes: string[];
  }): Promise<CoachReport>;
}

// All side-effecting collaborators the graph nodes need, gathered into a
// single bag so we inject one object through LangGraph's `config`.
export interface OrchestratorDeps {
  orderBook: OrderBook;
  niaClient: NiaClient;
  manifest: Manifest;
  coach: CoachNarrator;
  now: () => number;
  nextId: () => string;
}

declare module "@langchain/langgraph" {
  // Augment LangGraph's runnable config so node implementations can pull the
  // deps out via `config.configurable.deps`.
  interface LangGraphRunnableConfig {
    configurable?: {
      thread_id?: string;
      deps?: OrchestratorDeps;
      [key: string]: unknown;
    };
  }
}

export function getDeps(config: {
  configurable?: { deps?: OrchestratorDeps };
}): OrchestratorDeps {
  const deps = config.configurable?.deps;
  if (!deps) {
    throw new Error(
      "OrchestratorDeps not provided. Pass via `config.configurable.deps`."
    );
  }
  return deps;
}
