/**
 * Deterministic NVDA paper-trading fixture.
 *
 * Used by the dashboard chart, KPIs, trade tape, and bot scorecards. The
 * fixture is intentionally deterministic — we anchor on a fixed reference
 * date instead of `Date.now()` so SSR and CSR render the exact same series
 * and React doesn't tear hydration.
 */

export type Timeframe = "1m" | "5m" | "15m" | "1h" | "1D";

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BotTrade {
  time: number; // unix seconds
  price: number;
  side: "buy" | "sell";
  bot: "polyclaw" | "gridhawk";
  qty: number;
}

export interface NvdaSeries {
  candles: Candle[];
  trades: BotTrade[];
  lastPrice: number;
}

const TF_SECONDS: Record<Timeframe, number> = {
  "1m": 60,
  "5m": 5 * 60,
  "15m": 15 * 60,
  "1h": 60 * 60,
  "1D": 24 * 60 * 60,
};

/**
 * Fixed reference timestamp so server and client render identical data.
 * 2026-05-09T20:00:00Z is the close of the most recent hypothetical session.
 */
const REFERENCE_END_MS = Date.UTC(2026, 4, 9, 20, 0, 0);

const NUM_BARS = 120;
const MID_PRICE = 135;

/** Mulberry32 PRNG — small, fast, deterministic. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateNvdaSeries(seed = 42, tf: Timeframe = "5m"): NvdaSeries {
  const rng = mulberry32(seed);
  const stepSec = TF_SECONDS[tf];

  const endSec = Math.floor(REFERENCE_END_MS / 1000);
  const startSec = endSec - stepSec * (NUM_BARS - 1);

  const candles: Candle[] = [];
  let close = MID_PRICE;
  // Target drift: ~+8% across the series, with a drawdown around bar 60.
  const totalDrift = 0.08;
  const driftPerBar = totalDrift / NUM_BARS;

  for (let i = 0; i < NUM_BARS; i++) {
    const t = startSec + i * stepSec;
    // Drawdown shape — gentle dip centered near bar 60.
    const drawdownCenter = 60;
    const drawdownWidth = 14;
    const drawdownDepth = -0.045; // -4.5% around the dip
    const drawdownFactor =
      drawdownDepth *
      Math.exp(-Math.pow((i - drawdownCenter) / drawdownWidth, 2));

    const noise = (rng() - 0.5) * 0.012; // ±1.2% per-bar noise
    const driftFactor = driftPerBar + drawdownFactor / drawdownWidth;
    const ret = driftFactor + noise;

    const open = close;
    close = Math.max(50, open * (1 + ret));
    const wick = (rng() * 0.006 + 0.002) * close;
    const high = Math.max(open, close) + wick * rng();
    const low = Math.min(open, close) - wick * rng();
    const volume = Math.round(80_000 + rng() * 220_000);

    candles.push({
      time: t,
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(close),
      volume,
    });
  }

  const trades = generateTrades(candles, rng);

  return {
    candles,
    trades,
    lastPrice: candles[candles.length - 1].close,
  };
}

function generateTrades(
  candles: Candle[],
  rng: () => number,
): BotTrade[] {
  const trades: BotTrade[] = [];

  // ── Polyclaw (momentum) ────────────────────────────────────────────────
  // Buys when close > max(last 3 closes), sells when close < min(last 2 closes).
  // Min 8 bars between Polyclaw trades. Qty 50–150.
  let lastPolyIdx = -10;
  for (let i = 4; i < candles.length; i++) {
    if (i - lastPolyIdx < 8) continue;
    const c = candles[i].close;
    const prev3Max = Math.max(
      candles[i - 1].close,
      candles[i - 2].close,
      candles[i - 3].close,
    );
    const prev2Min = Math.min(candles[i - 1].close, candles[i - 2].close);
    if (c > prev3Max * 1.001) {
      trades.push({
        time: candles[i].time,
        price: c,
        side: "buy",
        bot: "polyclaw",
        qty: Math.round(50 + rng() * 100),
      });
      lastPolyIdx = i;
    } else if (c < prev2Min * 0.999) {
      trades.push({
        time: candles[i].time,
        price: c,
        side: "sell",
        bot: "polyclaw",
        qty: Math.round(50 + rng() * 100),
      });
      lastPolyIdx = i;
    }
  }

  // ── Gridhawk (grid) ────────────────────────────────────────────────────
  // Buys when close crosses below $132, sells when crosses above $138.
  // Qty 100. Won't repeat without a re-cross.
  let lastSide: "buy" | "sell" | null = null;
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1].close;
    const c = candles[i].close;
    if (prev >= 132 && c < 132 && lastSide !== "buy") {
      trades.push({
        time: candles[i].time,
        price: c,
        side: "buy",
        bot: "gridhawk",
        qty: 100,
      });
      lastSide = "buy";
    } else if (prev <= 138 && c > 138 && lastSide !== "sell") {
      trades.push({
        time: candles[i].time,
        price: c,
        side: "sell",
        bot: "gridhawk",
        qty: 100,
      });
      lastSide = "sell";
    }
  }

  // Cap each bot at ~10 trades to keep the chart legible. Spread evenly.
  const cap = 10;
  const polyclaw = trades.filter((t) => t.bot === "polyclaw");
  const gridhawk = trades.filter((t) => t.bot === "gridhawk");
  const trimmed = [...evenly(polyclaw, cap), ...evenly(gridhawk, cap)];

  trimmed.sort((a, b) => a.time - b.time);
  return trimmed;
}

function evenly<T>(items: T[], cap: number): T[] {
  if (items.length <= cap) return items;
  const out: T[] = [];
  const step = items.length / cap;
  for (let i = 0; i < cap; i++) {
    out.push(items[Math.floor(i * step)]);
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
