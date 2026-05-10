import { describe, it, expect } from "vitest";
import { createInMemoryOrderBook } from "./orderBook";

let idCounter = 0;
let timeCounter = 1_000;

function fresh() {
  idCounter = 0;
  timeCounter = 1_000;
  return createInMemoryOrderBook({
    nextId: () => `id-${++idCounter}`,
    now: () => ++timeCounter,
  });
}

describe("orderBook - place + match round-trip", () => {
  it("matches a crossing buy against a resting ask and removes the maker", async () => {
    const book = fresh();
    const ask = await book.place({
      botId: "bob",
      taskId: "tB",
      symbol: "BTCUSDT",
      side: "sell",
      type: "limit",
      limitPrice: 100,
      quantity: 1,
    });
    expect(ask.fills).toHaveLength(0);
    expect(ask.order.status).toBe("open");

    const taker = await book.place({
      botId: "alice",
      taskId: "tA",
      symbol: "BTCUSDT",
      side: "buy",
      type: "limit",
      limitPrice: 101,
      quantity: 1,
    });
    expect(taker.fills).toHaveLength(1);
    expect(taker.fills[0].price).toBe(100);
    expect(taker.order.status).toBe("filled");

    // The maker is now off the book.
    const snap = await book.snapshot("BTCUSDT");
    expect(snap.bids).toHaveLength(0);
    expect(snap.asks).toHaveLength(0);
  });

  it("rests an unmatched limit order on the book", async () => {
    const book = fresh();
    const res = await book.place({
      botId: "alice",
      taskId: "tA",
      symbol: "BTCUSDT",
      side: "buy",
      type: "limit",
      limitPrice: 99,
      quantity: 1,
    });
    expect(res.order.status).toBe("open");
    expect(res.events.some((e) => e.kind === "order_resting")).toBe(true);

    const snap = await book.snapshot("BTCUSDT");
    expect(snap.bids).toHaveLength(1);
  });
});

describe("orderBook - validation", () => {
  it("rejects an order with non-positive quantity", async () => {
    const book = fresh();
    const res = await book.place({
      botId: "alice",
      taskId: "tA",
      symbol: "BTCUSDT",
      side: "buy",
      type: "limit",
      limitPrice: 100,
      quantity: 0,
    });
    expect(res.order.status).toBe("rejected");
    expect(res.events[0]).toMatchObject({ kind: "order_rejected" });
  });

  it("rejects a limit order without a limit price", async () => {
    const book = fresh();
    const res = await book.place({
      botId: "alice",
      taskId: "tA",
      symbol: "BTCUSDT",
      side: "buy",
      type: "limit",
      quantity: 1,
    });
    expect(res.order.status).toBe("rejected");
  });
});

describe("orderBook - cancel", () => {
  it("cancels an open order", async () => {
    const book = fresh();
    const placed = await book.place({
      botId: "alice",
      taskId: "tA",
      symbol: "BTCUSDT",
      side: "buy",
      type: "limit",
      limitPrice: 99,
      quantity: 1,
    });
    const canceled = await book.cancel(placed.order.orderId);
    expect(canceled?.status).toBe("canceled");

    const snap = await book.snapshot("BTCUSDT");
    expect(snap.bids).toHaveLength(0);
  });

  it("returns null when canceling an already-filled order", async () => {
    const book = fresh();
    await book.place({
      botId: "bob",
      taskId: "tB",
      symbol: "BTCUSDT",
      side: "sell",
      type: "limit",
      limitPrice: 100,
      quantity: 1,
    });
    const filled = await book.place({
      botId: "alice",
      taskId: "tA",
      symbol: "BTCUSDT",
      side: "buy",
      type: "limit",
      limitPrice: 100,
      quantity: 1,
    });
    const result = await book.cancel(filled.order.orderId);
    expect(result).toBeNull();
  });
});

describe("orderBook - serialized concurrent placement", () => {
  it("serializes concurrent placements so two takers don't race the same maker", async () => {
    const book = fresh();
    await book.place({
      botId: "bob",
      taskId: "tB",
      symbol: "BTCUSDT",
      side: "sell",
      type: "limit",
      limitPrice: 100,
      quantity: 1,
    });

    const [a, b] = await Promise.all([
      book.place({
        botId: "alice",
        taskId: "tA",
        symbol: "BTCUSDT",
        side: "buy",
        type: "limit",
        limitPrice: 100,
        quantity: 1,
      }),
      book.place({
        botId: "carol",
        taskId: "tC",
        symbol: "BTCUSDT",
        side: "buy",
        type: "limit",
        limitPrice: 100,
        quantity: 1,
      }),
    ]);

    const filledCount = [a, b].filter((r) => r.order.status === "filled").length;
    const restingCount = [a, b].filter((r) => r.order.status === "open").length;
    expect(filledCount).toBe(1);
    expect(restingCount).toBe(1);
  });
});
