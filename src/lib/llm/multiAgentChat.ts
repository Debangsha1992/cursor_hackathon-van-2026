// Multi-agent chat orchestrator.
//
// Architecture:
//
//   user --> Clōd (generic conversational layer)
//                |  decides when expertise is required
//                v
//          consult_finance_expert  (tool)
//                |
//                v
//   Lightning AI vLLM serving DragonLLM/Qwen-Open-Finance-R-8B
//                |
//                v
//          expert analysis (sanitised)
//                |
//                v
//          Clōd synthesises into a user-facing reply
//
// Clōd talks to the user; the vLLM is a specialist tool. The loop is pure
// orchestration over two injected interfaces (a `ClodChat`-like function and
// a `FinanceExpert`) so this module is unit-testable without network.
//
// Safety: the orchestrator inherits the system prompt's prohibition on
// live-deploy phrasing and runs a final pass through the same sanitiser
// used by the finance expert.

import type {
  AssistantMessage,
  ClodChatResult,
  ClodMessage,
  ToolDefinition,
} from "./clodClient";
import type { FinanceExpert, FinanceExpertConsultation } from "./financeExpert";

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

/** The conversational layer (Clōd) reduced to its essential shape. */
export interface ClodChatFn {
  (opts: {
    messages: ClodMessage[];
    tools?: ToolDefinition[];
    toolChoice?: "auto" | "none" | "required";
    maxTokens?: number;
    temperature?: number;
    signal?: AbortSignal;
  }): Promise<ClodChatResult>;
}

/** What an external caller sees as the conversation so far. */
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** What actually happened under the hood — Clōd's decisions + each
 * consultation with the finance expert. Surfaced for transparency. */
export type AgentStep =
  | {
      kind: "clod_reply";
      content: string;
      model: string;
      latencyMs: number;
      promptTokens: number;
      completionTokens: number;
    }
  | {
      kind: "clod_tool_call";
      tool: string;
      argumentsJson: string;
      model: string;
      latencyMs: number;
    }
  | {
      kind: "finance_expert";
      tool: string;
      input: string;
      analysis: string;
      model: string;
      latencyMs: number;
      totalTokens: number;
    }
  | {
      kind: "fallback";
      reason: string;
    };

export interface MultiAgentChatResult {
  reply: string;
  steps: AgentStep[];
  /** Clōd ran out of turns / errored / produced no usable text. The reply
   * will be a deterministic template explaining this. */
  fallbackUsed: boolean;
  toolCalls: number;
  totalLatencyMs: number;
}

export interface MultiAgentChatOpts {
  /** User-visible transcript (does NOT include tool calls). */
  history: ChatTurn[];
  clod: ClodChatFn;
  financeExpert: FinanceExpert;
  /** Hard cap on Clōd<->expert back-and-forth. Default 4. */
  maxToolRounds?: number;
  signal?: AbortSignal;
  /** Optional system-prompt override (e.g. for the strategy interrogator). */
  systemPrompt?: string;
  /** Max tokens per Clōd call. */
  maxTokens?: number;
}

const DEFAULT_SYSTEM_PROMPT = `You are PaperPilot AI's conversational front-end. You are Clōd — a generic
large language model — and you are talking to a human bot-builder.

You are NOT a finance expert. Whenever the user asks anything that requires
real pinescript / trading-strategy expertise (analysing Pine code, evaluating
a strategy idea, identifying behavioural risks, etc.) you MUST call the
\`consult_finance_expert\` tool to get a specialist opinion before answering.
Re-narrate the expert's analysis in plain, friendly language; do not just
forward it verbatim.

Rules:
- Ground every substantive finance claim in either (a) a tool call you
  just made, or (b) something the user told you. Do not invent strategy
  details from your own pretraining.
- Never write "ready for live", "deploy this bot", "guaranteed return",
  or "profitable strategy" — PaperPilot is paper-trading only and these
  phrases are forbidden.
- If the user's question is purely procedural (e.g. "where do I paste my
  pinescript?"), you may answer directly without consulting the expert.
- Be concise. Two-to-five short paragraphs is plenty for most replies.
- If a consultation returned an apology / refusal, acknowledge that to
  the user instead of pretending you analysed something you didn't.`;

const FINANCE_TOOL_NAME = "consult_finance_expert";

