import { NextResponse } from "next/server";

import {
  generateNvdaSeries,
  type Timeframe,
} from "@/lib/market/nvda-fixture";

const VALID_TF = new Set<Timeframe>(["1m", "5m", "15m", "1h", "1D"]);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tfRaw = url.searchParams.get("tf") ?? "5m";
  const tf = (VALID_TF.has(tfRaw as Timeframe) ? tfRaw : "5m") as Timeframe;
  const series = generateNvdaSeries(42, tf);
  return NextResponse.json(series, {
    headers: { "Cache-Control": "no-store" },
  });
}
