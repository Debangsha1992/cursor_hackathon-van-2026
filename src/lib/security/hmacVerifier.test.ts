import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyBotRequest } from "./hmacVerifier";

const TEST_SECRET = "secret-key-abc-123";
const TEST_BOT_ID = "bot_abc";

function sign(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
}

const fixedNow = () => 1_715_000_000_000; // 2024-05-06, in ms
const nowSeconds = Math.floor(fixedNow() / 1000);

const goodGetSecret = async (botId: string) =>
  botId === TEST_BOT_ID ? TEST_SECRET : null;

const baseBody = JSON.stringify({ symbol: "BTCUSDT" });

function makeHeaders(opts: {
  botId?: string;
  timestamp?: string;
  signature?: string;
} = {}) {
  const ts = opts.timestamp ?? String(nowSeconds);
  const sig =
    opts.signature ?? sign(TEST_SECRET, Number.parseInt(ts, 10) || nowSeconds, baseBody);
  return {
    "x-paperpilot-bot-id": opts.botId ?? TEST_BOT_ID,
    "x-paperpilot-timestamp": ts,
    "x-paperpilot-signature": sig,
  } as Record<string, string | undefined>;
}

describe("hmacVerifier - tracer", () => {
  it("accepts a valid signature with a fresh timestamp", async () => {
    const result = await verifyBotRequest({
      headers: makeHeaders(),
      rawBody: baseBody,
      getSecretByBotId: goodGetSecret,
      now: fixedNow,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.botId).toBe(TEST_BOT_ID);
  });
});

describe("hmacVerifier - failure modes", () => {
  it("rejects a wrong signature with 'signature_mismatch'", async () => {
    const wrongSig = sign("not-the-real-secret", nowSeconds, baseBody);
    const result = await verifyBotRequest({
      headers: makeHeaders({ signature: wrongSig }),
      rawBody: baseBody,
      getSecretByBotId: goodGetSecret,
      now: fixedNow,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("signature_mismatch");
  });

  it("rejects a timestamp 301 seconds in the past with 'timestamp_skew'", async () => {
    const oldTs = nowSeconds - 301;
    const result = await verifyBotRequest({
      headers: makeHeaders({
        timestamp: String(oldTs),
        signature: sign(TEST_SECRET, oldTs, baseBody),
      }),
      rawBody: baseBody,
      getSecretByBotId: goodGetSecret,
      now: fixedNow,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("timestamp_skew");
  });

  it("rejects a timestamp 301 seconds in the future with 'timestamp_skew'", async () => {
    const futureTs = nowSeconds + 301;
    const result = await verifyBotRequest({
      headers: makeHeaders({
        timestamp: String(futureTs),
        signature: sign(TEST_SECRET, futureTs, baseBody),
      }),
      rawBody: baseBody,
      getSecretByBotId: goodGetSecret,
      now: fixedNow,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("timestamp_skew");
  });

  it("rejects an unknown botId with 'unknown_bot'", async () => {
    const result = await verifyBotRequest({
      headers: makeHeaders({ botId: "bot_unknown" }),
      rawBody: baseBody,
      getSecretByBotId: goodGetSecret,
      now: fixedNow,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("unknown_bot");
  });

  it("rejects a missing signature header with 'missing_signature'", async () => {
    const headers = makeHeaders();
    delete headers["x-paperpilot-signature"];

    const result = await verifyBotRequest({
      headers,
      rawBody: baseBody,
      getSecretByBotId: goodGetSecret,
      now: fixedNow,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("missing_signature");
  });

  it("rejects a missing bot-id header with 'missing_bot_id'", async () => {
    const headers = makeHeaders();
    delete headers["x-paperpilot-bot-id"];

    const result = await verifyBotRequest({
      headers,
      rawBody: baseBody,
      getSecretByBotId: goodGetSecret,
      now: fixedNow,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("missing_bot_id");
  });

  it("rejects a missing timestamp header with 'missing_timestamp'", async () => {
    const headers = makeHeaders();
    delete headers["x-paperpilot-timestamp"];

    const result = await verifyBotRequest({
      headers,
      rawBody: baseBody,
      getSecretByBotId: goodGetSecret,
      now: fixedNow,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("missing_timestamp");
  });

  it("rejects a non-hex signature with 'malformed_signature'", async () => {
    const result = await verifyBotRequest({
      headers: makeHeaders({ signature: "not_hex_zzzz" }),
      rawBody: baseBody,
      getSecretByBotId: goodGetSecret,
      now: fixedNow,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("malformed_signature");
  });
});
