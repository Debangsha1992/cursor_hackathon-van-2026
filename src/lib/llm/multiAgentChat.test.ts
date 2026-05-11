import { describe, it, expect } from "vitest";
import {
  multiAgentChat,
  __forTesting,
  type ClodChatFn,
  type ChatTurn,
} from "./multiAgentChat";
import type {
  AssistantMessage,
  ClodChatResult,
  ClodMessage,
  ToolCall,
} from "./clodClient";
import type {
  FinanceExpert,
  FinanceExpertConsultation,
} from "./financeExpert";

function makeClodResult(
  message: AssistantMessage,
  partial: Partial<ClodChatResult> = {}
): ClodChatResult {
  return {
    message,
    rawContent: message.content,
    model: "GPT 4o",
    finishReason: message.toolCalls.length > 0 ? "tool_calls" : "stop",
    promptTokens: 10,
    completionTokens: 5,
    totalTokens: 15,
    latencyMs: 4,
    ...partial,
  };
}

function scriptedClod(responses: AssistantMessage[]): {
  clod: ClodChatFn;
  observedTools: number;
  /** Per-call snapshot of the messages array that was sent. */
  callMessages: ClodMessage[][];
} {
  let i = 0;
  const callMessages: ClodMessage[][] = [];
  let observedTools = 0;
  const clod: ClodChatFn = async (opts) => {
    callMessages.push(opts.messages.map((m) => ({ ...m })));
    if (opts.tools && opts.tools.length > 0) observedTools += 1;
    const next = responses[i] ?? {
      role: "assistant" as const,
      content: "(no more scripted responses)",
      toolCalls: [] as ToolCall[],
    };
    i += 1;
    return makeClodResult(next);
  };
  return {
    get observedTools() {
      return observedTools;
    },
    get callMessages() {
      return callMessages;
    },
    clod,
  } as { clod: ClodChatFn; observedTools: number; callMessages: ClodMessage[][] };
}

function scriptedExpert(
  analyses: string[]
): FinanceExpert & { calls: Array<{ tool: string; arg: unknown }> } {
  let i = 0;
  const calls: Array<{ tool: string; arg: unknown }> = [];
  const next = (): FinanceExpertConsultation => {
    const a = analyses[i] ?? "(no further analysis)";
    i += 1;
    return {
      analysis: a,
      reasoning: "",
      model: "DragonLLM/test",
      latencyMs: 11,
      totalTokens: 90,
    };
  };
  return {
    calls,
    async analyzePineScript(arg) {
      calls.push({ tool: "analyzePineScript", arg });
      return next();
    },
    async evaluateStrategy(arg) {
      calls.push({ tool: "evaluateStrategy", arg });
      return next();
    },
    async answerFinanceQuestion(arg) {
      calls.push({ tool: "answerFinanceQuestion", arg });
      return next();
    },
  };
}

function userOnly(history: string[]): ChatTurn[] {
  return history.map((c) => ({ role: "user" as const, content: c }));
}

describe("multiAgentChat — text-only path (no tool calls)", () => {
  it("returns Clōd's text reply when no tool is invoked", async () => {
    const { clod } = scriptedClod([
      { role: "assistant", content: "Here is a procedural answer.", toolCalls: [] },
    ]);
    const expert = scriptedExpert([]);

    const r = await multiAgentChat({
      history: userOnly(["Where do I paste my pinescript?"]),
      clod,
      financeExpert: expert,
    });

    expect(r.reply).toBe("Here is a procedural answer.");
    expect(r.toolCalls).toBe(0);
    expect(r.fallbackUsed).toBe(false);
    expect(expert.calls).toHaveLength(0);
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0].kind).toBe("clod_reply");
  });
});

describe("multiAgentChat — single expert consultation then text reply", () => {
  it("routes a Pine analysis through the finance expert and synthesises", async () => {
    const toolCall: ToolCall = {
      id: "call_1",
      name: __forTesting.FINANCE_TOOL_NAME,
      arguments: {
        mode: "pinescript",
        pineCode: '//@version=5\nstrategy("x")',
        declaredStrategyType: "trend_following",
        focusedQuestion: "look-ahead bias?",
      },
      rawArguments: '{"mode":"pinescript","pineCode":"//@version=5"}',
    };
    const responses: AssistantMessage[] = [
      { role: "assistant", content: "", toolCalls: [toolCall] },
      {
        role: "assistant",
        content:
          "Your strategy uses an EMA crossover with no look-ahead leakage.",
        toolCalls: [],
      },
    ];
    const { clod, callMessages } = scriptedClod(responses);
    const expert = scriptedExpert([
      "EMA crossover; no request.security lookahead leakage detected.",
    ]);

    const r = await multiAgentChat({
      history: userOnly(["Here is my pine script: ...."]),
      clod,
      financeExpert: expert,
    });

    expect(expert.calls).toEqual([
      {
        tool: "analyzePineScript",
        arg: {
          pineCode: '//@version=5\nstrategy("x")',
          declaredStrategyType: "trend_following",
          focusedQuestion: "look-ahead bias?",
          signal: undefined,
        },
      },
    ]);
    expect(r.toolCalls).toBe(1);
    expect(r.reply).toBe(
      "Your strategy uses an EMA crossover with no look-ahead leakage."
    );
    expect(r.fallbackUsed).toBe(false);

    // The second Clōd call must include the tool result message.
    const secondCall = callMessages[1];
    const toolMsg = secondCall.find((m) => m.role === "tool");
    expect(toolMsg).toBeDefined();
    expect(toolMsg && "toolCallId" in toolMsg && toolMsg.toolCallId).toBe(
      "call_1"
    );
    if (toolMsg && toolMsg.role === "tool") {
      const parsed = JSON.parse(toolMsg.content);
      expect(parsed.ok).toBe(true);
      expect(parsed.analysis).toContain("EMA crossover");
    }

    const kinds = r.steps.map((s) => s.kind);
    expect(kinds).toContain("clod_tool_call");
    expect(kinds).toContain("finance_expert");
    expect(kinds).toContain("clod_reply");
  });
});

