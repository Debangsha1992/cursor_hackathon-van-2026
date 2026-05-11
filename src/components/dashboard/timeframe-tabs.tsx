"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import type { Timeframe } from "@/lib/market/nvda-fixture";

const OPTIONS: Timeframe[] = ["1m", "5m", "15m", "1h", "1D"];

export interface TimeframeTabsProps {
  value: Timeframe;
  onChange: (tf: Timeframe) => void;
  className?: string;
}

export function TimeframeTabs({
  value,
  onChange,
  className,
}: TimeframeTabsProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border bg-card p-0.5 text-xs",
        className,
      )}
      role="tablist"
      aria-label="Chart timeframe"
    >
      {OPTIONS.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt)}
            className={cn(
              "rounded px-2.5 py-1 font-mono uppercase tracking-wider transition-colors",
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