const FINANCE_TOOL: ToolDefinition = {
  name: FINANCE_TOOL_NAME,
  description:
    "Consult PaperPilot's senior trading-strategy and Pine Script v5 expert (a fine-tuned finance LLM). Use whenever the user query touches Pine Script analysis, strategy evaluation, behavioural-risk identification, or any substantive trading-finance question. The expert never talks to the user directly — its output is for your synthesis.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      mode: {
        type: "string",
        enum: ["pinescript", "strategy", "question"],
        description:
          "pinescript = analyse raw Pine v5 code. strategy = evaluate a natural-language strategy description. question = answer a focused finance / trading question.",
      },
      pineCode: {
        type: "string",
        description:
          "Pine Script v5 source code, exactly as the user provided it. Required when mode='pinescript'.",
      },
      description: {
        type: "string",
        description:
          "Natural-language description of the strategy or trade idea. Required when mode='strategy'.",
      },
      question: {
        type: "string",
        description:
          "Focused finance / trading-strategy question. Required when mode='question'.",
      },
      declaredStrategyType: {
        type: "string",
        description:
          "Optional: the strategy type the user told you they were trying to build (e.g. 'trend_following'). Helps the expert flag mismatches.",
      },
      focusedQuestion: {
        type: "string",
        description:
          "Optional: a narrow sub-question to focus the expert's analysis on, e.g. 'is the stop loss tight enough for trending markets?'.",
      },
      context: {
        type: "string",
        description:
          "Optional: additional supporting context (recent violations, retrieved excerpts, etc.) — used only when mode='question'.",
      },
    },
    required: ["mode"],
  },
};

function turnsToMessages(
  history: ChatTurn[],
  systemPrompt: string
): ClodMessage[] {
  const out: ClodMessage[] = [{ role: "system", content: systemPrompt }];
  for (const t of history) {
    if (t.role === "assistant") {
      out.push({ role: "assistant", content: t.content, toolCalls: [] });
    } else {
      out.push({ role: "user", content: t.content });
    }
  }
  return out;
}

function expectString(o: Record<string, unknown>, k: string): string | null {
  const v = o[k];
  return typeof v === "string" && v.length > 0 ? v : null;
}

async function runOneToolCall(
  args: Record<string, unknown>,
  expert: FinanceExpert,
  signal?: AbortSignal
): Promise<{ consultation: FinanceExpertConsultation; inputDigest: string }> {
  const mode = expectString(args, "mode") ?? "question";
  const declaredStrategyType = expectString(args, "declaredStrategyType") ?? undefined;
  const focusedQuestion = expectString(args, "focusedQuestion") ?? undefined;

  if (mode === "pinescript") {
    const pineCode = expectString(args, "pineCode");
    if (!pineCode) {
      throw new Error(
        "consult_finance_expert(mode=pinescript) requires `pineCode`"
      );
    }
    const consultation = await expert.analyzePineScript({
      pineCode,
      declaredStrategyType,
      focusedQuestion,
      signal,
    });
    return {
      consultation,
      inputDigest: `pinescript (${pineCode.length} chars)${focusedQuestion ? `; focus: ${focusedQuestion}` : ""}`,
    };
  }

  if (mode === "strategy") {
    const description = expectString(args, "description");
    if (!description) {
      throw new Error(
        "consult_finance_expert(mode=strategy) requires `description`"
      );
    }
    const consultation = await expert.evaluateStrategy({
      description,
      declaredStrategyType,
      focusedQuestion,
      signal,
    });
    return {
      consultation,
      inputDigest: `strategy: ${description.slice(0, 120)}${description.length > 120 ? "…" : ""}`,
    };
  }

  // question mode (default)
  const question = expectString(args, "question");
  if (!question) {
    throw new Error(
      "consult_finance_expert(mode=question) requires `question`"
    );
  }
  const context = expectString(args, "context") ?? undefined;
  const consultation = await expert.answerFinanceQuestion({
    question,
    context,
    signal,
  });
  return {
    consultation,
    inputDigest: `question: ${question.slice(0, 160)}${question.length > 160 ? "…" : ""}`,
  };
}

function appendAssistantWithToolCalls(
  messages: ClodMessage[],
  assistant: AssistantMessage
): void {
  messages.push({
    role: "assistant",
    content: assistant.content,
    toolCalls: assistant.toolCalls,
  });
}

