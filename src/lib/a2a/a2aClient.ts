// Outbound A2A client. Counterpart to ./agentCard.ts (which describes our
// own card). Used by the strategy interrogator to discover a peer trading
// agent's card and exchange JSON-RPC messages so we can ask it about its
// strategy. Auth is intentionally pluggable: peer agents may use bearer
// tokens, HMAC signatures, or no auth at all.
import { z } from "zod";
import {
  Task,
  type MessageValue,
  type TaskValue,
  JsonRpcId,
} from "./envelope";
import type { AgentCard } from "./agentCard";

export interface AuthHeaderProvider {
  /**
   * Compute the headers for a single outbound HTTP request. `bodyText`
   * is the exact JSON string we are about to send so HMAC providers can
   * sign over it; `urlPath` is the request path for path-bound schemes.
   */
  headersFor(req: { urlPath: string; bodyText: string }):
    | Promise<Record<string, string>>
    | Record<string, string>;
}

export interface A2AClientOpts {
  fetchImpl?: typeof fetch;
  /** Optional auth provider; if omitted no extra headers are added. */
  auth?: AuthHeaderProvider;
  timeoutMs?: number;
}

export class A2AClientError extends Error {
  readonly status?: number;
  readonly bodyText?: string;
  readonly rpcCode?: number;
  constructor(
    message: string,
    opts: { status?: number; bodyText?: string; rpcCode?: number } = {}
  ) {
    super(message);
    this.name = "A2AClientError";
    this.status = opts.status;
    this.bodyText = opts.bodyText;
    this.rpcCode = opts.rpcCode;
  }
}

const AGENT_CARD_PATH = "/.well-known/agent-card.json";

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

async function abortAfter<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs?: number
): Promise<T> {
  if (!timeoutMs) {
    const ctl = new AbortController();
    return fn(ctl.signal);
  }
  const ctl = new AbortController();
  const handle = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fn(ctl.signal);
  } finally {
    clearTimeout(handle);
  }
}

/**
 * GET <agentBaseUrl>/.well-known/agent-card.json and return the parsed
 * AgentCard. The remote does not have to be a PaperPilot instance; any
 * conforming A2A v1 agent is acceptable.
 */
export async function discoverAgentCard(
  agentBaseUrl: string,
  opts: A2AClientOpts = {}
): Promise<AgentCard> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = joinUrl(agentBaseUrl, AGENT_CARD_PATH);
  const res = await abortAfter(
    (signal) =>
      fetchImpl(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal,
      }),
    opts.timeoutMs
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new A2AClientError(`agent-card discovery failed: HTTP ${res.status}`, {
      status: res.status,
      bodyText: body,
    });
  }
  const card = (await res.json()) as AgentCard;
  if (!card?.url || !Array.isArray(card?.skills)) {
    throw new A2AClientError(
      "agent-card response is missing required fields (url, skills)"
    );
  }
  return card;
}

const JsonRpcSuccessSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: JsonRpcId,
  result: z.unknown(),
});

const JsonRpcFailureSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: JsonRpcId,
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: z.unknown().optional(),
  }),
});

const JsonRpcResponseSchema = z.union([
  JsonRpcSuccessSchema,
  JsonRpcFailureSchema,
]);

let rpcCounter = 0;
function nextRpcId(): string {
  rpcCounter += 1;
  return `pp-${Date.now().toString(36)}-${rpcCounter}`;
}

/**
 * Invoke an arbitrary A2A JSON-RPC method on `rpcUrl`. Returns the parsed
 * `result` field; throws A2AClientError on transport failure or rpc error.
 */
export async function rpcCall<T = unknown>(
  rpcUrl: string,
  method: string,
  params: unknown,
  opts: A2AClientOpts = {}
): Promise<T> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const id = nextRpcId();
  const bodyText = JSON.stringify({
    jsonrpc: "2.0",
    method,
    params,
    id,
  });
  const path = new URL(rpcUrl, "http://placeholder").pathname;
  const authHeaders = opts.auth
    ? await opts.auth.headersFor({ urlPath: path, bodyText })
    : {};

  const res = await abortAfter(
    (signal) =>
      fetchImpl(rpcUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...authHeaders,
        },
        body: bodyText,
        signal,
      }),
    opts.timeoutMs
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new A2AClientError(`rpc transport error: HTTP ${res.status}`, {
      status: res.status,
      bodyText: body,
    });
  }

  const json = await res.json().catch(() => null);
  const parsed = JsonRpcResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new A2AClientError("rpc response was not a valid JSON-RPC envelope");
  }
  if ("error" in parsed.data) {
    throw new A2AClientError(parsed.data.error.message, {
      rpcCode: parsed.data.error.code,
    });
  }
  return parsed.data.result as T;
}

/**
 * Send a single A2A `message/send` to a peer and return the resulting Task.
 * The peer is responsible for spawning the task and may return it in any
 * lifecycle state. For long-running interactions, callers should poll
 * `tasks/get` (see `getTask`) or subscribe via SSE.
 */
export async function sendMessage(
  rpcUrl: string,
  message: MessageValue,
  opts: A2AClientOpts = {}
): Promise<TaskValue> {
  const result = await rpcCall<unknown>(
    rpcUrl,
    "message/send",
    { message },
    opts
  );
  return Task.parse(result);
}

export async function getTask(
  rpcUrl: string,
  taskId: string,
  opts: A2AClientOpts & { historyLength?: number } = {}
): Promise<TaskValue> {
  const params: Record<string, unknown> = { taskId };
  if (opts.historyLength !== undefined) params.historyLength = opts.historyLength;
  const result = await rpcCall<unknown>(rpcUrl, "tasks/get", params, opts);
  return Task.parse(result);
}

/**
 * Build a bearer-token auth provider. Many A2A peers accept simple
 * `Authorization: Bearer <token>` for inbound calls.
 */
export function bearerAuth(token: string): AuthHeaderProvider {
  return {
    headersFor() {
      return { Authorization: `Bearer ${token}` };
    },
  };
}
