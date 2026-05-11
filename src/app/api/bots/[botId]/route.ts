import { NextResponse } from "next/server";
import { getGlobalRegistry } from "@/lib/bots/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HACKATHON_USER_ID = "demo_user";

// GET /api/bots/:botId - returns the bot's profile and the integration
// metadata needed to render the integration screens. Secrets are NOT
// returned (they were shown exactly once at registration time).
export async function GET(
  _request: Request,
  context: { params: Promise<{ botId: string }> }
): Promise<NextResponse> {
  const { botId } = await context.params;
  const reg = getGlobalRegistry();
  const record = await reg.get(botId);
  if (!record) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (record.ownerUserId !== HACKATHON_USER_ID) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({
    botId,
    profile: record.profile,
    createdAtMs: record.createdAtMs,
    // The bot owner needs the shared secret to wire up TradingView. We only
    // return it here AFTER an authn check (currently a stand-in user id);
    // when Supabase auth is wired in this becomes session-gated.
    tradingviewSharedSecret: record.tradingviewSharedSecret,
  });
}
