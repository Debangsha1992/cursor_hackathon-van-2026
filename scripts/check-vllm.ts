// Live smoke test for the vLLM agent layer. Reads OPENAI_* env vars,
// asks the model two short questions (one to verify the chat path,
// one to verify the reasoning-split), prints the result.
//
// Run: pnpm tsx scripts/check-vllm.ts   (or)   npx tsx scripts/check-vllm.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chat, loadVllmConfigFromEnv } from "../src/lib/llm/vllmClient";

function loadEnvLocal() {
  try {
    const text = readFileSync(resolve(__dirname, "../.env.local"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    /* fine */
  }
}

async function main() {
  loadEnvLocal();
  const config = loadVllmConfigFromEnv();
  console.log(`base=${config.baseUrl} model=${config.model}`);

  const r = await chat(config, {
    messages: [
      {
        role: "system",
        content:
          "You are a senior portfolio risk officer. Answer in one sentence.",
      },
      {
        role: "user",
        content:
          "Define 'meta-labeling' as used in López de Prado's Advances in Financial Machine Learning.",
      },
    ],
    maxTokens: 512,
    temperature: 0.1,
  });

  console.log(`\n--- finish_reason: ${r.finishReason} ---`);
  console.log(`reasoning chars: ${r.reasoning.length}`);
  console.log(`content chars:   ${r.content.length}`);
  console.log(`latency:         ${r.latencyMs} ms`);
  console.log(`tokens:          prompt=${r.promptTokens} out=${r.completionTokens}`);
  console.log("\n--- content ---\n" + r.content);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
