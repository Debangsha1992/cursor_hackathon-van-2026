import { interrupt } from "@langchain/langgraph";
import type {
  ClarificationRequest,
  ClarificationResponse,
  PaperPilotStateUpdate,
  PaperPilotStateValue,
} from "../state";

// CLARIFY node: emits an A2A INPUT_REQUIRED equivalent via LangGraph's
// `interrupt`. The host (route layer) translates this into a
// TaskStatusUpdateEvent with state TASK_STATE_INPUT_REQUIRED and parks the
// task; when the agent re-submits via `respond_to_clarification`, we resume
// the graph with the response embedded in `Command.resume`.
export function clarifyNode(
  state: PaperPilotStateValue
): PaperPilotStateUpdate {
  const high = state.violations.find((v) => v.severity === "high");
  const code = high?.code ?? "UNKNOWN";
  const request: ClarificationRequest = {
    violationCode: code,
    reason: high?.message ?? "High-severity violation detected.",
    promptToAgent: buildPrompt(code, state),
  };

  // `interrupt` suspends here. When the graph is resumed via Command with the
  // agent's response, `value` becomes that response.
  const response = interrupt<ClarificationRequest, ClarificationResponse>(
    request
  );

  return {
    clarificationRequest: request,
    clarificationResponse: response,
    reAuditAttempts: state.reAuditAttempts + 1,
  };
}

function buildPrompt(code: string, state: PaperPilotStateValue): string {
  switch (code) {
    case "BOT_NO_STOP_LOSS":
      return `The intent for ${state.intent.symbol} ${state.intent.side} ${state.intent.quantity} @ ${state.intent.entryPrice} has no stop loss. Reply with a correctedStopLoss or accept rejection.`;
    case "BOT_MISSING_REASONING":
      return `The intent lacks a substantive signalReason (>= 30 chars). Reply with correctedSignalReason explaining why this trade aligns with the declared ${state.profile.strategyType} strategy.`;
    default:
      return `High-severity violation ${code}. Reply with text justification or accept rejection.`;
  }
}
