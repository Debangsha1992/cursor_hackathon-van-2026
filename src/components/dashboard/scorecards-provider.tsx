"use client";

import * as React from "react";
import type { ScorecardsResponse } from "@/app/api/dashboard/scorecards/route";

// Single polling source for /api/dashboard/scorecards. KPI strip, score chart,
// and per-bot scorecards all need the same payload, so we fetch once here and
// fan out via context.

const POLL_INTERVAL_MS = 2_000;

interface ScorecardsContextValue {
  data: ScorecardsResponse | null;
  error: string | null;
  loading: boolean;
}

const ScorecardsContext = React.createContext<ScorecardsContextValue>({
  data: null,
  error: null,
  loading: true,
});

export function useScorecards(): ScorecardsContextValue {
  return React.useContext(ScorecardsContext);
}

export function ScorecardsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [data, setData] = React.useState<ScorecardsResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const res = await fetch("/api/dashboard/scorecards", {
          cache: "no-store",
        });
        if (!alive) return;
        if (!res.ok) {
          setError(`HTTP ${res.status}`);
        } else {
          const json = (await res.json()) as ScorecardsResponse;
          setData(json);
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

  const value = React.useMemo<ScorecardsContextValue>(
    () => ({ data, error, loading: data === null && error === null }),
    [data, error],
  );

  return (
    <ScorecardsContext.Provider value={value}>
      {children}
    </ScorecardsContext.Provider>
  );
}
