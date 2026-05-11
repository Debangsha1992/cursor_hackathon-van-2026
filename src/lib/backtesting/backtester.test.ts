import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runBacktest, type CandlesFile } from "./backtester";
import type { BotTradingProfile } from "../trading/types";

const candlesFile: CandlesFile = JSON.parse(
  readFileSync(
    resolve(__dirname, "../../../public/sample-candles/btc.json"),
    "utf8"
  )
);

const profile: BotTradingProfile = {
  botId: "bot_test",
  botName: "GoldenTestBot",
  strategyType: "trend_following",
  maxRiskPerTradePercent: 2,
  maxTradesPerDay: 5,
  maxAllowedDrawdownPercent: 20,
  botType: "rule_based",
};

describe("backtester - golden test", () => {
  it("produces a deterministic result for MA-crossover on the BTC fixture", () => {
    const result = runBacktest({
      strategy: "ma_crossover",
      candles: candlesFile.candles,
      profile,
      shortPeriod: 5,
      longPeriod: 10,
    });

    expect(result.trades.length).toBeGreaterThan(0);
    expect(typeof result.summary.totalReturn).toBe("number");
    expect(result.summary.winRate).toBeGreaterThanOrEqual(0);
    expect(result.summary.winRate).toBeLessThanOrEqual(1);
    expect(Array.isArray(result.violations)).toBe(true);

    expect({
      tradesCount: result.trades.length,
      totalReturn: Number(result.summary.totalReturn.toFixed(4)),
      winRate: Number(result.summary.winRate.toFixed(4)),
      totalTrades: result.summary.totalTrades,
      violationsCount: result.violations.length,
    }).toMatchSnapshot();
  });
});
