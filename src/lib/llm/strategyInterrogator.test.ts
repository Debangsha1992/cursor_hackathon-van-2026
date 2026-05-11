import { describe, it, expect } from "vitest";
import {
  interrogateAgent,
  type LlmChat,
  type CounterpartySender,
} from "./strategyInterrogator";

function fixedSender(answers: string[]): CounterpartySender & {
  asked: string[];
} {
  let i = 0;
  const asked: string[] = [];
  return {
    asked,
    async ask(q: string) {
      asked.push(q);
      const a = answers[i] ?? "(no further answer)";
      i += 1;
      return a;
    },
  };
}

function scriptedLlm(turns: string[]): LlmChat & { calls: number } {
  const obj = {
    calls: 0,
    async chat() {
      const idx = obj.calls;
      obj.calls += 1;
      const content = turns[idx] ?? "";
      return {
        content,
        reasoning: "",
        model: "test-model",
        latencyMs: 5,
      };
    },
  };
  return obj;
}

describe("interrogateAgent — happy path", () => {
  it("asks the counterparty the LLM-supplied question and returns the LLM-supplied summary", async () => {
    const llm = scriptedLlm([
      JSON.stringify({
        action: "ask",
        question: "What is your edge in one sentence?",
      }),
      JSON.stringify({
        action: "finish",
        summary: {
          inferredStrategyType: "trend_following",
          consistencyScore: 0.85,
          edge: "Cross-asset momentum.",
          signalGeneration: "EMA crossover with volume filter.",
          positionSizing: "Volatility-targeted notional.",
          riskManagement: "ATR-based stop, max 1% per trade.",
          exitCriteria: "Trailing stop or signal flip.",
          marketRegimeAssumption: "Trending markets.",
          failureModes: ["Whipsaws in chop", "Slippage at signal flip"],
          redFlags: [],
          notes: "Coherent, internally consistent answers.",
        },
      }),
    ]);

    const sender = fixedSender(["Cross-asset momentum exploiting trend persistence."]);

    const result = await interrogateAgent({
      counterparty: {
        id: "bot-42",
        name: "Counterparty Bot",
        declaredStrategyType: "trend_following",
      },
      llm,
      sender,
    });

    expect(sender.asked).toEqual(["What is your edge in one sentence?"]);
    expect(result.inferredStrategyType).toBe("trend_following");
    expect(result.consistencyScore).toBeCloseTo(0.85);
    expect(result.transcript).toEqual([
      { role: "interrogator", text: "What is your edge in one sentence?" },
      {
        role: "counterparty",
        text: "Cross-asset momentum exploiting trend persistence.",
      },
    ]);
    expect(result.rounds).toBe(1);
    expect(result.llmFallbackUsed).toBe(false);
    expect(result.llmModel).toBe("test-model");
    expect(result.failureModes).toContain("Whipsaws in chop");
  });
});

describe("interrogateAgent — multi-round and fallback", () => {
  it("loops up to maxRounds when LLM keeps asking, then forces a finish on the trailing call", async () => {
    const llm = scriptedLlm([
      JSON.stringify({ action: "ask", question: "Q1?" }),
      JSON.stringify({ action: "ask", question: "Q2?" }),
      JSON.stringify({
        action: "finish",
        summary: { notes: "wrapped up after 2 rounds" },
      }),
    ]);
    const sender = fixedSender(["A1.", "A2."]);

    const result = await interrogateAgent({
      counterparty: { id: "b", name: "n", declaredStrategyType: null },
      llm,
      sender,
      maxRounds: 5,
    });

    expect(sender.asked).toEqual(["Q1?", "Q2?"]);
    expect(result.rounds).toBe(2);
    expect(result.notes).toContain("wrapped up after 2 rounds");
  });

  it("falls back to a deterministic question when the LLM returns unparseable output", async () => {
    const llm = scriptedLlm([
      "Here's some prose that is not JSON.",
      JSON.stringify({
        action: "finish",
        summary: { notes: "summary after fallback" },
      }),
    ]);
    const sender = fixedSender(["my edge is X"]);

    const result = await interrogateAgent({
      counterparty: { id: "b", name: "n", declaredStrategyType: null },
      llm,
      sender,
      maxRounds: 3,
    });

    expect(sender.asked.length).toBe(1);
    expect(sender.asked[0].toLowerCase()).toContain("edge");
    expect(result.llmFallbackUsed).toBe(true);
    expect(result.notes).toContain("summary after fallback");
  });

  it("returns a deterministic fallback summary when even the trailing finish-call fails", async () => {
    // 3 unparseable LLM calls in a row: rounds 0, 1, plus the post-loop forced-finish call.
    const llm = scriptedLlm(["nope.", "nope.", "still nope."]);
    const sender = fixedSender(["a", "b"]);

    const result = await interrogateAgent({
      counterparty: { id: "b", name: "n", declaredStrategyType: null },
      llm,
      sender,
      maxRounds: 2,
    });

    expect(result.llmFallbackUsed).toBe(true);
    expect(result.redFlags).toContain("INTERROGATOR_LLM_FALLBACK");
    expect(result.consistencyScore).toBe(0);
    expect(result.notes).toContain("Deterministic fallback summary");
  });

  it("recovers JSON from prose-wrapped LLM output", async () => {
    const llm = scriptedLlm([
      'Sure. {"action": "ask", "question": "How do you size positions?"} -- I asked one.',
      JSON.stringify({
        action: "finish",
        summary: { notes: "ok" },
      }),
    ]);
    const sender = fixedSender(["fixed fractional 1%"]);

    const result = await interrogateAgent({
      counterparty: { id: "b", name: "n", declaredStrategyType: null },
      llm,
      sender,
    });

    expect(result.llmFallbackUsed).toBe(false);
    expect(sender.asked).toEqual(["How do you size positions?"]);
  });
});

describe("interrogateAgent — safety", () => {
  it("redacts forbidden phrases that slip into the LLM summary", async () => {
    const llm = scriptedLlm([
      JSON.stringify({
        action: "finish",
        summary: {
          notes: "This is a profitable strategy and looks ready for live.",
          edge: "we have a guaranteed return on every trade",
        },
      }),
    ]);
    const sender = fixedSender([]);

    const result = await interrogateAgent({
      counterparty: { id: "b", name: "n", declaredStrategyType: null },
      llm,
      sender,
    });

    expect(result.notes).not.toMatch(/profitable strategy/i);
    expect(result.notes).not.toMatch(/ready for live/i);
    expect(result.edge).not.toMatch(/guaranteed return/i);
    expect(result.notes).toContain("[redacted: forbidden phrase]");
  });

  it("captures errors from the counterparty sender into the transcript without bombing", async () => {
    const llm = scriptedLlm([
      JSON.stringify({ action: "ask", question: "What's your edge?" }),
      JSON.stringify({
        action: "finish",
        summary: { notes: "interrogation done" },
      }),
    ]);
    const sender: CounterpartySender = {
      async ask() {
        throw new Error("peer 503");
      },
    };

    const result = await interrogateAgent({
      counterparty: { id: "b", name: "n", declaredStrategyType: null },
      llm,
      sender,
    });

    expect(result.transcript[1].text).toContain("counterparty error: peer 503");
    expect(result.notes).toContain("interrogation done");
  });
});
