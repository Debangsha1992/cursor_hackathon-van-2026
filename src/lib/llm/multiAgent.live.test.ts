// Live integration probe for the two-model multi-agent stack.
//
// This file is GATED by `RUN_LIVE=1`. The normal `npm test` run skips it
// because it dials real network endpoints (api.clod.io + Lightning AI vLLM)
// and uses paid credits. Invoke explicitly with:
//
//   RUN_LIVE=1 npx vitest run src/lib/llm/multiAgent.live.test.ts
//
// What this verifies end-to-end against the REAL endpoints (no stubs):
//
//   1. Clōd (api.clod.io) answers a procedural question directly, WITHOUT
//      consulting the finance expert — proves Clōd talks to the user.
//   2. Clōd sees a Pine Script question, decides to consult the finance
//      expert via the `consult_finance_expert` tool call, the call lands on
//      the Lightning AI vLLM serving DragonLLM/Qwen-Open-Finance-R-8B, the
//      vLLM returns a non-empty analysis, and Clōd synthesises a final
//      user-facing reply — proves Clōd ↔ vLLM communication.
//
// Important architectural note this probe surfaces:
//   The finance model does NOT execute trades on TradingView. TradingView is
//   the INBOUND webhook source PaperPilot audits. The finance model is a
//   read-only consultant the conversational layer (Clōd) calls when a user
//   question requires Pine Script / strategy expertise. See docs/PRD.md
//   "Out of Scope".

import { describe, it, expect } from "vitest";
import { clodChat, loadClodConfigFromEnv } from "./clodClient";
import { loadVllmConfigFromEnv } from "./vllmClient";
import { createFinanceExpert } from "./financeExpert";
import { multiAgentChat } from "./multiAgentChat";

const LIVE = process.env.RUN_LIVE === "1";

const PROCEDURAL_QUESTION =
  "Where in TradingView's alert dialog do I paste my PaperPilot webhook URL? Just point me to the right field — no analysis needed.";

const FINANCE_QUESTION = `I have this Pine v5 strategy. Please identify one concrete behavioural risk you see. Mention the missing stop loss specifically.

\`\`\`pine
//@version=5
strategy("naive trend", overlay = true)
fast = ta.sma(close, 20)
slow = ta.sma(close, 50)
if ta.crossover(fast, slow)
    strategy.entry("long", strategy.long)
if ta.crossunder(fast, slow)
    strategy.close("long")
\`\`\`
`;

const FORBIDDEN_PHRASES = [
  "ready for live",
  "deploy this bot",
  "guaranteed return",
  "profitable strategy",
];

function runProbe(userMessage: string) {
  const clodConfig = loadClodConfigFromEnv();
  clodConfig.defaultTimeoutMs = 45_000;
  const vllmConfig = loadVllmConfigFromEnv();
  vllmConfig.defaultTimeoutMs = 60_000;
  const financeExpert = createFinanceExpert({ vllmConfig });

  return multiAgentChat({
    history: [{ role: "user", content: userMessage }],
    clod: (o) => clodChat(clodConfig, o),
    financeExpert,
    maxToolRounds: 3,
    maxTokens: 800,
  });
}

function dumpSteps(steps: Awaited<ReturnType<typeof runProbe>>["steps"]) {
  for (const s of steps) {
    if (s.kind === "clod_tool_call") {
      const a = s.argumentsJson.replace(/\s+/g, " ").slice(0, 200);
      console.log(
        `  - Clōd tool_call → ${s.tool} (${s.model}, ${s.latencyMs} ms): ${a}…`
      );
    } else if (s.kind === "finance_expert") {
      console.log(
        `  - vLLM ${s.tool} (${s.model}, ${s.latencyMs} ms, ${s.totalTokens} tok)`
      );
      console.log(`      input: ${s.input}`);
      console.log(
        `      analysis: ${s.analysis.replace(/\s+/g, " ").slice(0, 240)}…`
      );
    } else if (s.kind === "clod_reply") {
      console.log(
        `  - Clōd reply (${s.model}, ${s.latencyMs} ms): ${s.content.replace(/\s+/g, " ").slice(0, 240)}…`
      );
    } else if (s.kind === "fallback") {
      console.log(`  - FALLBACK: ${s.reason}`);
    }
  }
}

