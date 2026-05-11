"use client";

import * as React from "react";
import { LineChartIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useScorecards } from "./scorecards-provider";

// ScoreChart — pure-SVG line chart of audit scores over time.
//
// Defaults to "All bots" (all history points). Toggle pills let the user
// isolate a single bot's curve. No chart library; the rendered series is
// short (≤100 points) and the styling is dictated by the dashboard tokens.

const VIEW_W = 480;
const VIEW_H = 140;
const PAD_X = 8;
const PAD_Y = 12;

export function ScoreChart() {
  const { data } = useScorecards();
  const [selectedBot, setSelectedBot] = React.useState<string | null>(null);

  const history = data?.history ?? [];
  const perBot = data?.perBot ?? [];

  const filtered = selectedBot
    ? history.filter((h) => h.botId === selectedBot)
    : history;

  return (
    <section className="border-border bg-card rounded-lg border p-5">
      <header className="mb-4 flex items-center gap-2">
        <LineChartIcon className="text-primary size-4" />
        <h3 className="text-sm font-medium">Compliance score over time</h3>
        <span className="bg-muted text-muted-foreground ml-auto rounded-md px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider">
          {filtered.length} pts
        </span>
      </header>

      <div className="relative h-[160px] w-full">
        {filtered.length === 0 ? (
          <EmptyOverlay />
        ) : (
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H + PAD_Y * 2}`}
            preserveAspectRatio="none"
            className="h-full w-full"
            role="img"
            aria-label="Compliance score chart"
          >
            <Gridlines />
            <ScoreLine points={filtered.map((h) => h.score)} />
          </svg>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
        <Pill
          active={selectedBot === null}
          onClick={() => setSelectedBot(null)}
        >
          All bots
        </Pill>
        {perBot.slice(0, 6).map((b) => (
          <Pill
            key={b.botId}
            active={selectedBot === b.botId}
            onClick={() =>
              setSelectedBot(selectedBot === b.botId ? null : b.botId)
            }
          >
            {b.botName}
          </Pill>
        ))}
      </div>
    </section>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2 py-0.5 transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Gridlines() {
  return (
    <>
      {[0, 25, 50, 75, 100].map((y) => {
        const yPx = scoreToY(y);
        return (
          <g key={y}>
            <line
              x1={PAD_X}
              x2={VIEW_W - PAD_X}
              y1={yPx}
              y2={yPx}
              stroke="hsl(var(--border))"
              strokeWidth={0.5}
              strokeDasharray="2 4"
            />
            <text
              x={2}
              y={yPx + 3}
              fontSize={8}
              fill="hsl(var(--muted-foreground))"
              fontFamily="monospace"
            >
              {y}
            </text>
          </g>
        );
      })}
    </>
  );
}

function ScoreLine({ points }: { points: number[] }) {
  if (points.length === 0) return null;
  const xs = points.map((_, i) =>
    points.length === 1
      ? VIEW_W / 2
      : PAD_X + (i / (points.length - 1)) * (VIEW_W - PAD_X * 2),
  );
  const ys = points.map((s) => scoreToY(s));
  const path =
    `M${xs[0]},${ys[0]}` +
    xs
      .slice(1)
      .map((x, i) => ` L${x},${ys[i + 1]}`)
      .join("");
  const area = `${path} L${xs[xs.length - 1]},${VIEW_H + PAD_Y} L${xs[0]},${VIEW_H + PAD_Y} Z`;
  return (
    <>
      <path d={area} fill="hsl(var(--primary))" fillOpacity={0.08} />
      <path
        d={path}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.length === 1 ? (
        <circle cx={xs[0]} cy={ys[0]} r={2.5} fill="hsl(var(--primary))" />
      ) : null}
    </>
  );
}

function scoreToY(score: number): number {
  const clamped = Math.max(0, Math.min(100, score));
  return PAD_Y + (1 - clamped / 100) * VIEW_H;
}

function EmptyOverlay() {
  return (
    <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
      No audits yet. Trigger a TradingView test alert from a bot's
      Integrations page to populate this chart.
    </div>
  );
}
