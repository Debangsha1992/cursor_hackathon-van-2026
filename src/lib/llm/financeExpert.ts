// FinanceExpert: a domain-shaped façade over the Lightning AI vLLM serving
// DragonLLM/Qwen-Open-Finance-R-8B. In the multi-agent architecture, this
// model never talks to end-users directly — it is consulted by Clōd (the
// generic conversational layer) whenever Clōd decides the user query
// requires deep pinescript or trading-strategy expertise.
//
// Why a separate file from `vllmClient.ts`?
//  - vllmClient is transport-level (OpenAI-compatible HTTP).
//  - financeExpert is intent-level: one method per kind of question Clōd
//    is allowed to ask, with system prompts crafted for that question.
//  - Tests can stub the underlying chat function without depending on the
//    HTTP envelope, and the multi-agent orchestrator depends only on the
//    `FinanceExpert` interface — not on a vLLM binding.
//
// Safety: the system prompts forbid live-deploy / guaranteed-return phrasing,
// matching the project's rules. A post-hoc sanitizer redacts the same set
// of phrases the interrogator already polices.

import { chat as vllmChat, type VllmConfig } from "./vllmClient";

const FORBIDDEN_PHRASES = [
  "ready for live",
  "deploy this bot",
  "guaranteed return",
  "profitable strategy",
];

function sanitize(text: string): string {
  let out = text;
  for (const p of FORBIDDEN_PHRASES) {
    const re = new RegExp(p, "ig");
    out = out.replace(re, "[redacted: forbidden phrase]");
  }
  return out;
}

const EXPERT_SYSTEM_PROMPT = `You are PaperPilot's senior trading-strategy and Pine Script v5 expert.
You are being consulted by a generic conversational agent ("Clōd") that is
talking to a human bot-builder. Your replies are not shown to the user
verbatim — Clōd will re-narrate them — but they ARE the substantive
analysis that grounds Clōd's response. Optimise for technical correctness,
not friendliness.

Rules:
- Be specific. Cite Pine Script v5 functions by name (e.g. ta.crossover,
  strategy.entry, request.security) when relevant.
- Identify concrete failure modes (look-ahead bias, repainting,
  request.security lookahead leakage, off-by-one bar indexing,
  inappropriate strategy.position_size sizing, etc.).
- Distinguish between what the code does mechanically and what the
  declared strategy claims.
- Never write "ready for live", "deploy this bot", "guaranteed return",
  or "profitable strategy". These are forbidden phrases.
- Never recommend live-money deployment. PaperPilot is paper-trading only.
- If the input is not Pine Script or not a trading-strategy question,
  say so plainly in one sentence and stop.`;

export interface FinanceExpertConsultation {
  /** Sanitised, model-emitted analysis. May contain internal <think>...
   * blocks already stripped by the underlying vLLM client. */
  analysis: string;
  /** Reasoning trace from the vLLM (kept for audit; do not surface). */
  reasoning: string;
  model: string;
  latencyMs: number;
  totalTokens: number;
}

export interface FinanceExpert {
  analyzePineScript(args: {
    pineCode: string;
    declaredStrategyType?: string;
    focusedQuestion?: string;
    signal?: AbortSignal;
  }): Promise<FinanceExpertConsultation>;

  evaluateStrategy(args: {
    description: string;
    declaredStrategyType?: string;
    focusedQuestion?: string;
    signal?: AbortSignal;
  }): Promise<FinanceExpertConsultation>;

  answerFinanceQuestion(args: {
    question: string;
    /** Optional supporting context (recent trades, violations, excerpts). */
    context?: string;
    signal?: AbortSignal;
  }): Promise<FinanceExpertConsultation>;
}

/**
 * Minimal interface the wrapper needs from a chat function — lets tests
 * inject a stub without spinning up the OpenAI-compatible envelope.
 */
export interface ExpertChatFn {
  (opts: {
    messages: Array<{ role: "system" | "user"; content: string }>;
    maxTokens?: number;
    temperature?: number;
    signal?: AbortSignal;
  }): Promise<{
    content: string;
    reasoning: string;
    model: string;
    latencyMs: number;
    totalTokens: number;
  }>;
}

export interface FinanceExpertOpts {
  /** Bind to a real Lightning AI vLLM config... */
  vllmConfig?: VllmConfig;
  /** ...or inject a chat function directly (used by tests). */
  chatImpl?: ExpertChatFn;
  defaultMaxTokens?: number;
  defaultTemperature?: number;
}

function makeChatImpl(opts: FinanceExpertOpts): ExpertChatFn {
  if (opts.chatImpl) return opts.chatImpl;
  if (!opts.vllmConfig) {
    throw new Error(
      "createFinanceExpert: either vllmConfig or chatImpl is required"
    );
  }
  const cfg = opts.vllmConfig;
  return async ({ messages, maxTokens, temperature, signal }) => {
    const r = await vllmChat(cfg, {
      messages,
      maxTokens,
      temperature,
      signal,
    });
    return {
      content: r.content,
      reasoning: r.reasoning,
      model: r.model,
      latencyMs: r.latencyMs,
      totalTokens: r.totalTokens,
    };
  };
}

export function createFinanceExpert(opts: FinanceExpertOpts): FinanceExpert {
  const chatImpl = makeChatImpl(opts);
  const maxTokens = opts.defaultMaxTokens ?? 1024;
  const temperature = opts.defaultTemperature ?? 0.2;

  const consult = async (
    userBlock: string,
    signal?: AbortSignal
  ): Promise<FinanceExpertConsultation> => {
    const r = await chatImpl({
      messages: [
        { role: "system", content: EXPERT_SYSTEM_PROMPT },
        { role: "user", content: userBlock },
      ],
      maxTokens,
      temperature,
      signal,
    });
    return {
      analysis: sanitize(r.content || r.reasoning || ""),
      reasoning: r.reasoning,
      model: r.model,
      latencyMs: r.latencyMs,
      totalTokens: r.totalTokens,
    };
  };

  return {
    analyzePineScript({ pineCode, declaredStrategyType, focusedQuestion, signal }) {
      const lines = [
        "Task: analyse this Pine Script v5 strategy for behavioural risk.",
        declaredStrategyType
          ? `Declared strategy type: ${declaredStrategyType}`
          : "Declared strategy type: (none)",
        focusedQuestion
          ? `The conversational agent specifically wants to know: ${focusedQuestion}`
          : "Cover: edge, signal generation, position sizing, stop placement, exit, regime fit, and failure modes.",
        "",
        "```pine",
        pineCode,
        "```",
      ];
      return consult(lines.join("\n"), signal);
    },

    evaluateStrategy({ description, declaredStrategyType, focusedQuestion, signal }) {
      const lines = [
        "Task: evaluate this trading-strategy description.",
        declaredStrategyType
          ? `Declared strategy type: ${declaredStrategyType}`
          : "Declared strategy type: (none)",
        focusedQuestion
          ? `The conversational agent specifically wants to know: ${focusedQuestion}`
          : "Cover: edge, signal generation, position sizing, stop placement, exit, regime fit, and failure modes.",
        "",
        "Description:",
        description,
      ];
      return consult(lines.join("\n"), signal);
    },

    answerFinanceQuestion({ question, context, signal }) {
      const lines = [
        "Task: answer this finance / trading-strategy question for the conversational agent.",
        "Question:",
        question,
      ];
      if (context && context.trim().length > 0) {
        lines.push("", "Supporting context:", context);
      }
      return consult(lines.join("\n"), signal);
    },
  };
}
