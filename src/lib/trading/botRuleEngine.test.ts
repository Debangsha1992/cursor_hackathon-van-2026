import { describe, it, expect } from "vitest";
import { detectBotRuleViolations } from "./botRuleEngine";
import type { BotPaperTrade, BotTradingProfile } from "./types";

const baseTrade: BotPaperTrade = {
  symbol: "BTCUSDT",
  assetType: "crypto",
  side: "buy",
  entryPrice: 65000,
  quantity: 0.01,
  stopLoss: 64000,
  takeProfit: 67000,
  strategyType: "trend_following",
  signalReason: "Short moving average crossed above long moving average.",
  confidenceScore: 0.75,
  marketRegime: "trending",
};

const baseProfile: BotTradingProfile = {
  botId: "bot_test",
  botName: "TestBot",
  strategyType: "trend_following",
  maxRiskPerTradePercent: 2,
  maxTradesPerDay: 5,
  maxAllowedDrawdownPercent: 20,
  botType: "rule_based",
};

describe("botRuleEngine - BOT_NO_STOP_LOSS", () => {
  it("flags a trade with no stopLoss as a high-severity violation", () => {
    const trade: BotPaperTrade = { ...baseTrade, stopLoss: undefined };

    const violations = detectBotRuleViolations(trade, baseProfile, [], []);

    const noStopLoss = violations.find((v) => v.code === "BOT_NO_STOP_LOSS");
    expect(noStopLoss).toBeDefined();
    expect(noStopLoss?.severity).toBe("high");
  });

  it("does not flag BOT_NO_STOP_LOSS when stopLoss is set", () => {
    const violations = detectBotRuleViolations(baseTrade, baseProfile, [], []);

    const noStopLoss = violations.find((v) => v.code === "BOT_NO_STOP_LOSS");
    expect(noStopLoss).toBeUndefined();
  });
});

describe("botRuleEngine - BOT_STRATEGY_MISMATCH", () => {
  it("flags a trade whose strategyType differs from the profile (non-custom)", () => {
    const trade: BotPaperTrade = { ...baseTrade, strategyType: "mean_reversion" };
    const profile: BotTradingProfile = {
      ...baseProfile,
      strategyType: "trend_following",
    };

    const violations = detectBotRuleViolations(trade, profile, [], []);

    const mismatch = violations.find(
      (v) => v.code === "BOT_STRATEGY_MISMATCH"
    );
    expect(mismatch).toBeDefined();
  });

  it("does not flag BOT_STRATEGY_MISMATCH when strategyType matches", () => {
    const violations = detectBotRuleViolations(baseTrade, baseProfile, [], []);

    const mismatch = violations.find(
      (v) => v.code === "BOT_STRATEGY_MISMATCH"
    );
    expect(mismatch).toBeUndefined();
  });

  it("does not flag BOT_STRATEGY_MISMATCH when profile.strategyType is 'custom'", () => {
    const trade: BotPaperTrade = { ...baseTrade, strategyType: "mean_reversion" };
    const profile: BotTradingProfile = { ...baseProfile, strategyType: "custom" };

    const violations = detectBotRuleViolations(trade, profile, [], []);

    const mismatch = violations.find(
      (v) => v.code === "BOT_STRATEGY_MISMATCH"
    );
    expect(mismatch).toBeUndefined();
  });
});

describe("botRuleEngine - BOT_POOR_RISK_REWARD", () => {
  it("flags a trade where reward-to-risk ratio is below 1.5", () => {
    // entry 65000, SL 64000 (risk 1000), TP 65500 (reward 500), R:R = 0.5
    const trade: BotPaperTrade = {
      ...baseTrade,
      entryPrice: 65000,
      stopLoss: 64000,
      takeProfit: 65500,
    };

    const violations = detectBotRuleViolations(trade, baseProfile, [], []);

    const poor = violations.find((v) => v.code === "BOT_POOR_RISK_REWARD");
    expect(poor).toBeDefined();
  });

  it("does not flag BOT_POOR_RISK_REWARD when R:R >= 1.5", () => {
    // entry 65000, SL 64000 (risk 1000), TP 67000 (reward 2000), R:R = 2.0
    const trade: BotPaperTrade = {
      ...baseTrade,
      entryPrice: 65000,
      stopLoss: 64000,
      takeProfit: 67000,
    };

    const violations = detectBotRuleViolations(trade, baseProfile, [], []);

    const poor = violations.find((v) => v.code === "BOT_POOR_RISK_REWARD");
    expect(poor).toBeUndefined();
  });

  it("does not flag BOT_POOR_RISK_REWARD when takeProfit is unset", () => {
    const trade: BotPaperTrade = { ...baseTrade, takeProfit: undefined };

    const violations = detectBotRuleViolations(trade, baseProfile, [], []);

    const poor = violations.find((v) => v.code === "BOT_POOR_RISK_REWARD");
    expect(poor).toBeUndefined();
  });
});

