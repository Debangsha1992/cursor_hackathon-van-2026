"use client";

import * as React from "react";
import {
  ActivityIcon,
  AlertTriangleIcon,
  GaugeIcon,
  ShieldAlertIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useScorecards } from "./scorecards-provider";

// KpiStrip — four headline metrics across the top of /dashboard.
//
// avgScore       : pooled mean across all per-bot audits in the runtime ring
// fills          : count of paper fills currently in the market history
// interrupts     : pending INPUT_REQUIRED tasks blocking on clarification
// topViolation   : most-frequent rule code across the audit history
//
// All four come from /api/dashboard/scorecards via ScorecardsProvider.

export function KpiStrip() {
  const { data, error, loading } = useScorecards();
  const totals = data?.totals;

  return (
    <section
      className={cn(
        "grid grid-cols-2 gap-3 lg:grid-cols-4",
        loading && "opacity-70",
      )}
      aria-busy={loading}
    >
      <KpiCard
        label="Avg score"
        value={totals?.avgScore ?? null}
        suffix={totals?.avgScore !== null && totals?.avgScore !== undefined ? "/100" : undefined}
        icon={GaugeIcon}
        tone={scoreTone(totals?.avgScore ?? null)}
      />
      <KpiCard
        label="Paper fills"
        value={totals?.fills ?? 0}
        icon={ActivityIcon}
      />
      <KpiCard
        label="Pending interrupts"
        value={totals?.interrupts ?? 0}
        icon={AlertTriangleIcon}
        tone={(totals?.interrupts ?? 0) > 0 ? "warn" : "neutral"}
      />
      <KpiCard
        label="Top violation"
        value={totals?.topViolation?.code ?? null}
        valueAs="code"
        suffix={
          totals?.topViolation?.count
            ? `· ${totals.topViolation.count}`
            : undefined
        }
        icon={ShieldAlertIcon}
        tone={totals?.topViolation ? "warn" : "neutral"}
      />
      {error ? (
        <p className="text-destructive col-span-2 text-xs lg:col-span-4">
          Could not load metrics: {error}
        </p>
      ) : null}
    </section>
  );
}

type Tone = "neutral" | "good" | "warn" | "bad";

function KpiCard({
  label,
  value,
  suffix,
  icon: Icon,
  tone = "neutral",
  valueAs,
}: {
  label: string;
  value: string | number | null;
  suffix?: string;
  icon: LucideIcon;
  tone?: Tone;
  valueAs?: "code";
}) {
  const display = value === null || value === undefined ? "—" : value;
  return (
    <div className="border-border bg-card flex items-start gap-3 rounded-lg border p-4">
      <div
        className={cn(
          "bg-background flex aspect-square size-9 shrink-0 items-center justify-center rounded-md border",
          tone === "good" && "text-emerald-500",
          tone === "warn" && "text-amber-500",
          tone === "bad" && "text-destructive",
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-[10px] font-mono uppercase tracking-wider">
          {label}
        </p>
        <p
          className={cn(
            "mt-1 truncate text-lg font-medium leading-tight",
            valueAs === "code" && "font-mono text-sm",
          )}
          title={typeof display === "string" ? display : undefined}
        >
          {display}
          {suffix ? (
            <span className="text-muted-foreground ml-1 text-xs font-normal">
              {suffix}
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );
}

function scoreTone(s: number | null): Tone {
  if (s === null) return "neutral";
  if (s >= 90) return "good";
  if (s >= 60) return "neutral";
  if (s >= 40) return "warn";
  return "bad";
}
