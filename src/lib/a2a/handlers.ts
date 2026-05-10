import { z } from "zod";
import { A2AError, type A2AHandlers } from "./server";
import {
  JsonRpcErrorCode,
  type ArtifactValue,
  type StreamEventValue,
  type TaskValue,
} from "./envelope";
import type { OrchestratorGraph } from "@/lib/orchestrator/graph";
import type { OrchestratorDeps } from "@/lib/orchestrator/deps";
import type { MarketEventBus } from "./eventBus";
import {
  runSubmitTradeIntent,
  submitTradeIntentUnary,
} from "./skills/submitTradeIntent";
import {
  runRespondToClarification,
  respondToClarificationUnary,
} from "./skills/respondToClarification";
import { runSubscribeToMarketEvents } from "./skills/subscribeToMarketEvents";
import type {
  BotPaperTrade,
  BotTradingProfile,
  RuleViolation,
  TradeIntent,
} from "@/lib/trading/types";

// Repository ports — kept narrow so the handler module doesn't need to know
// about Supabase directly. A `RepoBundle` is constructed once per Next.js
// instance and passed in.
export interface PaperPilotRepo {
  loadBotProfile(botId: string): Promise<BotTradingProfile | null>;
  recentTradesForBot(botId: string): Promise<BotPaperTrade[]>;
  recentViolationsForBot(botId: string): Promise<RuleViolation[]>;
  // Push-notification config — optional in MVP. The default no-op impl just
  // returns a fresh configId without persistence.
  savePushNotificationConfig?(input: {
    taskId: string;
    url: string;
    token?: string;
    signingSecret?: string;
  }): Promise<{ configId: string }>;
  // Persist the final task snapshot for `tasks/get`.
  saveTaskSnapshot?(task: TaskValue): Promise<void>;
  loadTaskSnapshot?(taskId: string): Promise<TaskValue | null>;
}

export interface HandlerDeps {
  graph: OrchestratorGraph;
  orchestratorDeps: OrchestratorDeps;
  eventBus: MarketEventBus;
  repo: PaperPilotRepo;
  // The authenticated botId, asserted by the route layer's HMAC check.
  authenticatedBotId: string;
  nextId: () => string;
  now: () => number;
}

// ---------------------------------------------------------------------------
// Schemas for the data parts the agent embeds in `params.message.parts`.
// ---------------------------------------------------------------------------

const SubmitTradeIntentDataPart = z.object({
  kind: z.literal("submit_trade_intent"),
  intent: z.object({
    symbol: z.string(),
    side: z.enum(["buy", "sell"]),
    assetType: z.enum(["crypto", "stock"]).default("crypto"),
    entryPrice: z.number().positive(),
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
    confidenceScore: z.number().min(-1).max(2).optional(),
    marketRegime: z
      .enum(["trending", "sideways", "volatile", "unknown"])
      .optional(),
    orderType: z.enum(["limit", "market"]).default("limit"),
    limitPrice: z.number().positive().optional(),
  }),
});

const RespondToClarificationDataPart = z.object({
  kind: z.literal("respond_to_clarification"),
  taskId: z.string(),
  text: z.string().optional(),
  correctedStopLoss: z.number().positive().optional(),
  correctedSignalReason: z.string().optional(),
});

const SubscribeToMarketDataPart = z.object({
  kind: z.literal("subscribe_to_market_events"),
});

const SkillDataPart = z.discriminatedUnion("kind", [
  SubmitTradeIntentDataPart,
  RespondToClarificationDataPart,
  SubscribeToMarketDataPart,
]);
type SkillDataPartValue = z.infer<typeof SkillDataPart>;

interface ParamsShape {
  message: {
    messageId: string;
    role: "ROLE_USER" | "ROLE_AGENT";
    parts: Array<
      { kind: "text"; text: string } | { kind: "data"; data: unknown }
    >;
    taskId?: string;
    contextId?: string;
  };
  configuration?: unknown;
}

