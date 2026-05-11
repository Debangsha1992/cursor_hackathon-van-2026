export type AssetType = "crypto" | "stock";

export type TradeSide = "buy" | "sell";

export type StrategyType =
  | "trend_following"
  | "mean_reversion"
  | "breakout"
  | "momentum"
  | "range_trading"
  | "custom";

export type MarketRegime = "trending" | "sideways" | "volatile" | "unknown";

export type BotType = "rule_based" | "ai_agent" | "hybrid";

export type Severity = "low" | "medium" | "high";

export type TradeSource =
  | "manual"
  | "tradingview_webhook"
  | "bot_api"
  | "backtest";

export type TrustTier = "hmac" | "shared_secret" | "manual";

export interface BotPaperTrade {
  symbol: string;
  assetType: AssetType;
  side: TradeSide;
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  stopLoss?: number;
  takeProfit?: number;
  strategyType: StrategyType;
  signalReason?: string;
  confidenceScore?: number;
  marketRegime?: MarketRegime;
  source?: TradeSource;
  trust_tier?: TrustTier;
  botId?: string;
}

export interface BotTradingProfile {
  botId: string;
  botName: string;
  strategyType: StrategyType;
  maxRiskPerTradePercent: number;
  maxTradesPerDay: number;
  maxAllowedDrawdownPercent: number;
  botType: BotType;
}

export interface RuleViolation {
  code: string;
  severity: Severity;
  message: string;
}

// A `TradeIntent` is the A2A-side superset of `BotPaperTrade`. It carries the
// orchestration identifiers needed to thread a single submission through the
// LangGraph state machine, plus the order parameters needed by the matcher.
// The plain `BotPaperTrade` view is still what the rule engine sees — the
// extra fields are deliberately not visible to deep modules to keep their
// inputs minimal.
export type OrderTypeIntent = "limit" | "market";

export interface TradeIntent extends BotPaperTrade {
  taskId: string;
  contextId: string;
  orderType: OrderTypeIntent;
  limitPrice?: number;
}

// Re-exported for callers that want the "trading-flavored" name. The actual
// canonical definitions live under @/lib/market/types to keep the matcher
// fully independent of the rule engine.
export type { PaperFill as Fill, MarketEvent } from "@/lib/market/types";
