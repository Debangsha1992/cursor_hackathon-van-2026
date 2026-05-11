// strategyInterrogator: the agent layer that talks to other trading agents
// to understand their strategy *by talking to them*. It uses the vLLM
// finance reasoning model (DragonLLM/Qwen-Open-Finance-R-8B) as the
// interrogator and a pluggable `CounterpartySender` (typically the A2A
// outbound client) as the channel to the bot under audit.
//
// The orchestrator is a pure function: it accepts an `LlmChat` interface
// and a `CounterpartySender` interface, so it can be unit-tested with
// stubs. No I/O lives in this file.
//
// Safety: the system prompt forbids any "ready for live" / "deploy" /
// "guaranteed return" language, matching the project's `.cursor/rules/`
// conventions. A post-hoc sanitization pass redacts those phrases if they
// slip through.

import { z } from "zod";
import type { ChatMessage, ChatResult } from "./vllmClient";

/** Minimal interface the interrogator needs from the LLM client. */
export interface LlmChat {
  chat(opts: {
    messages: ChatMessage[];
    maxTokens?: number;
    temperature?: number;
    signal?: AbortSignal;
  }): Promise<Pick<ChatResult, "content" | "reasoning" | "model" | "latencyMs">>;
}

/** The transport the interrogator uses to ask the counterparty a question. */
export interface CounterpartySender {
  ask(question: string): Promise<string>;
}

export interface CounterpartyDescriptor {
  id: string;
  name: string;
  /** What the bot owner *claimed* the strategy is at registration. */
  declaredStrategyType: string | null;
}

export interface InterrogateOpts {
  counterparty: CounterpartyDescriptor;
  llm: LlmChat;
  sender: CounterpartySender;
  maxRounds?: number;
  /** Per-LLM-call max tokens. Reasoning models need plenty of headroom. */
  llmMaxTokens?: number;
  /** Optional abort signal to cancel the whole interrogation. */
  signal?: AbortSignal;
}

export interface TranscriptTurn {
  role: "interrogator" | "counterparty";
  text: string;
}

export interface StrategyUnderstanding {
  counterpartyId: string;
  counterpartyName: string;
  declaredStrategyType: string | null;
  inferredStrategyType: string | null;
  /** 0..1 — how well declared vs observed strategy match in the dialogue. */
  consistencyScore: number;
  edge: string;
  signalGeneration: string;
  positionSizing: string;
  riskManagement: string;
  exitCriteria: string;
  marketRegimeAssumption: string;
  failureModes: string[];
  redFlags: string[];
  notes: string;
  transcript: TranscriptTurn[];
  rounds: number;
  llmModel: string;
  totalLatencyMs: number;
  /**
   * True if any LLM call produced unparseable output and was substituted
   * with a deterministic question or final-summary template.
   */
  llmFallbackUsed: boolean;
}

const FORBIDDEN_PHRASES = [
  "ready for live",
  "deploy this bot",
  "guaranteed return",
  "profitable strategy",
];

const SUMMARY_SCHEMA = z.object({
  inferredStrategyType: z.string().nullable().optional(),
  consistencyScore: z.number().min(0).max(1).optional(),
  edge: z.string().optional(),
  signalGeneration: z.string().optional(),
  positionSizing: z.string().optional(),
  riskManagement: z.string().optional(),
  exitCriteria: z.string().optional(),
  marketRegimeAssumption: z.string().optional(),
  failureModes: z.array(z.string()).optional(),
  redFlags: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

const TURN_SCHEMA = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ask"), question: z.string().min(1) }),
  z.object({ action: z.literal("finish"), summary: SUMMARY_SCHEMA }),
]);

type TurnAction = z.infer<typeof TURN_SCHEMA>;

