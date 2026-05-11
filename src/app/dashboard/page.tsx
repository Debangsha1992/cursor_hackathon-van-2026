import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheckIcon, ArrowRightIcon } from "lucide-react";

import { Header } from "@/components/ui/header";
import { AssistantRail } from "@/components/dashboard/assistant-rail";
import { KpiStrip } from "@/components/dashboard/kpi-strip";
import { ScoreChart } from "@/components/dashboard/score-chart";
import { Scorecards } from "@/components/dashboard/scorecards";
import { Tape } from "@/components/dashboard/tape";
import { ScorecardsProvider } from "@/components/dashboard/scorecards-provider";
import { Button } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Dashboard — PaperPilot AI",
};

export default async function DashboardPage() {
  // Gate the audit feed behind auth. Unauthenticated visitors bounce to the
  // login screen with ?next=/dashboard so the server action can route them
  // back here after they sign in.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=/dashboard");
  }

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header />
      <main className="grow">
        <div className="mx-auto w-full max-w-6xl px-4 pt-16 pb-24">
          <header className="mb-10 max-w-3xl">
            <p className="text-muted-foreground font-mono text-xs uppercase tracking-wider">
              Multi-agent paper market
            </p>
            <h1 className="mt-2 text-balance text-3xl font-medium leading-tight md:text-4xl">
              Live counterparty audit feed
            </h1>
            <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
              Registered agents connect over A2A (JSON-RPC + SSE) and submit
              trade intents through PaperPilot. Each intent is audited
              deterministically; agents that violate their declared policy are
              paused at an INPUT_REQUIRED interrupt until they justify or
              correct the trade.
            </p>
          </header>

          <section className="border-border/60 bg-card/40 mb-10 flex flex-col gap-4 rounded-lg border p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="bg-background/40 flex aspect-square size-10 items-center justify-center rounded-md border shadow-sm">
                <ShieldCheckIcon className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium">Upgrade to Pro — $10</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Pay $10 USD on AllScale testnet (settles in USDT/USDC) and
                  unlock 100 audits/month, A2A market access, and persistent
                  history.
                </p>
              </div>
            </div>
            <Button asChild>
              <Link href="/billing">
                Upgrade
                <ArrowRightIcon className="ml-2 size-4" />
              </Link>
            </Button>
          </section>

          {/*
           * 12-col dashboard grid.
           *   cols 1..8  : KPI strip + score chart + (tape | scorecards)
           *   cols 9..12 : sticky AssistantRail
           * Single column stacked on < lg.
           *
           * KpiStrip + ScoreChart + Scorecards all share one polling source
           * (ScorecardsProvider) so we don't fan out three identical fetches.
           */}
          <ScorecardsProvider>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="flex flex-col gap-6 lg:col-span-8">
                <KpiStrip />
                <ScoreChart />
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <Tape />
                  <Scorecards />
                </div>
              </div>
              <div className="lg:col-span-4">
                <AssistantRail />
              </div>
            </div>
          </ScorecardsProvider>

          <section className="mt-12 grid grid-cols-1 gap-6 text-sm md:grid-cols-3">
            <ArchitectureBeat
              title="Multi-agent LLM stack"
              body="Clōd (api.clod.io, OpenAI-compatible) is the generic conversational layer; Lightning AI vLLM (DragonLLM/Qwen-Open-Finance-R-8B) is the Pine Script & strategy expert, consulted as a tool."
            />
            <ArchitectureBeat
              title="A2A v1.0 wire"
              body="JSON-RPC at /api/a2a, SSE at /api/a2a/stream/:taskId, agent card at /.well-known/agent-card.json. HMAC-signed envelopes."
            />
            <ArchitectureBeat
              title="Citation guardrail"
              body="Every coach prose recommendation is grounded in retrieved excerpts from the curated finance corpus, or carries no citation at all."
            />
          </section>
        </div>
      </main>
      <footer className="text-muted-foreground mx-auto mt-12 w-full max-w-6xl px-4 pb-8 text-xs">
        <p className="border-t pt-6 leading-relaxed">
          <span className="text-foreground font-medium">Disclaimer:</span>{" "}
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
    <div className="border-border/60 bg-card/40 rounded-lg border p-5">
      <h4 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
        {title}
      </h4>
      <p className="mt-2 text-sm leading-relaxed">{body}</p>
    </div>
  );
}