function appendToolResults(
  messages: ClodMessage[],
  toolCallId: string,
  payload: { ok: true; analysis: string; model: string } | { ok: false; error: string }
): void {
  messages.push({
    role: "tool",
    toolCallId,
    content: JSON.stringify(payload),
  });
}

const FALLBACK_REPLY =
  "I couldn't get a useful answer from the conversational model just now. Try rephrasing your question, or paste your Pine Script directly and I'll route it to the finance expert.";

export async function multiAgentChat(
  opts: MultiAgentChatOpts
): Promise<MultiAgentChatResult> {
  const maxRounds = opts.maxToolRounds ?? 4;
  const maxTokens = opts.maxTokens ?? 1024;
  const systemPrompt = opts.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  const messages = turnsToMessages(opts.history, systemPrompt);
  const steps: AgentStep[] = [];
  let toolCalls = 0;
  let totalLatencyMs = 0;
  let round = 0;
  let finalText = "";
  let fallbackUsed = false;

  while (round <= maxRounds) {
    if (opts.signal?.aborted) {
      steps.push({ kind: "fallback", reason: "aborted" });
      fallbackUsed = true;
      finalText = "Cancelled.";
      break;
    }

    let r: ClodChatResult;
    try {
      r = await opts.clod({
        messages,
        tools: [FINANCE_TOOL],
        toolChoice: "auto",
        maxTokens,
        temperature: 0.3,
        signal: opts.signal,
      });
    } catch (e) {
      steps.push({
        kind: "fallback",
        reason: `clod call failed: ${(e as Error).message}`,
      });
      fallbackUsed = true;
      finalText = FALLBACK_REPLY;
      break;
    }

    totalLatencyMs += r.latencyMs;
    const assistant = r.message;

    if (assistant.toolCalls.length === 0) {
      // Pure text reply — terminal.
      const text = assistant.content?.trim() ?? "";
      if (!text) {
        steps.push({
          kind: "fallback",
          reason: "clod returned empty content and no tool calls",
        });
        fallbackUsed = true;
        finalText = FALLBACK_REPLY;
      } else {
        steps.push({
          kind: "clod_reply",
          content: text,
          model: r.model,
          latencyMs: r.latencyMs,
          promptTokens: r.promptTokens,
          completionTokens: r.completionTokens,
        });
        finalText = text;
      }
      break;
    }

    // The model wants to call tools. Append its turn (with the tool_calls
    // payload) and then resolve each tool call.
    appendAssistantWithToolCalls(messages, assistant);
    for (const call of assistant.toolCalls) {
      steps.push({
        kind: "clod_tool_call",
        tool: call.name,
        argumentsJson: call.rawArguments,
        model: r.model,
        latencyMs: r.latencyMs,
      });
      if (call.name !== FINANCE_TOOL_NAME) {
        appendToolResults(messages, call.id, {
          ok: false,
          error: `Unknown tool '${call.name}'. The only available tool is consult_finance_expert.`,
        });
        continue;
      }
      try {
        const { consultation, inputDigest } = await runOneToolCall(
          call.arguments,
          opts.financeExpert,
          opts.signal
        );
        toolCalls += 1;
        totalLatencyMs += consultation.latencyMs;
        steps.push({
          kind: "finance_expert",
          tool: call.name,
          input: inputDigest,
          analysis: consultation.analysis,
          model: consultation.model,
          latencyMs: consultation.latencyMs,
          totalTokens: consultation.totalTokens,
        });
        appendToolResults(messages, call.id, {
          ok: true,
          analysis: consultation.analysis,
          model: consultation.model,
        });
      } catch (e) {
        appendToolResults(messages, call.id, {
          ok: false,
          error: (e as Error).message,
        });
      }
    }
    round += 1;
  }

  if (!finalText) {
    // Hit max rounds without a terminal text reply.
    steps.push({
      kind: "fallback",
      reason: `exceeded ${maxRounds} tool rounds without final text`,
    });
    fallbackUsed = true;
    finalText = FALLBACK_REPLY;
  }

  return {
    reply: sanitize(finalText),
    steps,
    fallbackUsed,
    toolCalls,
    totalLatencyMs,
  };
}

/** Re-exported for tests. */
export const __forTesting = {
  FINANCE_TOOL,
  FINANCE_TOOL_NAME,
  DEFAULT_SYSTEM_PROMPT,
};
