import { NextResponse } from "next/server";
import { z } from "zod";
import { clodChat, loadClodConfigFromEnv } from "@/lib/llm/clodClient";
import { loadVllmConfigFromEnv } from "@/lib/llm/vllmClient";
import { createFinanceExpert } from "@/lib/llm/financeExpert";
import { multiAgentChat, type ChatTurn } from "@/lib/llm/multiAgentChat";
import {
  interrogateAgent,
  type LlmChat,
} from "@/lib/llm/strategyInterrogator";
import { createA2ACounterpartySender } from "@/lib/llm/a2aCounterpartySender";
import { bearerAuth } from "@/lib/a2a/a2aClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/agents/interrogate
// Body:
//   {
//     "counterparty": {
//       "id": "bot-42",
//       "name": "Counterparty Bot",
//       "declaredStrategyType": "trend_following" | null,
//       "agentBaseUrl": "https://peer.example.com"
//     },
//     "peerBearerToken": "optional",
//     "maxRounds": 6
//   }
//
// Returns: StrategyUnderstanding JSON.
//
// Multi-agent role split:
//   * Clōd (api.clod.io) drives the JSON-protocol interrogation dialog as the
//     `LlmChat` injected into `interrogateAgent`. It's the generic reasoner.
//   * Lightning AI vLLM (DragonLLM/Qwen-Open-Finance-R-8B) is exposed to Clōd
//     as the `consult_finance_expert` tool via `multiAgentChat`, so Clōd can
//     pull specialist analysis whenever a counterparty answer needs deeper
//     pinescript / strategy scrutiny before composing the next question.
//   * The counterparty bot itself is reached over A2A JSON-RPC.

const RequestSchema = z.object({
  counterparty: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    declaredStrategyType: z.string().nullable().default(null),
    agentBaseUrl: z.string().url(),
  }),
  peerBearerToken: z.string().optional(),
  maxRounds: z.number().int().min(1).max(12).optional(),
  llmMaxTokens: z.number().int().min(128).max(8192).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Body is not valid JSON" },
      { status: 400 }
    );
  }

  const parsed = RequestSchema.safeParse(parsedBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid request", details: parsed.error.format() },
      { status: 400 }
    );
  }

  let clodConfig;
  try {
    clodConfig = loadClodConfigFromEnv();
  } catch (e) {
    return NextResponse.json(
      {
        error: "Clōd conversational layer is not configured",
        details: (e as Error).message,
      },
      { status: 503 }
    );
  }
  clodConfig.defaultTimeoutMs = 30_000;

  let vllmConfig;
  try {
    vllmConfig = loadVllmConfigFromEnv();
  } catch (e) {
    return NextResponse.json(
      {
        error: "Finance expert (Lightning AI vLLM) is not configured",
        details: (e as Error).message,
      },
      { status: 503 }
    );
  }
  vllmConfig.defaultTimeoutMs = 30_000;

  // The strategy interrogator wants a single-shot `chat(messages) -> content`
  // surface. Under the hood we wire Clōd as the generic reasoner, give it
  // access to `consult_finance_expert` (the vLLM), and run a bounded
  // multi-agent loop per turn. The interrogator's existing JSON-protocol
  // (ask/finish actions) survives unchanged because Clōd terminates each
  // multi-agent turn with a plain text reply containing that JSON.
  const financeExpert = createFinanceExpert({ vllmConfig });
  const interrogatorSystemPrompt = `You are the senior portfolio risk officer at PaperPilot AI, currently
operating as the conversational reasoner that drives a structured
bot-interrogation protocol. Every turn you receive a transcript and must
respond with a single JSON object using the protocol the caller spelled
out in its own system prompt (action: "ask" or "finish"). Before you
emit your JSON, you MAY call \`consult_finance_expert\` to verify
behavioural-risk hypotheses (pinescript red flags, strategy mismatch,
position-sizing soundness) — use it whenever the counterparty's most
recent answer touches Pine Script or substantive strategy details. Never
write "ready for live", "deploy this bot", "guaranteed return", or
"profitable strategy" in any output.`;

  const llm: LlmChat = {
    async chat(o) {
      // Split the interrogator's pre-built messages into (system prompts to
      // merge) and (user/assistant turns to keep as the chat history).
      const systemParts: string[] = [];
      const history: ChatTurn[] = [];
      for (const m of o.messages) {
        if (m.role === "system") {
          systemParts.push(m.content);
        } else {
          history.push({ role: m.role, content: m.content });
        }
      }
      systemParts.push(interrogatorSystemPrompt);

      const result = await multiAgentChat({
        history,
        clod: (opts) => clodChat(clodConfig, opts),
        financeExpert,
        maxToolRounds: 2,
        signal: o.signal,
        systemPrompt: systemParts.join("\n\n"),
        maxTokens: o.maxTokens,
      });
      return {
        content: result.reply,
        reasoning: "",
        model: "clod+vllm",
        latencyMs: result.totalLatencyMs,
      };
    },
  };

  const sender = createA2ACounterpartySender({
    agentBaseUrl: parsed.data.counterparty.agentBaseUrl,
    auth: parsed.data.peerBearerToken
      ? bearerAuth(parsed.data.peerBearerToken)
      : undefined,
    timeoutMs: 30_000,
  });

  try {
    const understanding = await interrogateAgent({
      counterparty: {
        id: parsed.data.counterparty.id,
        name: parsed.data.counterparty.name,
        declaredStrategyType: parsed.data.counterparty.declaredStrategyType,
      },
      llm,
      sender,
      maxRounds: parsed.data.maxRounds,
      llmMaxTokens: parsed.data.llmMaxTokens,
    });
    return NextResponse.json(understanding);
  } catch (e) {
    return NextResponse.json(
      {
        error: "interrogation failed",
        details: (e as Error).message,
      },
      { status: 502 }
    );
  }
}