const SYSTEM_PROMPT = `You are the senior portfolio risk officer at PaperPilot AI.
Your job: interrogate an external trading bot and surface, in plain language,
how its strategy actually works, where it can fail, and whether the behavior
matches its declared strategy. You are NOT a coach for the bot. You are
auditing it on behalf of its owner.

Rules:
- Ask ONE focused question per turn. Avoid compound or vague questions.
- Lead with the most load-bearing question you have not asked yet.
- Cover: edge, signal generation, position sizing, stop-loss/exit, regime
  assumptions, failure modes, leverage, and consistency with declared
  strategy.
- Treat over-confident or hand-wavy answers as red flags. Probe them.
- Never recommend live deployment. Never say "ready for live", "deploy this
  bot", "guaranteed return", or "profitable strategy" — these are forbidden
  phrases.
- When you have enough signal (typically 4-7 rounds), emit a final summary.

Output protocol — every response MUST be a single JSON object, nothing
else, with one of these two shapes:

  {"action": "ask", "question": "<your next question, one sentence>"}

  {"action": "finish", "summary": {
     "inferredStrategyType": "<short label or null>",
     "consistencyScore": <0..1>,
     "edge": "<one sentence>",
     "signalGeneration": "<one sentence>",
     "positionSizing": "<one sentence>",
     "riskManagement": "<one sentence>",
     "exitCriteria": "<one sentence>",
     "marketRegimeAssumption": "<one sentence>",
     "failureModes": ["<short>", "..."],
     "redFlags": ["<UPPER_SNAKE_CODE>", "..."],
     "notes": "<2-4 sentence synthesis, no live-deploy language>"
  }}

Do not include markdown fences, prose, or commentary outside the JSON.`;

function buildOpeningUserPrompt(c: CounterpartyDescriptor): string {
  return [
    "You are about to interrogate the following bot:",
    `- bot id: ${c.id}`,
    `- bot name: ${c.name}`,
    `- declared strategy: ${c.declaredStrategyType ?? "(none)"}`,
    "",
    "Begin. Emit your first JSON action.",
  ].join("\n");
}

/**
 * Find the first balanced top-level JSON object inside a blob of text.
 * Reasoning models occasionally wrap their JSON in stray prose despite
 * instructions; this lets us recover instead of giving up.
 */
function extractFirstJsonObject(s: string): string | null {
  if (!s) return null;
  const start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function parseTurnAction(raw: string): TurnAction | null {
  const candidate = extractFirstJsonObject(raw);
  if (!candidate) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return null;
  }
  const result = TURN_SCHEMA.safeParse(parsed);
  return result.success ? result.data : null;
}

function sanitize(text: string): string {
  let out = text;
  for (const p of FORBIDDEN_PHRASES) {
    const re = new RegExp(p, "ig");
    out = out.replace(re, "[redacted: forbidden phrase]");
  }
  return out;
}

function defaultQuestionForRound(round: number): string {
  const QUESTIONS = [
    "What is your edge — what inefficiency do you exploit, in one sentence?",
    "Walk me through how a single buy signal gets generated, end to end.",
    "How do you size positions, and how does sizing change with confidence?",
    "Where do you place stop losses, and what makes you cancel a trade?",
    "What market regime do you assume, and how do you detect a regime shift?",
    "What are the two failure modes you worry about most?",
    "Can you give me one trade where you behaved inconsistently with your declared strategy?",
  ];
  return QUESTIONS[Math.min(round, QUESTIONS.length - 1)];
}

function buildFallbackSummary(
  c: CounterpartyDescriptor,
  transcript: TranscriptTurn[]
): z.infer<typeof SUMMARY_SCHEMA> {
  const counterpartyText = transcript
    .filter((t) => t.role === "counterparty")
    .map((t) => t.text)
    .join(" | ");
  return {
    inferredStrategyType: null,
    consistencyScore: 0,
    edge: "Not extractable — interrogator LLM unavailable.",
    signalGeneration: "Not extractable — interrogator LLM unavailable.",
    positionSizing: "Not extractable — interrogator LLM unavailable.",
    riskManagement: "Not extractable — interrogator LLM unavailable.",
    exitCriteria: "Not extractable — interrogator LLM unavailable.",
    marketRegimeAssumption: "Not extractable — interrogator LLM unavailable.",
    failureModes: [],
    redFlags: ["INTERROGATOR_LLM_FALLBACK"],
    notes: `Deterministic fallback summary. Raw counterparty answers: ${counterpartyText.slice(0, 800)}`,
  };
}

