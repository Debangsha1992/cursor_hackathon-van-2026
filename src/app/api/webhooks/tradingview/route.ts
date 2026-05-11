import { NextResponse } from "next/server";
import { parseTradingViewAlert } from "@/lib/adapters/tradingViewAdapter";
import { auditTrade } from "@/lib/trading/auditPipeline";
import { getAuditDeps } from "@/lib/trading/auditRuntime";
import { getGlobalRegistry } from "@/lib/bots/registry";
import { getOrCreateA2ARuntimeWithStubs } from "@/lib/a2a/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/webhooks/tradingview
//
// Pine alerts post here with a JSON body whose shape is constrained by
// `parseTradingViewAlert`. The body MUST include the bot's shared secret
// (`webhookSecret`) and `botId` because TV alerts can't compute HMAC.
//
// On success: returns 200 with `{ score, band, violations, coachReport,
// excerpts }` so the bot owner can inspect the audit result in their
// TradingView alert delivery log.
//
// On parse failure: returns 400 with the specific `AdapterError`.
// On unknown bot: returns 404.
// On bad shared secret: returns 401.
//
// Per the PRD, behavior-quality failures (missing stopLoss, etc.) are
// *not* rejection conditions - the trade is accepted with a low score and
// the violation codes are surfaced in the response.
export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();
  if (rawBody.length === 0) {
    return NextResponse.json(
      { error: "empty_body" },
      { status: 400 }
    );
  }

  // First parse pass with an empty expectedSecret. We pull the botId out of
  // the (validated) payload, look up the bot's actual shared secret, then
  // re-parse with the real expected value so the secret check fires.
  const probe = parseTradingViewAlert(rawBody, "__never_match__");
  if (!probe.ok && probe.error !== "invalid_secret") {
    return NextResponse.json({ error: probe.error }, { status: 400 });
  }

  // We need the parsed payload's botId either way (to look up the secret).
  // The adapter's invalid-secret branch already validated the rest of the
  // payload, so we can safely re-parse the raw body as JSON for botId.
  let botId: string | undefined;
  try {
    const obj = JSON.parse(rawBody) as { botId?: unknown };
    if (typeof obj.botId === "string") botId = obj.botId;
  } catch {
    return NextResponse.json({ error: "malformed" }, { status: 400 });
  }
  if (!botId) {
    return NextResponse.json(
      { error: "missing_bot_id" },
      { status: 400 }
    );
  }

  const registry = getGlobalRegistry();
  const record = await registry.get(botId);
  if (!record) {
    return NextResponse.json(
      { error: "unknown_bot", botId },
      { status: 404 }
    );
  }

  const parsed = parseTradingViewAlert(
    rawBody,
    record.tradingviewSharedSecret
  );
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.error === "invalid_secret" ? 401 : 400 }
    );
  }

  const result = await auditTrade(
    {
      trade: parsed.trade,
      profile: record.profile,
      // Recent trades / violations are stored in Supabase in production; for
      // the hackathon in-memory registry we treat each TV webhook as the
      // first trade of the day. The audit is still meaningful - rule
      // violations and the score still fire.
      recentTrades: [],
      recentViolations: [],
    },
    getAuditDeps()
  );

  // Surface the audit on the dashboard scorecards. Recording is best-effort -
  // we never want a metrics ring buffer hiccup to fail an actual webhook.
  try {
    const rt = getOrCreateA2ARuntimeWithStubs();
    rt.auditHistory.recordAudit({
      ts: rt.now(),
      botId,
      score: result.score.score,
      band: result.score.band,
      violationCodes: result.violations.map((v) => v.code),
      strategyType: result.trade.strategyType,
      symbol: result.trade.symbol,
    });
  } catch {
    // ignored on purpose
  }

  return NextResponse.json(
    {
      ok: true,
      botId,
      score: result.score.score,
      band: result.score.band,
      breakdown: result.score.breakdown,
      violations: result.violations,
      recurringCodes: result.recurringCodes,
      coachReport: {
        prose: result.coachReport.prose,
        excerpts: result.coachReport.excerpts,
        llmFallbackUsed: result.coachReport.llmFallbackUsed,
      },
      trade: result.trade,
    },
    { status: 200 }
  );
}
