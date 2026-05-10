import { createHmac, timingSafeEqual } from "node:crypto";

export type HmacError =
  | "signature_mismatch"
  | "timestamp_skew"
  | "unknown_bot"
  | "missing_signature"
  | "missing_bot_id"
  | "missing_timestamp"
  | "malformed_signature"
  | "malformed_timestamp"
  | "malformed_envelope"
  | "envelope_bot_id_mismatch";

export interface VerifyInput {
  headers: Record<string, string | undefined>;
  rawBody: string;
  getSecretByBotId: (botId: string) => Promise<string | null>;
  now: () => number;
  skewSeconds?: number;
}

export type VerifyResult =
  | { ok: true; botId: string }
  | { ok: false; error: HmacError };

const DEFAULT_SKEW_SECONDS = 300;
const HEX_PATTERN = /^[a-f0-9]+$/i;

export async function verifyBotRequest(
  input: VerifyInput
): Promise<VerifyResult> {
  const botId = input.headers["x-paperpilot-bot-id"];
  if (!botId) {
    return { ok: false, error: "missing_bot_id" };
  }

  const timestampHeader = input.headers["x-paperpilot-timestamp"];
  if (!timestampHeader) {
    return { ok: false, error: "missing_timestamp" };
  }

  const signature = input.headers["x-paperpilot-signature"];
  if (!signature) {
    return { ok: false, error: "missing_signature" };
  }

  if (!HEX_PATTERN.test(signature)) {
    return { ok: false, error: "malformed_signature" };
  }

  const timestamp = Number.parseInt(timestampHeader, 10);
  if (Number.isNaN(timestamp)) {
    return { ok: false, error: "malformed_timestamp" };
  }

  const skew = input.skewSeconds ?? DEFAULT_SKEW_SECONDS;
  const nowSeconds = Math.floor(input.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > skew) {
    return { ok: false, error: "timestamp_skew" };
  }

  const secret = await input.getSecretByBotId(botId);
  if (!secret) {
    return { ok: false, error: "unknown_bot" };
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${input.rawBody}`)
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const receivedBuf = Buffer.from(signature, "hex");

  if (
    expectedBuf.length !== receivedBuf.length ||
    !timingSafeEqual(expectedBuf, receivedBuf)
  ) {
    return { ok: false, error: "signature_mismatch" };
  }

  return { ok: true, botId };
}

// A2A `message/send` and `message/stream` envelopes carry the trade-intent
// payload inside `params.message.parts[*].data`. We re-use the existing
// `<timestamp>.<raw-body>` signature primitive — the entire raw JSON-RPC body
// is what gets signed and what HMAC validates — but require the embedded
// botId (when present) to match the `X-PaperPilot-Bot-Id` header so a stolen
// header can't be replayed against an envelope that names a different bot.
export interface VerifyEnvelopeInput extends VerifyInput {
  embeddedBotId?: string | null;
}

export async function verifyA2AEnvelope(
  input: VerifyEnvelopeInput
): Promise<VerifyResult> {
  const base = await verifyBotRequest(input);
  if (!base.ok) {
    return base;
  }
  if (
    input.embeddedBotId !== undefined &&
    input.embeddedBotId !== null &&
    input.embeddedBotId !== base.botId
  ) {
    return { ok: false, error: "envelope_bot_id_mismatch" };
  }
  return base;
}

// Pull the embedded botId, if any, out of an A2A request. The convention is
// that the agent stamps its own bot id into `params.message.parts[0].data.botId`
// (or as a top-level field on a data part). Absence is fine; mismatch is not.
export function extractEmbeddedBotId(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") return null;
  const params = (parsed as { params?: unknown }).params;
  if (!params || typeof params !== "object") return null;
  const message = (params as { message?: unknown }).message;
  if (!message || typeof message !== "object") return null;
  const parts = (message as { parts?: unknown }).parts;
  if (!Array.isArray(parts)) return null;
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    if ((part as { kind?: unknown }).kind !== "data") continue;
    const data = (part as { data?: unknown }).data;
    if (!data || typeof data !== "object") continue;
    const botId = (data as { botId?: unknown }).botId;
    if (typeof botId === "string" && botId.length > 0) return botId;
  }
  return null;
}
