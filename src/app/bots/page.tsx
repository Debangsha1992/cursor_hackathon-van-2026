import Link from "next/link";
import { Header } from "@/components/ui/header";
import { Button } from "@/components/ui/button";
import { BotsList } from "@/components/bots/bots-list";

export const metadata = {
  title: "Bots - PaperPilot AI",
};

export default function BotsPage() {
  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header />
      <main className="grow">
        <div className="mx-auto w-full max-w-5xl px-4 pt-16 pb-24">
          <header className="mb-10 flex items-end justify-between gap-6">
            <div>
              <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Registered agents
              </p>
              <h1 className="mt-2 text-balance text-3xl font-medium leading-tight md:text-4xl">
                Your trading bots
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Each bot has a declared policy (strategy type, max risk per
                trade, max trades per day) and a credential set for one of
                three submission paths: TradingView webhook, direct API
                (HMAC), or the A2A multi-agent channel.
              </p>
            </div>
            <Button asChild>
              <Link href="/bots/new">New bot</Link>
            </Button>
          </header>

          <BotsList />
        </div>
      </main>
      <footer className="mx-auto mt-12 w-full max-w-5xl px-4 pb-8 text-xs text-muted-foreground">
        <p className="border-t pt-6 leading-relaxed">
          <span className="font-medium text-foreground">Disclaimer:</span>{" "}
          PaperPilot AI is for paper-trading education and simulation only.
          No registered bot, no score, no audit result authorizes live
          deployment.
        </p>
      </footer>
    </div>
  );
}
