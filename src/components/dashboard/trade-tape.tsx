"use client";

import * as React from "react";

import type { BotTrade } from "@/lib/market/nvda-fixture";
import { cn } from "@/lib/utils";

export interface TradeTapeProps {
  trades: BotTrade[];
}

const BOT_LABEL: Record<BotTrade["bot"], string> = {
  polyclaw: "Polyclaw",
  gridhawk: "Gridhawk",
};

export function TradeTape({ trades }: TradeTapeProps) {
  const latest = React.useMemo(
    () => [...trades].sort((a, b) => b.time - a.time).slice(0, 15),
    [trades],
  );

  return (
    <div className="rounded-lg border bg-card p-5">
      <header className="mb-4 flex items-center gap-2">
        <h3 className="text-sm font-medium">Bot trade tape</h3>
        <span className="ml-auto rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          last {latest.length}
        </span>
      </header>
      {latest.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No bot fills yet on this session.
        </p>
      ) : (
        <ul className="space-y-2 text-xs">
          {latest.map((t, i) => (
            <li
              key={`${t.time}-${t.bot}-${i}`}
              className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2 font-mono"
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px]",
                    t.side === "buy"
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-red-500/15 text-red-600 dark:text-red-400",
                  )}
                >
                  {t.side.toUpperCase()}
                </span>
                <span>${t.price.toFixed(2)}</span>
                <span className="text-muted-foreground">× {t.qty}</span>
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-muted-foreground">
                  {BOT_LABEL[t.bot]}
                </span>
                <span className="text-muted-foreground/70">
                  {formatTime(t.time)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatTime(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}
