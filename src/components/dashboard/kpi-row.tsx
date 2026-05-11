"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export interface KpiRowProps {
  lastPrice: number;
  changePct: number;
  polyclawPnl: number;
  gridhawkPnl: number;
}

export function KpiRow({
  lastPrice,
  changePct,
  polyclawPnl,
  gridhawkPnl,
}: KpiRowProps) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiCard label="Last (NVDA)" value={`$${lastPrice.toFixed(2)}`} />
      <KpiCard
        label="Δ Today"
        value={`${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`}
        valueClassName={
          changePct >= 0
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-red-600 dark:text-red-400"
        }
      />
      <KpiCard
        label="Polyclaw P&L"
        value={formatPnl(polyclawPnl)}
        valueClassName={pnlColor(polyclawPnl)}
      />
      <KpiCard
        label="Gridhawk P&L"
        value={formatPnl(gridhawkPnl)}
        valueClassName={pnlColor(gridhawkPnl)}
      />
    </div>
  );
}

function KpiCard({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-1 text-2xl font-semibold", valueClassName)}>
        {value}
      </p>
    </div>
  );
}

function formatPnl(n: number): string {
  const sign = n >= 0 ? "+" : "−";
  return `${sign}$${Math.abs(n).toFixed(0)}`;
}

function pnlColor(n: number): string {
  if (n > 0) return "text-emerald-600 dark:text-emerald-400";
  if (n < 0) return "text-red-600 dark:text-red-400";
  return "";
}
