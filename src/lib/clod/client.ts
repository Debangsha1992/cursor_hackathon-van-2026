/**
 * Server-only client for the Clōd OpenAI-compatible chat completions gateway.
 *
 * The caller is responsible for piping the response body — this module owns
 * just the request shape and env-var validation.
 */

import "server-only";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatCompletionTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface ChatStreamRequest {
  messages: ChatMessage[];
  tools?: ChatCompletionTool[];
  signal?: AbortSignal;
}

export async function chatStreamRequest({
  messages,
  tools,
  signal,
}: ChatStreamRequest): Promise<Response> {
  const base = process.env.CLOD_API_BASE;
  const key = process.env.CLOD_API_KEY;
  const model = process.env.CLOD_MODEL;
  if (!base || !key || !model) {
    throw new Error(
      "Clōd is not configured. Set CLOD_API_BASE, CLOD_API_KEY, and CLOD_MODEL.",
    );
  }

  const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages,
      tools,
      stream: true,
    }),
    signal,
  });

  if (!res.ok) {
    const detail = await safeText(res);
    throw new Error(
      `Clōd request failed: ${res.status} ${res.statusText}${
        detail ? ` — ${detail.slice(0, 400)}` : ""
      }`,
    );
  }
  if (!res.body) {
    throw new Error("Clōd response had no body");
  }
  return res;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
