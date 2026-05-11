import { detectBotRuleViolations } from "../trading/botRuleEngine";
import type {
  BotPaperTrade,
  BotTradingProfile,
  RuleViolation,
} from "../trading/types";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface CandlesFile {
  symbol: string;
  interval: string;
  candles: Candle[];
}

export type BacktestStrategy = "ma_crossover";

export interface BacktestInput {
  strategy: BacktestStrategy;
  candles: Candle[];
  profile: BotTradingProfile;
  shortPeriod?: number;
  longPeriod?: number;
}

export interface ClosedTrade extends BotPaperTrade {
  pnl: number;
  closedAt: number;
}

export interface BacktestSummary {
  totalTrades: number;
  winRate: number;
  totalReturn: number;
  avgWin: number;
  avgLoss: number;
  maxDrawdown: number;
}

export interface BacktestResult {
  trades: ClosedTrade[];
  summary: BacktestSummary;
  violations: RuleViolation[];
}

function sma(values: number[], period: number, idx: number): number | null {
  if (idx + 1 < period) return null;
  let sum = 0;
  for (let i = idx - period + 1; i <= idx; i++) sum += values[i];
  return sum / period;
}

export function runBacktest(input: BacktestInput): BacktestResult {
  const shortPeriod = input.shortPeriod ?? 5;
  const longPeriod = input.longPeriod ?? 10;
  const closes = input.candles.map((c) => c.close);

  const trades: ClosedTrade[] = [];
  const allViolations: RuleViolation[] = [];

  let inPosition = false;
  let entryPrice = 0;
  let entryTime = 0;

  for (let i = longPeriod; i < closes.length; i++) {
    const shortNow = sma(closes, shortPeriod, i)!;
    const longNow = sma(closes, longPeriod, i)!;
    const shortPrev = sma(closes, shortPeriod, i - 1)!;
    const longPrev = sma(closes, longPeriod, i - 1)!;

    const crossUp = shortPrev <= longPrev && shortNow > longNow;
    const crossDown = shortPrev >= longPrev && shortNow < longNow;

    if (!inPosition && crossUp) {
      entryPrice = closes[i];
      entryTime = input.candles[i].time;
      inPosition = true;

      const stopLoss = entryPrice * 0.98;
      const takeProfit = entryPrice * 1.04;
      const synthetic: BotPaperTrade = {
        symbol: "BTCUSDT",
        assetType: "crypto",
        side: "buy",
        entryPrice,
        quantity: 0.01,
        stopLoss,
        takeProfit,
        strategyType: "trend_following",
        signalReason: "Short SMA crossed above long SMA on the daily frame.",
        confidenceScore: 0.6,
        marketRegime: "trending",
        source: "backtest",
      };

      const violations = detectBotRuleViolations(
        synthetic,
        input.profile,
        trades,
        allViolations
      );
      allViolations.push(...violations);
    } else if (inPosition && crossDown) {
      const exitPrice = closes[i];
      const pnl = (exitPrice - entryPrice) * 0.01;
      trades.push({
        symbol: "BTCUSDT",
        assetType: "crypto",
        side: "buy",
        entryPrice,
        exitPrice,
        quantity: 0.01,
        stopLoss: entryPrice * 0.98,
        takeProfit: entryPrice * 1.04,
        strategyType: "trend_following",
        source: "backtest",
        pnl,
        closedAt: input.candles[i].time,
      });
      inPosition = false;
    }
  }

  const wins = trades.filter((t) => t.pnl > 0).length;
  const losses = trades.filter((t) => t.pnl <= 0).length;
  const winRate = trades.length > 0 ? wins / trades.length : 0;
  const totalReturn = trades.reduce((acc, t) => acc + t.pnl, 0);
  const avgWin =
    wins > 0
      ? trades.filter((t) => t.pnl > 0).reduce((a, t) => a + t.pnl, 0) / wins
      : 0;
  const avgLoss =
    losses > 0
      ? trades.filter((t) => t.pnl <= 0).reduce((a, t) => a + t.pnl, 0) / losses
      : 0;

  let runningTotal = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const t of trades) {
    runningTotal += t.pnl;
    if (runningTotal > peak) peak = runningTotal;
    const drawdown = peak - runningTotal;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  return {
    trades,
    summary: {
      totalTrades: trades.length,
      winRate,
      totalReturn,
      avgWin,
      avgLoss,
      maxDrawdown,
    },
    violations: allViolations,
  };
}
