import { describe, it, expect, beforeEach } from "vitest";
import { GET } from "./route";
import {
  __resetGlobalRegistry,
  getGlobalRegistry,
} from "@/lib/bots/registry";
import {
  __resetA2ARuntime,
  getOrCreateA2ARuntimeWithStubs,
} from "@/lib/a2a/runtime";

const HACKATHON_USER_ID = "demo_user";

const profile = {
  botName: "EMA-cross BTC",
  strategyType: "trend_following" as const,
  maxRiskPerTradePercent: 2,
  maxTradesPerDay: 5,
  maxAllowedDrawdownPercent: 20,
  botType: "rule_based" as const,
};

beforeEach(() => {
  __resetGlobalRegistry();
  __resetA2ARuntime();
});

async function createBot() {
  return getGlobalRegistry().create({
    ownerUserId: HACKATHON_USER_ID,
    profile,
  });
}

describe("GET /api/dashboard/scorecards - shape", () => {
  it("returns empty perBot/history/totals when there are no bots", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.perBot).toEqual([]);
    expect(data.history).toEqual([]);
    expect(data.totals).toEqual({
      fills: 0,
      interrupts: 0,
      avgScore: null,
      topViolation: null,
    });
  });

  it("returns a perBot row with null score for a bot that has no audits yet", async () => {
    const created = await createBot();
    const res = await GET();
    const data = await res.json();
    expect(data.perBot).toHaveLength(1);
    const row = data.perBot[0];
    expect(row.botId).toBe(created.record.profile.botId);
    expect(row.botName).toBe(profile.botName);
    expect(row.lastScore).toBeNull();
    expect(row.lastBand).toBeNull();
    expect(row.lastViolationCodes).toEqual([]);
    expect(row.lastScoredAtMs).toBeNull();
    expect(row.sparkline).toEqual([]);
  });
});

describe("GET /api/dashboard/scorecards - real audits", () => {
  it("aggregates per-bot last score, sparkline, and totals from auditHistory", async () => {
    const created = await createBot();
    const botId = created.record.profile.botId;

    const rt = getOrCreateA2ARuntimeWithStubs();
    rt.auditHistory.recordAudit({
      ts: 1_000,
      botId,
      score: 80,
      band: "Solid",
      violationCodes: ["BOT_NO_STOP_LOSS"],
      strategyType: "trend_following",
      symbol: "BTCUSDT",
    });
    rt.auditHistory.recordAudit({
      ts: 2_000,
      botId,
      score: 65,
      band: "Notable gaps",
      violationCodes: ["BOT_NO_STOP_LOSS", "BOT_OVERCONFIDENCE"],
      strategyType: "trend_following",
      symbol: "BTCUSDT",
    });
    rt.auditHistory.recordAudit({
      ts: 3_000,
      botId,
      score: 100,
      band: "Exemplary",
      violationCodes: [],
      strategyType: "trend_following",
      symbol: "BTCUSDT",
    });

    const res = await GET();
    const data = await res.json();

    expect(data.perBot).toHaveLength(1);
    const row = data.perBot[0];
    expect(row.lastScore).toBe(100);
    expect(row.lastBand).toBe("Exemplary");
    expect(row.lastViolationCodes).toEqual([]);
    expect(row.lastScoredAtMs).toBe(3_000);
    expect(row.sparkline).toEqual([80, 65, 100]);

    expect(data.history).toHaveLength(3);
    expect(data.history[0]).toEqual({ ts: 1_000, score: 80, botId });
    expect(data.history[2]).toEqual({ ts: 3_000, score: 100, botId });

    // (80 + 65 + 100) / 3 = 81.66... -> 82
    expect(data.totals.avgScore).toBe(82);
    expect(data.totals.topViolation).toEqual({
      code: "BOT_NO_STOP_LOSS",
      count: 2,
    });
  });

  it("filters audits by bot for sparkline but pools everything for totals", async () => {
    const a = await createBot();
    const b = await getGlobalRegistry().create({
      ownerUserId: HACKATHON_USER_ID,
      profile: { ...profile, botName: "Mean reverter" },
    });

    const rt = getOrCreateA2ARuntimeWithStubs();
    rt.auditHistory.recordAudit({
      ts: 1,
      botId: a.record.profile.botId,
      score: 90,
      band: "Exemplary",
      violationCodes: [],
      strategyType: "trend_following",
    });
    rt.auditHistory.recordAudit({
      ts: 2,
      botId: b.record.profile.botId,
      score: 50,
      band: "Pattern of risk failures",
      violationCodes: ["BOT_OVERTRADING"],
      strategyType: "trend_following",
    });

    const res = await GET();
    const data = await res.json();

    const aRow = data.perBot.find(
      (r: { botId: string }) => r.botId === a.record.profile.botId,
    );
    const bRow = data.perBot.find(
      (r: { botId: string }) => r.botId === b.record.profile.botId,
    );

    expect(aRow.sparkline).toEqual([90]);
    expect(bRow.sparkline).toEqual([50]);
    // Avg score is pooled across bots: (90+50)/2 = 70
    expect(data.totals.avgScore).toBe(70);
    expect(data.totals.topViolation).toEqual({
      code: "BOT_OVERTRADING",
      count: 1,
    });
  });
});
