"use client";

import * as React from "react";
import { ActivityIcon, AlertTriangleIcon, ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Order = {
  orderId: string;
  botId: string;
  side: "buy" | "sell";
  limitPrice?: number;
  remainingQuantity: number;
};

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

type Interrupt = {
  taskId: string;
  botId: string;
  reason: string;
};

interface MarketSnapshot {
  symbol: string;
  book: { bids: Order[]; asks: Order[] };
  fills: Fill[];
  interrupts: Interrupt[];
}

const POLL_INTERVAL_MS = 2_000;

export function MarketPanel() {
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
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "fetch failed");
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

  if (!snapshot && !error) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        Loading market state...
      </div>
    );
  }
  if (error && !snapshot) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
        Failed to load market state: {error}
      </div>
    );
  }
  if (!snapshot) return null;

  return (
    <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <InterruptsCard interrupts={snapshot.interrupts} />
      <OrderBookCard book={snapshot.book} symbol={snapshot.symbol} />
      <FillsCard fills={snapshot.fills} />
    </section>
  );
}

function InterruptsCard({ interrupts }: { interrupts: Interrupt[] }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <header className="mb-4 flex items-center gap-2">
        <AlertTriangleIcon className="size-4 text-amber-500" />
        <h3 className="text-sm font-medium">Pending clarifications</h3>
        <span className="ml-auto rounded-md bg-muted px-2 py-0.5 font-mono text-xs">
          {interrupts.length}
        </span>
      </header>
      {interrupts.length === 0 ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          No agents are currently parked at an INPUT_REQUIRED interrupt.
          PaperPilot will pause an agent here when a recoverable rule violation
          is detected (e.g. missing stop loss).
        </p>
      ) : (
        <ul className="space-y-3">
          {interrupts.map((i) => (
            <li
              key={i.taskId}
              className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono">{i.botId}</span>
                <span className="rounded bg-amber-500/20 px-2 py-0.5 font-mono text-amber-700 dark:text-amber-300">
                  INPUT_REQUIRED
                </span>
              </div>
              <p className="mt-2 text-muted-foreground">{i.reason}</p>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground/70">
                task {i.taskId}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OrderBookCard({
  book,
  symbol,
}: {
  book: { bids: Order[]; asks: Order[] };
  symbol: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <header className="mb-4 flex items-center gap-2">
        <ActivityIcon className="size-4 text-primary" />
        <h3 className="text-sm font-medium">Order book</h3>
        <span className="ml-auto rounded-md bg-muted px-2 py-0.5 font-mono text-xs">
          {symbol}
        </span>
      </header>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="mb-2 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <ArrowUpIcon className="size-3" /> Bids
          </p>
          {book.bids.length === 0 ? (
            <p className="text-muted-foreground/70">—</p>
          ) : (
            <ul className="space-y-1">
              {book.bids.map((o) => (
                <li key={o.orderId} className="font-mono">
                  <span className="text-emerald-500">
                    {o.limitPrice?.toFixed(2)}
                  </span>{" "}
                  × {o.remainingQuantity}
                  <span className="ml-2 text-[10px] text-muted-foreground/70">
                    {o.botId.slice(0, 8)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="mb-2 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <ArrowDownIcon className="size-3" /> Asks
          </p>
          {book.asks.length === 0 ? (
            <p className="text-muted-foreground/70">—</p>
          ) : (
            <ul className="space-y-1">
              {book.asks.map((o) => (
                <li key={o.orderId} className="font-mono">
                  <span className="text-red-500">
                    {o.limitPrice?.toFixed(2)}
                  </span>{" "}
                  × {o.remainingQuantity}
                  <span className="ml-2 text-[10px] text-muted-foreground/70">
                    {o.botId.slice(0, 8)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function FillsCard({ fills }: { fills: Fill[] }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <header className="mb-4 flex items-center gap-2">
        <ActivityIcon className="size-4 text-primary" />
        <h3 className="text-sm font-medium">Recent fills</h3>
        <span className="ml-auto rounded-md bg-muted px-2 py-0.5 font-mono text-xs">
          live
        </span>
      </header>
      {fills.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No fills yet. Counterparty fills appear here as agents trade with
          each other through PaperPilot's audited paper market.
        </p>
      ) : (
        <ul className="space-y-2 text-xs">
          {fills.slice(0, 10).map((f) => (
            <li
              key={f.fillId}
              className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2 font-mono"
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px]",
                    f.takerSide === "buy"
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-red-500/15 text-red-600 dark:text-red-400"
                  )}
                >
                  {f.takerSide.toUpperCase()}
                </span>
                <span>{f.price.toFixed(2)}</span>
                <span className="text-muted-foreground">× {f.quantity}</span>
              </div>
              <span className="text-[10px] text-muted-foreground">
                {f.takerBotId.slice(0, 6)} ↔ {f.makerBotId.slice(0, 6)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
