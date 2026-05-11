// Thin OpenAI-compatible client for the self-hosted vLLM finance reasoning
// model (e.g. DragonLLM/Qwen-Open-Finance-R-8B served behind
// https://.../v1/chat/completions). The model emits an inline <think>...</think>
// block before its final answer; this client returns the two segments
// separately so callers can persist reasoning for audit without leaking it
// into user-facing prose.

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatOpts {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stop?: string[];
  signal?: AbortSignal;
  /** Override the configured model for a single call. */
  model?: string;
}

export interface ChatResult {
  /** Free-form natural-language answer with the <think> block stripped. */
  content: string;
  /** Contents of the <think>...</think> block, if any. Empty string if none. */
  reasoning: string;
  /** Untouched message content as returned by the server. */
  raw: string;
  model: string;
  finishReason: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
}

export interface VllmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Default request timeout when the caller does not pass an AbortSignal. */
  defaultTimeoutMs?: number;
  /** Override fetch (used by tests). */
  fetchImpl?: typeof fetch;
}

const THINK_OPEN = "<think>";
const THINK_CLOSE = "</think>";

/**
 * Reasoning models like Qwen-R emit thoughts inside a <think>...</think>
 * block before their final answer. We strip that block so we never surface
 * raw chain-of-thought to users, but we keep it on the result for the audit
 * log. Truncated (unclosed) think blocks are treated as "all reasoning, no
 * content" so the caller can detect the failure mode and retry with more
 * tokens instead of rendering an empty string as advice.
 */
export function splitReasoning(raw: string): {
  reasoning: string;
  content: string;
} {
  if (!raw) return { reasoning: "", content: "" };
  const openIdx = raw.indexOf(THINK_OPEN);
  if (openIdx === -1) return { reasoning: "", content: raw.trim() };
  const closeIdx = raw.indexOf(THINK_CLOSE, openIdx + THINK_OPEN.length);
  if (closeIdx === -1) {
    return {
      reasoning: raw.slice(openIdx + THINK_OPEN.length).trim(),
      content: "",
    };
  }
  const reasoning = raw.slice(openIdx + THINK_OPEN.length, closeIdx).trim();
  const before = raw.slice(0, openIdx);
  const after = raw.slice(closeIdx + THINK_CLOSE.length);
  return { reasoning, content: (before + after).trim() };
}

export class VllmClientError extends Error {
  readonly status?: number;
  readonly bodyText?: string;
  constructor(message: string, status?: number, bodyText?: string) {
    super(message);
    this.name = "VllmClientError";
    this.status = status;
    this.bodyText = bodyText;
  }
}

/**
 * Build a vLLM config from environment variables. The variables match the
 * project's existing .env.local convention (OpenAI-compatible naming).
 */
export function loadVllmConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): VllmConfig {
  const baseUrl = env.OPENAI_API_BASE;
  const apiKey = env.OPENAI_API_KEY;
  const model = env.OPENAI_MODEL;
  if (!baseUrl) {
    throw new VllmClientError("OPENAI_API_BASE is not set");
  }
  if (!apiKey) {
    throw new VllmClientError("OPENAI_API_KEY is not set");
  }
  if (!model) {
    throw new VllmClientError("OPENAI_MODEL is not set");
  }
  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiKey,
    model,
  };
}

interface RawChatCompletion {
  model?: string;
  choices?: Array<{
    finish_reason?: string;
    message?: { content?: string | null };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/** Send a chat completion. Returns content with reasoning stripped. */
export async function chat(
  config: VllmConfig,
  opts: ChatOpts
): Promise<ChatResult> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const url = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;

  let signal = opts.signal;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  if (!signal && config.defaultTimeoutMs) {
    const ctl = new AbortController();
    timeoutHandle = setTimeout(() => ctl.abort(), config.defaultTimeoutMs);
    signal = ctl.signal;
  }

  const body = JSON.stringify({
    model: opts.model ?? config.model,
    messages: opts.messages,
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.2,
    top_p: opts.topP,
    stop: opts.stop,
  });

  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body,
      signal,
    });
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new VllmClientError(
      `vLLM chat completion failed: HTTP ${res.status}`,
      res.status,
      text
    );
  }

  const data = (await res.json()) as RawChatCompletion;
  const choice = data.choices?.[0];
  const raw = choice?.message?.content ?? "";
  const { reasoning, content } = splitReasoning(raw);
  return {
    raw,
    reasoning,
    content,
    model: data.model ?? config.model,
    finishReason: choice?.finish_reason ?? "unknown",
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
    totalTokens: data.usage?.total_tokens ?? 0,
    latencyMs: Date.now() - t0,
  };
}
