import { describe, it, expect } from "vitest";
import {
  discoverAgentCard,
  sendMessage,
  rpcCall,
  bearerAuth,
  A2AClientError,
} from "./a2aClient";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const sampleAgentCard = {
  protocolVersion: "1.0.0",
  name: "Counterparty Bot",
  description: "A trend-following bot.",
  version: "0.1.0",
  url: "https://peer.example.com/api/a2a",
  defaultInputModes: ["application/json"],
  defaultOutputModes: ["application/json"],
  capabilities: {
    streaming: false,
    pushNotifications: false,
    extendedAgentCard: false,
  },
  skills: [
    {
      id: "describe_strategy",
      name: "Describe strategy",
      description: "Answer questions about my strategy.",
      inputModes: ["application/json"],
      outputModes: ["application/json"],
      tags: ["paper-trading"],
    },
  ],
  securitySchemes: {},
  preferredTransport: "JSONRPC",
};

describe("discoverAgentCard", () => {
  it("fetches /.well-known/agent-card.json from the base URL", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      return jsonResponse(sampleAgentCard);
    }) as unknown as typeof fetch;

    const card = await discoverAgentCard("https://peer.example.com", {
      fetchImpl,
    });

    expect(calls).toEqual([
      "https://peer.example.com/.well-known/agent-card.json",
    ]);
    expect(card.name).toBe("Counterparty Bot");
    expect(card.skills[0].id).toBe("describe_strategy");
  });

  it("trims trailing slash on base URL", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      return jsonResponse(sampleAgentCard);
    }) as unknown as typeof fetch;

    await discoverAgentCard("https://peer.example.com/", { fetchImpl });
    expect(calls[0]).toBe(
      "https://peer.example.com/.well-known/agent-card.json"
    );
  });

  it("throws A2AClientError on a non-2xx response", async () => {
    const fetchImpl = (async () =>
      new Response("nope", { status: 404 })) as unknown as typeof fetch;
    await expect(
      discoverAgentCard("https://peer.example.com", { fetchImpl })
    ).rejects.toMatchObject({ name: "A2AClientError", status: 404 });
  });

  it("rejects malformed agent cards (missing url or skills)", async () => {
    const fetchImpl = (async () =>
      jsonResponse({ name: "broken" })) as unknown as typeof fetch;
    await expect(
      discoverAgentCard("https://peer.example.com", { fetchImpl })
    ).rejects.toBeInstanceOf(A2AClientError);
  });
});

describe("rpcCall", () => {
  it("posts a JSON-RPC 2.0 request and unwraps result on success", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const sent = JSON.parse(init.body as string);
      return jsonResponse({
        jsonrpc: "2.0",
        id: sent.id,
        result: { ok: true, echoed: sent.params },
      });
    }) as unknown as typeof fetch;

    const result = await rpcCall<{ ok: boolean; echoed: unknown }>(
      "https://peer.example.com/api/a2a",
      "ping",
      { foo: "bar" },
      { fetchImpl }
    );

    expect(result.ok).toBe(true);
    expect(result.echoed).toEqual({ foo: "bar" });

    const sentBody = JSON.parse(calls[0].init.body as string);
    expect(sentBody.jsonrpc).toBe("2.0");
    expect(sentBody.method).toBe("ping");
    expect(typeof sentBody.id).toBe("string");
  });

  it("attaches auth headers from the AuthHeaderProvider", async () => {
    const calls: { headers: Record<string, string> }[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      calls.push({ headers: init.headers as Record<string, string> });
      const sent = JSON.parse(init.body as string);
      return jsonResponse({ jsonrpc: "2.0", id: sent.id, result: {} });
    }) as unknown as typeof fetch;

    await rpcCall(
      "https://peer.example.com/api/a2a",
      "ping",
      {},
      { fetchImpl, auth: bearerAuth("peer-token") }
    );

    expect(calls[0].headers["Authorization"]).toBe("Bearer peer-token");
  });

  it("throws A2AClientError when the peer returns a JSON-RPC error", async () => {
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const sent = JSON.parse(init.body as string);
      return jsonResponse({
        jsonrpc: "2.0",
        id: sent.id,
        error: { code: -32601, message: "method not found" },
      });
    }) as unknown as typeof fetch;

    await expect(
      rpcCall("https://peer.example.com/api/a2a", "noop", {}, { fetchImpl })
    ).rejects.toMatchObject({
      name: "A2AClientError",
      rpcCode: -32601,
    });
  });
});

describe("sendMessage", () => {
  it("calls message/send and returns a parsed Task", async () => {
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const sent = JSON.parse(init.body as string);
      expect(sent.method).toBe("message/send");
      expect(sent.params.message.parts[0].text).toBe(
        "Describe your edge in one sentence."
      );
      return jsonResponse({
        jsonrpc: "2.0",
        id: sent.id,
        result: {
          id: "task-1",
          contextId: "ctx-1",
          status: { state: "TASK_STATE_COMPLETED" },
          artifacts: [],
          history: [],
        },
      });
    }) as unknown as typeof fetch;

    const task = await sendMessage(
      "https://peer.example.com/api/a2a",
      {
        messageId: "m1",
        role: "ROLE_USER",
        parts: [
          { kind: "text", text: "Describe your edge in one sentence." },
        ],
      },
      { fetchImpl }
    );

    expect(task.id).toBe("task-1");
    expect(task.status.state).toBe("TASK_STATE_COMPLETED");
  });
});
