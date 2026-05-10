import { matchOrder } from "./matcher";
import type {
  BookSnapshot,
  MarketEvent,
  PaperFill,
  PaperOrder,
} from "./types";

export interface PlaceOrderInput {
  botId: string;
  taskId: string;
  symbol: string;
  side: PaperOrder["side"];
  type: PaperOrder["type"];
  limitPrice?: number;
  quantity: number;
}

export interface PlaceOrderResult {
  order: PaperOrder;
  fills: PaperFill[];
  events: MarketEvent[];
}

export interface OrderBook {
  place(input: PlaceOrderInput): Promise<PlaceOrderResult>;
  cancel(orderId: string): Promise<PaperOrder | null>;
  snapshot(symbol: string): Promise<BookSnapshot>;
}

export interface OrderBookDeps {
  now: () => number;
  nextId: () => string;
}

// ---------------------------------------------------------------------------
// In-memory implementation
// ---------------------------------------------------------------------------
//
// Sufficient for the hackathon demo. A Supabase-backed implementation can swap
// in by providing the same `OrderBook` interface plus a `pg_advisory_lock`
// around the read-match-mutate cycle. We expose this as a separate factory so
// tests can construct one cleanly.

export function createInMemoryOrderBook(deps: OrderBookDeps): OrderBook {
  // bookBySymbol -> orderId -> order
  const bookBySymbol = new Map<string, Map<string, PaperOrder>>();
  // Single in-process lock; replace with `pg_advisory_lock` in the Supabase impl.
  let chain: Promise<unknown> = Promise.resolve();

  const withLock = <T>(fn: () => Promise<T> | T): Promise<T> => {
    const next = chain.then(() => fn());
    chain = next.catch(() => undefined);
    return next;
  };

  const getBook = (symbol: string): Map<string, PaperOrder> => {
    let book = bookBySymbol.get(symbol);
    if (!book) {
      book = new Map();
      bookBySymbol.set(symbol, book);
    }
    return book;
  };

  const snapshotInternal = (symbol: string): BookSnapshot => {
    const book = bookBySymbol.get(symbol);
    if (!book) {
      return { symbol, bids: [], asks: [] };
    }
    const bids: PaperOrder[] = [];
    const asks: PaperOrder[] = [];
    for (const order of book.values()) {
      if (order.status !== "open" && order.status !== "partially_filled") {
        continue;
      }
      if (order.side === "buy") bids.push(order);
      else asks.push(order);
    }
    return { symbol, bids, asks };
  };

  return {
    async place(input: PlaceOrderInput): Promise<PlaceOrderResult> {
      return withLock(() => {
        if (input.quantity <= 0) {
          const rejected: PaperOrder = {
            orderId: deps.nextId(),
            botId: input.botId,
            taskId: input.taskId,
            symbol: input.symbol,
            side: input.side,
            type: input.type,
            limitPrice: input.limitPrice,
            quantity: input.quantity,
            remainingQuantity: 0,
            status: "rejected",
            placedAtMs: deps.now(),
          };
          return {
            order: rejected,
            fills: [],
            events: [
              {
                kind: "order_rejected",
                orderId: rejected.orderId,
                reason: "quantity_must_be_positive",
              },
            ],
          };
        }
        if (input.type === "limit" && input.limitPrice === undefined) {
          const rejected: PaperOrder = {
            orderId: deps.nextId(),
            botId: input.botId,
            taskId: input.taskId,
            symbol: input.symbol,
            side: input.side,
            type: input.type,
            limitPrice: input.limitPrice,
            quantity: input.quantity,
            remainingQuantity: 0,
            status: "rejected",
            placedAtMs: deps.now(),
          };
          return {
            order: rejected,
            fills: [],
            events: [
              {
                kind: "order_rejected",
                orderId: rejected.orderId,
                reason: "limit_price_required",
              },
            ],
          };
        }

        const incoming: PaperOrder = {
          orderId: deps.nextId(),
          botId: input.botId,
          taskId: input.taskId,
          symbol: input.symbol,
          side: input.side,
          type: input.type,
          limitPrice: input.limitPrice,
          quantity: input.quantity,
          remainingQuantity: input.quantity,
          status: "open",
          placedAtMs: deps.now(),
        };

        const snap = snapshotInternal(input.symbol);
        const matchResult = matchOrder({
          incoming,
          book: snap,
          now: deps.now,
          nextFillId: deps.nextId,
        });

        const book = getBook(input.symbol);
        for (const updatedMaker of matchResult.consumedMakers) {
          book.set(updatedMaker.orderId, updatedMaker);
        }

        const taker = matchResult.resultingTaker;
        const events: MarketEvent[] = matchResult.fills.map((fill) => ({
          kind: "fill",
          fill,
        }));

        if (taker.remainingQuantity > 0) {
          if (taker.type === "market") {
            const canceledRemainder: PaperOrder = {
              ...taker,
              status: matchResult.fills.length > 0 ? "partially_filled" : "rejected",
            };
            book.set(canceledRemainder.orderId, canceledRemainder);
            if (matchResult.fills.length === 0) {
              events.push({
                kind: "order_rejected",
                orderId: canceledRemainder.orderId,
                reason: "no_liquidity",
              });
            }
            return {
              order: canceledRemainder,
              fills: matchResult.fills,
              events,
            };
          }
          const resting: PaperOrder = {
            ...taker,
            status: matchResult.fills.length > 0 ? "partially_filled" : "open",
          };
          book.set(resting.orderId, resting);
          events.push({ kind: "order_resting", order: resting });
          return { order: resting, fills: matchResult.fills, events };
        }

        book.set(taker.orderId, taker);
        return { order: taker, fills: matchResult.fills, events };
      });
    },

    async cancel(orderId: string): Promise<PaperOrder | null> {
      return withLock(() => {
        for (const book of bookBySymbol.values()) {
          const existing = book.get(orderId);
          if (!existing) continue;
          if (
            existing.status === "filled" ||
            existing.status === "canceled" ||
            existing.status === "rejected"
          ) {
            return null;
          }
          const canceled: PaperOrder = { ...existing, status: "canceled" };
          book.set(orderId, canceled);
          return canceled;
        }
        return null;
      });
    },

    async snapshot(symbol: string): Promise<BookSnapshot> {
      return withLock(() => snapshotInternal(symbol));
    },
  };
}
