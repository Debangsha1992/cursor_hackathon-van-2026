import {
  END,
  MemorySaver,
  START,
  StateGraph,
  type BaseCheckpointSaver,
} from "@langchain/langgraph";
import { PaperPilotState, type PaperPilotStateValue } from "./state";
import { auditNode, routeAfterAudit } from "./nodes/audit";
import { clarifyNode } from "./nodes/clarify";
import { matchNode } from "./nodes/match";
import { rejectNode } from "./nodes/reject";
import { finalizeAuditNode } from "./nodes/finalizeAudit";

export interface BuildGraphOpts {
  // Defaults to MemorySaver for tests and the hackathon demo. Production swaps
  // in a Supabase-backed BaseCheckpointSaver.
  checkpointer?: BaseCheckpointSaver;
}

// Build the PaperPilot orchestration graph. The returned `app` is a compiled
// LangGraph runnable. Invocations are keyed by `thread_id` (== A2A taskId) so
// interrupted tasks can resume cleanly when the agent replies with a
// `Command.resume`.
export function buildOrchestratorGraph(opts: BuildGraphOpts = {}) {
  const checkpointer = opts.checkpointer ?? new MemorySaver();

  const graph = new StateGraph(PaperPilotState)
    .addNode("audit", auditNode)
    .addNode("clarify", clarifyNode)
    .addNode("match", matchNode)
    .addNode("reject", rejectNode)
    .addNode("finalize", finalizeAuditNode)
    .addEdge(START, "audit")
    .addConditionalEdges("audit", routeAfterAudit, {
      clarify: "clarify",
      match: "match",
      reject: "reject",
    })
    .addEdge("clarify", "audit")
    .addEdge("match", "finalize")
    .addEdge("reject", "finalize")
    .addEdge("finalize", END);

  return graph.compile({ checkpointer });
}

export type OrchestratorGraph = ReturnType<typeof buildOrchestratorGraph>;

// Convenience: assemble the initial state from primitive inputs. Callers (the
// `submit_trade_intent` skill) feed this into `graph.invoke` or
// `graph.stream`.
export function buildInitialState(
  input: Pick<
    PaperPilotStateValue,
    | "taskId"
    | "contextId"
    | "botId"
    | "intent"
    | "profile"
    | "recentTrades"
    | "recentViolations"
  >
): Partial<PaperPilotStateValue> {
  return {
    ...input,
    violations: [],
    historyModifier: null,
    score: null,
    clarificationRequest: null,
    clarificationResponse: null,
    reAuditAttempts: 0,
    outcome: null,
    marketEvents: [],
    coachReport: null,
  };
}
