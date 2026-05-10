import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { getDeps } from "../deps";
import type {
  Outcome,
  PaperPilotStateUpdate,
  PaperPilotStateValue,
} from "../state";

// MATCH + EXECUTE node: places the (audited, possibly clarified) intent on
// the order book and surfaces the result. The order book handles its own
// concurrency / matching and emits `MarketEvent`s the orchestrator
// accumulates.
export async function matchNode(
  state: PaperPilotStateValue,
  config: LangGraphRunnableConfig
): Promise<PaperPilotStateUpdate> {
  const deps = getDeps(config);

  const limitPrice =
    state.intent.orderType === "limit"
      ? state.intent.limitPrice ?? state.intent.entryPrice
      : undefined;

  const result = await deps.orderBook.place({
    botId: state.botId,
    taskId: state.taskId,
    symbol: state.intent.symbol,
    side: state.intent.side,
    type: state.intent.orderType,
    limitPrice,
    quantity: state.intent.quantity,
  });

  let outcome: Outcome;
  if (result.order.status === "filled") {
    outcome = { kind: "filled", fills: result.fills };
  } else if (result.order.status === "partially_filled") {
    outcome = result.fills.length > 0 && result.order.remainingQuantity > 0
      ? { kind: "resting", order: result.order }
      : { kind: "filled", fills: result.fills };
  } else if (result.order.status === "open") {
    outcome = { kind: "resting", order: result.order };
  } else {
    outcome = {
      kind: "rejected",
      reason:
        result.events.find((e) => e.kind === "order_rejected")?.kind === "order_rejected"
          ? "order_book_rejected"
          : "unknown",
    };
  }

  return {
    outcome,
    marketEvents: result.events,
  };
}
