import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/ui/header";
import { getGlobalRegistry } from "@/lib/bots/registry";

const HACKATHON_USER_ID = "demo_user";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Direct API - PaperPilot AI",
};

export default async function ApiIntegrationPage({
  params,
}: {
  params: Promise<{ botId: string }>;
}) {
  const { botId } = await params;
  const registry = getGlobalRegistry();
  const record = await registry.get(botId);
  if (!record || record.ownerUserId !== HACKATHON_USER_ID) {
    notFound();
  }

  const snippet = `import { createHmac } from "node:crypto";

const BOT_ID = "${botId}";
const SECRET = process.env.PAPERPILOT_HMAC_SECRET; // saved at registration
const BODY = JSON.stringify({
  symbol: "BTCUSDT",
  assetType: "crypto",
  side: "buy",
  entryPrice: 65000,
  quantity: 0.01,
  stopLoss: 64000,
  takeProfit: 67000,
  strategyType: "${record.profile.strategyType}",
  signalReason: "EMA crossover with 1h trend confirmation",
  confidenceScore: 0.7,
  marketRegime: "trending",
});
const TS = Math.floor(Date.now() / 1000);
const SIG = createHmac("sha256", SECRET).update(\`\${TS}.\${BODY}\`).digest("hex");

await fetch("https://paperpilot.ai/api/bots/trades", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-paperpilot-bot-id": BOT_ID,
    "x-paperpilot-timestamp": String(TS),
    "x-paperpilot-signature": SIG,
  },
  body: BODY,
});`;

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header />
      <main className="grow">
        <div className="mx-auto w-full max-w-3xl px-4 pt-16 pb-24">
          <Link
            href={`/bots/${botId}/integrations`}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            ← Integrations
          </Link>
          <h1 className="mt-3 text-3xl font-medium leading-tight md:text-4xl">
            Direct API submission
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Sign every <span className="font-mono">POST /api/bots/trades</span>{" "}
            request with the HMAC secret you saved at registration. PaperPilot
            verifies <span className="font-mono">X-PaperPilot-Signature</span>{" "}
            against{" "}
            <span className="font-mono">HMAC-SHA256(`{`{timestamp}.{rawBody}`}`)</span>{" "}
            with a ±300s skew window.
          </p>

          <h2 className="mt-10 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            TypeScript example
          </h2>
          <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-card p-5 font-mono text-xs leading-relaxed">
            {snippet}
          </pre>

          <h2 className="mt-10 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Headers
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <span className="font-mono">X-PaperPilot-Bot-Id</span> -{" "}
              <span className="text-muted-foreground">your bot's id</span>
            </li>
            <li>
              <span className="font-mono">X-PaperPilot-Timestamp</span> -{" "}
              <span className="text-muted-foreground">Unix seconds; ±300s skew window</span>
            </li>
            <li>
              <span className="font-mono">X-PaperPilot-Signature</span> -{" "}
              <span className="text-muted-foreground">hex HMAC-SHA256 of `{`{timestamp}.{rawBody}`}`</span>
            </li>
          </ul>
        </div>
      </main>
    </div>
  );
}
