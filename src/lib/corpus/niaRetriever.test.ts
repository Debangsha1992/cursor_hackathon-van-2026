import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadManifest } from "./manifestLoader";
import { retrieveExcerpts, type NiaClient, type RawHit } from "./niaRetriever";

const realManifest = loadManifest(
  readFileSync(
    resolve(__dirname, "../../../knowledge-base/manifest.yaml"),
    "utf8"
  )
);

const DE_PRADO_ID = "advances-fin-ml-de-prado-2018";
const STRATEGIES_ID = "151-trading-strategies-kakushadze-serur-2018";

function spyClient(canned: RawHit[] = []): NiaClient & {
  calls: { query: string; sourceIds: string[]; topK: number }[];
} {
  const calls: { query: string; sourceIds: string[]; topK: number }[] = [];
  return {
    calls,
    async search(opts) {
      calls.push(opts);
      return canned;
    },
  };
}

describe("niaRetriever - tracer", () => {
  it("queries de Prado source when violations include BOT_OVERCONFIDENCE", async () => {
    const client = spyClient([]);

    await retrieveExcerpts({
      tradeContext: {
        strategyType: "trend_following",
        signalReason: "EMA crossover",
        marketRegime: "trending",
        violationCodes: ["BOT_OVERCONFIDENCE"],
      },
      manifest: realManifest,
      niaClient: client,
    });

    const sourceIds = client.calls.flatMap((c) => c.sourceIds);
    expect(sourceIds).toContain(DE_PRADO_ID);
  });

  it("substitutes trade.strategyType and violations into the primary query template", async () => {
    const client = spyClient([]);

    const result = await retrieveExcerpts({
      tradeContext: {
        strategyType: "mean_reversion",
        signalReason: "Z-score deviation",
        marketRegime: "sideways",
        violationCodes: ["BOT_OVERCONFIDENCE"],
      },
      manifest: realManifest,
      niaClient: client,
    });

    expect(result.queryUsed).toContain("mean_reversion");
    expect(result.queryUsed).toContain("BOT_OVERCONFIDENCE");
    expect(result.queryUsed).toContain("sideways");
  });
});

describe("niaRetriever - source filtering and topK", () => {
  it("uses the fallback template when no violations are present", async () => {
    const client = spyClient([]);

    const result = await retrieveExcerpts({
      tradeContext: {
        strategyType: "trend_following",
        signalReason: "EMA crossover",
        marketRegime: "trending",
        violationCodes: [],
      },
      manifest: realManifest,
      niaClient: client,
    });

    expect(result.queryUsed).not.toContain("Market regime");
    expect(result.queryUsed).toContain("trend_following");
  });

  it("queries both sources when BOT_STRATEGY_MISMATCH is present", async () => {
    const client = spyClient([]);

    await retrieveExcerpts({
      tradeContext: {
        strategyType: "mean_reversion",
        signalReason: "Z-score deviation",
        marketRegime: "sideways",
        violationCodes: ["BOT_STRATEGY_MISMATCH"],
      },
      manifest: realManifest,
      niaClient: client,
    });

    const sourceIds = client.calls.flatMap((c) => c.sourceIds);
    expect(sourceIds).toContain(DE_PRADO_ID);
    expect(sourceIds).toContain(STRATEGIES_ID);
  });

  it("uses the manifest's default_top_k of 4 by default; respects an explicit override", async () => {
    const client1 = spyClient([]);
    await retrieveExcerpts({
      tradeContext: {
        strategyType: "trend_following",
        violationCodes: ["BOT_OVERCONFIDENCE"],
      },
      manifest: realManifest,
      niaClient: client1,
    });
    expect(client1.calls[0]?.topK).toBe(4);

    const client2 = spyClient([]);
    await retrieveExcerpts({
      tradeContext: {
        strategyType: "trend_following",
        violationCodes: ["BOT_OVERCONFIDENCE"],
      },
      manifest: realManifest,
      niaClient: client2,
      topK: 7,
    });
    expect(client2.calls[0]?.topK).toBe(7);
  });

  it("formats excerpts with citation strings matching manifest.retrieval.citation_format", async () => {
    const client = spyClient([
      { sourceId: DE_PRADO_ID, page: 142, text: "Excerpt about overfitting." },
    ]);

    const result = await retrieveExcerpts({
      tradeContext: {
        strategyType: "trend_following",
        violationCodes: ["BOT_OVERCONFIDENCE"],
      },
      manifest: realManifest,
      niaClient: client,
    });

    expect(result.excerpts).toHaveLength(1);
    expect(result.excerpts[0].citation).toContain("L\u00f3pez de Prado");
    expect(result.excerpts[0].citation).toContain("2018");
    expect(result.excerpts[0].citation).toContain("142");
  });
});
