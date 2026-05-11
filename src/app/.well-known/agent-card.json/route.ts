import { NextResponse } from "next/server";
import { buildAgentCard } from "@/lib/a2a/agentCard";

export const dynamic = "force-static";
export const revalidate = 3600; // 1h

export async function GET(): Promise<NextResponse> {
  const baseUrl =
    process.env.PAPERPILOT_PUBLIC_URL?.replace(/\/$/, "") ??
    "https://paperpilot.local";
  const version = process.env.PAPERPILOT_VERSION ?? "0.1.0";
  const card = buildAgentCard({ baseUrl, version });

  return NextResponse.json(card, {
    headers: {
      "cache-control": "public, max-age=3600, must-revalidate",
      "content-type": "application/json; charset=utf-8",
    },
  });
}
