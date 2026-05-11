import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/ui/header";
import { TradingViewSetup } from "@/components/bots/tradingview-setup";
import { getGlobalRegistry } from "@/lib/bots/registry";

const HACKATHON_USER_ID = "demo_user";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "TradingView - PaperPilot AI",
};

interface PageProps {
  params: Promise<{ botId: string }>;
}

export default async function TradingViewIntegrationPage({ params }: PageProps) {
  const { botId } = await params;
  const registry = getGlobalRegistry();
  const record = await registry.get(botId);
  if (!record || record.ownerUserId !== HACKATHON_USER_ID) {
    notFound();
  }

  const baseUrl = process.env.PAPERPILOT_PUBLIC_URL ?? "";
  const webhookUrl = `${baseUrl}/api/webhooks/tradingview`;

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header />
      <main className="grow">
        <div className="mx-auto w-full max-w-4xl px-4 pt-16 pb-24">
          <header className="mb-10">
            <Link
              href={`/bots/${botId}/integrations`}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              ← Integrations
            </Link>
            <p className="mt-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">
              {record.profile.botName} · {record.profile.botId}
            </p>
            <h1 className="mt-2 text-balance text-3xl font-medium leading-tight md:text-4xl">
              Wire up TradingView in three blocks
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Each block has a Copy button. Block A goes into TradingView's
              alert &quot;Webhook URL&quot; field, block B into &quot;Message&quot;,
              and block C is a Pine strategy template you can paste into
              TradingView's editor as a starting point.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Pine webhook alerts require a TradingView Pro+ subscription.
            </p>
          </header>

          <TradingViewSetup
            botId={botId}
            botName={record.profile.botName}
            strategyType={record.profile.strategyType}
            webhookUrl={webhookUrl}
            sharedSecret={record.tradingviewSharedSecret}
          />
        </div>
      </main>
    </div>
  );
}
