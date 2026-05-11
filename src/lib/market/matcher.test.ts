import { describe, it, expect } from "vitest";
import { matchOrder } from "./matcher";
import type { PaperOrder } from "./types";

function ord(
  partial: Partial<PaperOrder> & Pick<PaperOrder, "orderId" | "botId" | "side" | "quantity">
): PaperOrder {
  return {
    taskId: partial.taskId ?? "task",
    symbol: partial.symbol ?? "BTCUSDT",
    type: partial.type ?? "limit",
    limitPrice: partial.limitPrice,
    remainingQuantity: partial.remainingQuantity ?? partial.quantity,
    status: partial.status ?? "open",
    placedAtMs: partial.placedAtMs ?? 0,
    ...partial,
  };
}

let counter = 0;
const nextFillId = () => `fill-${counter++}`;
const now = () => 1_000;

describe("matcher - limit cross", () => {
  it("matches a crossing buy against the best ask", () => {
    const taker = ord({
      orderId: "T1",
      botId: "alice",
      side: "buy",
      limitPrice: 100,
      quantity: 1,
    });
    const ask = ord({
      orderId: "M1",
      botId: "bob",
      side: "sell",
      limitPrice: 99,
      quantity: 1,
      placedAtMs: 1,
    });

    const out = matchOrder({
      incoming: taker,
      book: { symbol: "BTCUSDT", bids: [], asks: [ask] },
      now,
      nextFillId,
    });

    expect(out.fills).toHaveLength(1);
    expect(out.fills[0].price).toBe(99); // maker dictates price
    expect(out.fills[0].quantity).toBe(1);
    expect(out.resultingTaker.status).toBe("filled");
    expect(out.consumedMakers[0].status).toBe("filled");
  });

  it("does not match when the buy limit is below the best ask", () => {
    const taker = ord({
      orderId: "T1",
      botId: "alice",
      side: "buy",
      limitPrice: 98,
      quantity: 1,
    });
    const ask = ord({
      orderId: "M1",
      botId: "bob",
      side: "sell",
      limitPrice: 99,
      quantity: 1,
    });
    const out = matchOrder({
      incoming: taker,
      book: { symbol: "BTCUSDT", bids: [], asks: [ask] },
      now,
      nextFillId,
    });
    expect(out.fills).toHaveLength(0);
    expect(out.resultingTaker.remainingQuantity).toBe(1);
  });
});

describe("matcher - partial fill", () => {
  it("partially fills the taker when maker liquidity is smaller", () => {
    const taker = ord({
      orderId: "T1",
      botId: "alice",
      side: "buy",
      limitPrice: 100,
      quantity: 5,
    });
    const ask = ord({
      orderId: "M1",
      botId: "bob",
      side: "sell",
      limitPrice: 99,
      quantity: 2,
    });
    const out = matchOrder({
      incoming: taker,
      book: { symbol: "BTCUSDT", bids: [], asks: [ask] },
      now,
      nextFillId,
    });
    expect(out.fills).toHaveLength(1);
    expect(out.fills[0].quantity).toBe(2);
    expect(out.resultingTaker.status).toBe("partially_filled");
    expect(out.resultingTaker.remainingQuantity).toBe(3);
  });
});

describe("matcher - price-time priority (FIFO at same price)", () => {
  it("fills the earlier-placed maker at the same price first", () => {
    const taker = ord({
      orderId: "T1",
      botId: "alice",
      side: "buy",
      limitPrice: 100,
      quantity: 2,
    });
    const earlier = ord({
      orderId: "EARLY",
      botId: "bob",
      side: "sell",
      limitPrice: 99,
      quantity: 1,
      placedAtMs: 1,
    });
    const later = ord({
      orderId: "LATE",
      botId: "carol",
      side: "sell",
      limitPrice: 99,
      quantity: 1,
      placedAtMs: 2,
    });
    const out = matchOrder({
      incoming: taker,
      book: { symbol: "BTCUSDT", bids: [], asks: [later, earlier] },
      now,
      nextFillId,
    });
    expect(out.fills.map((f) => f.makerOrderId)).toEqual(["EARLY", "LATE"]);
  });

  it("hits the best price first regardless of insertion order", () => {
    const taker = ord({
      orderId: "T1",
      botId: "alice",
      side: "buy",
      limitPrice: 100,
      quantity: 1,
    });
    const expensiveOlder = ord({
      orderId: "OLD",
      botId: "bob",
      side: "sell",
      limitPrice: 99.5,
      quantity: 1,
      placedAtMs: 1,
    });
    const cheaperNewer = ord({
      orderId: "NEW",
      botId: "carol",
      side: "sell",
      limitPrice: 99,
      quantity: 1,
      placedAtMs: 2,
    });
    const out = matchOrder({
      incoming: taker,
      book: { symbol: "BTCUSDT", bids: [], asks: [expensiveOlder, cheaperNewer] },
      now,
      nextFillId,
    });
    expect(out.fills[0].makerOrderId).toBe("NEW");
    expect(out.fills[0].price).toBe(99);
  });
});

describe("matcher - market order vs empty book", () => {
  it("returns no fills and the taker unchanged", () => {
    const taker = ord({
      orderId: "T1",
      botId: "alice",
      side: "buy",
      type: "market",
      quantity: 1,
    });
    const out = matchOrder({
      incoming: taker,
      book: { symbol: "BTCUSDT", bids: [], asks: [] },
      now,
      nextFillId,
    });
    expect(out.fills).toHaveLength(0);
    expect(out.resultingTaker.remainingQuantity).toBe(1);
  });
});

describe("matcher - no self-trade", () => {
  it("skips an opposite-side order from the same bot", () => {
    const taker = ord({
      orderId: "T1",
      botId: "alice",
      side: "buy",
      limitPrice: 100,
      quantity: 1,
    });
    const selfAsk = ord({
      orderId: "M1",
      botId: "alice",
      side: "sell",
      limitPrice: 99,
      quantity: 1,
    });
    const out = matchOrder({
      incoming: taker,
      book: { symbol: "BTCUSDT", bids: [], asks: [selfAsk] },
      now,
      nextFillId,
    });
    expect(out.fills).toHaveLength(0);
  });
});