export async function interrogateAgent(
  opts: InterrogateOpts
): Promise<StrategyUnderstanding> {
  const { counterparty, llm, sender } = opts;
  const maxRounds = opts.maxRounds ?? 6;
  const llmMaxTokens = opts.llmMaxTokens ?? 1024;

  const transcript: TranscriptTurn[] = [];
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildOpeningUserPrompt(counterparty) },
  ];

  let totalLatencyMs = 0;
  let llmModel = "unknown";
  let fallbackUsed = false;
  let summary: z.infer<typeof SUMMARY_SCHEMA> | null = null;
  let round = 0;

  while (round < maxRounds && !summary) {
    if (opts.signal?.aborted) {
      throw new Error("interrogation aborted");
    }

    let action: TurnAction | null = null;
    let assistantTurnContent = "";
    try {
      const r = await llm.chat({
        messages,
        maxTokens: llmMaxTokens,
        temperature: 0.2,
        signal: opts.signal,
      });
      llmModel = r.model;
      totalLatencyMs += r.latencyMs;
      assistantTurnContent = r.content || r.reasoning || "";
      action = parseTurnAction(assistantTurnContent);
    } catch {
      action = null;
    }

    if (!action) {
      fallbackUsed = true;
      action = { action: "ask", question: defaultQuestionForRound(round) };
      assistantTurnContent = JSON.stringify(action);
    }
    messages.push({ role: "assistant", content: assistantTurnContent });

    if (action.action === "finish") {
      summary = action.summary;
      break;
    }

    const question = sanitize(action.question);
    transcript.push({ role: "interrogator", text: question });
    let answer = "";
    try {
      answer = await sender.ask(question);
    } catch (e) {
      answer = `[counterparty error: ${(e as Error).message}]`;
    }
    transcript.push({ role: "counterparty", text: answer });

    messages.push({
      role: "user",
      content: `Counterparty answered: ${answer}\n\nEmit your next JSON action (ask or finish).`,
    });
    round += 1;
  }

  if (!summary) {
    // Hit max rounds without a finish — force one final attempt at a summary.
    try {
      const r = await llm.chat({
        messages: [
          ...messages,
          {
            role: "user",
            content:
              'You have used your turn budget. Emit only a {"action":"finish","summary":{...}} JSON object.',
          },
        ],
        maxTokens: llmMaxTokens,
        temperature: 0.2,
        signal: opts.signal,
      });
      llmModel = r.model;
      totalLatencyMs += r.latencyMs;
      const action = parseTurnAction(r.content);
      if (action && action.action === "finish") {
        summary = action.summary;
      }
    } catch {
      /* fall through to deterministic */
    }
    if (!summary) {
      fallbackUsed = true;
      summary = buildFallbackSummary(counterparty, transcript);
    }
  }

  const declared = counterparty.declaredStrategyType;
  const inferred = summary.inferredStrategyType ?? null;
  return {
    counterpartyId: counterparty.id,
    counterpartyName: counterparty.name,
    declaredStrategyType: declared,
    inferredStrategyType: inferred,
    consistencyScore: summary.consistencyScore ?? 0,
    edge: sanitize(summary.edge ?? ""),
    signalGeneration: sanitize(summary.signalGeneration ?? ""),
    positionSizing: sanitize(summary.positionSizing ?? ""),
    riskManagement: sanitize(summary.riskManagement ?? ""),
    exitCriteria: sanitize(summary.exitCriteria ?? ""),
    marketRegimeAssumption: sanitize(summary.marketRegimeAssumption ?? ""),
    failureModes: summary.failureModes ?? [],
    redFlags: summary.redFlags ?? [],
    notes: sanitize(summary.notes ?? ""),
    transcript,
    rounds: round,
    llmModel,
    totalLatencyMs,
    llmFallbackUsed: fallbackUsed,
  };
}
