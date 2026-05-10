import { describe, it, expect } from "vitest";
import { computeHistoryModifier } from "./historyModifier";
import type { RuleViolation } from "./types";

const v = (code: string): RuleViolation => ({
  code,
  severity: "medium",
  message: code,
});

describe("historyModifier - tracer", () => {
  it("returns modifier 0 and empty recurringCodes for an empty history", () => {
    const result = computeHistoryModifier([]);
    expect(result.modifier).toBe(0);
    expect(result.recurringCodes).toEqual([]);
  });
});

describe("historyModifier - recurrence threshold", () => {
  it("returns modifier 0 when a code occurs only twice", () => {
    const history = [v("BOT_NO_STOP_LOSS"), v("BOT_NO_STOP_LOSS")];
    const result = computeHistoryModifier(history);
    expect(result.modifier).toBe(0);
    expect(result.recurringCodes).toEqual([]);
  });

  it("returns modifier -10 and the code when it occurs exactly three times", () => {
    const history = [
      v("BOT_NO_STOP_LOSS"),
      v("BOT_NO_STOP_LOSS"),
      v("BOT_NO_STOP_LOSS"),
    ];
    const result = computeHistoryModifier(history);
    expect(result.modifier).toBe(-10);
    expect(result.recurringCodes).toContain("BOT_NO_STOP_LOSS");
  });

  it("caps modifier at -10 when a code occurs five times", () => {
    const history = Array.from({ length: 5 }, () => v("BOT_OVERTRADING"));
    const result = computeHistoryModifier(history);
    expect(result.modifier).toBe(-10);
  });

  it("caps modifier at -10 when multiple codes each occur 3+ times", () => {
    const history = [
      v("BOT_NO_STOP_LOSS"),
      v("BOT_NO_STOP_LOSS"),
      v("BOT_NO_STOP_LOSS"),
      v("BOT_OVERCONFIDENCE"),
      v("BOT_OVERCONFIDENCE"),
      v("BOT_OVERCONFIDENCE"),
    ];
    const result = computeHistoryModifier(history);
    expect(result.modifier).toBe(-10);
    expect(result.recurringCodes).toContain("BOT_NO_STOP_LOSS");
    expect(result.recurringCodes).toContain("BOT_OVERCONFIDENCE");
  });
});
