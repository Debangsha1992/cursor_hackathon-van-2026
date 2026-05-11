import { describe, it, expect } from "vitest";
import {
  clodChat,
  loadClodConfigFromEnv,
  ClodClientError,
  type ClodConfig,
} from "./clodClient";

function buildResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function env(o: Record<string, string>): NodeJS.ProcessEnv {
  return o as unknown as NodeJS.ProcessEnv;
}

describe("loadClodConfigFromEnv", () => {
  it("loads config from env and trims trailing slash", () => {
    const config = loadClodConfigFromEnv(
      env({
        CLOD_API_BASE: "https://api.clod.io/v1/",
        CLOD_API_KEY: "ek-test",
        CLOD_MODEL: "GPT 4o",
      })
    );
    expect(config.baseUrl).toBe("https://api.clod.io/v1");
    expect(config.apiKey).toBe("ek-test");
    expect(config.model).toBe("GPT 4o");
  });

  it("throws when a required var is missing", () => {
    expect(() =>
      loadClodConfigFromEnv(env({ CLOD_API_KEY: "x", CLOD_MODEL: "y" }))
    ).toThrow(ClodClientError);
    expect(() =>
      loadClodConfigFromEnv(env({ CLOD_API_BASE: "x", CLOD_MODEL: "y" }))
    ).toThrow(ClodClientError);
  });

  it("rejects the placeholder key value", () => {
    expect(() =>
      loadClodConfigFromEnv(
        env({
          CLOD_API_BASE: "https://api.clod.io/v1",
          CLOD_API_KEY: "replace-with-clod-key",
          CLOD_MODEL: "GPT 4o",
        })
      )
    ).toThrow(ClodClientError);
  });
});

