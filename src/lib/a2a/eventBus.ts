import type { MarketEvent } from "@/lib/market/types";

// In-process pub/sub for market broadcast events. One subscriber per
// connected `subscribe_to_market_events` SSE stream. This is sufficient for a
// single-instance hackathon deployment; a production system would back this
// with Redis Streams or a Supabase Realtime channel.
export interface MarketEventBus {
  publish(event: MarketEvent): void;
  subscribe(): AsyncIterable<MarketEvent>;
  close(): void;
}

export function createMarketEventBus(): MarketEventBus {
  type Sub = {
    queue: MarketEvent[];
    resolve?: () => void;
    closed: boolean;
  };
  const subs = new Set<Sub>();
  let closed = false;

  return {
    publish(event) {
      if (closed) return;
      for (const sub of subs) {
        sub.queue.push(event);
        sub.resolve?.();
        sub.resolve = undefined;
      }
    },
    subscribe(): AsyncIterable<MarketEvent> {
      const sub: Sub = { queue: [], closed: false };
      subs.add(sub);
      return {
        [Symbol.asyncIterator](): AsyncIterator<MarketEvent> {
          return {
            async next() {
              while (!sub.closed && !closed) {
                const next = sub.queue.shift();
                if (next) return { value: next, done: false };
                await new Promise<void>((resolve) => {
                  sub.resolve = resolve;
                });
              }
              subs.delete(sub);
              return { value: undefined as unknown as MarketEvent, done: true };
            },
            async return() {
              sub.closed = true;
              sub.resolve?.();
              subs.delete(sub);
              return { value: undefined as unknown as MarketEvent, done: true };
            },
          };
        },
      };
    },
    close() {
      closed = true;
      for (const sub of subs) {
        sub.closed = true;
        sub.resolve?.();
      }
      subs.clear();
    },
  };
}
