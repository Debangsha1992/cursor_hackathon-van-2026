import { detectBotRuleViolations } from "@/lib/trading/botRuleEngine";
import { computeHistoryModifier } from "@/lib/trading/historyModifier";
import { calculateScore } from "@/lib/trading/scoreCalculator";
import type {
  PaperPilotStateValue,
  PaperPilotStateUpdate,
} from "../state";

// AUDIT node: runs the existing pure rule engine + history modifier + score
// calculator over the (possibly clarified) intent.
export function auditNode(
  state: PaperPilotStateValue
): PaperPilotStateUpdate {
  // The intent the rule engine sees may have been corrected by a prior
  // clarification round.
  const correctedIntent = applyClarification(state);
  const violations = detectBotRuleViolations(
    correctedIntent,
    state.profile,
    state.recentTrades,
    state.recentViolations
  );
  const historyModifier = computeHistoryModifier(state.recentViolations);
  const score = calculateScore(violations, historyModifier.modifier);

  return {
    intent: correctedIntent,
    violations,
    historyModifier,
    score,
  };
}

function applyClarification(
  state: PaperPilotStateValue
): PaperPilotStateValue["intent"] {
  const resp = state.clarificationResponse;
  if (!resp) return state.intent;
  return {
    ...state.intent,
    stopLoss: resp.correctedStopLoss ?? state.intent.stopLoss,
    signalReason: resp.correctedSignalReason ?? state.intent.signalReason,
  };
}

// Routing: classify the audit outcome. If there's a high-severity violation
// AND we haven't already burned through our clarification retries, ask for
// input. Otherwise proceed to matching (clean OR low-severity-only).
export function routeAfterAudit(state: PaperPilotStateValue):
  | "clarify"
  | "match"
  | "reject" {
  const high = state.violations.filter((v) => v.severity === "high");
  if (high.length === 0) return "match";

  // Hard rejection — no recovery possible (e.g. unknown bot, malformed body).
  // For violations the agent can fix (no_stop_loss, missing_reasoning) we ask.
  const recoverable = new Set([
    "BOT_NO_STOP_LOSS",
    "BOT_MISSING_REASONING",
  ]);
  const fixable = high.find((v) => recoverable.has(v.code));
  if (!fixable) return "reject";

  // Cap retries so an obstinate bad agent can't loop forever.
  if (state.reAuditAttempts >= 1) return "reject";
  return "clarify";
}