function extractSkill(params: ParamsShape): SkillDataPartValue {
  for (const part of params.message.parts) {
    if (part.kind !== "data") continue;
    const parsed = SkillDataPart.safeParse(part.data);
    if (parsed.success) return parsed.data;
  }
  throw new A2AError(
    JsonRpcErrorCode.INVALID_PARAMS,
    "Message parts did not contain a recognized skill data part"
  );
}

export function buildA2AHandlers(deps: HandlerDeps): A2AHandlers {
  const skillsDeps = {
    graph: deps.graph,
    orchestratorDeps: deps.orchestratorDeps,
    eventBus: deps.eventBus,
  };

  const sendMessageImpl = async (params: unknown): Promise<TaskValue> => {
    const p = params as ParamsShape;
    const skill = extractSkill(p);
    const taskId = p.message.taskId ?? deps.nextId();
    const contextId = p.message.contextId ?? deps.nextId();

    if (skill.kind === "submit_trade_intent") {
      const profile = await assertProfile(deps, deps.authenticatedBotId);
      const recentTrades = await deps.repo.recentTradesForBot(
        deps.authenticatedBotId
      );
      const recentViolations = await deps.repo.recentViolationsForBot(
        deps.authenticatedBotId
      );

      const intent: TradeIntent = {
        ...skill.intent,
        botId: deps.authenticatedBotId,
        taskId,
        contextId,
        source: "bot_api",
        trust_tier: "hmac",
      };

      const task = await submitTradeIntentUnary(
        {
          taskId,
          contextId,
          botId: deps.authenticatedBotId,
          intent,
          profile,
          recentTrades,
          recentViolations,
        },
        skillsDeps
      );
      await deps.repo.saveTaskSnapshot?.(task);
      return task;
    }

    if (skill.kind === "respond_to_clarification") {
      const task = await respondToClarificationUnary(
        {
          taskId: skill.taskId,
          contextId,
          response: {
            text: skill.text,
            correctedStopLoss: skill.correctedStopLoss,
            correctedSignalReason: skill.correctedSignalReason,
          },
        },
        skillsDeps
      );
      await deps.repo.saveTaskSnapshot?.(task);
      return task;
    }

    // subscribe_to_market_events is a stream-only skill; reject unary use.
    throw new A2AError(
      JsonRpcErrorCode.UNSUPPORTED_OPERATION,
      "subscribe_to_market_events requires message/stream, not message/send"
    );
  };

  const sendStreamingMessageImpl = async function* (
    params: unknown
  ): AsyncIterable<StreamEventValue> {
    const p = params as ParamsShape;
    const skill = extractSkill(p);
    const taskId = p.message.taskId ?? deps.nextId();
    const contextId = p.message.contextId ?? deps.nextId();

    if (skill.kind === "submit_trade_intent") {
      const profile = await assertProfile(deps, deps.authenticatedBotId);
      const recentTrades = await deps.repo.recentTradesForBot(
        deps.authenticatedBotId
      );
      const recentViolations = await deps.repo.recentViolationsForBot(
        deps.authenticatedBotId
      );
      const intent: TradeIntent = {
        ...skill.intent,
        botId: deps.authenticatedBotId,
        taskId,
        contextId,
        source: "bot_api",
        trust_tier: "hmac",
      };
      const collected: ArtifactValue[] = [];
      let lastState: TaskValue["status"]["state"] = "TASK_STATE_SUBMITTED";
      for await (const event of runSubmitTradeIntent(
        {
          taskId,
          contextId,
          botId: deps.authenticatedBotId,
          intent,
          profile,
          recentTrades,
          recentViolations,
        },
        skillsDeps
      )) {
        if (event.kind === "status-update") lastState = event.status.state;
        if (event.kind === "artifact-update") collected.push(event.artifact);
        yield event;
      }
      await deps.repo.saveTaskSnapshot?.({
        id: taskId,
        contextId,
        status: { state: lastState },
        artifacts: collected,
        history: [],
      });
      return;
    }
    if (skill.kind === "respond_to_clarification") {
      const collected: ArtifactValue[] = [];
      let lastState: TaskValue["status"]["state"] = "TASK_STATE_SUBMITTED";
      for await (const event of runRespondToClarification(
        {
          taskId: skill.taskId,
          contextId,
          response: {
            text: skill.text,
            correctedStopLoss: skill.correctedStopLoss,
            correctedSignalReason: skill.correctedSignalReason,
          },
        },
        skillsDeps
      )) {
        if (event.kind === "status-update") lastState = event.status.state;
        if (event.kind === "artifact-update") collected.push(event.artifact);
        yield event;
      }
      await deps.repo.saveTaskSnapshot?.({
        id: skill.taskId,
        contextId,
        status: { state: lastState },
        artifacts: collected,
        history: [],
      });
      return;
    }
    if (skill.kind === "subscribe_to_market_events") {
      yield* runSubscribeToMarketEvents({ taskId, contextId }, deps.eventBus);
      return;
    }
  };

  return {
    sendMessage: sendMessageImpl,
    sendStreamingMessage: sendStreamingMessageImpl,
    subscribeToTask: async function* (params: unknown) {
      const p = params as { taskId: string };
      if (!deps.repo.loadTaskSnapshot) {
        throw new A2AError(
          JsonRpcErrorCode.UNSUPPORTED_OPERATION,
          "Task snapshots are not persisted; SubscribeToTask requires server-side persistence."
        );
      }
      const task = await deps.repo.loadTaskSnapshot(p.taskId);
      if (!task) {
        throw new A2AError(
          JsonRpcErrorCode.TASK_NOT_FOUND,
          `Task '${p.taskId}' not found`
        );
      }
      // Replay the persisted artifacts as a synthetic stream, then close.
      yield {
        kind: "status-update",
        taskId: task.id,
        contextId: task.contextId,
        status: task.status,
        final: true,
      };
      for (const artifact of task.artifacts) {
        yield {
          kind: "artifact-update",
          taskId: task.id,
          contextId: task.contextId,
          artifact,
          final: false,
        };
      }
    },
    getTask: async (params: unknown) => {
      const p = params as { taskId: string };
      const task = await deps.repo.loadTaskSnapshot?.(p.taskId);
      if (!task) {
        throw new A2AError(
          JsonRpcErrorCode.TASK_NOT_FOUND,
          `Task '${p.taskId}' not found`
        );
      }
      return task;
    },
    cancelTask: async (params: unknown) => {
      const p = params as { taskId: string };
      const task = await deps.repo.loadTaskSnapshot?.(p.taskId);
      if (!task) {
        throw new A2AError(
          JsonRpcErrorCode.TASK_NOT_FOUND,
          `Task '${p.taskId}' not found`
        );
      }
      // We don't implement real cancellation for the hackathon — any task
      // that's already past audit is committed.
      if (
        task.status.state === "TASK_STATE_COMPLETED" ||
        task.status.state === "TASK_STATE_FAILED" ||
        task.status.state === "TASK_STATE_CANCELED"
      ) {
        throw new A2AError(
          JsonRpcErrorCode.TASK_NOT_CANCELABLE,
          `Task '${p.taskId}' is in terminal state ${task.status.state}`
        );
      }
      const canceled: TaskValue = {
        ...task,
        status: { state: "TASK_STATE_CANCELED" },
      };
      await deps.repo.saveTaskSnapshot?.(canceled);
      return canceled;
    },
    createPushNotificationConfig: async (params: unknown) => {
      const p = params as {
        taskId: string;
        pushNotificationConfig: {
          url: string;
          token?: string;
        };
      };
      if (!deps.repo.savePushNotificationConfig) {
        return { configId: `${p.taskId}:default` };
      }
      return deps.repo.savePushNotificationConfig({
        taskId: p.taskId,
        url: p.pushNotificationConfig.url,
        token: p.pushNotificationConfig.token,
      });
    },
  };
}

async function assertProfile(
  deps: HandlerDeps,
  botId: string
): Promise<BotTradingProfile> {
  const profile = await deps.repo.loadBotProfile(botId);
  if (!profile) {
    throw new A2AError(
      JsonRpcErrorCode.AUTHENTICATION_REQUIRED,
      `No registered bot profile for botId='${botId}'`
    );
  }
  return profile;
}
