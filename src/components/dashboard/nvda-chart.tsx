"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";

import type { BotTrade, Candle } from "@/lib/market/nvda-fixture";

const POLY_BUY_COLOR = "#10b981";
const POLY_SELL_COLOR = "#ef4444";
const GRID_BUY_COLOR = "#06b6d4";
const GRID_SELL_COLOR = "#f59e0b";

export interface NvdaChartProps {
  candles: Candle[];
  trades: BotTrade[];
}

export function NvdaChart({ candles, trades }: NvdaChartProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const seriesRef = React.useRef<ISeriesApi<"Area"> | null>(null);
  const markersRef = React.useRef<ReturnType<typeof createSeriesMarkers<Time>> | null>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // ── Build chart once on mount ────────────────────────────────────────
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 480,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(125, 125, 140, 0.85)",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(125, 125, 140, 0.12)" },
        horzLines: { color: "rgba(125, 125, 140, 0.12)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "rgba(125, 125, 140, 0.18)" },
      timeScale: {
        borderColor: "rgba(125, 125, 140, 0.18)",
        timeVisible: true,
        secondsVisible: false,
      },
      autoSize: false,
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: "#3b82f6",
      lineWidth: 2,
      topColor: "rgba(59, 130, 246, 0.28)",
      bottomColor: "rgba(59, 130, 246, 0.02)",
      priceLineVisible: false,
      lastValueVisible: true,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      chart.applyOptions({ width: w });
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      markersRef.current = null;
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // ── Push data on every prop change ───────────────────────────────────
  React.useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;

    series.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.close,
      })),
    );

    const markers: SeriesMarker<Time>[] = trades.map((t) => {
      if (t.bot === "polyclaw") {
        return t.side === "buy"
          ? {
              time: t.time as UTCTimestamp,
              position: "belowBar",
              color: POLY_BUY_COLOR,
              shape: "arrowUp",
              text: "P",
            }
          : {
              time: t.time as UTCTimestamp,
              position: "aboveBar",
              color: POLY_SELL_COLOR,
              shape: "arrowDown",
              text: "P",
            };
      }
      return t.side === "buy"
        ? {
            time: t.time as UTCTimestamp,
            position: "belowBar",
            color: GRID_BUY_COLOR,
            shape: "arrowUp",
            text: "G",
          }
        : {
            time: t.time as UTCTimestamp,
            position: "aboveBar",
            color: GRID_SELL_COLOR,
            shape: "arrowDown",
            text: "G",
          };
    });

    if (markersRef.current) {
      markersRef.current.setMarkers(markers);
    } else {
      markersRef.current = createSeriesMarkers(series, markers);
    }

    chart.timeScale().fitContent();
  }, [candles, trades]);

  // ── Re-theme on dark/light flip ──────────────────────────────────────
  React.useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const text = isDark ? "rgba(220, 222, 230, 0.85)" : "rgba(40, 45, 60, 0.85)";
    const grid = isDark ? "rgba(220, 222, 230, 0.08)" : "rgba(40, 45, 60, 0.08)";
    const border = isDark
      ? "rgba(220, 222, 230, 0.16)"
      : "rgba(40, 45, 60, 0.14)";
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: text,
      },
      grid: {
        vertLines: { color: grid },
        horzLines: { color: grid },
      },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border },
    });
  }, [isDark]);

  return (
    <div className="relative h-[480px] w-full overflow-hidden rounded-lg border bg-card">
      {/* Legend */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col gap-1 rounded-md border border-border/60 bg-background/70 px-2.5 py-1.5 text-[11px] backdrop-blur supports-[backdrop-filter]:bg-background/50">
        <span className="flex items-center gap-1.5 text-foreground">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Polyclaw <span className="text-muted-foreground">· momentum</span>
        </span>
        <span className="flex items-center gap-1.5 text-foreground">
          <span className="h-2 w-2 rounded-full bg-cyan-500" />
          Gridhawk <span className="text-muted-foreground">· grid</span>
        </span>
      </div>
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