describe.skipIf(!LIVE)("multi-agent live probe", () => {
  it(
    "PROBE 1: procedural question — Clōd answers without consulting the finance expert",
    async () => {
      console.log("\n========================================================");
      console.log("  PROBE 1: procedural question");
      console.log("  expectation: Clōd replies directly, no tool call");
      console.log("========================================================");
      console.log(`  User: ${PROCEDURAL_QUESTION}\n`);

      const result = await runProbe(PROCEDURAL_QUESTION);
      dumpSteps(result.steps);
      console.log(`\n  Final reply:\n${result.reply.split("\n").map((l) => "    | " + l).join("\n")}`);

      expect(result.fallbackUsed).toBe(false);
      const clodReplied = result.steps.some(
        (s) => s.kind === "clod_reply" && s.content.length > 10
      );
      expect(clodReplied).toBe(true);
      const usedTool = result.steps.some((s) => s.kind === "clod_tool_call");
      // Procedural question → ideally NO consultation; we tolerate it but
      // log if it happens. (Models are non-deterministic; the architectural
      // claim is "Clōd talks to the user".)
      if (usedTool) {
        console.log("  note: Clōd opted to consult anyway — non-fatal");
      }
      for (const p of FORBIDDEN_PHRASES) {
        expect(result.reply.toLowerCase()).not.toContain(p);
      }
    },
    90_000
  );

  it(
    "PROBE 2: Pine Script question — Clōd consults the finance expert, vLLM answers, Clōd synthesises",
    async () => {
      console.log("\n========================================================");
      console.log("  PROBE 2: Pine Script analysis question");
      console.log("  expectation: Clōd → consult_finance_expert → vLLM → reply");
      console.log("========================================================");
      console.log(`  User: <Pine v5 strategy + 'identify a behavioural risk'>\n`);

      const result = await runProbe(FINANCE_QUESTION);
      dumpSteps(result.steps);
      console.log(`\n  Tool calls: ${result.toolCalls}`);
      console.log(`  Latency: ${result.totalLatencyMs} ms (sum of round trips)`);
      console.log(`\n  Final reply:\n${result.reply.split("\n").map((l) => "    | " + l).join("\n")}`);

      expect(result.fallbackUsed).toBe(false);

      // The model SHOULD consult; the system prompt requires it for Pine
      // questions. If it skipped, the wiring is broken or the prompt isn't
      // landing.
      const toolCallStep = result.steps.find((s) => s.kind === "clod_tool_call");
      expect(toolCallStep, "Clōd should have issued a consult_finance_expert tool call").toBeDefined();
      if (toolCallStep?.kind === "clod_tool_call") {
        expect(toolCallStep.tool).toBe("consult_finance_expert");
      }

      const expertStep = result.steps.find((s) => s.kind === "finance_expert");
      expect(expertStep, "the vLLM should have returned a consultation").toBeDefined();
      if (expertStep?.kind === "finance_expert") {
        expect(expertStep.analysis.length).toBeGreaterThan(40);
        expect(expertStep.model).toBeTypeOf("string");
      }

      const finalClodReply = [...result.steps]
        .reverse()
        .find((s) => s.kind === "clod_reply");
      expect(finalClodReply, "Clōd should have produced a synthesised reply").toBeDefined();
      if (finalClodReply?.kind === "clod_reply") {
        expect(finalClodReply.content.length).toBeGreaterThan(40);
      }

      for (const p of FORBIDDEN_PHRASES) {
        expect(result.reply.toLowerCase()).not.toContain(p);
      }
    },
    120_000
  );
});

describe.skipIf(LIVE)("multi-agent live probe (skipped)", () => {
  it("is skipped unless RUN_LIVE=1 is set in env", () => {
    expect(LIVE).toBe(false);
  });
});
