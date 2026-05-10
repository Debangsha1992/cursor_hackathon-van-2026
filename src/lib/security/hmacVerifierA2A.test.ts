import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  extractEmbeddedBotId,
  verifyA2AEnvelope,
} from "./hmacVerifier";

const TEST_SECRET = "secret-key-abc-123";
const TEST_BOT_ID = "bot_abc";

function sign(secret: string, timestamp: number, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

const fixedNow = () => 1_715_000_000_000;
const nowSeconds = Math.floor(fixedNow() / 1000);

const goodGetSecret = async (botId: string) =>
  botId === TEST_BOT_ID ? TEST_SECRET : null;

function makeRequest(opts: {
  embeddedBotId?: string;
} = {}) {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    method: "message/send",
    id: 1,
    params: {
      message: {
        messageId: "m1",
        role: "ROLE_USER",
        parts: [
          {
            kind: "data",
            data: {
              kind: "submit_trade_intent",
              botId: opts.embeddedBotId,
              intent: {},
            },
          },
        ],
      },
    },
  });
  const ts = nowSeconds;
  const signature = sign(TEST_SECRET, ts, body);
  const headers = {
    "x-paperpilot-bot-id": TEST_BOT_ID,
    "x-paperpilot-timestamp": String(ts),
    "x-paperpilot-signature": signature,
  };
  return { body, headers };
}

describe("verifyA2AEnvelope", () => {
  it("accepts a well-signed envelope with a matching embedded botId", async () => {
    const { body, headers } = makeRequest({ embeddedBotId: TEST_BOT_ID });
    const result = await verifyA2AEnvelope({
      headers,
      rawBody: body,
      embeddedBotId: TEST_BOT_ID,
      getSecretByBotId: goodGetSecret,
      now: fixedNow,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects when embeddedBotId disagrees with header botId", async () => {
    const { body, headers } = makeRequest({ embeddedBotId: "bot_other" });
    const result = await verifyA2AEnvelope({
      headers,
      rawBody: body,
      embeddedBotId: "bot_other",
      getSecretByBotId: goodGetSecret,
      now: fixedNow,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("envelope_bot_id_mismatch");
    }
  });

  it("passes through when no embedded botId is present", async () => {
    const { body, headers } = makeRequest();
    const result = await verifyA2AEnvelope({
      headers,
      rawBody: body,
      embeddedBotId: null,
      getSecretByBotId: goodGetSecret,
      now: fixedNow,
    });
    expect(result.ok).toBe(true);
  });
});

describe("extractEmbeddedBotId", () => {
  it("pulls a botId out of a data part", () => {
    const parsed = {
      params: {
        message: {
          parts: [
            { kind: "data", data: { kind: "submit_trade_intent", botId: "bot_x" } },
          ],
        },
      },
    };
    expect(extractEmbeddedBotId(parsed)).toBe("bot_x");
  });

  it("returns null when no data part has a botId", () => {
    const parsed = {
      params: {
        message: {
          parts: [
            { kind: "text", text: "hi" },
            { kind: "data", data: { kind: "submit_trade_intent" } },
          ],
        },
      },
    };
    expect(extractEmbeddedBotId(parsed)).toBeNull();
  });

  it("returns null on malformed input", () => {
    expect(extractEmbeddedBotId(null)).toBeNull();
    expect(extractEmbeddedBotId({ foo: "bar" })).toBeNull();
  });
});
