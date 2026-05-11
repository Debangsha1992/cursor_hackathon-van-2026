"use client";

import * as React from "react";
import { ShieldCheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ScoreBand } from "@/lib/trading/scoreCalculator";
import { useScorecards } from "./scorecards-provider";
import type { PerBotScorecard } from "@/app/api/dashboard/scorecards/route";

// Scorecards — per-bot summary table.
//
// Each row: bot name + strategy badge + last band pill + last score
// + sparkline. Falls back to "no audits yet" copy for newly-registered
// bots that haven't had a TradingView alert routed through them.

export function Scorecards() {
  const { data, error } = useScorecards();
  const rows = data?.perBot ?? [];

  return (
    <section className="border-border bg-card flex h-full flex-col rounded-lg border p-5">
      <header className="mb-4 flex items-center gap-2">
        <ShieldCheckIcon className="text-primary size-4" />
        <h3 className="text-sm font-medium">Bot scorecards</h3>
        <span className="bg-muted text-muted-foreground ml-auto rounded-md px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider">
          {rows.length}
        </span>
      </header>

      {error && rows.length === 0 ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-xs leading-relaxed">
          No bots registered yet. Register a bot under{" "}
          <a className="text-foreground underline" href="/bots/new">
            /bots/new
          </a>
          {" "}then send a test alert from its Integrations page to populate
          the scorecard.
        </p>
      ) : (
        <ul className="flex-1 space-y-2 overflow-y-auto pr-1">
          {rows.map((row) => (
            <ScorecardRow key={row.botId} row={row} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ScorecardRow({ row }: { row: PerBotScorecard }) {
  return (
    <li className="border-border/60 bg-background/40 rounded-md border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{row.botName}</p>
          <p className="text-muted-foreground mt-0.5 truncate font-mono text-[10px]">
            {row.strategyType.replaceAll("_", " ")} · {row.botId.slice(0, 8)}
          </p>
        </div>
        <BandPill band={row.lastBand} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-[10px] font-mono uppercase tracking-wider">
            Last score
          </p>
          <p className="mt-0.5 text-base font-medium leading-none">
            {row.lastScore ?? "—"}
            {row.lastScore !== null ? (
              <span className="text-muted-foreground ml-1 text-xs font-normal">
                /100
              </span>
            ) : null}
          </p>
        </div>
        <Sparkline values={row.sparkline} />
      </div>

      {row.lastViolationCodes.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {row.lastViolationCodes.slice(0, 3).map((code) => (
            <span
              key={code}
              className="bg-destructive/10 text-destructive rounded px-1.5 py-0.5 font-mono text-[10px]"
            >
              {code}
            </span>
          ))}
        </div>
      ) : null}
    </li>
  );
}

function BandPill({ band }: { band: ScoreBand | null }) {
  if (!band) {
    return (
      <span className="bg-muted text-muted-foreground rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider">
        no audits
      </span>
    );
  }
  const tone = bandTone(band);
  return (
    <span
      className={cn(
        "rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
        tone,
      )}
    >
      {band}
    </span>
  );
}

function bandTone(band: ScoreBand): string {
  switch (band) {
    case "Exemplary":
      return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
    case "Solid":
      return "bg-sky-500/15 text-sky-600 dark:text-sky-400";
    case "Notable gaps":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
    case "Pattern of risk failures":
      return "bg-orange-500/15 text-orange-600 dark:text-orange-400";
    case "Severe":
      return "bg-destructive/15 text-destructive";
  }
}

function Sparkline({ values }: { values: number[] }) {
  const W = 96;
  const H = 28;
  if (values.length === 0) {
    return <div className="text-muted-foreground/60 text-[10px]">no data</div>;
  }
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 100);
  const range = Math.max(1, max - min);
  const xs = values.map((_, i) =>
    values.length === 1 ? W / 2 : (i / (values.length - 1)) * W,
  );
  const ys = values.map((v) => H - ((v - min) / range) * H);
  const path =
    `M${xs[0]},${ys[0]}` +
    xs
      .slice(1)
      .map((x, i) => ` L${x},${ys[i + 1]}`)
      .join("");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-7 w-24"
      aria-hidden="true"
    >
      <path
        d={path}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {values.length === 1 ? (
        <circle cx={xs[0]} cy={ys[0]} r={1.5} fill="hsl(var(--primary))" />
      ) : null}
    </svg>
  );
}
