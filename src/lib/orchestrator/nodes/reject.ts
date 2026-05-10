import type {
  PaperPilotStateUpdate,
  PaperPilotStateValue,
} from "../state";

// REJECT_INTENT node: the agent either refused to justify a recoverable
// violation, or the violation isn't recoverable (e.g. invalid confidence). We
// produce a rejected `outcome` without ever touching the order book.
export function rejectNode(
  state: PaperPilotStateValue
): PaperPilotStateUpdate {
  const high = state.violations.find((v) => v.severity === "high");
  return {
    outcome: {
      kind: "rejected",
      reason: high?.code ?? "policy_violation",
    },
  };
}
