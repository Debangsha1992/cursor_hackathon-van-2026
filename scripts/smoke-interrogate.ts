// End-to-end smoke test for the agent layer:
//
//  1. Spin up a tiny "counterparty bot" HTTP server on localhost:4444 that
//     publishes an A2A agent-card at /.well-known/agent-card.json and
//     answers JSON-RPC `message/send` calls with canned strategy
//     descriptions.
//  2. POST /api/agents/interrogate on the local Next dev server, asking
//     it to interrogate the stub.
//  3. Print the resulting StrategyUnderstanding and shut everything down.
//
// Requires: dev server running on http://localhost:3001 (or pass NEXT_URL).
// Requires: OPENAI_* env vars in .env.local pointing at the vLLM endpoint.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const COUNTERPARTY_PORT = 4444;
const NEXT_URL = process.env.NEXT_URL ?? "http://localhost:3001";
const COUNTERPARTY_URL = `http://localhost:${COUNTERPARTY_PORT}`;

const STRATEGY_ANSWERS: Array<(q: string) => string> = [
  () =>
    "My edge is medium-term trend persistence on liquid crypto majors; I exploit autocorrelation in 4h returns after a regime-confirmed breakout.",
  () =>
    "Signal generation: a 20/50 EMA crossover gated by ADX>22 on 4h, with a volume-z>1 filter on the breakout bar, only when realized vol is below the 80th percentile.",
  () =>
    "Position sizing: volatility-targeted at 0.5% portfolio risk per trade, where stop distance is 1.5 ATR(14); confidence below 0.6 reduces size by half.",
  () =>
    "Stops: hard ATR-multiple stop at entry, then chandelier-trail; I cancel the trade if ADX falls below 18 before the entry triggers.",
  () =>
    "Regime: I assume a trending or weakly-trending regime; I detect regime shifts by a 30-day rolling Hurst exponent dropping under 0.5 for two consecutive days.",
  () =>
    "Failure modes: whipsaws in a sudden chop after macro releases, and slippage at signal-flip when liquidity thins on the second leg.",
  () =>
    "One inconsistency: in March I let confidence push size to 1.2% on a high-conviction breakout that violated my own 0.5% cap. The trade made money but was a clear policy violation.",
];

function jsonRpcSuccess(id: unknown, result: unknown) {
  return JSON.stringify({ jsonrpc: "2.0", id, result });
}

function startCounterparty(): Promise<{ close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    let askIdx = 0;
    const server = createServer(
      async (req: IncomingMessage, res: ServerResponse) => {
        try {
          if (req.method === "GET" && req.url === "/.well-known/agent-card.json") {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(
              JSON.stringify({
                protocolVersion: "1.0.0",
                name: "PolyClaw Trend Bot",
                description: "Stub counterparty for the interrogate smoke test.",
                version: "0.0.1",
                url: `${COUNTERPARTY_URL}/api/a2a`,
                defaultInputModes: ["application/json"],
                defaultOutputModes: ["application/json"],
                capabilities: {
                  streaming: false,
                  pushNotifications: false,
                  extendedAgentCard: false,
                },
                skills: [
                  {
                    id: "describe_strategy",
                    name: "Describe strategy",
                    description: "Answer questions about my strategy.",
                    inputModes: ["application/json"],
                    outputModes: ["application/json"],
                    tags: ["paper-trading"],
                  },
                ],
                securitySchemes: {},
                preferredTransport: "JSONRPC",
              })
            );
            return;
          }

          if (req.method === "POST" && req.url === "/api/a2a") {
            const chunks: Buffer[] = [];
            for await (const c of req) chunks.push(c as Buffer);
            const body = JSON.parse(Buffer.concat(chunks).toString());
            const question = body?.params?.message?.parts?.[0]?.text ?? "";
            const answerFn =
              STRATEGY_ANSWERS[Math.min(askIdx, STRATEGY_ANSWERS.length - 1)];
            askIdx += 1;
            const answer = answerFn(question);
            res.writeHead(200, { "content-type": "application/json" });
            res.end(
              jsonRpcSuccess(body.id, {
                id: `task-${askIdx}`,
                contextId: body?.params?.message?.contextId ?? "ctx",
                status: { state: "TASK_STATE_COMPLETED" },
                artifacts: [
                  {
                    artifactId: `a-${askIdx}`,
                    parts: [{ kind: "text", text: answer }],
                  },
                ],
                history: [
                  {
                    messageId: `m-q-${askIdx}`,
                    role: "ROLE_USER",
                    parts: [{ kind: "text", text: question }],
                  },
                  {
                    messageId: `m-a-${askIdx}`,
                    role: "ROLE_AGENT",
                    parts: [{ kind: "text", text: answer }],
                  },
                ],
              })
            );
            return;
          }

          res.writeHead(404).end("not found");
        } catch (e) {
          res.writeHead(500).end((e as Error).message);
        }
      }
    );
    server.listen(COUNTERPARTY_PORT, () => {
      console.log(`counterparty stub listening on ${COUNTERPARTY_URL}`);
      resolve({
        close: () =>
          new Promise<void>((r, x) =>
            server.close((err) => (err ? x(err) : r()))
          ),
      });
    });
    server.on("error", reject);
  });
}

async function main() {
  const stub = await startCounterparty();
  try {
    const url = `${NEXT_URL}/api/agents/interrogate`;
    console.log(`POST ${url}`);
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        counterparty: {
          id: "polyclaw-trend",
          name: "PolyClaw Trend Bot",
          declaredStrategyType: "trend_following",
          agentBaseUrl: COUNTERPARTY_URL,
        },
        maxRounds: 4,
        llmMaxTokens: 768,
      }),
    });
    const body = await res.text();
    console.log(`HTTP ${res.status}`);
    let pretty = body;
    try {
      pretty = JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      /* leave as-is */
    }
    console.log(pretty);
  } finally {
    await stub.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
