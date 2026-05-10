import { z } from "zod";

// A2A v1.0 task lifecycle states.
// https://a2aproject.github.io/A2A/latest/specification/
export const TaskState = z.enum([
  "TASK_STATE_SUBMITTED",
  "TASK_STATE_WORKING",
  "TASK_STATE_INPUT_REQUIRED",
  "TASK_STATE_AUTH_REQUIRED",
  "TASK_STATE_COMPLETED",
  "TASK_STATE_FAILED",
  "TASK_STATE_CANCELED",
  "TASK_STATE_REJECTED",
]);
export type TaskStateValue = z.infer<typeof TaskState>;

export const TERMINAL_STATES: ReadonlySet<TaskStateValue> = new Set([
  "TASK_STATE_COMPLETED",
  "TASK_STATE_FAILED",
  "TASK_STATE_CANCELED",
  "TASK_STATE_REJECTED",
]);

export const INTERRUPTED_STATES: ReadonlySet<TaskStateValue> = new Set([
  "TASK_STATE_INPUT_REQUIRED",
  "TASK_STATE_AUTH_REQUIRED",
]);

export const MessageRole = z.enum(["ROLE_USER", "ROLE_AGENT"]);
export type MessageRoleValue = z.infer<typeof MessageRole>;

export const TextPart = z.object({
  kind: z.literal("text"),
  text: z.string(),
});

export const DataPart = z.object({
  kind: z.literal("data"),
  data: z.unknown(),
  mimeType: z.string().optional(),
});

export const Part = z.discriminatedUnion("kind", [TextPart, DataPart]);
export type PartValue = z.infer<typeof Part>;

export const Message = z.object({
  messageId: z.string(),
  role: MessageRole,
  parts: z.array(Part).min(1),
  taskId: z.string().optional(),
  contextId: z.string().optional(),
});
export type MessageValue = z.infer<typeof Message>;

export const TaskStatus = z.object({
  state: TaskState,
  message: Message.optional(),
  timestamp: z.string().optional(),
});

export const Artifact = z.object({
  artifactId: z.string(),
  name: z.string().optional(),
  parts: z.array(Part).min(1),
});
export type ArtifactValue = z.infer<typeof Artifact>;

export const Task = z.object({
  id: z.string(),
  contextId: z.string(),
  status: TaskStatus,
  artifacts: z.array(Artifact).default([]),
  history: z.array(Message).default([]),
});
export type TaskValue = z.infer<typeof Task>;

export const TaskStatusUpdateEvent = z.object({
  kind: z.literal("status-update"),
  taskId: z.string(),
  contextId: z.string(),
  status: TaskStatus,
  final: z.boolean().default(false),
});
export type TaskStatusUpdateEventValue = z.infer<typeof TaskStatusUpdateEvent>;

export const TaskArtifactUpdateEvent = z.object({
  kind: z.literal("artifact-update"),
  taskId: z.string(),
  contextId: z.string(),
  artifact: Artifact,
  final: z.boolean().default(false),
});
export type TaskArtifactUpdateEventValue = z.infer<
  typeof TaskArtifactUpdateEvent
>;

export const StreamEvent = z.discriminatedUnion("kind", [
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
]);
export type StreamEventValue = z.infer<typeof StreamEvent>;

export const SendMessageConfiguration = z.object({
  acceptedOutputModes: z.array(z.string()).optional(),
  historyLength: z.number().int().nonnegative().optional(),
  returnImmediately: z.boolean().optional(),
});

export const SendMessageParams = z.object({
  message: Message,
  configuration: SendMessageConfiguration.optional(),
});

export const SubscribeToTaskParams = z.object({
  taskId: z.string(),
});

export const GetTaskParams = z.object({
  taskId: z.string(),
  historyLength: z.number().int().nonnegative().optional(),
});

export const CancelTaskParams = z.object({
  taskId: z.string(),
});

export const PushNotificationConfig = z.object({
  url: z.string().url(),
  token: z.string().optional(),
  authentication: z
    .object({
      schemes: z.array(z.string()),
      credentials: z.string().optional(),
    })
    .optional(),
});

export const CreateTaskPushNotificationConfigParams = z.object({
  taskId: z.string(),
  pushNotificationConfig: PushNotificationConfig,
});

// JSON-RPC 2.0 envelope (https://www.jsonrpc.org/specification).
// We accept either string or numeric ids; we only echo what came in.
export const JsonRpcId = z.union([z.string(), z.number().int(), z.null()]);
export type JsonRpcIdValue = z.infer<typeof JsonRpcId>;

export const JsonRpcRequest = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string(),
  params: z.unknown().optional(),
  id: JsonRpcId.optional(),
});
export type JsonRpcRequestValue = z.infer<typeof JsonRpcRequest>;

export interface JsonRpcSuccess<T> {
  jsonrpc: "2.0";
  result: T;
  id: JsonRpcIdValue;
}

export interface JsonRpcFailure {
  jsonrpc: "2.0";
  error: { code: number; message: string; data?: unknown };
  id: JsonRpcIdValue;
}

export type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcFailure;

// Standard JSON-RPC errors plus A2A-specific extensions.
export const JsonRpcErrorCode = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // A2A reserves -32000..-32099 for application errors.
  TASK_NOT_FOUND: -32001,
  TASK_NOT_CANCELABLE: -32002,
  PUSH_NOTIFICATION_NOT_SUPPORTED: -32003,
  UNSUPPORTED_OPERATION: -32004,
  CONTENT_TYPE_NOT_SUPPORTED: -32005,
  AUTHENTICATION_REQUIRED: -32006,
} as const;
