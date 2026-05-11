/**
 * Helpers for parsing OpenAI-compatible SSE chat-completion streams.
 *
 * The Clōd gateway returns lines of the form:
 *   data: {"id":"...","choices":[{"delta":{...}}]}\n
 *   data: [DONE]\n
 * Frames are separated by blank lines (\n\n).
 */

export interface OpenAiToolCallDelta {
  index: number;
  id?: string;
  type?: "function";
  function?: { name?: string; arguments?: string };
}

export interface OpenAiDelta {
  role?: string;
  content?: string;
  tool_calls?: OpenAiToolCallDelta[];
}

export interface OpenAiStreamChunk {
  choices: { delta: OpenAiDelta; finish_reason?: string | null }[];
}

/**
 * Async generator yielding raw SSE event payloads (everything after `data:`).
 * Skips heartbeats and `[DONE]` is yielded as a special string sentinel.
 */
export async function* iterateSseEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep: number;
      // Frames separated by \n\n. Some servers use \r\n\r\n, handle both.
      while (
        (sep = nextFrameBoundary(buffer)) !== -1
      ) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep).replace(/^(\r?\n){2}/, "");
        const dataLines = frame
          .split(/\r?\n/)
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim());
        if (dataLines.length === 0) continue;
        const payload = dataLines.join("\n");
        if (payload.length === 0) continue;
        yield payload;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function nextFrameBoundary(s: string): number {
  const a = s.indexOf("\n\n");
  const b = s.indexOf("\r\n\r\n");
  if (a === -1) return b;
  if (b === -1) return a;
  return Math.min(a, b);
}

/** Merge a streamed tool-call delta into the accumulated tool calls list. */
export function mergeToolCallDelta(
  acc: { id: string; name: string; arguments: string }[],
  delta: OpenAiToolCallDelta,
): void {
  const idx = delta.index;
  while (acc.length <= idx) {
    acc.push({ id: "", name: "", arguments: "" });
  }
  const slot = acc[idx];
  if (delta.id) slot.id = delta.id;
  if (delta.function?.name) slot.name = delta.function.name;
  if (delta.function?.arguments) slot.arguments += delta.function.arguments;
}
