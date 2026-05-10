import { describe, it, expect } from "vitest";
import { Command } from "@langchain/langgraph";
import { buildOrchestratorGraph, buildInitialState } from "./graph";
import { createInMemoryOrderBook } from "@/lib/market/orderBook";
import type { OrchestratorDeps, CoachNarrator } from "./deps";
import type {
  BotTradingProfile,
  TradeIntent,
} from "@/lib/trading/types";
import type { Manifest } from "@/lib/corpus/manifestLoader";

const profile: BotTradingProfile = {
  botId: "bot_test",
  botName: "TestBot",
  strategyType: "trend_following",
  maxRiskPerTradePercent: 2,
  maxTradesPerDay: 5,
  maxAllowedDrawdownPercent: 20,
  botType: "rule_based",
};

const emptyManifest: Manifest = {
  version: 0,
  sources: [],
  retrieval: {
    default_top_k: 4,
    default_mode: "universal",
    citation_format: "{title_short}, p.{page}",
  },
  query_composition: {
    template: "{trade.strategyType}: {violation_codes_joined}",
    fallback_template: "{trade.strategyType}",
  },
};

const stubCoach: CoachNarrator = {
  async narrate({ violations, score, band }) {
    return {
      prose: `Score ${score} (${band}). ${violations.length} violations.`,
      excerpts: [
        {
          sourceId: "stub",
          page: 1,
          text: "stub excerpt",
          citation: "Stub (2026), p.1",
        },
      ],
      llmFallbackUsed: false,
      llmLatencyMs: 0,
    };
  },
};

function makeDeps(): OrchestratorDeps {
  let n = 0;
  return {
    orderBook: createInMemoryOrderBook({
      now: () => 1_000 + n++,
      nextId: () => `id-${n++}`,
    }),
    niaClient: { async search() { return []; } },
    manifest: emptyManifest,
    coach: stubCoach,
    now: () => 1_000,
    nextId: () => `id-${n++}`,
  };
}

describe("orchestrator graph - end-to-end interrupt-and-resume golden", () => {
  it(
    "rejects no-stop-loss, interrupts for clarification, resumes with correction, matches, and emits a coach report with a citation",
    async () => {
      const deps = makeDeps();
      const graph = buildOrchestratorGraph();
      const taskId = "task-golden";
      const contextId = "ctx-golden";

      // First place a counter-side ask so a corrected intent has liquidity.
      await deps.orderBook.place({
        botId: "bot_counter",
        taskId: "task-counter",
        symbol: "BTCUSDT",
        side: "sell",
        type: "limit",
        limitPrice: 100,
        quantity: 1,
      });

      const badIntent: TradeIntent = {
        symbol: "BTCUSDT",
        assetType: "crypto",
        side: "buy",
        entryPrice: 100,
        quantity: 1,
        stopLoss: undefined, // <- triggers BOT_NO_STOP_LOSS
        takeProfit: 105,
        strategyType: "trend_following",
        signalReason:
          "Moving-average crossover signal across the last two sessions.",
        confidenceScore: 0.7,
        marketRegime: "trending",
        taskId,
        contextId,
        orderType: "limit",
        limitPrice: 101,
      };

      const config = {
        configurable: {
          thread_id: taskId,
          deps,
        },
      };

      // Phase 1: should hit the interrupt at `clarify`.
      const stream1 = await graph.stream(
        buildInitialState({
          taskId,
          contextId,
          botId: "bot_test",
          intent: badIntent,
          profile,
          recentTrades: [],
          recentViolations: [],
        }),
        { ...config, streamMode: "updates" }
      );
      let sawInterrupt = false;
      for await (const update of stream1) {
        if ("__interrupt__" in update) sawInterrupt = true;
      }
      // After phase 1 the state is parked at the clarify interrupt.
      const snap1 = await graph.getState(config);
      expect(snap1).toBeDefined();
      const pending = snap1?.tasks ?? [];
      const hasInterrupt =
        sawInterrupt ||
        pending.some(
          (t) => Array.isArray(t.interrupts) && t.interrupts.length > 0
        );
      expect(hasInterrupt).toBe(true);

      // Phase 2: agent supplies a clarification — corrected stop loss.
      const stream2 = await graph.stream(
        new Command({ resume: { correctedStopLoss: 98 } }),
        { ...config, streamMode: "updates" }
      );
      for await (const _update of stream2) {
        // drain
      }

      const finalSnap = await graph.getState(config);
      const finalValues = finalSnap?.values;
      expect(finalValues).toBeDefined();
      expect(finalValues!.violations).toEqual([]);
      expect(finalValues!.outcome?.kind).toBe("filled");
      expect(finalValues!.coachReport).toBeDefined();
      expect(finalValues!.coachReport!.excerpts).toHaveLength(1);
      expect(finalValues!.coachReport!.excerpts[0].citation).toContain(
        "p.1"
      );
    },
    15_000
  );
});
