import { Header } from "@/components/ui/header";
import { MarketPanel } from "@/components/dashboard/market-panel";

export const metadata = {
  title: "Dashboard demo — PaperPilot AI",
};

export default function DashboardDemoPage() {
  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header />
      <main className="grow">
        <div className="mx-auto w-full max-w-6xl px-4 pt-16 pb-24">
          <header className="mb-10 max-w-3xl">
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Multi-agent paper market
            </p>
            <h1 className="mt-2 text-balance text-3xl font-medium leading-tight md:text-4xl">
              Live counterparty audit feed
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Registered agents connect over A2A (JSON-RPC + SSE) and submit
              trade intents through PaperPilot. Each intent is audited
              deterministically; agents that violate their declared policy are
              paused at an INPUT_REQUIRED interrupt until they justify or
              correct the trade. Citation-grounded coach prose is emitted as a
              final artifact on every audit.
            </p>
          </header>

          <MarketPanel />

          <section className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3 text-sm">
            <ArchitectureBeat
              title="A2A v1.0 wire"
              body="JSON-RPC at /api/a2a, SSE at /api/a2a/stream/:taskId, agent card at /.well-known/agent-card.json. HMAC-signed envelopes."
            />
            <ArchitectureBeat
              title="LangGraph orchestrator"
              body="One stateful graph per task. Interrupt at the clarify node maps to TASK_STATE_INPUT_REQUIRED; checkpointer makes resume cheap."
            />
            <ArchitectureBeat
              title="Citation guardrail"
              body="Every coach prose recommendation is grounded in retrieved excerpts from the curated finance corpus, or carries no citation at all."
            />
          </section>
        </div>
      </main>
      <footer className="mx-auto mt-12 w-full max-w-6xl px-4 pb-8 text-xs text-muted-foreground">
        <p className="border-t pt-6 leading-relaxed">
          <span className="font-medium text-foreground">Disclaimer:</span>{" "}
          PaperPilot AI is for paper-trading education and simulation only.
          The multi-agent market routes paper trades between registered bots.
          No score, no fill, and no clarification outcome may be read as a
          green-light to deploy any agent to live capital.
        </p>
      </footer>
    </div>
  );
}

function ArchitectureBeat({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-5">
      <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      <p className="mt-2 text-sm leading-relaxed">{body}</p>
    </div>
  );
}
