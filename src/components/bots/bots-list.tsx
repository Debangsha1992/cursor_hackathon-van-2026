"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRightIcon, BotIcon } from "lucide-react";

interface BotSummary {
  botId: string;
  botName: string;
  strategyType: string;
  maxRiskPerTradePercent: number;
  maxTradesPerDay: number;
  maxAllowedDrawdownPercent: number;
  botType: string;
  createdAtMs: number;
}

export function BotsList() {
  const [bots, setBots] = React.useState<BotSummary[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    fetch("/api/bots", { cache: "no-store" })
      .then(async (res) => {
        if (!alive) return;
        if (!res.ok) {
          setError(`HTTP ${res.status}`);
          return;
        }
        const data = (await res.json()) as { bots: BotSummary[] };
        setBots(data.bots);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "fetch failed");
      });
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
        Failed to load bots: {error}
      </div>
    );
  }
  if (!bots) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }
  if (bots.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/40 p-10 text-center">
        <BotIcon className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-4 text-sm font-medium">No bots yet</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Register your first agent to start auditing its behavior. The
          fastest path is the TradingView webhook - five minutes from Pine
          alert to first audit.
        </p>
        <Link
          href="/bots/new"
          className="mt-6 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Register a bot
          <ArrowRightIcon className="ml-2 size-4" />
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {bots.map((bot) => (
        <li key={bot.botId}>
          <Link
            href={`/bots/${bot.botId}/integrations`}
            className="group flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent"
          >
            <div className="flex size-10 items-center justify-center rounded-md border bg-background">
              <BotIcon className="size-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{bot.botName}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {bot.strategyType.replace(/_/g, " ")} ·{" "}
                {bot.maxRiskPerTradePercent}% max risk ·{" "}
                {bot.maxTradesPerDay}/day · {bot.botType}
              </p>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground/70">
                {bot.botId}
              </p>
            </div>
            <ArrowRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
