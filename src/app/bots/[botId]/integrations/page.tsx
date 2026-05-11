import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRightIcon,
  KeyRoundIcon,
  NetworkIcon,
  ZapIcon,
} from "lucide-react";
import { Header } from "@/components/ui/header";
import { getGlobalRegistry } from "@/lib/bots/registry";

const HACKATHON_USER_ID = "demo_user";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Integrations - PaperPilot AI",
};

interface PageProps {
  params: Promise<{ botId: string }>;
}

export default async function IntegrationsPage({ params }: PageProps) {
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
        <div className="mx-auto w-full max-w-5xl px-4 pt-16 pb-24">
          <header className="mb-10">
            <Link
              href="/bots"
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              ← Bots
            </Link>
            <p className="mt-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">
              {record.profile.botName} · {record.profile.botId}
            </p>
            <h1 className="mt-2 text-balance text-3xl font-medium leading-tight md:text-4xl">
              Pick an integration path
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              All three paths feed the same audit pipeline - same rule engine,
              same compliance score, same citation-grounded coach prose. They
              differ in how the agent reaches PaperPilot and how much trust
              PaperPilot extends to the submission.
            </p>
          </header>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <IntegrationCard
              href={`/bots/${botId}/integrations/tradingview`}
              icon={<ZapIcon className="size-5" />}
              recommended
              title="TradingView alert"
              tier="Shared secret"
              description="Audit a strategy you already wrote in Pine. Paste the webhook URL and the alert message body into TradingView - no code changes to your bot. Five-minute setup."
              cta="Set up TradingView"
            />
            <IntegrationCard
              href={`/bots/${botId}/integrations/api`}
              icon={<KeyRoundIcon className="size-5" />}
              title="Direct API"
              tier="HMAC-signed"
              description="Audit a custom-built bot. Sign POST /api/bots/trades requests with the HMAC secret you saved at registration. Full trust tier."
              cta="View API docs"
            />
            <IntegrationCard
              href={`/bots/${botId}/integrations/a2a`}
              icon={<NetworkIcon className="size-5" />}
              title="A2A streaming"
              tier="HMAC-signed"
              description="Connect a multi-agent system. JSON-RPC + Server-Sent Events with bidirectional clarification interrupts. For LangGraph / OpenAI Agents SDK / AutoGen / CrewAI agents."
              cta="View AgentCard"
            />
          </section>

          <PolicyRecap profile={record.profile} />
        </div>
      </main>
    </div>
  );
}

interface CardProps {
  href: string;
  icon: React.ReactNode;
  title: string;
  tier: string;
  description: string;
  cta: string;
  recommended?: boolean;
}

function IntegrationCard({
  href,
  icon,
  title,
  tier,
  description,
  cta,
  recommended,
}: CardProps) {
  return (
    <Link
      href={href}
      className={
        recommended
          ? "group relative flex flex-col rounded-lg border-2 border-primary bg-card p-5 transition-colors hover:bg-accent"
          : "group flex flex-col rounded-lg border border-border bg-card p-5 transition-colors hover:bg-accent"
      }
    >
      {recommended ? (
        <span className="absolute -top-2 left-4 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary-foreground">
          Recommended
        </span>
      ) : null}
      <div className="flex size-10 items-center justify-center rounded-md border bg-background">
        {icon}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <h3 className="text-base font-medium">{title}</h3>
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
          {tier}
        </span>
      </div>
      <p className="mt-2 grow text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      <p className="mt-6 inline-flex items-center text-sm font-medium">
        {cta}
        <ArrowRightIcon className="ml-1 size-4 transition-transform group-hover:translate-x-0.5" />
      </p>
    </Link>
  );
}

function PolicyRecap({
  profile,
}: {
  profile: {
    botName: string;
    strategyType: string;
    maxRiskPerTradePercent: number;
    maxTradesPerDay: number;
    maxAllowedDrawdownPercent: number;
    botType: string;
  };
}) {
  return (
    <section className="mt-12 rounded-lg border border-border/60 bg-card/40 p-5">
      <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Declared policy
      </h2>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-4">
        <Stat label="Strategy" value={profile.strategyType.replace(/_/g, " ")} />
        <Stat label="Max risk / trade" value={`${profile.maxRiskPerTradePercent}%`} />
        <Stat label="Max trades / day" value={String(profile.maxTradesPerDay)} />
        <Stat label="Max drawdown" value={`${profile.maxAllowedDrawdownPercent}%`} />
        <Stat label="Bot type" value={profile.botType.replace(/_/g, " ")} />
      </dl>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 font-mono">{value}</dd>
    </div>
  );
}
