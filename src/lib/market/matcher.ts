import type { BookSnapshot, PaperFill, PaperOrder } from "./types";

export interface MatchInput {
  incoming: PaperOrder;
  book: BookSnapshot;
  now: () => number;
  nextFillId: () => string;
}

export interface MatchOutput {
  fills: PaperFill[];
  // The incoming order after partial fills are applied. If fully filled, its
  // remainingQuantity is 0 and status is "filled". If partially filled and a
  // limit, callers should rest it; if market and unfilled remainder, callers
  // should reject the remainder.
  resultingTaker: PaperOrder;
  // The maker orders that were fully or partially consumed, with their
  // remainingQuantity and status updated. Callers persist these mutations.
  consumedMakers: PaperOrder[];
}

function comparePriceTime(a: PaperOrder, b: PaperOrder, side: "bids" | "asks"): number {
  // Best price first: for bids (buy side), higher price is better.
  // For asks (sell side), lower price is better. Limit orders only on the
  // book — undefined limitPrice should never appear here.
  const pa = a.limitPrice ?? Number.NaN;
  const pb = b.limitPrice ?? Number.NaN;
  if (pa !== pb) {
    return side === "bids" ? pb - pa : pa - pb;
  }
  return a.placedAtMs - b.placedAtMs;
}

function crosses(taker: PaperOrder, maker: PaperOrder): boolean {
  if (taker.type === "market") return true;
  if (taker.limitPrice === undefined) return false;
  if (maker.limitPrice === undefined) return false;
  return taker.side === "buy"
    ? taker.limitPrice >= maker.limitPrice
    : taker.limitPrice <= maker.limitPrice;
}

// Pure: returns a new MatchOutput without mutating inputs.
export function matchOrder(input: MatchInput): MatchOutput {
  const { incoming, book } = input;
  const oppositeSide = incoming.side === "buy" ? "asks" : "bids";
  const counterparties = (
    oppositeSide === "bids" ? [...book.bids] : [...book.asks]
  ).sort((a, b) => comparePriceTime(a, b, oppositeSide));

  const fills: PaperFill[] = [];
  const consumedMakers: PaperOrder[] = [];

  let taker: PaperOrder = { ...incoming };

  for (const candidate of counterparties) {
    if (taker.remainingQuantity <= 0) break;
    if (candidate.botId === taker.botId) continue; // no self-trade
    if (candidate.status !== "open" && candidate.status !== "partially_filled")
      continue;
    if (candidate.remainingQuantity <= 0) continue;
    if (!crosses(taker, candidate)) break; // sorted by price; no later one will cross either

    const tradeQty = Math.min(
      taker.remainingQuantity,
      candidate.remainingQuantity
    );
    // Resting limit dictates price (standard "maker wins price" rule).
    const tradePrice = candidate.limitPrice;
    if (tradePrice === undefined) continue; // defensive — makers should always have limit price

    const fill: PaperFill = {
      fillId: input.nextFillId(),
      symbol: incoming.symbol,
      takerOrderId: taker.orderId,
      takerBotId: taker.botId,
      takerSide: taker.side,
      makerOrderId: candidate.orderId,
      makerBotId: candidate.botId,
      price: tradePrice,
      quantity: tradeQty,
      filledAtMs: input.now(),
    };
    fills.push(fill);

    const updatedMaker: PaperOrder = {
      ...candidate,
      remainingQuantity: candidate.remainingQuantity - tradeQty,
      status:
        candidate.remainingQuantity - tradeQty <= 0
          ? "filled"
          : "partially_filled",
    };
    consumedMakers.push(updatedMaker);

    taker = {
      ...taker,
      remainingQuantity: taker.remainingQuantity - tradeQty,
      status:
        taker.remainingQuantity - tradeQty <= 0
          ? "filled"
          : "partially_filled",
    };
  }

  return { fills, resultingTaker: taker, consumedMakers };
}
