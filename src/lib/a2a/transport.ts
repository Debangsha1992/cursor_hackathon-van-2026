import { createHmac } from "node:crypto";
import type { JsonRpcIdValue, StreamEventValue } from "./envelope";

// ---------------------------------------------------------------------------
// SSE writer
// ---------------------------------------------------------------------------

export interface SseEventEnvelope {
  jsonrpc: "2.0";
  id: JsonRpcIdValue;
  result: StreamEventValue;
}

function formatSseEvent(envelope: SseEventEnvelope): string {
  return `data: ${JSON.stringify(envelope)}\n\n`;
}

// Pump a stream of A2A events into a ReadableStream suitable for returning from
// a Next.js Route Handler with Content-Type: text/event-stream.
export interface SseStreamHandle {
  push(event: StreamEventValue): void;
  end(): void;
  readonly readable: ReadableStream<Uint8Array>;
}

export function createSseStream(rpcId: JsonRpcIdValue): SseStreamHandle {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let closed = false;

  const readable = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      closed = true;
      controller = null;
    },
  });

  return {
    push(event: StreamEventValue) {
      if (closed || !controller) return;
      const envelope: SseEventEnvelope = {
        jsonrpc: "2.0",
        id: rpcId,
        result: event,
      };
      controller.enqueue(encoder.encode(formatSseEvent(envelope)));
    },
    end() {
      if (closed || !controller) return;
      closed = true;
      controller.close();
      controller = null;
    },
    get readable() {
      return readable;
    },
  };
}

// ---------------------------------------------------------------------------
// Push-notification (signed outbound webhook) dispatcher
// ---------------------------------------------------------------------------

export interface PushNotificationTarget {
  url: string;
  token?: string;
  // HMAC-SHA256 secret to sign the body with. Optional — when absent we send
  // the bearer token only; that is sufficient for low-trust shared-secret
  // targets.
  signingSecret?: string;
}

export interface PushNotificationAttempt {
  ok: boolean;
  status?: number;
  attempts: number;
  error?: string;
}

export interface PushDispatchOpts {
  target: PushNotificationTarget;
  event: StreamEventValue;
  rpcId?: JsonRpcIdValue;
  now?: () => number;
  fetchImpl?: typeof fetch;
  maxAttempts?: number;
  backoffMs?: (attempt: number) => number;
}

const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_BACKOFF = (attempt: number) =>
  Math.min(8_000, 250 * 2 ** (attempt - 1));

export async function dispatchPushNotification(
  opts: PushDispatchOpts
): Promise<PushNotificationAttempt> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const max = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const backoff = opts.backoffMs ?? DEFAULT_BACKOFF;

  const envelope: SseEventEnvelope = {
    jsonrpc: "2.0",
    id: opts.rpcId ?? null,
    result: opts.event,
  };
  const body = JSON.stringify(envelope);
  const timestamp = Math.floor(now() / 1000);

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-paperpilot-event": opts.event.kind,
    "x-paperpilot-timestamp": String(timestamp),
  };
  if (opts.target.token) {
    headers["authorization"] = `Bearer ${opts.target.token}`;
  }
  if (opts.target.signingSecret) {
    const signature = createHmac("sha256", opts.target.signingSecret)
      .update(`${timestamp}.${body}`)
      .digest("hex");
    headers["x-paperpilot-signature"] = signature;
  }

  let lastErr: string | undefined;
  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      const resp = await fetchImpl(opts.target.url, {
        method: "POST",
        headers,
        body,
      });
      if (resp.ok) {
        return { ok: true, status: resp.status, attempts: attempt };
      }
      // 4xx (not 429) is a permanent failure - stop early.
      if (resp.status >= 400 && resp.status < 500 && resp.status !== 429) {
        return {
          ok: false,
          status: resp.status,
          attempts: attempt,
          error: `http_${resp.status}`,
        };
      }
      lastErr = `http_${resp.status}`;
    } catch (err) {
      lastErr =
        err instanceof Error ? err.message : "unknown_dispatch_error";
    }
    if (attempt < max) {
      await sleep(backoff(attempt));
    }
  }

  return { ok: false, attempts: max, error: lastErr ?? "exhausted" };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
