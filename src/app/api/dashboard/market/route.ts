import { NextResponse } from "next/server";
import { createInMemoryRepo, getOrCreateA2ARuntime } from "@/lib/a2a/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/dashboard/market - returns the live market snapshot for the
// dashboard market panel. Same-origin only; intentionally no HMAC, since
// the dashboard speaks to its own backend (not as a bot).
export async function GET(): Promise<NextResponse> {
  const rt = getOrCreateA2ARuntime({
    niaClient: { async search() { return []; } },
    coach: {
      async narrate() {
        return {
          prose: "",
          excerpts: [],
          llmFallbackUsed: true,
          llmLatencyMs: 0,
        };
      },
    },
    repo: createInMemoryRepo(),
  });

  const snap = await rt.orderBook.snapshot("BTCUSDT");
  const events = rt.history.recent();
  const interrupts = rt.history.pendingInterrupts();

  // Surface the most recent fills (newest first), cap at 20.
  const fills = events
    .filter((e) => e.kind === "fill")
    .map((e) => (e.kind === "fill" ? e.fill : null))
    .filter((f) => f !== null)
    .slice(-20)
    .reverse();

  return NextResponse.json({
    symbol: "BTCUSDT",
    book: {
      bids: snap.bids
        .slice()
        .sort((a, b) => (b.limitPrice ?? 0) - (a.limitPrice ?? 0))
        .slice(0, 5),
      asks: snap.asks
        .slice()
        .sort((a, b) => (a.limitPrice ?? 0) - (b.limitPrice ?? 0))
        .slice(0, 5),
    },
    fills,
    interrupts,
  });
}
