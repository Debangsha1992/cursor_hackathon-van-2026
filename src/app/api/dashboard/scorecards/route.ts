import { NextResponse } from "next/server";
import { getOrCreateA2ARuntimeWithStubs, type AuditEntry } from "@/lib/a2a/runtime";
import { getGlobalRegistry } from "@/lib/bots/registry";
import type { ScoreBand } from "@/lib/trading/scoreCalculator";
import type { StrategyType } from "@/lib/trading/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HACKATHON_USER_ID = "demo_user";
const SPARKLINE_LIMIT = 20;
const HISTORY_LIMIT = 100;

export interface PerBotScorecard {
  botId: string;
  botName: string;
  strategyType: StrategyType;
  lastScore: number | null;
  lastBand: ScoreBand | null;
  lastViolationCodes: string[];
  lastScoredAtMs: number | null;
  sparkline: number[];
}

export interface HistoryPoint {
  ts: number;
  score: number;
  botId: string;
}

export interface ScorecardTotals {
  fills: number;
  interrupts: number;
  avgScore: number | null;
  topViolation: { code: string; count: number } | null;
}

export interface ScorecardsResponse {
  perBot: PerBotScorecard[];
  history: HistoryPoint[];
  totals: ScorecardTotals;
}

// GET /api/dashboard/scorecards
//
// Joins the bot registry with the runtime's in-memory audit + market history
// to give the dashboard a single payload it can poll on a tight interval.
// Same-origin only; no auth gate yet (the hackathon registry only knows about
// `demo_user`). Once Supabase auth lands the userId comes from the session.
export async function GET(): Promise<NextResponse<ScorecardsResponse>> {
  const registry = getGlobalRegistry();
  const rt = getOrCreateA2ARuntimeWithStubs();

  const records = await registry.list(HACKATHON_USER_ID);
  const allAudits = rt.auditHistory.recentAudits();

  const perBot: PerBotScorecard[] = records.map((r) => {
    const botAudits = allAudits.filter((a) => a.botId === r.profile.botId);
    const last = botAudits.length > 0 ? botAudits[botAudits.length - 1] : null;
    return {
      botId: r.profile.botId,
      botName: r.profile.botName,
      strategyType: r.profile.strategyType,
      lastScore: last?.score ?? null,
      lastBand: last?.band ?? null,
      lastViolationCodes: last?.violationCodes ?? [],
      lastScoredAtMs: last?.ts ?? null,
      sparkline: botAudits.slice(-SPARKLINE_LIMIT).map((a) => a.score),
    };
  });

  const history: HistoryPoint[] = allAudits
    .slice(-HISTORY_LIMIT)
    .map((a) => ({ ts: a.ts, score: a.score, botId: a.botId }));

  const fills = rt.history.recent().filter((e) => e.kind === "fill").length;
  const interrupts = rt.history.pendingInterrupts().length;
  const avgScore =
    allAudits.length > 0
      ? Math.round(
          allAudits.reduce((s, a) => s + a.score, 0) / allAudits.length,
        )
      : null;
  const topViolation = computeTopViolation(allAudits);

  return NextResponse.json({
    perBot,
    history,
    totals: {
      fills,
      interrupts,
      avgScore,
      topViolation,
    },
  });
}

function computeTopViolation(
  audits: AuditEntry[],
): { code: string; count: number } | null {
  if (audits.length === 0) return null;
  const counts = new Map<string, number>();
  for (const a of audits) {
    for (const code of a.violationCodes) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return null;
  let best: { code: string; count: number } | null = null;
  for (const [code, count] of counts) {
    if (!best || count > best.count) best = { code, count };
  }
  return best;
}
