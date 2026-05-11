import { isGraphInterrupt } from "@langchain/langgraph";
import { buildInitialState, type OrchestratorGraph } from "@/lib/orchestrator/graph";
import { getDeps, type OrchestratorDeps } from "@/lib/orchestrator/deps";
import type { ClarificationRequest } from "@/lib/orchestrator/state";
import type {
  ArtifactValue,
  StreamEventValue,
  TaskValue,
} from "../envelope";
import type { MarketEventBus } from "../eventBus";
import type {
  BotPaperTrade,
  BotTradingProfile,
  RuleViolation,
  TradeIntent,
} from "@/lib/trading/types";

export interface SubmitTradeIntentInput {
  taskId: string;
  contextId: string;
  botId: string;
  intent: TradeIntent;
  profile: BotTradingProfile;
  recentTrades: BotPaperTrade[];
  recentViolations: RuleViolation[];
}

export interface SubmitTradeIntentDeps {
  graph: OrchestratorGraph;
  orchestratorDeps: OrchestratorDeps;
  eventBus: MarketEventBus;
}

// Run the submit_trade_intent skill against the orchestrator graph. Yields
// A2A stream events as the graph progresses. On interrupt (clarify node),
// emits a TASK_STATE_INPUT_REQUIRED status and ends the stream; the agent
// resumes via `respond_to_clarification`. Otherwise runs to completion and
// emits a final TaskArtifactUpdateEvent with the coach report.
export async function* runSubmitTradeIntent(
  input: SubmitTradeIntentInput,
  deps: SubmitTradeIntentDeps
): AsyncGenerator<StreamEventValue, void, void> {
  const { graph, orchestratorDeps, eventBus } = deps;

  yield statusUpdate(input, "TASK_STATE_SUBMITTED", false);

  const config = {
    configurable: {
      thread_id: input.taskId,
      deps: orchestratorDeps,
    },
  };

  const initialState = buildInitialState(input);

  try {
    yield statusUpdate(input, "TASK_STATE_WORKING", false);
    const stream = await graph.stream(initialState, {
      ...config,
      streamMode: "updates",
    });
    for await (const update of stream) {
      // `update` is keyed by node name. Surface the most useful per-node
      // events as A2A artifacts so the agent can see audit + match
      // progress incrementally.
      for (const [node, change] of Object.entries(update)) {
        const events = nodeUpdateToEvents(
          input,
          node,
          change as Record<string, unknown>,
          eventBus
        );
        for (const e of events) yield e;
      }
    }
  } catch (err) {
    if (isGraphInterrupt(err)) {
      const interruptValue = extractInterruptValue(err);
      yield statusUpdate(input, "TASK_STATE_INPUT_REQUIRED", false, {
        clarification: interruptValue ?? undefined,
      });
      return;
    }
    yield statusUpdate(input, "TASK_STATE_FAILED", true, {
      error: err instanceof Error ? err.message : "unknown",
    });
    return;
  }

  // Pull the final state and emit the coach report as a terminal artifact.
  const finalSnapshot = await graph.getState(config);
  const finalState = finalSnapshot?.values;
  if (finalState?.coachReport) {
    yield {
      kind: "artifact-update",
      taskId: input.taskId,
      contextId: input.contextId,
      artifact: coachReportArtifact(input, finalState),
      final: true,
    };
  }
  yield statusUpdate(input, "TASK_STATE_COMPLETED", true);
}

// Run the unary `message/send` form: drain the stream and synthesize a Task.
export async function submitTradeIntentUnary(
  input: SubmitTradeIntentInput,
  deps: SubmitTradeIntentDeps
): Promise<TaskValue> {
  let lastState: "TASK_STATE_SUBMITTED" | "TASK_STATE_WORKING" | "TASK_STATE_INPUT_REQUIRED" | "TASK_STATE_COMPLETED" | "TASK_STATE_FAILED" | "TASK_STATE_AUTH_REQUIRED" | "TASK_STATE_CANCELED" | "TASK_STATE_REJECTED" = "TASK_STATE_SUBMITTED";
  const artifacts: ArtifactValue[] = [];

  for await (const event of runSubmitTradeIntent(input, deps)) {
    if (event.kind === "status-update") {
      lastState = event.status.state;
    } else if (event.kind === "artifact-update") {
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
// Helpers
// ---------------------------------------------------------------------------

function statusUpdate(
  input: { taskId: string; contextId: string },
  state:
    | "TASK_STATE_SUBMITTED"
    | "TASK_STATE_WORKING"
    | "TASK_STATE_INPUT_REQUIRED"
    | "TASK_STATE_COMPLETED"
    | "TASK_STATE_FAILED"
    | "TASK_STATE_AUTH_REQUIRED"
    | "TASK_STATE_CANCELED"
    | "TASK_STATE_REJECTED",
  final: boolean,
  data?: unknown
): StreamEventValue {
  return {
    kind: "status-update",
    taskId: input.taskId,
    contextId: input.contextId,
    status: {
      state,
      ...(data !== undefined
        ? {
            message: {
              messageId: `${input.taskId}:${state}`,
              role: "ROLE_AGENT" as const,
              parts: [{ kind: "data" as const, data }],
            },
          }
        : {}),
    },
    final,
  };
}

function nodeUpdateToEvents(
  input: SubmitTradeIntentInput,
  node: string,
  change: Record<string, unknown>,
  eventBus: MarketEventBus
): StreamEventValue[] {
  const events: StreamEventValue[] = [];
  if (node === "audit" && change.violations) {
    events.push({
      kind: "artifact-update",
      taskId: input.taskId,
      contextId: input.contextId,
      artifact: {
        artifactId: `${input.taskId}:audit`,
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
  if (node === "match" && change.marketEvents) {
    for (const me of change.marketEvents as unknown[]) {
      eventBus.publish(
        me as Parameters<MarketEventBus["publish"]>[0]
      );
    }
    if (change.outcome) {
      events.push({
        kind: "artifact-update",
        taskId: input.taskId,
        contextId: input.contextId,
        artifact: {
          artifactId: `${input.taskId}:match`,
          name: "match-outcome",
          parts: [{ kind: "data", data: change.outcome }],
        },
        final: false,
      });
    }
  }
  return events;
}

function coachReportArtifact(
  input: SubmitTradeIntentInput,
  finalState: {
    coachReport: { prose: string; excerpts: unknown[]; llmFallbackUsed: boolean };
    outcome: unknown;
    score: unknown;
    violations: unknown;
  }
): ArtifactValue {
  return {
    artifactId: `${input.taskId}:coach`,
    name: "coach-report",
    parts: [
      { kind: "text", text: finalState.coachReport.prose },
      {
        kind: "data",
        data: {
          excerpts: finalState.coachReport.excerpts,
          llmFallbackUsed: finalState.coachReport.llmFallbackUsed,
          outcome: finalState.outcome,
          score: finalState.score,
          violations: finalState.violations,
        },
      },
    ],
  };
}

function extractInterruptValue(err: unknown): ClarificationRequest | null {
  if (!err || typeof err !== "object") return null;
  const interrupts = (err as { interrupts?: unknown }).interrupts;
  if (!Array.isArray(interrupts) || interrupts.length === 0) return null;
  const first = interrupts[0] as { value?: unknown };
  return (first?.value as ClarificationRequest) ?? null;
}

// Re-export so the JSON-RPC handlers can access it; avoids a circular import
// via `deps.ts`.
export { getDeps };
