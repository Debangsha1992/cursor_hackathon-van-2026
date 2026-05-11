import { NextResponse } from "next/server";
import { z } from "zod";
import { getGlobalRegistry } from "@/lib/bots/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HACKATHON_USER_ID = "demo_user";

const RegisterBotBody = z.object({
  botName: z.string().trim().min(1).max(120),
  strategyType: z.enum([
    "trend_following",
    "mean_reversion",
    "breakout",
    "momentum",
    "range_trading",
    "custom",
  ]),
  maxRiskPerTradePercent: z.number().positive().max(50),
  maxTradesPerDay: z.number().int().positive().max(1_000),
  maxAllowedDrawdownPercent: z.number().positive().max(100),
  botType: z.enum(["rule_based", "ai_agent", "hybrid"]),
});

// POST /api/bots - register a new bot. Returns the bot id, both secrets
// (HMAC for direct API, shared for TradingView), and the redirect URL for
// the integration chooser. The secrets are returned ONCE and never again.
export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "malformed_body" }, { status: 400 });
  }
  const parsed = RegisterBotBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_params", detail: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const reg = getGlobalRegistry();
  const created = await reg.create({
    ownerUserId: HACKATHON_USER_ID,
    profile: parsed.data,
  });

  return NextResponse.json(
    {
      ok: true,
      botId: created.record.profile.botId,
      profile: created.record.profile,
      secrets: {
        hmacSecret: created.hmacSecret,
        tradingviewSharedSecret: created.record.tradingviewSharedSecret,
      },
      nextStep: `/bots/${created.record.profile.botId}/integrations`,
    },
    { status: 201 }
  );
}

// GET /api/bots - list bots owned by the current user. In MVP this is the
// hackathon demo user.
export async function GET(): Promise<NextResponse> {
  const reg = getGlobalRegistry();
  const records = await reg.list(HACKATHON_USER_ID);
  return NextResponse.json({
    bots: records.map((r) => ({
      botId: r.profile.botId,
      botName: r.profile.botName,
      strategyType: r.profile.strategyType,
      maxRiskPerTradePercent: r.profile.maxRiskPerTradePercent,
      maxTradesPerDay: r.profile.maxTradesPerDay,
      maxAllowedDrawdownPercent: r.profile.maxAllowedDrawdownPercent,
      botType: r.profile.botType,
      createdAtMs: r.createdAtMs,
    })),
  });
}
