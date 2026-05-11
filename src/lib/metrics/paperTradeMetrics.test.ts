import { describe, it, expect } from "vitest";
import { computeMetrics, type ScoredTrade } from "./paperTradeMetrics";

describe("paperTradeMetrics - tracer", () => {
  it("returns empty sparkline, empty topViolationCodes, and null currentScore for no trades", () => {
    const result = computeMetrics([]);

    expect(result.sparklineSeries).toEqual([]);
    expect(result.topViolationCodes).toEqual([]);
    expect(result.currentScore).toBeNull();
  });
});

describe("paperTradeMetrics - shape", () => {
  it("computes a single-trade sparkline and current score", () => {
    const trades: ScoredTrade[] = [
      { score: 80, violations: [{ code: "BOT_NO_STOP_LOSS" }] },
    ];

    const result = computeMetrics(trades);

    expect(result.sparklineSeries).toEqual([80]);
    expect(result.currentScore).toBe(80);
    expect(result.topViolationCodes).toHaveLength(1);
    expect(result.topViolationCodes[0]).toEqual({
      code: "BOT_NO_STOP_LOSS",
      count: 1,
    });
  });

  it("orders top violation codes by frequency, capped at 3", () => {
    const trades: ScoredTrade[] = [
      ...Array.from({ length: 10 }, () => ({
        score: 60,
        violations: [{ code: "BOT_NO_STOP_LOSS" }],
      })),
      ...Array.from({ length: 7 }, () => ({
        score: 70,
        violations: [{ code: "BOT_OVERCONFIDENCE" }],
      })),
      ...Array.from({ length: 4 }, () => ({
        score: 80,
        violations: [{ code: "BOT_POOR_RISK_REWARD" }],
      })),
      ...Array.from({ length: 2 }, () => ({
        score: 90,
        violations: [{ code: "BOT_OVERTRADING" }],
      })),
      ...Array.from({ length: 27 }, () => ({ score: 95, violations: [] })),
    ];

    const result = computeMetrics(trades);

    expect(result.sparklineSeries).toHaveLength(50);
    expect(result.topViolationCodes).toHaveLength(3);
    expect(result.topViolationCodes[0].code).toBe("BOT_NO_STOP_LOSS");
    expect(result.topViolationCodes[1].code).toBe("BOT_OVERCONFIDENCE");
    expect(result.topViolationCodes[2].code).toBe("BOT_POOR_RISK_REWARD");
    expect(result.currentScore).toBe(95);
  });
});
