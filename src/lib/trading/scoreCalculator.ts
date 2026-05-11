import type { RuleViolation } from "./types";

export type ScoreBand =
  | "Exemplary"
  | "Solid"
  | "Notable gaps"
  | "Pattern of risk failures"
  | "Severe";

export interface CategoryBreakdown {
  riskPolicyCompliance: number;
  strategyConsistency: number;
  decisionQuality: number;
  frequencyDiscipline: number;
  calibrationRegimeFit: number;
  historyModifier: number;
}

export interface ScoreResult {
  score: number;
  band: ScoreBand;
  breakdown: CategoryBreakdown;
}

const CATEGORY_MAX = {
  riskPolicyCompliance: 30,
  strategyConsistency: 20,
  decisionQuality: 20,
  frequencyDiscipline: 15,
  calibrationRegimeFit: 15,
} as const;

type Category = keyof typeof CATEGORY_MAX;

const DEDUCTION_MAP: Record<string, { category: Category; points: number }> = {
  BOT_NO_STOP_LOSS: { category: "riskPolicyCompliance", points: 12 },
  BOT_POOR_RISK_REWARD: { category: "riskPolicyCompliance", points: 8 },
  BOT_STRATEGY_MISMATCH: { category: "strategyConsistency", points: 12 },
  BOT_MISSING_REASONING: { category: "decisionQuality", points: 8 },
  BOT_INVALID_CONFIDENCE: { category: "decisionQuality", points: 6 },
  BOT_OVERCONFIDENCE: { category: "decisionQuality", points: 6 },
  BOT_OVERTRADING: { category: "frequencyDiscipline", points: 15 },
};

function classifyBand(score: number): ScoreBand {
  if (score >= 90) return "Exemplary";
  if (score >= 75) return "Solid";
  if (score >= 60) return "Notable gaps";
  if (score >= 40) return "Pattern of risk failures";
  return "Severe";
}

export function calculateScore(
  violations: RuleViolation[],
  historyModifier: number = 0
): ScoreResult {
  const breakdown: CategoryBreakdown = {
    riskPolicyCompliance: CATEGORY_MAX.riskPolicyCompliance,
    strategyConsistency: CATEGORY_MAX.strategyConsistency,
    decisionQuality: CATEGORY_MAX.decisionQuality,
    frequencyDiscipline: CATEGORY_MAX.frequencyDiscipline,
    calibrationRegimeFit: CATEGORY_MAX.calibrationRegimeFit,
    historyModifier: Math.max(-10, Math.min(0, historyModifier)),
  };

  for (const violation of violations) {
    const rule = DEDUCTION_MAP[violation.code];
    if (rule) {
      breakdown[rule.category] = Math.max(
        0,
        breakdown[rule.category] - rule.points
      );
    }
  }

  const raw =
    breakdown.riskPolicyCompliance +
    breakdown.strategyConsistency +
    breakdown.decisionQuality +
    breakdown.frequencyDiscipline +
    breakdown.calibrationRegimeFit +
    breakdown.historyModifier;

  const score = Math.max(0, Math.min(100, raw));

  return {
    score,
    band: classifyBand(score),
    breakdown,
  };
}
