import { describe, it, expect } from "vitest";
import { checkUsage } from "./usageGate";

describe("usageGate - tracer", () => {
  it("free tier with 0 used is allowed and reports limit 5", () => {
    const result = checkUsage({ tier: "free", currentMonthCount: 0 });
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(5);
    expect(result.used).toBe(0);
    expect(result.remaining).toBe(5);
    expect(result.upgradeUrl).toBeUndefined();
  });
});

describe("usageGate - free tier", () => {
  it("allows the 5th audit and reports 1 remaining at 4 used", () => {
    const result = checkUsage({ tier: "free", currentMonthCount: 4 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("blocks the 6th audit at 5 used and surfaces the upgrade URL", () => {
    const result = checkUsage({ tier: "free", currentMonthCount: 5 });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.upgradeUrl).toBe("/billing");
  });

  it("respects a caller-provided upgradeUrl override when blocking", () => {
    const result = checkUsage({
      tier: "free",
      currentMonthCount: 5,
      upgradeUrl: "https://allscale.example/upgrade",
    });
    expect(result.upgradeUrl).toBe("https://allscale.example/upgrade");
  });
});

describe("usageGate - pro tier", () => {
  it("allows the first audit on pro and reports limit 100", () => {
    const result = checkUsage({ tier: "pro", currentMonthCount: 0 });
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(100);
    expect(result.upgradeUrl).toBeUndefined();
  });

  it("allows the 100th audit on pro and reports 1 remaining at 99 used", () => {
    const result = checkUsage({ tier: "pro", currentMonthCount: 99 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("defensively blocks pro at 100 used (limit reached)", () => {
    const result = checkUsage({ tier: "pro", currentMonthCount: 100 });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.upgradeUrl).toBeUndefined();
  });
});
