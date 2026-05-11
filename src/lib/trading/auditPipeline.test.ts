import { describe, it, expect } from "vitest";
import { auditTrade } from "./auditPipeline";
import type {
  BotPaperTrade,
  BotTradingProfile,
} from "./types";
import type { Manifest } from "@/lib/corpus/manifestLoader";

const profile: BotTradingProfile = {
  botId: "bot_x",
  botName: "Xbot",
  strategyType: "trend_following",
  maxRiskPerTradePercent: 2,
  maxTradesPerDay: 5,
  maxAllowedDrawdownPercent: 20,
  botType: "rule_based",
};

const cleanTrade: BotPaperTrade = {
  symbol: "BTCUSDT",
  assetType: "crypto",
  side: "buy",
  entryPrice: 65000,
  quantity: 0.01,
  stopLoss: 64000,
  takeProfit: 67000,
  strategyType: "trend_following",
  signalReason: "EMA crossover confirmed on the 15m and 1h timeframes.",
  confidenceScore: 0.7,
  marketRegime: "trending",
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

function stubDeps() {
  return {
    niaClient: { async search() { return []; } },
    manifest: emptyManifest,
    coach: {
      async narrate({ score, band, violations }: {
        score: number;
        band: string;
        violations: Array<{ code: string }>;
      }) {
        return {
          prose: `Score ${score} (${band}). ${violations.length} violations.`,
          excerpts: [],
          llmFallbackUsed: false,
          llmLatencyMs: 1,
        };
      },
    },
  };
}

describe("auditPipeline - happy path", () => {
  it("returns score 100, no violations, and a coach report for a clean trade", async () => {
    const result = await auditTrade(
      { trade: cleanTrade, profile, recentTrades: [], recentViolations: [] },
      stubDeps()
    );
    expect(result.violations).toEqual([]);
    expect(result.score.score).toBe(100);
    expect(result.score.band).toBe("Exemplary");
    expect(result.coachReport.prose).toContain("Exemplary");
  });
});

describe("auditPipeline - flags violations and lowers score", () => {
  it("flags BOT_NO_STOP_LOSS and BOT_MISSING_REASONING on a sparse trade", async () => {
    const sparse: BotPaperTrade = {
      ...cleanTrade,
      stopLoss: undefined,
      signalReason: undefined,
    };
    const result = await auditTrade(
      { trade: sparse, profile, recentTrades: [], recentViolations: [] },
      stubDeps()
    );
    const codes = result.violations.map((v) => v.code);
    expect(codes).toContain("BOT_NO_STOP_LOSS");
    expect(codes).toContain("BOT_MISSING_REASONING");
    expect(result.score.score).toBeLessThan(100);
  });
});

describe("auditPipeline - history modifier applies", () => {
  it("applies the -10 modifier when a code recurred 3+ times", async () => {
    const recent = [
      { code: "BOT_NO_STOP_LOSS", severity: "high" as const, message: "" },
      { code: "BOT_NO_STOP_LOSS", severity: "high" as const, message: "" },
      { code: "BOT_NO_STOP_LOSS", severity: "high" as const, message: "" },
    ];
    const result = await auditTrade(
      {
        trade: cleanTrade,
        profile,
        recentTrades: [],
        recentViolations: recent,
      },
      stubDeps()
    );
    expect(result.recurringCodes).toContain("BOT_NO_STOP_LOSS");
    expect(result.score.score).toBe(90);
  });
});
