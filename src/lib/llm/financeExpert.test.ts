import { describe, it, expect } from "vitest";
import {
  createFinanceExpert,
  type ExpertChatFn,
} from "./financeExpert";

function recordingChat(answers: string[]): {
  chatImpl: ExpertChatFn;
  calls: Array<{
    messages: Array<{ role: "system" | "user"; content: string }>;
  }>;
} {
  const calls: Array<{
    messages: Array<{ role: "system" | "user"; content: string }>;
  }> = [];
  let i = 0;
  const chatImpl: ExpertChatFn = async ({ messages }) => {
    calls.push({ messages });
    const content = answers[i] ?? "(no further answer)";
    i += 1;
    return {
      content,
      reasoning: "",
      model: "DragonLLM/test",
      latencyMs: 7,
      totalTokens: 42,
    };
  };
  return { chatImpl, calls };
}

describe("createFinanceExpert.analyzePineScript", () => {
  it("calls the underlying chat with a Pine-shaped user block and the expert system prompt", async () => {
    const { chatImpl, calls } = recordingChat([
      "Strategy uses an EMA crossover. Look-ahead bias is acceptable here.",
    ]);
    const expert = createFinanceExpert({ chatImpl });

    const r = await expert.analyzePineScript({
      pineCode: '//@version=5\nstrategy("ema-x")',
      declaredStrategyType: "trend_following",
      focusedQuestion: "Are there look-ahead bias issues?",
    });

    expect(calls).toHaveLength(1);
    const [sys, user] = calls[0].messages;
    expect(sys.role).toBe("system");
    expect(sys.content).toContain("Pine Script v5 expert");
    expect(user.content).toContain("Declared strategy type: trend_following");
    expect(user.content).toContain("Are there look-ahead bias issues?");
    expect(user.content).toContain("```pine");
    expect(user.content).toContain("strategy(\"ema-x\")");

    expect(r.model).toBe("DragonLLM/test");
    expect(r.totalTokens).toBe(42);
    expect(r.analysis).toContain("EMA crossover");
  });
});

describe("createFinanceExpert.evaluateStrategy", () => {
  it("includes the declared strategy and focused question in the user block", async () => {
    const { chatImpl, calls } = recordingChat([
      "Plausible mean-reversion edge but stop is too tight for BTC volatility.",
    ]);
    const expert = createFinanceExpert({ chatImpl });

    const r = await expert.evaluateStrategy({
      description: "Buy when RSI < 20, exit at RSI > 50.",
      declaredStrategyType: "mean_reversion",
      focusedQuestion: "Is the stop loss appropriate?",
    });

    const user = calls[0].messages[1];
    expect(user.content).toContain("Declared strategy type: mean_reversion");
    expect(user.content).toContain("Is the stop loss appropriate?");
    expect(user.content).toContain("RSI < 20");
    expect(r.analysis).toContain("mean-reversion edge");
  });
});

describe("createFinanceExpert.answerFinanceQuestion", () => {
  it("appends supporting context when provided", async () => {
    const { chatImpl, calls } = recordingChat(["Reward-to-risk is the ratio…"]);
    const expert = createFinanceExpert({ chatImpl });

    await expert.answerFinanceQuestion({
      question: "What is a reasonable R:R?",
      context: "Last 5 trades had R:R 0.8.",
    });

    const user = calls[0].messages[1];
    expect(user.content).toContain("What is a reasonable R:R?");
    expect(user.content).toContain("Supporting context");
    expect(user.content).toContain("Last 5 trades had R:R 0.8.");
  });
});

describe("createFinanceExpert — safety sanitiser", () => {
  it("redacts forbidden phrases the underlying model may emit", async () => {
    const { chatImpl } = recordingChat([
      "This is a profitable strategy and is ready for live capital.",
    ]);
    const expert = createFinanceExpert({ chatImpl });
    const r = await expert.answerFinanceQuestion({
      question: "is this good?",
    });
    expect(r.analysis).not.toMatch(/profitable strategy/i);
    expect(r.analysis).not.toMatch(/ready for live/i);
    expect(r.analysis).toContain("[redacted: forbidden phrase]");
  });
});

describe("createFinanceExpert — input validation", () => {
  it("throws if neither vllmConfig nor chatImpl is provided", () => {
    expect(() => createFinanceExpert({})).toThrow(/vllmConfig or chatImpl/);
  });
});
