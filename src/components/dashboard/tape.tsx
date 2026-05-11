"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ActivityIcon } from "lucide-react";

import { cn } from "@/lib/utils";

// Tape — live trade-tape from /api/dashboard/market.
//
// Subtle slide-in motion via framer-motion so the most-recent fill draws
// the eye when a new one lands.

type Fill = {
  fillId: string;
  symbol: string;
  takerBotId: string;
  takerSide: "buy" | "sell";
  makerBotId: string;
  price: number;
  quantity: number;
  filledAtMs: number;
};

interface MarketSnapshot {
  symbol: string;
  fills: Fill[];
}

const POLL_INTERVAL_MS = 2_000;
const MAX_DISPLAYED = 12;

export function Tape() {
  const [snapshot, setSnapshot] = React.useState<MarketSnapshot | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const res = await fetch("/api/dashboard/market", { cache: "no-store" });
        if (!alive) return;
        if (!res.ok) {
          setError(`HTTP ${res.status}`);
        } else {
          const data = (await res.json()) as MarketSnapshot;
          setSnapshot(data);
          setError(null);
        }
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "fetch failed");
      } finally {
        if (alive) timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };

    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const fills = (snapshot?.fills ?? []).slice(0, MAX_DISPLAYED);

  return (
    <section className="border-border bg-card flex h-full flex-col rounded-lg border p-5">
      <header className="mb-4 flex items-center gap-2">
        <ActivityIcon className="text-primary size-4" />
        <h3 className="text-sm font-medium">Tape</h3>
        <span className="bg-muted text-muted-foreground ml-auto rounded-md px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider">
          {snapshot?.symbol ?? "—"}
        </span>
      </header>

      {error && !snapshot ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : fills.length === 0 ? (
        <p className="text-muted-foreground text-xs leading-relaxed">
          No fills yet. Counterparty fills appear here as agents trade with
          each other through PaperPilot's audited paper market.
        </p>
      ) : (
        <ul className="flex-1 space-y-1.5 overflow-y-auto pr-1">
          <AnimatePresence initial={false}>
            {fills.map((f) => (
              <motion.li
                key={f.fillId}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="border-border/60 bg-background/40 flex items-center justify-between gap-3 rounded-md border px-3 py-2 font-mono text-xs"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px]",
                      f.takerSide === "buy"
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : "bg-red-500/15 text-red-600 dark:text-red-400",
                    )}
                  >
                    {f.takerSide.toUpperCase()}
                  </span>
                  <span>{f.price.toFixed(2)}</span>
                  <span className="text-muted-foreground">× {f.quantity}</span>
                </div>
                <span className="text-muted-foreground text-[10px]">
                  {f.takerBotId.slice(0, 6)} ↔ {f.makerBotId.slice(0, 6)}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
