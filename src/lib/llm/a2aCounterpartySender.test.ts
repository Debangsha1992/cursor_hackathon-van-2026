import { describe, it, expect } from "vitest";
import {
  createA2ACounterpartySender,
  extractAnswerText,
} from "./a2aCounterpartySender";
import type { AgentCard } from "../a2a/agentCard";
import type { TaskValue } from "../a2a/envelope";

const sampleCard: AgentCard = {
  protocolVersion: "1.0.0",
  name: "Counterparty Bot",
  description: "test bot",
  version: "0.0.1",
  url: "https://peer.example.com/api/a2a",
  defaultInputModes: ["application/json"],
  defaultOutputModes: ["application/json"],
  capabilities: {
    streaming: false,
    pushNotifications: false,
    extendedAgentCard: false,
  },
  skills: [],
  securitySchemes: {},
  preferredTransport: "JSONRPC",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function rpcResultResponse(taskBody: Partial<TaskValue> & {
  id: string;
  contextId: string;
}, requestId: string | number | null) {
  return jsonResponse({
    jsonrpc: "2.0",
    id: requestId,
    result: {
      id: taskBody.id,
      contextId: taskBody.contextId,
      status: taskBody.status ?? { state: "TASK_STATE_COMPLETED" },
      artifacts: taskBody.artifacts ?? [],
      history: taskBody.history ?? [],
    },
  });
}

describe("extractAnswerText", () => {
  it("returns concatenated text from artifacts when present", () => {
    const t: TaskValue = {
      id: "t",
      contextId: "c",
      status: { state: "TASK_STATE_COMPLETED" },
      artifacts: [
        {
          artifactId: "a1",
          parts: [
            { kind: "text", text: "I trade momentum." },
            { kind: "text", text: "Sized at 1% risk." },
          ],
        },
      ],
      history: [],
    };
    expect(extractAnswerText(t)).toBe("I trade momentum.\nSized at 1% risk.");
  });

  it("falls back to the latest ROLE_AGENT history message when there are no artifacts", () => {
    const t: TaskValue = {
      id: "t",
      contextId: "c",
      status: { state: "TASK_STATE_COMPLETED" },
      artifacts: [],
      history: [
        {
          messageId: "m1",
          role: "ROLE_USER",
          parts: [{ kind: "text", text: "Q?" }],
        },
        {
          messageId: "m2",
          role: "ROLE_AGENT",
          parts: [{ kind: "text", text: "My edge is X." }],
        },
      ],
    };
    expect(extractAnswerText(t)).toBe("My edge is X.");
  });

  it("falls back to the status message when nothing else is available", () => {
    const t: TaskValue = {
      id: "t",
      contextId: "c",
      status: {
        state: "TASK_STATE_INPUT_REQUIRED",
        message: {
          messageId: "m",
          role: "ROLE_AGENT",
          parts: [{ kind: "text", text: "Need clarification on stop-loss." }],
        },
      },
      artifacts: [],
      history: [],
    };
    expect(extractAnswerText(t)).toContain("clarification");
  });

  it("returns a placeholder when no text parts exist anywhere", () => {
    const t: TaskValue = {
      id: "t",
      contextId: "c",
      status: { state: "TASK_STATE_FAILED" },
      artifacts: [],
      history: [],
    };
    expect(extractAnswerText(t)).toContain("TASK_STATE_FAILED");
  });
});

describe("createA2ACounterpartySender", () => {
  it("uses a pre-fetched agent card and posts message/send to its url", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const sent = JSON.parse(init.body as string);
      return rpcResultResponse(
        {
          id: "task-1",
          contextId: "ctx-1",
          artifacts: [
            {
              artifactId: "a",
              parts: [{ kind: "text", text: "I run trend-following on 1h." }],
            },
          ],
        },
        sent.id
      );
    }) as unknown as typeof fetch;

    const sender = createA2ACounterpartySender({
      agentCard: sampleCard,
      fetchImpl,
    });
    const answer = await sender.ask("What is your edge?");

    expect(answer).toBe("I run trend-following on 1h.");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(sampleCard.url);
    const sentBody = JSON.parse(calls[0].init.body as string);
    expect(sentBody.method).toBe("message/send");
    expect(sentBody.params.message.parts[0]).toEqual({
      kind: "text",
      text: "What is your edge?",
    });
    expect(sentBody.params.message.role).toBe("ROLE_USER");
    expect(sentBody.params.message.contextId).toBeTruthy();
  });

  it("discovers the agent card from agentBaseUrl on first use, then reuses it", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push(url);
      if (url.endsWith("/.well-known/agent-card.json")) {
        return jsonResponse(sampleCard);
      }
      const sent = JSON.parse((init?.body as string) ?? "{}");
      return rpcResultResponse(
        {
          id: "t",
          contextId: "c",
          artifacts: [
            {
              artifactId: "a",
              parts: [{ kind: "text", text: "answer" }],
            },
          ],
        },
        sent.id
      );
    }) as unknown as typeof fetch;

    const sender = createA2ACounterpartySender({
      agentBaseUrl: "https://peer.example.com",
      fetchImpl,
    });
    await sender.ask("Q1?");
    await sender.ask("Q2?");

    const discoveryHits = calls.filter((u) =>
      u.endsWith("/.well-known/agent-card.json")
    );
    expect(discoveryHits).toHaveLength(1);
    expect(calls.filter((u) => u.endsWith("/api/a2a"))).toHaveLength(2);
  });

  it("reuses the same contextId across asks so the peer can stitch the conversation", async () => {
    const sentContextIds: string[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const sent = JSON.parse(init.body as string);
      sentContextIds.push(sent.params.message.contextId);
      return rpcResultResponse(
        {
          id: "t",
          contextId: sent.params.message.contextId,
          artifacts: [
            {
              artifactId: "a",
              parts: [{ kind: "text", text: "ok" }],
            },
          ],
        },
        sent.id
      );
    }) as unknown as typeof fetch;

    const sender = createA2ACounterpartySender({
      agentCard: sampleCard,
      fetchImpl,
    });
    await sender.ask("Q1?");
    await sender.ask("Q2?");
    expect(sentContextIds[0]).toBeTruthy();
    expect(sentContextIds[0]).toBe(sentContextIds[1]);
  });

  it("throws when neither agentCard nor agentBaseUrl is provided", () => {
    expect(() =>
      createA2ACounterpartySender({} as never)
    ).toThrow(/agentCard or agentBaseUrl/);
  });
});
