import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "./route";
import { POST as TEST_POST } from "./test/route";
import { __resetGlobalRegistry, getGlobalRegistry } from "@/lib/bots/registry";
import {
  __resetA2ARuntime,
  getOrCreateA2ARuntimeWithStubs,
} from "@/lib/a2a/runtime";

const HACKATHON_USER_ID = "demo_user";

const validProfile = {
  botName: "EMA-cross BTC",
  strategyType: "trend_following" as const,
  maxRiskPerTradePercent: 2,
  maxTradesPerDay: 5,
  maxAllowedDrawdownPercent: 20,
  botType: "rule_based" as const,
};

async function createBot() {
  const reg = getGlobalRegistry();
  return reg.create({ ownerUserId: HACKATHON_USER_ID, profile: validProfile });
}

function buildPayload(opts: {
  webhookSecret: string;
  botId: string;
  override?: Record<string, unknown>;
}): string {
  return JSON.stringify({
    webhookSecret: opts.webhookSecret,
    botId: opts.botId,
    symbol: "BTCUSDT",
    assetType: "crypto",
    side: "buy",
    entryPrice: 65000,
    quantity: 0.01,
    stopLoss: 64000,
    takeProfit: 67000,
    strategyType: "trend_following",
    signalReason: "EMA crossover with 1h trend confirmation; both timeframes long.",
    confidenceScore: 0.7,
    marketRegime: "trending",
    ...opts.override,
  });
}

function makeRequest(body: string): Request {
  return new Request("http://test.local/api/webhooks/tradingview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

beforeEach(() => {
  __resetGlobalRegistry();
  __resetA2ARuntime();
});

describe("POST /api/webhooks/tradingview - happy path", () => {
  it("audits a clean trade and returns score 100", async () => {
    const created = await createBot();
    const body = buildPayload({
      webhookSecret: created.record.tradingviewSharedSecret,
      botId: created.record.profile.botId,
    });
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      ok: boolean;
      score: number;
      violations: unknown[];
      coachReport: { prose: string };
    };
    expect(data.ok).toBe(true);
    expect(data.score).toBe(100);
    expect(data.violations).toEqual([]);
    expect(data.coachReport.prose.length).toBeGreaterThan(10);
  });

  it("stamps source=tradingview_webhook and trust_tier=shared_secret on the trade", async () => {
    const created = await createBot();
    const body = buildPayload({
      webhookSecret: created.record.tradingviewSharedSecret,
      botId: created.record.profile.botId,
    });
    const res = await POST(makeRequest(body));
    const data = (await res.json()) as {
      trade: { source: string; trust_tier: string };
    };
    expect(data.trade.source).toBe("tradingview_webhook");
    expect(data.trade.trust_tier).toBe("shared_secret");
  });
});

describe("POST /api/webhooks/tradingview - audit history side-effect", () => {
  it("records the audit into the runtime's auditHistory ring buffer", async () => {
    const created = await createBot();
    const before = getOrCreateA2ARuntimeWithStubs().auditHistory.recentAudits({
      botId: created.record.profile.botId,
    });
    expect(before).toEqual([]);

    const body = buildPayload({
      webhookSecret: created.record.tradingviewSharedSecret,
      botId: created.record.profile.botId,
    });
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);

    const after = getOrCreateA2ARuntimeWithStubs().auditHistory.recentAudits({
      botId: created.record.profile.botId,
    });
    expect(after).toHaveLength(1);
    expect(after[0].score).toBe(100);
    expect(after[0].band).toBe("Exemplary");
    expect(after[0].violationCodes).toEqual([]);
    expect(after[0].symbol).toBe("BTCUSDT");
    expect(after[0].strategyType).toBe("trend_following");
  });

  it("records a violation-bearing audit with the matching code", async () => {
    const created = await createBot();
    const body = buildPayload({
      webhookSecret: created.record.tradingviewSharedSecret,
      botId: created.record.profile.botId,
      override: { stopLoss: undefined },
    });
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);

    const after = getOrCreateA2ARuntimeWithStubs().auditHistory.recentAudits({
      botId: created.record.profile.botId,
    });
    expect(after).toHaveLength(1);
    expect(after[0].violationCodes).toContain("BOT_NO_STOP_LOSS");
    expect(after[0].score).toBeLessThan(100);
  });
});

