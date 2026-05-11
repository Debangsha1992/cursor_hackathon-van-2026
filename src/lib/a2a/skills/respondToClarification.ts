import { Command, isGraphInterrupt } from "@langchain/langgraph";
import type { OrchestratorGraph } from "@/lib/orchestrator/graph";
import type { OrchestratorDeps } from "@/lib/orchestrator/deps";
import type { ClarificationResponse } from "@/lib/orchestrator/state";
import type {
  ArtifactValue,
  StreamEventValue,
  TaskValue,
} from "../envelope";
import type { MarketEventBus } from "../eventBus";

export interface RespondToClarificationInput {
  taskId: string;
  contextId: string;
  response: ClarificationResponse;
}

export interface RespondDeps {
  graph: OrchestratorGraph;
  orchestratorDeps: OrchestratorDeps;
  eventBus: MarketEventBus;
}

// Resume an interrupted task with the agent's clarification. Mirrors the
// runSubmitTradeIntent output stream so consumers can subscribe identically
// regardless of whether the task started fresh or resumed.
export async function* runRespondToClarification(
  input: RespondToClarificationInput,
  deps: RespondDeps
): AsyncGenerator<StreamEventValue, void, void> {
  const { graph, orchestratorDeps, eventBus } = deps;

  const config = {
    configurable: {
      thread_id: input.taskId,
      deps: orchestratorDeps,
    },
  };

  // Make sure the task actually exists and is in an interruptible state.
  const snap = await graph.getState(config);
  if (!snap) {
    yield failure(input, "task_not_found");
    return;
  }

  try {
    yield {
      kind: "status-update",
      taskId: input.taskId,
      contextId: input.contextId,
      status: { state: "TASK_STATE_WORKING" },
      final: false,
    };
    const stream = await graph.stream(new Command({ resume: input.response }), {
      ...config,
      streamMode: "updates",
    });
    for await (const update of stream) {
      for (const [node, change] of Object.entries(update)) {
        const events = nodeUpdateToEvents(input, node, change as Record<string, unknown>, eventBus);
        for (const e of events) yield e;
      }
    }
  } catch (err) {
    if (isGraphInterrupt(err)) {
      yield {
        kind: "status-update",
        taskId: input.taskId,
        contextId: input.contextId,
        status: { state: "TASK_STATE_INPUT_REQUIRED" },
        final: false,
      };
      return;
    }
    yield failure(
      input,
      err instanceof Error ? err.message : "unknown_resume_error"
    );
    return;
  }

  const finalSnapshot = await graph.getState(config);
  const finalState = finalSnapshot?.values as
    | {
        coachReport?: { prose: string; excerpts: unknown[]; llmFallbackUsed: boolean };
        outcome?: unknown;
        score?: unknown;
        violations?: unknown;
      }
    | undefined;
  if (finalState?.coachReport) {
    yield {
      kind: "artifact-update",
      taskId: input.taskId,
      contextId: input.contextId,
      artifact: coachReportArtifact(input, finalState),
      final: true,
    };
  }
  yield {
    kind: "status-update",
    taskId: input.taskId,
    contextId: input.contextId,
    status: { state: "TASK_STATE_COMPLETED" },
    final: true,
  };
}

export async function respondToClarificationUnary(
  input: RespondToClarificationInput,
  deps: RespondDeps
): Promise<TaskValue> {
  let lastState: TaskValue["status"]["state"] = "TASK_STATE_SUBMITTED";
  const artifacts: ArtifactValue[] = [];
  for await (const event of runRespondToClarification(input, deps)) {
    if (event.kind === "status-update") {
      lastState = event.status.state;
    } else {
      artifacts.push(event.artifact);
    }
  }
  return {
    id: input.taskId,
    contextId: input.contextId,
    status: { state: lastState },
    artifacts,
    history: [],
  };
}

// ---------------------------------------------------------------------------

function failure(
  input: { taskId: string; contextId: string },
  reason: string
): StreamEventValue {
  return {
    kind: "status-update",
    taskId: input.taskId,
    contextId: input.contextId,
    status: {
      state: "TASK_STATE_FAILED",
      message: {
        messageId: `${input.taskId}:failure`,
        role: "ROLE_AGENT",
        parts: [{ kind: "data", data: { reason } }],
      },
    },
    final: true,
  };
}

function nodeUpdateToEvents(
  input: { taskId: string; contextId: string },
  node: string,
  change: Record<string, unknown>,
  eventBus: MarketEventBus
): StreamEventValue[] {
  const out: StreamEventValue[] = [];
  if (node === "audit" && change.violations) {
    out.push({
      kind: "artifact-update",
      taskId: input.taskId,
      contextId: input.contextId,
      artifact: {
        artifactId: `${input.taskId}:audit-reaudit`,
        name: "audit-report",
        parts: [
          {
            kind: "data",
            data: {
              violations: change.violations,
              score: change.score,
              historyModifier: change.historyModifier,
            },
          },
        ],
      },
      final: false,
    });
  }
  if (node === "match" && Array.isArray(change.marketEvents)) {
    for (const me of change.marketEvents) {
      eventBus.publish(me as Parameters<MarketEventBus["publish"]>[0]);
    }
  }
  return out;
}

function coachReportArtifact(
  input: { taskId: string },
  finalState: {
    coachReport?: { prose: string; excerpts: unknown[]; llmFallbackUsed: boolean };
    outcome?: unknown;
    score?: unknown;
    violations?: unknown;
  }
): ArtifactValue {
  const report = finalState.coachReport;
  return {
    artifactId: `${input.taskId}:coach`,
    name: "coach-report",
    parts: [
      { kind: "text", text: report?.prose ?? "" },
      {
        kind: "data",
        data: {
          excerpts: report?.excerpts ?? [],
          llmFallbackUsed: report?.llmFallbackUsed ?? false,
          outcome: finalState.outcome,
          score: finalState.score,
          violations: finalState.violations,
        },
      },
    ],
  };
}
