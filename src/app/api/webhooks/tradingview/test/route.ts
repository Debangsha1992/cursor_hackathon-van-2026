import { NextResponse } from "next/server";
import { parseTradingViewAlert } from "@/lib/adapters/tradingViewAdapter";
import { auditTrade } from "@/lib/trading/auditPipeline";
import { getAuditDeps } from "@/lib/trading/auditRuntime";
import { getGlobalRegistry } from "@/lib/bots/registry";
import type { BotPaperTrade } from "@/lib/trading/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/webhooks/tradingview/test
//
// Same-origin endpoint that powers the dashboard's "Send test alert" button.
// Synthesizes a TradingView-shaped payload using the bot's stored shared
// secret server-side, runs the same audit path the real webhook uses, and
// returns the audit result inline so the user sees end-to-end behavior on
// the spot.
//
// Body: { botId: string; variant?: "clean" | "no_stop_loss" | "overconfident" | "poor_rr" }
//
// `variant` lets the user preview the result for a few common failure modes
// without leaving the dashboard. Defaults to "clean".
//
// In the hackathon-grade implementation the route trusts the caller; once
// auth is wired in, the ownership check on getTradingviewSharedSecret will
// gate access.

const HACKATHON_USER_ID = "demo_user";

type Variant = "clean" | "no_stop_loss" | "overconfident" | "poor_rr";

function buildSamplePayload(opts: {
  botId: string;
  webhookSecret: string;
  strategyType: BotPaperTrade["strategyType"];
  variant: Variant;
}): Record<string, unknown> {
  const base = {
    webhookSecret: opts.webhookSecret,
    botId: opts.botId,
    symbol: "BTCUSDT",
    assetType: "crypto",
    side: "buy" as const,
    entryPrice: 65000,
    quantity: 0.01,
    strategyType: opts.strategyType,
    signalReason:
      "Fast EMA crossed above slow EMA on the 15m frame with confirmation from the 1h trend filter.",
    confidenceScore: 0.7,
    marketRegime: "trending" as const,
    stopLoss: 64000,
    takeProfit: 67000,
  };

  switch (opts.variant) {
    case "clean":
      return base;
    case "no_stop_loss":
      return { ...base, stopLoss: undefined };
    case "overconfident":
      return { ...base, confidenceScore: 0.97 };
    case "poor_rr":
      // entry 65000, SL 64000 (risk 1000), TP 65500 (reward 500) -> R:R 0.5
      return { ...base, takeProfit: 65500 };
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: { botId?: unknown; variant?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "malformed_body" },
      { status: 400 }
    );
  }
  if (typeof body.botId !== "string") {
    return NextResponse.json(
      { error: "missing_bot_id" },
      { status: 400 }
    );
  }
  const variant: Variant =
    body.variant === "no_stop_loss" ||
    body.variant === "overconfident" ||
    body.variant === "poor_rr"
      ? body.variant
      : "clean";

  const registry = getGlobalRegistry();
  const record = await registry.get(body.botId);
  if (!record) {
    return NextResponse.json(
      { error: "unknown_bot" },
      { status: 404 }
    );
  }

  // Ownership check. Until Supabase auth lands, all bots created on this
  // instance are owned by `demo_user`; switch to the session user once wired.
  const sharedSecret = await registry.getTradingviewSharedSecret(
    body.botId,
    record.ownerUserId === HACKATHON_USER_ID
      ? HACKATHON_USER_ID
      : record.ownerUserId
  );
  if (!sharedSecret) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const payload = buildSamplePayload({
    botId: body.botId,
    webhookSecret: sharedSecret,
    strategyType: record.profile.strategyType,
    variant,
  });
  const parsed = parseTradingViewAlert(JSON.stringify(payload), sharedSecret);
  if (!parsed.ok) {
    // Should never happen given we just built the payload, but surface it
    // honestly so a bug isn't silent.
    return NextResponse.json(
      { error: "synthetic_payload_invalid", reason: parsed.error },
      { status: 500 }
    );
  }

  const result = await auditTrade(
    {
      trade: parsed.trade,
      profile: record.profile,
      recentTrades: [],
      recentViolations: [],
    },
    getAuditDeps()
  );

  return NextResponse.json(
    {
      ok: true,
      botId: body.botId,
      variant,
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