describe("multiAgentChat — strategy-mode consultation", () => {
  it("calls evaluateStrategy when mode='strategy'", async () => {
    const toolCall: ToolCall = {
      id: "c2",
      name: __forTesting.FINANCE_TOOL_NAME,
      arguments: {
        mode: "strategy",
        description: "Buy oversold RSI on BTC and hold for 24h.",
      },
      rawArguments: "{}",
    };
    const { clod } = scriptedClod([
      { role: "assistant", content: "", toolCalls: [toolCall] },
      { role: "assistant", content: "Done.", toolCalls: [] },
    ]);
    const expert = scriptedExpert(["Mean-reversion-ish; needs tighter stops."]);

    const r = await multiAgentChat({
      history: userOnly(["evaluate my idea"]),
      clod,
      financeExpert: expert,
    });

    expect(expert.calls[0].tool).toBe("evaluateStrategy");
    expect(r.toolCalls).toBe(1);
  });
});

describe("multiAgentChat — question-mode consultation", () => {
  it("calls answerFinanceQuestion when mode='question'", async () => {
    const toolCall: ToolCall = {
      id: "c3",
      name: __forTesting.FINANCE_TOOL_NAME,
      arguments: {
        mode: "question",
        question: "what is reward-to-risk?",
        context: "trade had R:R 0.7",
      },
      rawArguments: "{}",
    };
    const { clod } = scriptedClod([
      { role: "assistant", content: "", toolCalls: [toolCall] },
      { role: "assistant", content: "Done.", toolCalls: [] },
    ]);
    const expert = scriptedExpert(["R:R is..."]);

    await multiAgentChat({
      history: userOnly(["explain R:R"]),
      clod,
      financeExpert: expert,
    });

    expect(expert.calls[0].tool).toBe("answerFinanceQuestion");
    expect(expert.calls[0].arg).toMatchObject({
      question: "what is reward-to-risk?",
      context: "trade had R:R 0.7",
    });
  });
});

describe("multiAgentChat — safety", () => {
  it("redacts forbidden phrases from the final reply", async () => {
    const { clod } = scriptedClod([
      {
        role: "assistant",
        content: "Looks great — this is a profitable strategy ready for live!",
        toolCalls: [],
      },
    ]);
    const expert = scriptedExpert([]);

    const r = await multiAgentChat({
      history: userOnly(["how is my bot?"]),
      clod,
      financeExpert: expert,
    });

    expect(r.reply).not.toMatch(/profitable strategy/i);
    expect(r.reply).not.toMatch(/ready for live/i);
    expect(r.reply).toContain("[redacted: forbidden phrase]");
  });

  it("rejects unknown tools by sending an error tool result and continuing", async () => {
    const badCall: ToolCall = {
      id: "x",
      name: "delete_all_bots",
      arguments: {},
      rawArguments: "{}",
    };
    const { clod, callMessages } = scriptedClod([
      { role: "assistant", content: "", toolCalls: [badCall] },
      { role: "assistant", content: "ok, abandoned that.", toolCalls: [] },
    ]);
    const expert = scriptedExpert([]);

    const r = await multiAgentChat({
      history: userOnly(["do something dangerous"]),
      clod,
      financeExpert: expert,
    });

    expect(r.toolCalls).toBe(0);
    expect(r.reply).toBe("ok, abandoned that.");
    const toolMsg = callMessages[1].find((m) => m.role === "tool");
    expect(toolMsg).toBeDefined();
    if (toolMsg && toolMsg.role === "tool") {
      const payload = JSON.parse(toolMsg.content);
      expect(payload.ok).toBe(false);
      expect(payload.error).toMatch(/Unknown tool/);
    }
  });
});

describe("multiAgentChat — fallback paths", () => {
  it("falls back when Clōd throws", async () => {
    const clod: ClodChatFn = async () => {
      throw new Error("clod 503");
    };
    const r = await multiAgentChat({
      history: userOnly(["hi"]),
      clod,
      financeExpert: scriptedExpert([]),
    });
    expect(r.fallbackUsed).toBe(true);
    expect(r.steps.some((s) => s.kind === "fallback")).toBe(true);
    expect(r.reply.length).toBeGreaterThan(0);
  });

  it("falls back when Clōd returns empty text and no tool calls", async () => {
    const { clod } = scriptedClod([
      { role: "assistant", content: "", toolCalls: [] },
    ]);
    const r = await multiAgentChat({
      history: userOnly(["hi"]),
      clod,
      financeExpert: scriptedExpert([]),
    });
    expect(r.fallbackUsed).toBe(true);
  });

  it("falls back when Clōd keeps calling tools past maxToolRounds", async () => {
    const persistentToolCall = (i: number): AssistantMessage => ({
      role: "assistant",
      content: "",
      toolCalls: [
        {
          id: `c${i}`,
          name: __forTesting.FINANCE_TOOL_NAME,
          arguments: { mode: "question", question: "?" },
          rawArguments: "{}",
        },
      ],
    });
    const { clod } = scriptedClod([
      persistentToolCall(1),
      persistentToolCall(2),
      persistentToolCall(3),
    ]);
    const r = await multiAgentChat({
      history: userOnly(["spin forever"]),
      clod,
      financeExpert: scriptedExpert(["a", "b", "c"]),
      maxToolRounds: 2,
    });
    expect(r.fallbackUsed).toBe(true);
    expect(r.toolCalls).toBeLessThanOrEqual(3);
  });
});
