import { z } from "zod";
import type { BotPaperTrade } from "../trading/types";

export type AdapterError =
  | "invalid_secret"
  | "malformed"
  | "invalid_value";

export type ParseResult =
  | { ok: true; trade: BotPaperTrade }
  | { ok: false; error: AdapterError };

const TVAlertSchema = z.object({
  webhookSecret: z.string(),
  botId: z.string().optional(),
  symbol: z.string().min(1),
  assetType: z.enum(["crypto", "stock"]),
  side: z.enum(["buy", "sell"]),
  entryPrice: z.number().positive(),
  exitPrice: z.number().positive().optional(),
  quantity: z.number().positive(),
  stopLoss: z.number().positive().optional(),
  takeProfit: z.number().positive().optional(),
  strategyType: z.enum([
    "trend_following",
    "mean_reversion",
    "breakout",
    "momentum",
    "range_trading",
    "custom",
  ]),
  signalReason: z.string().optional(),
  confidenceScore: z.number().optional(),
  marketRegime: z
    .enum(["trending", "sideways", "volatile", "unknown"])
    .optional(),
});

export function parseTradingViewAlert(
  rawAlertJson: string,
  expectedSecret: string
): ParseResult {
  let payload: unknown;
  try {
    payload = JSON.parse(rawAlertJson);
  } catch {
    return { ok: false, error: "malformed" };
  }

  const parsed = TVAlertSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.code === "too_small" || issue?.code === "invalid_type" && issue.path.includes("entryPrice")) {
      return { ok: false, error: "invalid_value" };
    }
    if (
      issue?.path.includes("entryPrice") ||
      issue?.path.includes("quantity") ||
      issue?.path.includes("stopLoss") ||
      issue?.path.includes("takeProfit")
    ) {
      return { ok: false, error: "invalid_value" };
    }
    return { ok: false, error: "malformed" };
  }

  if (parsed.data.webhookSecret !== expectedSecret) {
    return { ok: false, error: "invalid_secret" };
  }

  const trade: BotPaperTrade = {
    symbol: parsed.data.symbol,
    assetType: parsed.data.assetType,
    side: parsed.data.side,
    entryPrice: parsed.data.entryPrice,
    exitPrice: parsed.data.exitPrice,
    quantity: parsed.data.quantity,
    stopLoss: parsed.data.stopLoss,
    takeProfit: parsed.data.takeProfit,
    strategyType: parsed.data.strategyType,
    signalReason: parsed.data.signalReason,
    confidenceScore: parsed.data.confidenceScore,
    marketRegime: parsed.data.marketRegime,
    source: "tradingview_webhook",
    trust_tier: "shared_secret",
    botId: parsed.data.botId,
  };

  return { ok: true, trade };
}
