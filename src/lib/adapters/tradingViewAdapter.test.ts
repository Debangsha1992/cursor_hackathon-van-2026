import { describe, it, expect } from "vitest";
import { parseTradingViewAlert } from "./tradingViewAdapter";

const SECRET = "tv-shared-secret-xyz";

const validBody = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    webhookSecret: SECRET,
    botId: "bot_tv",
    symbol: "BTCUSDT",
    assetType: "crypto",
    side: "buy",
    entryPrice: 65000,
    quantity: 0.01,
    stopLoss: 64000,
    takeProfit: 67000,
    strategyType: "trend_following",
    signalReason: "EMA crossover signal on the 15m frame.",
    confidenceScore: 0.7,
    marketRegime: "trending",
    ...overrides,
  });

describe("tradingViewAdapter - tracer", () => {
  it("parses a valid alert and stamps source + trust_tier", () => {
    const result = parseTradingViewAlert(validBody(), SECRET);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.trade.source).toBe("tradingview_webhook");
      expect(result.trade.trust_tier).toBe("shared_secret");
      expect(result.trade.symbol).toBe("BTCUSDT");
    }
  });
});

describe("tradingViewAdapter - failure modes", () => {
  it("returns 'invalid_secret' when the webhook secret does not match", () => {
    const result = parseTradingViewAlert(validBody(), "wrong-secret");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_secret");
  });

  it("returns 'malformed' when a required field is missing", () => {
    const incomplete = JSON.stringify({
      webhookSecret: SECRET,
      assetType: "crypto",
      side: "buy",
      entryPrice: 65000,
      quantity: 0.01,
      strategyType: "trend_following",
    });

    const result = parseTradingViewAlert(incomplete, SECRET);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("malformed");
  });

  it("returns 'malformed' when JSON is invalid", () => {
    const result = parseTradingViewAlert("{ this is not json }", SECRET);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("malformed");
  });

  it("returns 'invalid_value' when entryPrice is negative", () => {
    const result = parseTradingViewAlert(
      validBody({ entryPrice: -100 }),
      SECRET
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_value");
  });
});
