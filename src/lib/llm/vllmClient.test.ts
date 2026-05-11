import { describe, it, expect } from "vitest";
import {
  splitReasoning,
  loadVllmConfigFromEnv,
  chat,
  VllmClientError,
  type VllmConfig,
} from "./vllmClient";

describe("splitReasoning", () => {
  it("returns content as-is when there is no <think> block", () => {
    const out = splitReasoning("The answer is 42.");
    expect(out.reasoning).toBe("");
    expect(out.content).toBe("The answer is 42.");
  });

  it("extracts reasoning and post-think content from a closed block", () => {
    const raw = "<think>\nLet me consider...\n</think>\n\nFinal: buy AAPL.";
    const out = splitReasoning(raw);
    expect(out.reasoning).toBe("Let me consider...");
    expect(out.content).toBe("Final: buy AAPL.");
  });

  it("treats an unclosed think block (e.g. cut off by max_tokens) as reasoning-only", () => {
    const raw = "<think>\nOkay, the user wants me to reply with just";
    const out = splitReasoning(raw);
    expect(out.reasoning).toContain("Okay, the user wants");
    expect(out.content).toBe("");
  });

  it("handles empty input", () => {
    const out = splitReasoning("");
    expect(out).toEqual({ reasoning: "", content: "" });
  });

  it("preserves prose that appears before <think> if any", () => {
    const raw = "Preamble. <think>internal</think> Final answer.";
    const out = splitReasoning(raw);
    expect(out.reasoning).toBe("internal");
    expect(out.content).toBe("Preamble.  Final answer.".trim());
  });
});

function env(o: Record<string, string>): NodeJS.ProcessEnv {
  return o as unknown as NodeJS.ProcessEnv;
}

describe("loadVllmConfigFromEnv", () => {
  it("loads config from env and trims trailing slash on base URL", () => {
    const config = loadVllmConfigFromEnv(
      env({
        OPENAI_API_BASE: "https://example.com/v1/",
        OPENAI_API_KEY: "token-abc123",
        OPENAI_MODEL: "DragonLLM/Qwen-Open-Finance-R-8B",
      })
    );
    expect(config.baseUrl).toBe("https://example.com/v1");
    expect(config.apiKey).toBe("token-abc123");
    expect(config.model).toBe("DragonLLM/Qwen-Open-Finance-R-8B");
  });

  it("throws a VllmClientError when any required var is missing", () => {
    expect(() =>
      loadVllmConfigFromEnv(env({ OPENAI_API_KEY: "x", OPENAI_MODEL: "y" }))
    ).toThrow(VllmClientError);
    expect(() =>
      loadVllmConfigFromEnv(env({ OPENAI_API_BASE: "x", OPENAI_MODEL: "y" }))
    ).toThrow(VllmClientError);
    expect(() =>
      loadVllmConfigFromEnv(env({ OPENAI_API_BASE: "x", OPENAI_API_KEY: "y" }))
    ).toThrow(VllmClientError);
  });
});

function buildResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("chat", () => {
  it("posts to <baseUrl>/chat/completions with bearer auth and the configured model", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return buildResponse({
        model: "DragonLLM/Qwen-Open-Finance-R-8B",
        choices: [
          {
            finish_reason: "stop",
            message: { content: "<think>think</think>Hi." },
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 4, total_tokens: 9 },
      });
    }) as unknown as typeof fetch;

    const config: VllmConfig = {
      baseUrl: "https://api.example.com/v1",
      apiKey: "token-abc123",
      model: "DragonLLM/Qwen-Open-Finance-R-8B",
      fetchImpl,
    };
    const result = await chat(config, {
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 32,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.example.com/v1/chat/completions");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer token-abc123");
    expect(headers["Content-Type"]).toBe("application/json");
    const sent = JSON.parse(calls[0].init.body as string);
    expect(sent.model).toBe("DragonLLM/Qwen-Open-Finance-R-8B");
    expect(sent.max_tokens).toBe(32);
    expect(sent.messages).toEqual([{ role: "user", content: "hi" }]);

    expect(result.content).toBe("Hi.");
    expect(result.reasoning).toBe("think");
    expect(result.finishReason).toBe("stop");
    expect(result.totalTokens).toBe(9);
  });

  it("throws VllmClientError with status on non-2xx responses", async () => {
    const fetchImpl = (async () =>
      new Response("upstream broken", { status: 503 })) as unknown as typeof fetch;

    const config: VllmConfig = {
      baseUrl: "https://api.example.com/v1",
      apiKey: "k",
      model: "m",
      fetchImpl,
    };

    await expect(
      chat(config, { messages: [{ role: "user", content: "hi" }] })
    ).rejects.toMatchObject({
      name: "VllmClientError",
      status: 503,
    });
  });
});