describe("clodChat — plain text", () => {
  it("posts to <baseUrl>/chat/completions with bearer auth and the configured model", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return buildResponse({
        model: "GPT 4o",
        choices: [
          {
            finish_reason: "stop",
            message: { role: "assistant", content: "Hi." },
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
      });
    }) as unknown as typeof fetch;

    const config: ClodConfig = {
      baseUrl: "https://api.clod.io/v1",
      apiKey: "ek-test",
      model: "GPT 4o",
      fetchImpl,
    };
    const r = await clodChat(config, {
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 32,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.clod.io/v1/chat/completions");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer ek-test");
    expect(headers["Content-Type"]).toBe("application/json");

    const sent = JSON.parse(calls[0].init.body as string);
    expect(sent.model).toBe("GPT 4o");
    expect(sent.max_completion_tokens).toBe(32);
    expect(sent.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(sent.tools).toBeUndefined();
    expect(sent.tool_choice).toBeUndefined();

    expect(r.message.content).toBe("Hi.");
    expect(r.message.toolCalls).toEqual([]);
    expect(r.totalTokens).toBe(6);
    expect(r.finishReason).toBe("stop");
  });

  it("includes tools and tool_choice when tools are provided", async () => {
    const calls: { init: RequestInit }[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      calls.push({ init });
      return buildResponse({
        model: "GPT 4o",
        choices: [
          {
            finish_reason: "stop",
            message: { role: "assistant", content: "ok" },
          },
        ],
      });
    }) as unknown as typeof fetch;

    const config: ClodConfig = {
      baseUrl: "https://api.clod.io/v1",
      apiKey: "k",
      model: "GPT 4o",
      fetchImpl,
    };
    await clodChat(config, {
      messages: [{ role: "user", content: "hi" }],
      tools: [
        {
          name: "consult_finance_expert",
          description: "Specialist consult",
          parameters: { type: "object", properties: {} },
        },
      ],
    });
    const sent = JSON.parse(calls[0].init.body as string);
    expect(sent.tools).toHaveLength(1);
    expect(sent.tools[0]).toEqual({
      type: "function",
      function: {
        name: "consult_finance_expert",
        description: "Specialist consult",
        parameters: { type: "object", properties: {} },
      },
    });
    expect(sent.tool_choice).toBe("auto");
  });

  it("parses tool_calls into structured ToolCall entries", async () => {
    const fetchImpl = (async () =>
      buildResponse({
        model: "GPT 4o",
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_abc",
                  type: "function",
                  function: {
                    name: "consult_finance_expert",
                    arguments: '{"mode":"question","question":"what is alpha?"}',
                  },
                },
              ],
            },
          },
        ],
      })) as unknown as typeof fetch;

    const config: ClodConfig = {
      baseUrl: "https://api.clod.io/v1",
      apiKey: "k",
      model: "GPT 4o",
      fetchImpl,
    };
    const r = await clodChat(config, {
      messages: [{ role: "user", content: "explain alpha" }],
      tools: [
        {
          name: "consult_finance_expert",
          description: "x",
          parameters: { type: "object" },
        },
      ],
    });
    expect(r.message.content).toBe("");
    expect(r.message.toolCalls).toHaveLength(1);
    expect(r.message.toolCalls[0].id).toBe("call_abc");
    expect(r.message.toolCalls[0].name).toBe("consult_finance_expert");
    expect(r.message.toolCalls[0].arguments).toEqual({
      mode: "question",
      question: "what is alpha?",
    });
    expect(r.finishReason).toBe("tool_calls");
  });

  it("survives a tool_calls entry whose arguments string is not valid JSON", async () => {
    const fetchImpl = (async () =>
      buildResponse({
        model: "GPT 4o",
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_x",
                  type: "function",
                  function: {
                    name: "consult_finance_expert",
                    arguments: "{not json",
                  },
                },
              ],
            },
          },
        ],
      })) as unknown as typeof fetch;

    const config: ClodConfig = {
      baseUrl: "https://api.clod.io/v1",
      apiKey: "k",
      model: "GPT 4o",
      fetchImpl,
    };
    const r = await clodChat(config, {
      messages: [{ role: "user", content: "x" }],
      tools: [
        {
          name: "consult_finance_expert",
          description: "x",
          parameters: { type: "object" },
        },
      ],
    });
    expect(r.message.toolCalls[0].arguments).toEqual({});
    expect(r.message.toolCalls[0].rawArguments).toBe("{not json");
  });

  it("serialises a prior tool result message correctly", async () => {
    const calls: { init: RequestInit }[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      calls.push({ init });
      return buildResponse({
        model: "GPT 4o",
        choices: [
          { message: { role: "assistant", content: "final" } },
        ],
      });
    }) as unknown as typeof fetch;

    const config: ClodConfig = {
      baseUrl: "https://api.clod.io/v1",
      apiKey: "k",
      model: "GPT 4o",
      fetchImpl,
    };
    await clodChat(config, {
      messages: [
        { role: "user", content: "x" },
        {
          role: "assistant",
          content: "",
          toolCalls: [
            {
              id: "call_1",
              name: "consult_finance_expert",
              arguments: { mode: "question", question: "?" },
              rawArguments: '{"mode":"question","question":"?"}',
            },
          ],
        },
        {
          role: "tool",
          toolCallId: "call_1",
          content: '{"ok":true,"analysis":"..."}',
        },
      ],
    });

    const sent = JSON.parse(calls[0].init.body as string);
    expect(sent.messages[1]).toEqual({
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: {
            name: "consult_finance_expert",
            arguments: '{"mode":"question","question":"?"}',
          },
        },
      ],
    });
    expect(sent.messages[2]).toEqual({
      role: "tool",
      tool_call_id: "call_1",
      content: '{"ok":true,"analysis":"..."}',
    });
  });

  it("throws ClodClientError with status on non-2xx responses", async () => {
    const fetchImpl = (async () =>
      new Response("upstream broken", { status: 503 })) as unknown as typeof fetch;
    const config: ClodConfig = {
      baseUrl: "https://api.clod.io/v1",
      apiKey: "k",
      model: "GPT 4o",
      fetchImpl,
    };
    await expect(
      clodChat(config, { messages: [{ role: "user", content: "hi" }] })
    ).rejects.toMatchObject({ name: "ClodClientError", status: 503 });
  });
});