describe("botRuleEngine - BOT_OVERTRADING", () => {
  it("flags a trade when recentTrades.length >= profile.maxTradesPerDay", () => {
    const recent: BotPaperTrade[] = Array.from(
      { length: baseProfile.maxTradesPerDay },
      () => baseTrade
    );

    const violations = detectBotRuleViolations(
      baseTrade,
      baseProfile,
      recent,
      []
    );

    const over = violations.find((v) => v.code === "BOT_OVERTRADING");
    expect(over).toBeDefined();
    expect(over?.severity).toBe("high");
  });

  it("does not flag BOT_OVERTRADING when below the daily cap", () => {
    const recent: BotPaperTrade[] = Array.from(
      { length: baseProfile.maxTradesPerDay - 1 },
      () => baseTrade
    );

    const violations = detectBotRuleViolations(
      baseTrade,
      baseProfile,
      recent,
      []
    );

    const over = violations.find((v) => v.code === "BOT_OVERTRADING");
    expect(over).toBeUndefined();
  });
});

describe("botRuleEngine - BOT_OVERCONFIDENCE", () => {
  it("flags a trade with confidenceScore at 0.95", () => {
    const trade: BotPaperTrade = { ...baseTrade, confidenceScore: 0.95 };

    const violations = detectBotRuleViolations(trade, baseProfile, [], []);

    const overconf = violations.find((v) => v.code === "BOT_OVERCONFIDENCE");
    expect(overconf).toBeDefined();
    expect(overconf?.severity).toBe("medium");
  });

  it("does not flag BOT_OVERCONFIDENCE at 0.85", () => {
    const trade: BotPaperTrade = { ...baseTrade, confidenceScore: 0.85 };

    const violations = detectBotRuleViolations(trade, baseProfile, [], []);

    const overconf = violations.find((v) => v.code === "BOT_OVERCONFIDENCE");
    expect(overconf).toBeUndefined();
  });
});

describe("botRuleEngine - BOT_INVALID_CONFIDENCE", () => {
  it("flags a trade with confidenceScore below 0", () => {
    const trade: BotPaperTrade = { ...baseTrade, confidenceScore: -0.1 };

    const violations = detectBotRuleViolations(trade, baseProfile, [], []);

    const invalid = violations.find((v) => v.code === "BOT_INVALID_CONFIDENCE");
    expect(invalid).toBeDefined();
  });

  it("flags a trade with confidenceScore above 1", () => {
    const trade: BotPaperTrade = { ...baseTrade, confidenceScore: 1.5 };

    const violations = detectBotRuleViolations(trade, baseProfile, [], []);

    const invalid = violations.find((v) => v.code === "BOT_INVALID_CONFIDENCE");
    expect(invalid).toBeDefined();
  });

  it("does not flag BOT_INVALID_CONFIDENCE when confidence is in [0,1]", () => {
    const trade: BotPaperTrade = { ...baseTrade, confidenceScore: 0.5 };

    const violations = detectBotRuleViolations(trade, baseProfile, [], []);

    const invalid = violations.find((v) => v.code === "BOT_INVALID_CONFIDENCE");
    expect(invalid).toBeUndefined();
  });
});

describe("botRuleEngine - BOT_MISSING_REASONING", () => {
  it("flags a trade with no signalReason", () => {
    const trade: BotPaperTrade = { ...baseTrade, signalReason: undefined };

    const violations = detectBotRuleViolations(trade, baseProfile, [], []);

    const missing = violations.find((v) => v.code === "BOT_MISSING_REASONING");
    expect(missing).toBeDefined();
    expect(missing?.severity).toBe("high");
  });

  it("flags a trade whose signalReason is shorter than 30 chars", () => {
    const trade: BotPaperTrade = { ...baseTrade, signalReason: "MA crossover" };

    const violations = detectBotRuleViolations(trade, baseProfile, [], []);

    const missing = violations.find((v) => v.code === "BOT_MISSING_REASONING");
    expect(missing).toBeDefined();
  });

  it("does not flag BOT_MISSING_REASONING when signalReason is substantive", () => {
    const violations = detectBotRuleViolations(baseTrade, baseProfile, [], []);

    const missing = violations.find((v) => v.code === "BOT_MISSING_REASONING");
    expect(missing).toBeUndefined();
  });
});
