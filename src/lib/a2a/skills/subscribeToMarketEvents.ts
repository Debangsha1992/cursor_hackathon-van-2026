import type { StreamEventValue } from "../envelope";
import type { MarketEventBus } from "../eventBus";

export interface SubscribeMarketInput {
  taskId: string;
  contextId: string;
}

export async function* runSubscribeToMarketEvents(
  input: SubscribeMarketInput,
  eventBus: MarketEventBus
): AsyncGenerator<StreamEventValue, void, void> {
  yield {
    kind: "status-update",
    taskId: input.taskId,
    contextId: input.contextId,
    status: { state: "TASK_STATE_WORKING" },
    final: false,
  };

  for await (const me of eventBus.subscribe()) {
    yield {
      kind: "artifact-update",
      taskId: input.taskId,
      contextId: input.contextId,
      artifact: {
        artifactId: `${input.taskId}:market:${Date.now()}`,
        name: "market-event",
        parts: [{ kind: "data", data: me }],
      },
      final: false,
    };
  }
}
