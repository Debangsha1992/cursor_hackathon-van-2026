export interface ScoredTradeViolation {
  code: string;
}

export interface ScoredTrade {
  score: number;
  violations: ScoredTradeViolation[];
}

export interface TopViolation {
  code: string;
  count: number;
}

export interface MetricsResult {
  sparklineSeries: number[];
  topViolationCodes: TopViolation[];
  currentScore: number | null;
}

const TOP_N = 3;

export function computeMetrics(trades: ScoredTrade[]): MetricsResult {
  if (trades.length === 0) {
    return { sparklineSeries: [], topViolationCodes: [], currentScore: null };
  }

  const sparklineSeries = trades.map((t) => t.score);

  const counts = new Map<string, number>();
  for (const trade of trades) {
    for (const v of trade.violations) {
      counts.set(v.code, (counts.get(v.code) ?? 0) + 1);
    }
  }

  const topViolationCodes = [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_N);

  return {
    sparklineSeries,
    topViolationCodes,
    currentScore: trades[trades.length - 1].score,
  };
}
