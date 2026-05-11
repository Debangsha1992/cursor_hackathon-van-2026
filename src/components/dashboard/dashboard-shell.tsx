"use client";

import * as React from "react";

import {
  generateNvdaSeries,
  type NvdaSeries,
  type Timeframe,
} from "@/lib/market/nvda-fixture";

import { AssistantRail } from "./assistant-rail";
import { BotScorecards } from "./bot-scorecards";
import { KpiRow } from "./kpi-row";
import { NvdaChart } from "./nvda-chart";
import { SlimHeader } from "./slim-header";
import { TimeframeTabs } from "./timeframe-tabs";
import { TradeTape } from "./trade-tape";

export interface DashboardUser {
  email: string;
  id: string;
}

export interface DashboardShellProps {
  user: DashboardUser;
}

// SSR seed — using the deterministic fixture so first paint matches client.
const INITIAL: NvdaSeries = generateNvdaSeries(42, "5m");

export function DashboardShell({ user }: DashboardShellProps) {
  const [timeframe, setTimeframe] = React.useState<Timeframe>("5m");
  const [series, setSeries] = React.useState<NvdaSeries>(INITIAL);
  const [, startTransition] = React.useTransition();

  React.useEffect(() => {
    let alive = true;
    fetch(`/api/market/nvda?tf=${timeframe}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: NvdaSeries) => {
        if (!alive) return;
        startTransition(() => setSeries(data));
      })
      .catch(() => {
        // On a fetch failure we keep showing the deterministic seed; no toast
        // required because the fixture is reliable.
      });
    return () => {
      alive = false;
    };
  }, [timeframe]);

  const changePct = React.useMemo(() => {
    if (series.candles.length < 2) return 0;
    const open = series.candles[0].close;
    const close = series.candles[series.candles.length - 1].close;
    return ((close - open) / open) * 100;
  }, [series.candles]);

  const polyclawPnl = React.useMemo(
    () => realisedPlusMark(series, "polyclaw"),
    [series],
  );
  const gridhawkPnl = React.useMemo(
    () => realisedPlusMark(series, "gridhawk"),
    [series],
  );

  return (
    <div className="flex min-h-screen w-full flex-col">
      <SlimHeader email={user.email} />
      <main className="grow">
        <div className="mx-auto w-full max-w-6xl px-4 pb-32 pt-8">
          {/* ── Heading row ─────────────────────────────────────────── */}
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                NVDA · paper-trading session
              </p>
              <h1 className="mt-1 text-balance text-2xl font-semibold leading-tight md:text-3xl">
                Counterparty workspace
              </h1>
            </div>
            <TimeframeTabs value={timeframe} onChange={setTimeframe} />
          </div>

          {/* ── KPI row ─────────────────────────────────────────────── */}
          <KpiRow
            lastPrice={series.lastPrice}
            changePct={changePct}
            polyclawPnl={polyclawPnl}
            gridhawkPnl={gridhawkPnl}
          />

          {/* ── Chart ───────────────────────────────────────────────── */}
          <section className="mt-6">
            <NvdaChart candles={series.candles} trades={series.trades} />
          </section>

          {/* ── Tape + scorecards ───────────────────────────────────── */}
          <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <TradeTape trades={series.trades} />
            </div>
            <div className="lg:col-span-2">
              <BotScorecards
                trades={series.trades}
                lastPrice={series.lastPrice}
              />
            </div>
          </section>
        </div>
      </main>

      {/* ── Assistant rail (sticky at the bottom on md+, flows below on <md) ── */}
      <div className="z-20 mx-auto w-full max-w-3xl px-4 pb-4 md:sticky md:bottom-4 md:pb-0">
        <div className="rounded-2xl bg-background/40 p-1 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <AssistantRail
            symbol="NVDA"
            lastPrice={series.lastPrice}
            recentTrades={series.trades}
          />
        </div>
      </div>
    </div>
  );
}

function realisedPlusMark(
  series: NvdaSeries,
  bot: "polyclaw" | "gridhawk",
): number {
  let pos = 0;
  let cash = 0;
  for (const t of series.trades) {
    if (t.bot !== bot) continue;
    if (t.side === "buy") {
      pos += t.qty;
      cash -= t.price * t.qty;
    } else {
      pos -= t.qty;
      cash += t.price * t.qty;
    }
  }
  return cash + pos * series.lastPrice;
}
