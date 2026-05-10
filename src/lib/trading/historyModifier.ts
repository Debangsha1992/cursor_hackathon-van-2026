import type { RuleViolation } from "./types";

export interface HistoryModifierResult {
  recurringCodes: string[];
  modifier: number;
}

const RECURRENCE_THRESHOLD = 3;
const MODIFIER_CAP = -10;

export function computeHistoryModifier(
  recentViolations: RuleViolation[]
): HistoryModifierResult {
  const counts = new Map<string, number>();
  for (const v of recentViolations) {
    counts.set(v.code, (counts.get(v.code) ?? 0) + 1);
  }

  const recurringCodes: string[] = [];
  for (const [code, count] of counts) {
    if (count >= RECURRENCE_THRESHOLD) {
      recurringCodes.push(code);
    }
  }

  const modifier = recurringCodes.length > 0 ? MODIFIER_CAP : 0;

  return { recurringCodes, modifier };
}
