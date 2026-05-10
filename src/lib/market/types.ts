import type { TradeSide } from "@/lib/trading/types";

export type OrderType = "limit" | "market";

export type OrderStatus =
  | "open"
  | "partially_filled"
  | "filled"
  | "canceled"
  | "rejected";

export interface PaperOrder {
  orderId: string;
  botId: string;
  taskId: string;
  symbol: string;
  side: TradeSide;
  type: OrderType;
  // For market orders `limitPrice` is undefined; the matcher uses the best
  // available counterparty price.
  limitPrice?: number;
  quantity: number;
  remainingQuantity: number;
  status: OrderStatus;
  // Unix milliseconds — used only for FIFO ordering inside a price level.
  placedAtMs: number;
}

export interface PaperFill {
  fillId: string;
  symbol: string;
  // The "taker" is the incoming order; the "maker" is the resting order it
  // hit. Both are stamped onto each fill so push-notification routing knows
  // both counterparties.
  takerOrderId: string;
  takerBotId: string;
  takerSide: TradeSide;
  makerOrderId: string;
  makerBotId: string;
  price: number;
  quantity: number;
  filledAtMs: number;
}

export interface BookSnapshot {
  symbol: string;
  bids: ReadonlyArray<PaperOrder>;
  asks: ReadonlyArray<PaperOrder>;
}

export type MarketEvent =
  | { kind: "fill"; fill: PaperFill }
  | { kind: "order_resting"; order: PaperOrder }
  | { kind: "order_rejected"; orderId: string; reason: string };
