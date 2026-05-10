import type {
  BotPaperTrade,
  BotTradingProfile,
  RuleViolation,
} from "./types";

const MIN_REASON_LENGTH = 30;
const OVERCONFIDENCE_THRESHOLD = 0.9;
const MIN_REWARD_TO_RISK = 1.5;

function checkStopLoss(trade: BotPaperTrade): RuleViolation | null {
  return trade.stopLoss === undefined
    ? {
        code: "BOT_NO_STOP_LOSS",
        severity: "high",
        message: "The bot submitted a trade without a stop loss.",
      }
    : null;
}

function checkReasoning(trade: BotPaperTrade): RuleViolation | null {
  const reason = trade.signalReason;
  return reason === undefined || reason.trim().length < MIN_REASON_LENGTH
    ? {
        code: "BOT_MISSING_REASONING",
        severity: "high",
        message: "The bot did not provide a substantive decision explanation.",
      }
    : null;
}

function checkConfidenceRange(trade: BotPaperTrade): RuleViolation | null {
  const c = trade.confidenceScore;
  return c !== undefined && (c < 0 || c > 1)
    ? {
        code: "BOT_INVALID_CONFIDENCE",
        severity: "medium",
        message: "The bot confidence score must be within [0, 1].",
      }
    : null;
}

function checkOverconfidence(trade: BotPaperTrade): RuleViolation | null {
  const c = trade.confidenceScore;
  return c !== undefined && c >= OVERCONFIDENCE_THRESHOLD && c <= 1
    ? {
        code: "BOT_OVERCONFIDENCE",
        severity: "medium",
        message:
          "The bot reported very high confidence; this should be justified by strong evidence.",
      }
    : null;
}

function checkOvertrading(
  profile: BotTradingProfile,
  recentTrades: BotPaperTrade[]
): RuleViolation | null {
  return recentTrades.length >= profile.maxTradesPerDay
    ? {
        code: "BOT_OVERTRADING",
        severity: "high",
        message: "The bot exceeded its configured maximum trades per day.",
      }
    : null;
}

function checkRiskReward(trade: BotPaperTrade): RuleViolation | null {
  if (trade.stopLoss === undefined || trade.takeProfit === undefined) {
    return null;
  }
  const risk = Math.abs(trade.entryPrice - trade.stopLoss);
  const reward = Math.abs(trade.takeProfit - trade.entryPrice);
  if (risk === 0 || reward / risk >= MIN_REWARD_TO_RISK) return null;
  return {
    code: "BOT_POOR_RISK_REWARD",
    severity: "medium",
    message:
      "The reward-to-risk ratio is below the minimum threshold of 1.5 for bots.",
  };
}

function checkStrategyConsistency(
  trade: BotPaperTrade,
  profile: BotTradingProfile
): RuleViolation | null {
  if (profile.strategyType === "custom") return null;
  if (trade.strategyType === profile.strategyType) return null;
  return {
    code: "BOT_STRATEGY_MISMATCH",
    severity: "medium",
    message:
      "The trade's strategy type does not match the bot's configured strategy.",
  };
}

export function detectBotRuleViolations(
  trade: BotPaperTrade,
  profile: BotTradingProfile,
  recentTrades: BotPaperTrade[],
  _recentViolations: RuleViolation[]
): RuleViolation[] {
  const checks: (RuleViolation | null)[] = [
    checkStopLoss(trade),
    checkReasoning(trade),
    checkConfidenceRange(trade),
    checkOverconfidence(trade),
    checkOvertrading(profile, recentTrades),
    checkRiskReward(trade),
    checkStrategyConsistency(trade, profile),
  ];
  return checks.filter((v): v is RuleViolation => v !== null);
}
