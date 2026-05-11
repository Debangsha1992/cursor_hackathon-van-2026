import { NextResponse } from "next/server";

import { createCheckoutIntent } from "@/lib/billing/allscaleClient";
import {
  getAllScaleApiKey,
  getAllScaleApiSecret,
  getAllScaleBaseUrl,
} from "@/lib/billing/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/billing/checkout
//
// Asks AllScale Checkout for a $10 USD (currency=1, amount_cents=1000)
// hosted-checkout URL for the *currently signed-in* user, then returns
// `{ checkoutUrl, intentId }` so the client can redirect the user there.
// Settles in USDT on testnet/sandbox via the configured ALLSCALE_API_BASE_URL.
//
// Auth: requires a logged-in Supabase user. Anonymous callers get 401 — we
// never want to mint a checkout intent against an unattributable session.
//
// Surface contract:
//   200 { checkoutUrl, intentId, amountCoins }
//   401 { error: "unauthenticated" }
//   500 { error, code?, requestId? }   ← AllScale error code surfaced verbatim
export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // The request body is optional today, but reserved so we can later accept
  // an `amountCents` override or a `redirectUrl` chosen by the caller. For
  // the hackathon "ask for 10 USD" requirement we ignore the body entirely.
  const origin = new URL(request.url).origin;

  try {
    const intent = await createCheckoutIntent(
      {
        amountCents: 1000,
        currency: 1,
        orderId: `pp_${user.id.replace(/-/g, "").slice(0, 12)}_${Date.now()}`,
        userId: user.id,
        userName: user.email ?? undefined,
        orderDescription: "PaperPilot AI — Pro plan (10 USD)",
        redirectUrl: `${origin}/billing?status=success`,
        extra: { app: "paperpilot-ai", tier: "pro" },
      },
      {
        apiKey: getAllScaleApiKey(),
        apiSecret: getAllScaleApiSecret(),
        baseUrl: getAllScaleBaseUrl(),
      },
    );

    return NextResponse.json(
      {
        checkoutUrl: intent.checkoutUrl,
        intentId: intent.intentId,
        amountCoins: intent.amountCoins,
        stableCoinType: intent.stableCoinType,
      },
      { status: 200 },
    );
  } catch (err) {
    const e = err as {
      name?: string;
      message?: string;
      code?: number;
      requestId?: string;
    };
    return NextResponse.json(
      {
        error: e.message ?? "checkout_failed",
        code: e.code,
        requestId: e.requestId,
      },
      { status: 500 },
    );
  }
}
