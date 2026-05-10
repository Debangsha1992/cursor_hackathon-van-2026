import { describe, it, expect } from "vitest";
import { auditNode, routeAfterAudit } from "./audit";
import type {
  BotTradingProfile,
  RuleViolation,
  TradeIntent,
} from "@/lib/trading/types";
import type { ScoreResult } from "@/lib/trading/scoreCalculator";
import type { PaperPilotStateValue } from "../state";

// `auditNode` returns an annotated state update whose typed shape unions the
// plain value with LangGraph's reducer-overwrite wrapper. Tests work with the
// plain values, so narrow them here.
interface PlainAuditUpdate {
  intent?: TradeIntent;
  violations?: RuleViolation[];
  score?: ScoreResult | null;
}

const profile: BotTradingProfile = {
  botId: "bot_test",
  botName: "TestBot",
  strategyType: "trend_following",
  maxRiskPerTradePercent: 2,
  maxTradesPerDay: 5,
  maxAllowedDrawdownPercent: 20,
  botType: "rule_based",
};

const baseIntent: TradeIntent = {
  symbol: "BTCUSDT",
  assetType: "crypto",
  side: "buy",
  entryPrice: 65000,
  quantity: 0.01,
  stopLoss: 64000,
  takeProfit: 67000,
  strategyType: "trend_following",
  signalReason: "Short moving average crossed above long moving average today.",
  confidenceScore: 0.7,
  marketRegime: "trending",
  taskId: "task1",
  contextId: "ctx1",
  orderType: "limit",
  limitPrice: 65000,
};

function makeState(
  overrides: Partial<PaperPilotStateValue> = {}
): PaperPilotStateValue {
  return {
    taskId: "task1",
    contextId: "ctx1",
    botId: "bot_test",
    intent: baseIntent,
    profile,
    recentTrades: [],
    recentViolations: [],
    violations: [],
    historyModifier: null,
    score: null,
    clarificationRequest: null,
    clarificationResponse: null,
    reAuditAttempts: 0,
    outcome: null,
    marketEvents: [],
    coachReport: null,
    ...overrides,
  };
}

describe("auditNode", () => {
  it("returns an empty violations list for a clean intent", () => {
    const update = auditNode(makeState()) as PlainAuditUpdate;
    expect(update.violations).toEqual([]);
    expect(update.score?.score).toBe(100);
  });

  it("flags BOT_NO_STOP_LOSS for a missing stop loss", () => {
    const state = makeState({
      intent: { ...baseIntent, stopLoss: undefined },
    });
    const update = auditNode(state) as PlainAuditUpdate;
    expect(
      update.violations?.some((v) => v.code === "BOT_NO_STOP_LOSS")
    ).toBe(true);
  });

  it("applies a clarification's correctedStopLoss before re-auditing", () => {
    const state = makeState({
      intent: { ...baseIntent, stopLoss: undefined },
      clarificationResponse: { correctedStopLoss: 64500 },
    });
    const update = auditNode(state) as PlainAuditUpdate;
    expect(update.intent?.stopLoss).toBe(64500);
    expect(
      update.violations?.some((v) => v.code === "BOT_NO_STOP_LOSS")
    ).toBe(false);
  });
});

describe("routeAfterAudit", () => {
  it("routes to 'match' when no high-severity violations", () => {
    expect(routeAfterAudit(makeState({ violations: [] }))).toBe("match");
  });

  it("routes to 'clarify' on a recoverable high-severity violation", () => {
    const state = makeState({
      violations: [
        { code: "BOT_NO_STOP_LOSS", severity: "high", message: "" },
      ],
    });
    expect(routeAfterAudit(state)).toBe("clarify");
  });

  it("routes to 'reject' after one failed clarification attempt", () => {
    const state = makeState({
      violations: [
        { code: "BOT_NO_STOP_LOSS", severity: "high", message: "" },
      ],
      reAuditAttempts: 1,
    });
    expect(routeAfterAudit(state)).toBe("reject");
  });

  it("routes to 'reject' on an unrecoverable high-severity violation", () => {
    const state = makeState({
      violations: [
        { code: "BOT_OVERTRADING", severity: "high", message: "" },
      ],
    });
    expect(routeAfterAudit(state)).toBe("reject");
  });
});
