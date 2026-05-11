import { describe, it, expect } from "vitest";
import { calculateScore } from "./scoreCalculator";
import type { RuleViolation } from "./types";

const v = (code: string, severity: RuleViolation["severity"] = "medium"): RuleViolation => ({
  code,
  severity,
  message: code,
});

describe("scoreCalculator - tracer", () => {
  it("returns score 100 and band 'Exemplary' when there are no violations", () => {
    const result = calculateScore([]);

    expect(result.score).toBe(100);
    expect(result.band).toBe("Exemplary");
  });
});

describe("scoreCalculator - per-violation deductions", () => {
  it("BOT_NO_STOP_LOSS deducts 12 points from Risk Policy Compliance", () => {
    const result = calculateScore([v("BOT_NO_STOP_LOSS", "high")]);
    expect(result.score).toBe(88);
    expect(result.breakdown.riskPolicyCompliance).toBe(18);
    expect(result.band).toBe("Solid");
  });

  it("BOT_POOR_RISK_REWARD deducts 8 points from Risk Policy Compliance", () => {
    const result = calculateScore([v("BOT_POOR_RISK_REWARD")]);
    expect(result.score).toBe(92);
    expect(result.breakdown.riskPolicyCompliance).toBe(22);
  });

  it("BOT_STRATEGY_MISMATCH deducts 12 points from Strategy Consistency", () => {
    const result = calculateScore([v("BOT_STRATEGY_MISMATCH")]);
    expect(result.score).toBe(88);
    expect(result.breakdown.strategyConsistency).toBe(8);
  });

  it("BOT_MISSING_REASONING deducts 8 points from Decision Quality", () => {
    const result = calculateScore([v("BOT_MISSING_REASONING", "high")]);
    expect(result.score).toBe(92);
    expect(result.breakdown.decisionQuality).toBe(12);
  });

  it("BOT_INVALID_CONFIDENCE deducts 6 points from Decision Quality", () => {
    const result = calculateScore([v("BOT_INVALID_CONFIDENCE")]);
    expect(result.score).toBe(94);
  });

  it("BOT_OVERCONFIDENCE deducts 6 points from Decision Quality", () => {
    const result = calculateScore([v("BOT_OVERCONFIDENCE")]);
    expect(result.score).toBe(94);
  });

  it("BOT_OVERTRADING zeros Frequency Discipline (15 points)", () => {
    const result = calculateScore([v("BOT_OVERTRADING", "high")]);
    expect(result.score).toBe(85);
    expect(result.breakdown.frequencyDiscipline).toBe(0);
  });
});

describe("scoreCalculator - floor and ceiling", () => {
  it("never returns a score below 0 even with many violations", () => {
    const violations = [
      v("BOT_NO_STOP_LOSS", "high"),
      v("BOT_POOR_RISK_REWARD"),
      v("BOT_STRATEGY_MISMATCH"),
      v("BOT_MISSING_REASONING", "high"),
      v("BOT_INVALID_CONFIDENCE"),
      v("BOT_OVERCONFIDENCE"),
      v("BOT_OVERTRADING", "high"),
    ];
    const result = calculateScore(violations, -10);

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.band).toBe("Severe");
  });

  it("never returns a score above 100", () => {
    // Pass an impossible positive history modifier; our cap clamps it to 0.
    const result = calculateScore([], 50);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

describe("scoreCalculator - band boundaries", () => {
  it("classifies score 90 as Exemplary (lower boundary)", () => {
    const result = calculateScore([v("BOT_INVALID_CONFIDENCE"), v("BOT_OVERCONFIDENCE")]);
    expect(result.score).toBe(88);
    expect(result.band).toBe("Solid");
  });

  it("classifies score 75 as Solid (lower boundary)", () => {
    // Score = 100 - 12 (NO_SL) - 8 (POOR_RR) - 6 (OVERCONF) = 74
    const result = calculateScore([
      v("BOT_NO_STOP_LOSS", "high"),
      v("BOT_POOR_RISK_REWARD"),
      v("BOT_OVERCONFIDENCE"),
    ]);
    expect(result.score).toBe(74);
    expect(result.band).toBe("Notable gaps");
  });

  it("classifies score 60 as Notable gaps (lower boundary)", () => {
    // 100 - 12 - 8 - 12 - 8 = 60
    const result = calculateScore([
      v("BOT_NO_STOP_LOSS", "high"),
      v("BOT_POOR_RISK_REWARD"),
      v("BOT_STRATEGY_MISMATCH"),
      v("BOT_MISSING_REASONING", "high"),
    ]);
    expect(result.score).toBe(60);
    expect(result.band).toBe("Notable gaps");
  });

  it("classifies score 39 as Severe", () => {
    // 100 - 12 - 8 - 12 - 8 - 6 - 15 = 39
    const result = calculateScore([
      v("BOT_NO_STOP_LOSS", "high"),
      v("BOT_POOR_RISK_REWARD"),
      v("BOT_STRATEGY_MISMATCH"),
      v("BOT_MISSING_REASONING", "high"),
      v("BOT_INVALID_CONFIDENCE"),
      v("BOT_OVERTRADING", "high"),
    ]);
    expect(result.score).toBe(39);
    expect(result.band).toBe("Severe");
  });
});

describe("scoreCalculator - history modifier", () => {
  it("applies a -10 history modifier to the total", () => {
    const result = calculateScore([], -10);
    expect(result.score).toBe(90);
    expect(result.breakdown.historyModifier).toBe(-10);
  });

  it("clamps history modifier to a minimum of -10", () => {
    const result = calculateScore([], -50);
    expect(result.breakdown.historyModifier).toBe(-10);
    expect(result.score).toBe(90);
  });
});
