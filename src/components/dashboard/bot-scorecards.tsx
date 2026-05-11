"use client";

import * as React from "react";

import type { BotTrade } from "@/lib/market/nvda-fixture";
import { cn } from "@/lib/utils";

export interface BotScorecardsProps {
  trades: BotTrade[];
  lastPrice: number;
}

interface BotStats {
  bot: BotTrade["bot"];
  name: string;
  role: string;
  totalTrades: number;
  winRatePct: number;
  pnl: number;
  avgFill: number;
}

export function BotScorecards({ trades, lastPrice }: BotScorecardsProps) {
  const stats = React.useMemo(
    () => [
      computeStats(trades, "polyclaw", lastPrice, "Polyclaw", "momentum"),
      computeStats(trades, "gridhawk", lastPrice, "Gridhawk", "grid"),
    ],
    [trades, lastPrice],
  );

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {stats.map((s) => (
        <Scorecard key={s.bot} stats={s} />
      ))}
    </div>
  );
}

function Scorecard({ stats }: { stats: BotStats }) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <header className="flex items-baseline justify-between">
        <h3 className="text-base font-medium">{stats.name}</h3>
        <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {stats.role}
        </span>
      </header>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Trades" value={stats.totalTrades.toString()} />
        <Stat label="Win rate" value={`${stats.winRatePct}%`} />
        <Stat
          label="P&L"
          value={formatPnl(stats.pnl)}
          valueClassName={
            stats.pnl > 0
              ? "text-emerald-600 dark:text-emerald-400"
              : stats.pnl < 0
                ? "text-red-600 dark:text-red-400"
                : ""
          }
        />
        <Stat
          label="Avg fill"
          value={
            stats.totalTrades === 0
              ? "—"
              : `$${stats.avgFill.toFixed(0)}`
          }
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn("mt-0.5 font-mono text-sm font-medium", valueClassName)}
      >
        {value}
      </p>
    </div>
  );
}

function computeStats(
  trades: BotTrade[],
  bot: BotTrade["bot"],
  lastPrice: number,
  name: string,
  role: string,
): BotStats {
  const own = trades.filter((t) => t.bot === bot);
  let pos = 0;
  let cash = 0;
  let wins = 0;
  let trips = 0;
  // Walk-through P&L on cleared round-trips. Naive but matches a paper-trading
  // intuition: when the position goes back to zero, that closes a "trip".
  let avgEntry = 0;
  for (const t of own) {
    if (t.side === "buy") {
      const newPos = pos + t.qty;
      avgEntry =
        pos === 0 ? t.price : (avgEntry * pos + t.price * t.qty) / newPos;
      pos = newPos;
      cash -= t.price * t.qty;
    } else {
      const closeQty = Math.min(pos, t.qty);
      cash += t.price * t.qty;
      if (closeQty > 0) {
        const tripPnl = (t.price - avgEntry) * closeQty;
        if (tripPnl > 0) wins += 1;
        trips += 1;
      }
      pos -= t.qty;
    }
  }
  const mark = pos * lastPrice;
  const pnl = cash + mark;
  const winRatePct =
    trips === 0 ? 0 : Math.round((wins / trips) * 100);
  const avgFill =
    own.length === 0
      ? 0
      : own.reduce((acc, t) => acc + t.price, 0) / own.length;
  return {
    bot,
    name,
    role,
    totalTrades: own.length,
    winRatePct,
    pnl,
    avgFill,
  };
}

function formatPnl(n: number): string {
  if (Math.abs(n) < 1) return "$0";
  const sign = n >= 0 ? "+" : "−";
  return `${sign}$${Math.abs(n).toFixed(0)}`;
}