describe("POST /api/webhooks/tradingview - audit-quality failures (200 with violations)", () => {
  it("accepts a missing-stop-loss trade with violations and lowered score", async () => {
    const created = await createBot();
    const body = buildPayload({
      webhookSecret: created.record.tradingviewSharedSecret,
      botId: created.record.profile.botId,
      override: { stopLoss: undefined },
    });
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      score: number;
      violations: Array<{ code: string }>;
    };
    expect(data.score).toBeLessThan(100);
    expect(data.violations.some((v) => v.code === "BOT_NO_STOP_LOSS")).toBe(true);
  });
});

describe("POST /api/webhooks/tradingview - rejection paths", () => {
  it("returns 404 for an unknown bot", async () => {
    const body = buildPayload({
      webhookSecret: "irrelevant",
      botId: "bot_nonexistent",
    });
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(404);
  });

  it("returns 401 when the shared secret is wrong", async () => {
    const created = await createBot();
    const body = buildPayload({
      webhookSecret: "wrong-secret",
      botId: created.record.profile.botId,
    });
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("invalid_secret");
  });

  it("returns 400 on malformed JSON", async () => {
    const res = await POST(makeRequest("{ not valid json"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when required fields are missing", async () => {
    const created = await createBot();
    const incomplete = JSON.stringify({
      webhookSecret: created.record.tradingviewSharedSecret,
      botId: created.record.profile.botId,
      // missing symbol, side, etc.
    });
    const res = await POST(makeRequest(incomplete));
    expect(res.status).toBe(400);
  });

  it("returns 400 on empty body", async () => {
    const res = await POST(makeRequest(""));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/webhooks/tradingview/test - synthetic payload runner", () => {
  function makeTestRequest(body: unknown): Request {
    return new Request("http://test.local/api/webhooks/tradingview/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns score 100 for the 'clean' variant", async () => {
    const created = await createBot();
    const res = await TEST_POST(
      makeTestRequest({ botId: created.record.profile.botId, variant: "clean" })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { score: number; violations: unknown[] };
    expect(data.score).toBe(100);
    expect(data.violations).toEqual([]);
  });

  it("returns a BOT_NO_STOP_LOSS violation for the 'no_stop_loss' variant", async () => {
    const created = await createBot();
    const res = await TEST_POST(
      makeTestRequest({
        botId: created.record.profile.botId,
        variant: "no_stop_loss",
      })
    );
    const data = (await res.json()) as {
      score: number;
      violations: Array<{ code: string }>;
    };
    expect(data.score).toBeLessThan(100);
    expect(data.violations.some((v) => v.code === "BOT_NO_STOP_LOSS")).toBe(true);
  });

  it("returns a BOT_OVERCONFIDENCE violation for the 'overconfident' variant", async () => {
    const created = await createBot();
    const res = await TEST_POST(
      makeTestRequest({
        botId: created.record.profile.botId,
        variant: "overconfident",
      })
    );
    const data = (await res.json()) as {
      violations: Array<{ code: string }>;
    };
    expect(data.violations.some((v) => v.code === "BOT_OVERCONFIDENCE")).toBe(
      true
    );
  });

  it("returns a BOT_POOR_RISK_REWARD violation for the 'poor_rr' variant", async () => {
    const created = await createBot();
    const res = await TEST_POST(
      makeTestRequest({
        botId: created.record.profile.botId,
        variant: "poor_rr",
      })
    );
    const data = (await res.json()) as {
      violations: Array<{ code: string }>;
    };
    expect(data.violations.some((v) => v.code === "BOT_POOR_RISK_REWARD")).toBe(
      true
    );
  });

  it("returns 404 for an unknown bot", async () => {
    const res = await TEST_POST(
      makeTestRequest({ botId: "bot_missing", variant: "clean" })
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when botId is missing", async () => {
    const res = await TEST_POST(makeTestRequest({ variant: "clean" }));
    expect(res.status).toBe(400);
  });

  it("records the synthetic audit into the runtime's auditHistory", async () => {
    const created = await createBot();
    const res = await TEST_POST(
      makeTestRequest({
        botId: created.record.profile.botId,
        variant: "no_stop_loss",
      })
    );
    expect(res.status).toBe(200);

    const after = getOrCreateA2ARuntimeWithStubs().auditHistory.recentAudits({
      botId: created.record.profile.botId,
    });
    expect(after).toHaveLength(1);
    expect(after[0].violationCodes).toContain("BOT_NO_STOP_LOSS");
  });
});
