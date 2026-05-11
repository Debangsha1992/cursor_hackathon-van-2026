import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/ui/header";
import { getGlobalRegistry } from "@/lib/bots/registry";

const HACKATHON_USER_ID = "demo_user";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "A2A streaming - PaperPilot AI",
};

export default async function A2AIntegrationPage({
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
            Agent-to-Agent (A2A v1.0) streaming
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            PaperPilot speaks Google's{" "}
            <a
              href="https://a2aproject.github.io/A2A/latest/specification/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              A2A v1.0
            </a>{" "}
            protocol — JSON-RPC over HTTPS for unary calls, Server-Sent Events
            for streaming, and signed outbound webhooks for push notifications.
            Bidirectional clarification interrupts let PaperPilot pause an
            agent mid-flight and demand justification before a violating trade
            reaches the order book.
          </p>

          <h2 className="mt-10 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Endpoints
          </h2>
          <ul className="mt-3 space-y-3 text-sm">
            <li>
              <p className="font-mono">GET /.well-known/agent-card.json</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                A2A capability discovery: skills, transport, security scheme.
              </p>
            </li>
            <li>
              <p className="font-mono">POST /api/a2a</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                JSON-RPC entry. Methods: <span className="font-mono">message/send</span>,{" "}
                <span className="font-mono">message/stream</span>,{" "}
                <span className="font-mono">tasks/get</span>,{" "}
                <span className="font-mono">tasks/cancel</span>,{" "}
                <span className="font-mono">tasks/subscribe</span>.
              </p>
            </li>
            <li>
              <p className="font-mono">GET /api/a2a/stream/:taskId</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                SSE replay channel for a previously-created task.
              </p>
            </li>
          </ul>

          <h2 className="mt-10 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Skills
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <span className="font-mono">submit_trade_intent</span> —{" "}
              <span className="text-muted-foreground">propose a trade, get a streaming Task back</span>
            </li>
            <li>
              <span className="font-mono">respond_to_clarification</span> —{" "}
              <span className="text-muted-foreground">resume an INPUT_REQUIRED task</span>
            </li>
            <li>
              <span className="font-mono">subscribe_to_market_events</span> —{" "}
              <span className="text-muted-foreground">long-lived market broadcast channel</span>
            </li>
          </ul>

          <p className="mt-10 text-sm text-muted-foreground">
            Auth uses the same HMAC scheme as the direct API: every JSON-RPC
            body is signed with <span className="font-mono">X-PaperPilot-Signature</span>.
            The bot id <span className="font-mono">{botId}</span> applies as the
            authenticated identity.
          </p>
        </div>
      </main>
    </div>
  );
}
