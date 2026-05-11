import { describe, it, expect } from "vitest";
import { matchNode } from "./match";
import { createInMemoryOrderBook } from "@/lib/market/orderBook";
import type { OrchestratorDeps } from "../deps";
import type { PaperPilotStateValue, Outcome } from "../state";
import type {
  BotTradingProfile,
  TradeIntent,
} from "@/lib/trading/types";
import type { MarketEvent } from "@/lib/market/types";

interface PlainMatchUpdate {
  outcome?: Outcome | null;
  marketEvents?: MarketEvent[];
}

const profile: BotTradingProfile = {
  botId: "bot_a",
  botName: "Alice",
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
  quantity: 1,
  stopLoss: 64000,
  takeProfit: 67000,
  strategyType: "trend_following",
  signalReason: "Reasonable trend-following crossover signal recorded today.",
  confidenceScore: 0.7,
  marketRegime: "trending",
  taskId: "task-A",
  contextId: "ctx-A",
  orderType: "limit",
  limitPrice: 100,
};

function makeDeps() {
  let n = 0;
  return {
    orderBook: createInMemoryOrderBook({
      now: () => 1_000,
      nextId: () => `id-${++n}`,
    }),
    niaClient: { async search() { return []; } },
    manifest: { version: 0, sources: [], retrieval: { default_top_k: 4, default_mode: "universal", citation_format: "" } } as unknown as OrchestratorDeps["manifest"],
    coach: { async narrate() { return { prose: "", excerpts: [], llmFallbackUsed: true, llmLatencyMs: 0 }; } },
    now: () => 1_000,
    nextId: () => `id-${++n}`,
  } satisfies OrchestratorDeps;
}

function makeState(
  overrides: Partial<PaperPilotStateValue> = {}
): PaperPilotStateValue {
  return {
    taskId: "task-A",
    contextId: "ctx-A",
    botId: "bot_a",
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

describe("matchNode", () => {
  it("rests an unmatched limit order on an empty book", async () => {
    const deps = makeDeps();
    const result = (await matchNode(makeState(), {
      configurable: { deps },
    })) as PlainMatchUpdate;
    expect(result.outcome?.kind).toBe("resting");
  });

  it("fills against a resting counter-side limit order", async () => {
    const deps = makeDeps();
    // Resting opposite-side order from another bot.
    await deps.orderBook.place({
      botId: "bot_b",
      taskId: "task-B",
      symbol: "BTCUSDT",
      side: "sell",
      type: "limit",
      limitPrice: 99,
      quantity: 1,
    });
    const result = (await matchNode(makeState(), {
      configurable: { deps },
    })) as PlainMatchUpdate;
    expect(result.outcome?.kind).toBe("filled");
    expect(result.marketEvents).toBeDefined();
    expect(
      (result.marketEvents ?? []).some((e) => e.kind === "fill")
    ).toBe(true);
  });
});
