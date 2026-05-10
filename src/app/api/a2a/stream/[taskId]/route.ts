import { buildA2AHandlers } from "@/lib/a2a/handlers";
import { getOrCreateA2ARuntime, createInMemoryRepo } from "@/lib/a2a/runtime";
import { createSseStream } from "@/lib/a2a/transport";
import {
  extractEmbeddedBotId,
  verifyA2AEnvelope,
} from "@/lib/security/hmacVerifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/a2a/stream/:taskId — opens a Server-Sent Events stream that
// replays the persisted task state and any pending stream events. Equivalent
// to A2A's `SubscribeToTask` JSON-RPC method, with the taskId in the path
// for clients that don't speak JSON-RPC.
export async function GET(
  request: Request,
  context: { params: Promise<{ taskId: string }> }
): Promise<Response> {
  const { taskId } = await context.params;

  // We still require HMAC even on GETs - the path itself is sensitive.
  // For GETs there is no body, so we sign the path instead.
  const rawBody = `GET:${new URL(request.url).pathname}`;
  const headers = Object.fromEntries(request.headers.entries()) as Record<
    string,
    string
  >;
  const verify = await verifyA2AEnvelope({
    headers,
    rawBody,
    embeddedBotId: extractEmbeddedBotId(null),
    getSecretByBotId: getBotSecret,
    now: () => Date.now(),
  });
  if (!verify.ok) {
    return new Response(verify.error, { status: 401 });
  }

  const runtimeInstance = getOrCreateA2ARuntime({
    niaClient: { async search() { return []; } },
    coach: {
      async narrate() {
        return {
          prose: "",
          excerpts: [],
          llmFallbackUsed: true,
          llmLatencyMs: 0,
        };
      },
    },
    repo: createInMemoryRepo(),
  });

  const handlers = buildA2AHandlers({
    graph: runtimeInstance.graph,
    orchestratorDeps: runtimeInstance.orchestratorDeps,
    eventBus: runtimeInstance.eventBus,
    repo: runtimeInstance.repo,
    authenticatedBotId: verify.botId,
    nextId: runtimeInstance.nextId,
    now: runtimeInstance.now,
  });

  const stream = createSseStream(null);
  (async () => {
    try {
      for await (const event of handlers.subscribeToTask({ taskId })) {
        stream.push(event);
        if ("final" in event && event.final) break;
      }
    } catch (err) {
      stream.push({
        kind: "status-update",
        taskId,
        contextId: taskId,
        status: {
          state: "TASK_STATE_FAILED",
          message: {
            messageId: `${taskId}:error`,
            role: "ROLE_AGENT",
            parts: [
              {
                kind: "data",
                data: {
                  reason: err instanceof Error ? err.message : "unknown",
                },
              },
            ],
          },
        },
        final: true,
      });
    } finally {
      stream.end();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}

async function getBotSecret(botId: string): Promise<string | null> {
  return process.env[`PAPERPILOT_DEMO_SECRET_${botId.toUpperCase()}`] ?? null;
}
