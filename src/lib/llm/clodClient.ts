// Thin OpenAI-compatible client for the Clōd gateway (https://api.clod.io).
// Clōd brokers 30+ third-party and self-hosted models behind one OpenAI-shaped
// endpoint and a single API key, so this client is structurally identical to
// `vllmClient.ts` but adds first-class tool-call (function-call) support — the
// multi-agent layer relies on the Clōd-hosted model deciding when to invoke
// the `consult_finance_expert` tool that fans out to the Lightning AI vLLM.
//
// Reasoning models served via Clōd may emit a leading <think>...</think>
// block; we keep `splitReasoning` in `vllmClient` and re-export it here so
// callers can choose to strip or surface it.

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema (subset) for the tool's arguments. Validated by the model. */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  /** Provider-assigned id; must be echoed back on the matching tool message. */
  id: string;
  name: string;
  /** Already-parsed JSON arguments. Falls back to `{}` if the model emitted
   * an empty / unparseable arguments string. The raw string is on `rawArguments`. */
  arguments: Record<string, unknown>;
  rawArguments: string;
}

export interface AssistantMessage {
  role: "assistant";
  content: string;
  toolCalls: ToolCall[];
}

export interface UserMessage {
  role: "user";
  content: string;
}

export interface SystemMessage {
  role: "system";
  content: string;
}

export interface ToolResultMessage {
  role: "tool";
  /** Must match the `id` of the originating tool call. */
  toolCallId: string;
  /** Stringified tool output (model-readable). */
  content: string;
}

export type ClodMessage =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ToolResultMessage;

export interface ClodChatOpts {
  messages: ClodMessage[];
  tools?: ToolDefinition[];
  /** "auto" lets the model decide, "none" disables tool use, "required"
   * forces a call. Defaults to "auto" when `tools` is non-empty. */
  toolChoice?: "auto" | "none" | "required";
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stop?: string[];
  signal?: AbortSignal;
  /** Override the configured model for a single call. */
  model?: string;
}

export interface ClodChatResult {
  message: AssistantMessage;
  /** Untouched content as returned by the server, before any think-block
   * stripping. Empty string if the model emitted only tool calls. */
  rawContent: string;
  model: string;
  finishReason: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
}

export interface ClodConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Default request timeout when the caller does not pass an AbortSignal. */
  defaultTimeoutMs?: number;
  /** Override fetch (used by tests). */
  fetchImpl?: typeof fetch;
}

export class ClodClientError extends Error {
  readonly status?: number;
  readonly bodyText?: string;
  constructor(message: string, status?: number, bodyText?: string) {
    super(message);
    this.name = "ClodClientError";
    this.status = status;
    this.bodyText = bodyText;
  }
}

/**
 * Build a Clōd config from environment variables. We intentionally use a
 * dedicated CLOD_* namespace (not OPENAI_*) so the Lightning AI vLLM keeps
 * its own credentials separate.
 */
export function loadClodConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): ClodConfig {
  const baseUrl = env.CLOD_API_BASE;
  const apiKey = env.CLOD_API_KEY;
  const model = env.CLOD_MODEL;
  if (!baseUrl) {
    throw new ClodClientError("CLOD_API_BASE is not set");
  }
  if (!apiKey || apiKey === "replace-with-clod-key") {
    throw new ClodClientError("CLOD_API_KEY is not set");
  }
  if (!model) {
    throw new ClodClientError("CLOD_MODEL is not set");
  }
  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiKey,
    model,
  };
}

interface RawToolCall {
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

interface RawChatCompletion {
  model?: string;
  choices?: Array<{
    finish_reason?: string;
    message?: {
      role?: string;
      content?: string | null;
      tool_calls?: RawToolCall[];
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

function toWireMessage(m: ClodMessage): Record<string, unknown> {
  switch (m.role) {
    case "system":
    case "user":
      return { role: m.role, content: m.content };
    case "assistant":
      return {
        role: "assistant",
        content: m.content,
        ...(m.toolCalls.length > 0
          ? {
              tool_calls: m.toolCalls.map((c) => ({
                id: c.id,
                type: "function",
                function: { name: c.name, arguments: c.rawArguments },
              })),
            }
          : {}),
      };
    case "tool":
      return {
        role: "tool",
        tool_call_id: m.toolCallId,
        content: m.content,
      };
  }
}

function parseToolCalls(raw: RawToolCall[] | undefined): ToolCall[] {
  if (!raw) return [];
  const out: ToolCall[] = [];
  for (const c of raw) {
    const name = c.function?.name;
    const rawArgs = c.function?.arguments ?? "";
    if (!name || !c.id) continue;
    let parsed: Record<string, unknown> = {};
    if (rawArgs && rawArgs.trim().length > 0) {
      try {
        const v = JSON.parse(rawArgs);
        if (v && typeof v === "object") parsed = v as Record<string, unknown>;
      } catch {
        /* leave parsed as {} — caller still has rawArguments to inspect */
      }
    }
    out.push({ id: c.id, name, arguments: parsed, rawArguments: rawArgs });
  }
  return out;
}

export async function clodChat(
  config: ClodConfig,
  opts: ClodChatOpts
): Promise<ClodChatResult> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const url = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;

  let signal = opts.signal;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  if (!signal && config.defaultTimeoutMs) {
    const ctl = new AbortController();
    timeoutHandle = setTimeout(() => ctl.abort(), config.defaultTimeoutMs);
    signal = ctl.signal;
  }

  const wireBody: Record<string, unknown> = {
    model: opts.model ?? config.model,
    messages: opts.messages.map(toWireMessage),
    max_completion_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.3,
  };
  if (opts.topP !== undefined) wireBody.top_p = opts.topP;
  if (opts.stop !== undefined) wireBody.stop = opts.stop;
  if (opts.tools && opts.tools.length > 0) {
    wireBody.tools = opts.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
    wireBody.tool_choice = opts.toolChoice ?? "auto";
  } else if (opts.toolChoice === "none") {
    wireBody.tool_choice = "none";
  }

  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(wireBody),
      signal,
    });
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ClodClientError(
      `Clōd chat completion failed: HTTP ${res.status}`,
      res.status,
      text
    );
  }

  const data = (await res.json()) as RawChatCompletion;
  const choice = data.choices?.[0];
  const rawContent = choice?.message?.content ?? "";
  const toolCalls = parseToolCalls(choice?.message?.tool_calls);
  const message: AssistantMessage = {
    role: "assistant",
    content: rawContent,
    toolCalls,
  };
  return {
    message,
    rawContent,
    model: data.model ?? config.model,
    finishReason: choice?.finish_reason ?? "unknown",
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
    totalTokens: data.usage?.total_tokens ?? 0,
    latencyMs: Date.now() - t0,
  };
}
