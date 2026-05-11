import { NextResponse } from "next/server";
import { z } from "zod";
import {
  clodChat,
  loadClodConfigFromEnv,
  type ClodChatResult,
} from "@/lib/llm/clodClient";
import { loadVllmConfigFromEnv } from "@/lib/llm/vllmClient";
import { createFinanceExpert } from "@/lib/llm/financeExpert";
import {
  multiAgentChat,
  type ChatTurn,
  type ClodChatFn,
} from "@/lib/llm/multiAgentChat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/chat
//
// User-facing entry point to the multi-agent stack:
//
//   user --> Clōd (generic conversational layer) --> [tool: consult_finance_expert]
//                                                          \
//                                                           --> Lightning AI vLLM
//                                                               (DragonLLM/Qwen-Open-Finance-R-8B)
//
// Body:
//   { messages: [{ role: "user" | "assistant", content: string }, ...] }
//
// Returns:
//   {
//     reply: string,                  // user-visible final text from Clōd
//     steps: AgentStep[],             // tool calls + expert consultations (for UI transparency)
//     fallbackUsed: boolean,
//     toolCalls: number,
//     totalLatencyMs: number
//   }

const TurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(8000),
});

const RequestSchema = z.object({
  messages: z.array(TurnSchema).min(1).max(40),
  maxToolRounds: z.number().int().min(1).max(8).optional(),
  maxTokens: z.number().int().min(64).max(4096).optional(),
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

  // Last message must be from the user, otherwise the model has nothing
  // new to respond to.
  const last = parsed.data.messages[parsed.data.messages.length - 1];
  if (last.role !== "user") {
    return NextResponse.json(
      { error: "last message must have role 'user'" },
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

  const clod: ClodChatFn = async (o) => {
    const r: ClodChatResult = await clodChat(clodConfig, {
      messages: o.messages,
      tools: o.tools,
      toolChoice: o.toolChoice,
      maxTokens: o.maxTokens,
      temperature: o.temperature,
      signal: o.signal,
    });
    return r;
  };

  const financeExpert = createFinanceExpert({ vllmConfig });

  try {
    const result = await multiAgentChat({
      history: parsed.data.messages as ChatTurn[],
      clod,
      financeExpert,
      maxToolRounds: parsed.data.maxToolRounds,
      maxTokens: parsed.data.maxTokens,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      {
        error: "multi-agent chat failed",
        details: (e as Error).message,
      },
      { status: 502 }
    );
  }
}
