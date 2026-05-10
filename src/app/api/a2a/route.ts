import { NextResponse } from "next/server";
import {
  extractEmbeddedBotId,
  verifyA2AEnvelope,
} from "@/lib/security/hmacVerifier";
import { dispatchJsonRpc } from "@/lib/a2a/server";
import { buildA2AHandlers } from "@/lib/a2a/handlers";
import { getOrCreateA2ARuntime, createInMemoryRepo } from "@/lib/a2a/runtime";
import { createSseStream } from "@/lib/a2a/transport";
import { JsonRpcErrorCode } from "@/lib/a2a/envelope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: JsonRpcErrorCode.PARSE_ERROR,
          message: "Body is not valid JSON",
        },
      },
      { status: 400 }
    );
  }

  // HMAC + replay protection on the raw body.
  const headers = Object.fromEntries(request.headers.entries()) as Record<
    string,
    string
  >;
  const verify = await verifyA2AEnvelope({
    headers,
    rawBody,
    embeddedBotId: extractEmbeddedBotId(parsedBody),
    getSecretByBotId: getBotSecret,
    now: () => Date.now(),
  });
  if (!verify.ok) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: (parsedBody as { id?: unknown })?.id ?? null,
        error: {
          code: JsonRpcErrorCode.AUTHENTICATION_REQUIRED,
          message: verify.error,
        },
      },
      { status: 401 }
    );
  }

  const runtimeInstance = getOrCreateA2ARuntime({
    niaClient: stubNiaClient,
    coach: stubCoach,
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

  const dispatch = await dispatchJsonRpc({
    parsedBody,
    handlers,
  });

  if (dispatch.kind === "unary") {
    const status = "error" in dispatch.response ? 400 : 200;
    return NextResponse.json(dispatch.response, { status });
  }

  // Streaming response — pump A2A events into SSE frames.
  const sse = createSseStream(dispatch.rpcId);
  (async () => {
    try {
      for await (const event of dispatch.events) {
        sse.push(event);
        if ("final" in event && event.final) break;
      }
    } catch {
      // Best-effort; close the stream cleanly even on iterator failure.
    } finally {
      sse.end();
    }
  })();

  return new Response(sse.readable, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}

// ---------------------------------------------------------------------------
// Placeholders. Production wires these via env-driven Supabase + HF/Nia clients.
// ---------------------------------------------------------------------------

async function getBotSecret(botId: string): Promise<string | null> {
  // The real impl looks up `bots.secret_hash` in Supabase and reconstructs
  // the secret from a per-request hash; for the MVP we accept env-injected
  // demo secrets.
  const demo = process.env[`PAPERPILOT_DEMO_SECRET_${botId.toUpperCase()}`];
  return demo ?? null;
}

const stubNiaClient = {
  async search() {
    return [];
  },
};

const stubCoach = {
  async narrate(input: {
    violations: { code: string; severity: string; message: string }[];
    score: number;
    band: string;
    recurringCodes: string[];
  }) {
    const codes = input.violations.map((v) => v.code).join(", ") || "none";
    return {
      prose:
        `Compliance score: ${input.score} (${input.band}). ` +
        `Violations detected: ${codes}. ` +
        (input.recurringCodes.length > 0
          ? `Recurring patterns: ${input.recurringCodes.join(", ")}. `
          : "") +
        `Continue paper testing; this report does not authorize live deployment.`,
      excerpts: [],
      llmFallbackUsed: true,
      llmLatencyMs: 0,
    };
  },
};
