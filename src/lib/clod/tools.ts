import "server-only";

import type { ChatCompletionTool } from "./client";

const FINANCE_SYSTEM_PROMPT =
  "You are a senior quantitative trading and pinescript specialist. " +
  "You write in concise, professional prose with concrete numbers, " +
  "indicator names, and risk callouts. When pinescript is requested, " +
  "you produce minimal, idiomatic v5 code blocks. Never recommend live " +
  "execution — assume the asker is auditing a paper-trading agent.";

export const consultFinanceExpertTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "consult_finance_expert",
    description:
      "Consult the in-house Qwen-Open-Finance reasoning model for trading-strategy or pinescript analysis. Use when the user asks about strategy/indicators/risk/pinescript.",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description:
            "A self-contained question for the finance expert. Include the user's intent and any constraints.",
        },
        marketContext: {
          type: "object",
          description:
            "Optional market context (symbol, lastPrice, recentTrades, indicator values).",
        },
      },
      required: ["question"],
    },
  },
};

/**
 * Server-side call into the vLLM-served Qwen-Open-Finance model.
 *
 * Non-streaming — the orchestrator waits on a single message before re-entering
 * Clōd. Returns the raw assistant content; throws on any non-2xx.
 */
export async function callFinanceExpert(
  question: string,
  marketContext?: object,
): Promise<string> {
  const base = process.env.OPENAI_API_BASE;
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  if (!base || !key || !model) {
    throw new Error(
      "Finance expert is not configured. Set OPENAI_API_BASE, OPENAI_API_KEY, OPENAI_MODEL.",
    );
  }

  const userPayload = marketContext
    ? `${question}\n\nMarket context:\n\`\`\`json\n${JSON.stringify(
        marketContext,
        null,
        2,
      )}\n\`\`\``
    : question;

  const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      stream: false,
      temperature: 0.2,
      messages: [
        { role: "system", content: FINANCE_SYSTEM_PROMPT },
        { role: "user", content: userPayload },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Finance expert call failed: ${res.status} ${res.statusText} ${text.slice(0, 400)}`,
    );
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}
