import type { z } from "zod";
import {
  CancelTaskParams,
  CreateTaskPushNotificationConfigParams,
  GetTaskParams,
  JsonRpcErrorCode,
  JsonRpcRequest,
  SendMessageParams,
  SubscribeToTaskParams,
  type JsonRpcFailure,
  type JsonRpcIdValue,
  type JsonRpcResponse,
  type JsonRpcSuccess,
  type StreamEventValue,
  type TaskValue,
} from "./envelope";

// The handlers are intentionally narrow ports: the dispatcher knows nothing
// about LangGraph, Supabase, or the order book. Wire-level concerns (JSON-RPC
// parsing, error codes, envelope construction) live here and nowhere else.
export interface A2AHandlers {
  sendMessage(params: unknown): Promise<TaskValue>;
  // Streaming methods yield an async iterable of A2A stream events. The
  // dispatcher converts them into SSE frames at the route layer.
  sendStreamingMessage(params: unknown): AsyncIterable<StreamEventValue>;
  subscribeToTask(params: unknown): AsyncIterable<StreamEventValue>;
  getTask(params: unknown): Promise<TaskValue>;
  cancelTask(params: unknown): Promise<TaskValue>;
  createPushNotificationConfig(params: unknown): Promise<{ configId: string }>;
}

export type DispatchResult =
  | { kind: "unary"; response: JsonRpcResponse<unknown> }
  | {
      kind: "stream";
      events: AsyncIterable<StreamEventValue>;
      rpcId: JsonRpcIdValue;
    };

function ok<T>(id: JsonRpcIdValue, result: T): JsonRpcSuccess<T> {
  return { jsonrpc: "2.0", result, id };
}

function fail(
  id: JsonRpcIdValue,
  code: number,
  message: string,
  data?: unknown
): JsonRpcFailure {
  return { jsonrpc: "2.0", error: { code, message, data }, id };
}

export interface DispatchOpts {
  parsedBody: unknown;
  handlers: A2AHandlers;
}

export async function dispatchJsonRpc(
  opts: DispatchOpts
): Promise<DispatchResult> {
  const parsed = JsonRpcRequest.safeParse(opts.parsedBody);
  if (!parsed.success) {
    return {
      kind: "unary",
      response: fail(
        null,
        JsonRpcErrorCode.INVALID_REQUEST,
        "Invalid JSON-RPC request envelope",
        parsed.error.flatten()
      ),
    };
  }

  const req = parsed.data;
  const id = req.id ?? null;

  try {
    switch (req.method) {
      case "message/send": {
        const params = parseOrThrow(SendMessageParams, req.params);
        const task = await opts.handlers.sendMessage(params);
        return { kind: "unary", response: ok(id, task) };
      }
      case "message/stream": {
        // Validate eagerly so we surface bad params as a unary error before
        // opening the SSE channel.
        parseOrThrow(SendMessageParams, req.params);
        const events = opts.handlers.sendStreamingMessage(req.params);
        return { kind: "stream", events, rpcId: id };
      }
      case "tasks/subscribe": {
        parseOrThrow(SubscribeToTaskParams, req.params);
        const events = opts.handlers.subscribeToTask(req.params);
        return { kind: "stream", events, rpcId: id };
      }
      case "tasks/get": {
        const params = parseOrThrow(GetTaskParams, req.params);
        const task = await opts.handlers.getTask(params);
        return { kind: "unary", response: ok(id, task) };
      }
      case "tasks/cancel": {
        const params = parseOrThrow(CancelTaskParams, req.params);
        const task = await opts.handlers.cancelTask(params);
        return { kind: "unary", response: ok(id, task) };
      }
      case "tasks/pushNotificationConfig/create": {
        const params = parseOrThrow(
          CreateTaskPushNotificationConfigParams,
          req.params
        );
        const result =
          await opts.handlers.createPushNotificationConfig(params);
        return { kind: "unary", response: ok(id, result) };
      }
      default:
        return {
          kind: "unary",
          response: fail(
            id,
            JsonRpcErrorCode.METHOD_NOT_FOUND,
            `Unknown method '${req.method}'`
          ),
        };
    }
  } catch (err) {
    if (err instanceof InvalidParamsError) {
      return {
        kind: "unary",
        response: fail(
          id,
          JsonRpcErrorCode.INVALID_PARAMS,
          err.message,
          err.detail
        ),
      };
    }
    if (err instanceof A2AError) {
      return {
        kind: "unary",
        response: fail(id, err.code, err.message),
      };
    }
    return {
      kind: "unary",
      response: fail(
        id,
        JsonRpcErrorCode.INTERNAL_ERROR,
        err instanceof Error ? err.message : "Unhandled internal error"
      ),
    };
  }
}

class InvalidParamsError extends Error {
  constructor(message: string, public detail?: unknown) {
    super(message);
  }
}

export class A2AError extends Error {
  constructor(public code: number, message: string) {
    super(message);
  }
}

function parseOrThrow<S extends z.ZodTypeAny>(
  schema: S,
  value: unknown
): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new InvalidParamsError(
      "Parameters failed validation",
      parsed.error.flatten()
    );
  }
  return parsed.data;
}
