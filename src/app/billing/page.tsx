import { redirect } from "next/navigation";
import { CheckCircle2Icon } from "lucide-react";

import { Header } from "@/components/ui/header";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { UpgradeButton } from "./upgrade-button";

export const metadata = {
  title: "Upgrade — PaperPilot AI",
};

interface BillingPageProps {
  searchParams: Promise<{ status?: string }>;
}

// /billing is the "free-tier-cap-reached" landing surface — usageGate.ts
// hands out this URL as the upgrade target. Auth-gated so we always have a
// userId to attach to the AllScale checkout intent.
export default async function BillingPage({ searchParams }: BillingPageProps) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=/billing");
  }

  const sp = await searchParams;

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header />
      <main className="grow">
        <div className="mx-auto w-full max-w-3xl px-4 pt-16 pb-24">
          <header className="mb-10">
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Upgrade
            </p>
            <h1 className="mt-2 text-balance text-3xl font-medium leading-tight md:text-4xl">
              Unlock the Pro tier
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              You&apos;ve hit the free-tier audit cap. Pay once with AllScale
              Checkout (settles in USDT or USDC on testnet) and your account
              jumps from 5 audits/month to 100 audits/month, with multi-agent
              market access and persistent audit history.
            </p>
          </header>

          <section className="rounded-xl border border-border/60 bg-card/40 p-6">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <h2 className="text-lg font-medium">PaperPilot AI — Pro</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  One-time activation, billed via AllScale Checkout on testnet
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-3xl font-medium">$10</p>
                <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  USD · 1× USDT on AllScale
                </p>
              </div>
            </div>

            <ul className="mt-6 space-y-2 text-sm">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-foreground" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <div className="mt-6 border-t border-border/60 pt-6">
              <UpgradeButton searchStatus={sp?.status ?? null} />
              <p className="mt-3 text-xs text-muted-foreground">
                You&apos;ll be redirected to{" "}
                <span className="font-mono">checkout.allscale.io</span> to
                complete payment. The checkout intent is signed server-side with
                HMAC-SHA256, replay-protected, and tied to your user id (
                <span className="font-mono">{user.id.slice(0, 8)}…</span>).
              </p>
            </div>
          </section>

          <section className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 text-xs text-muted-foreground">
            <div className="rounded-md border border-border/60 bg-card/30 p-4">
              <p className="font-mono uppercase tracking-wider text-foreground/80">
                Network
              </p>
              <p className="mt-1">
                Testnet (AllScale sandbox). Switch to the production host by
                setting <span className="font-mono">ALLSCALE_API_BASE_URL</span>{" "}
                in your deploy environment.
              </p>
            </div>
            <div className="rounded-md border border-border/60 bg-card/30 p-4">
              <p className="font-mono uppercase tracking-wider text-foreground/80">
                Settlement
              </p>
              <p className="mt-1">
                USD-priced order, FX-converted to the resolved settlement coin
                (USDT by default, USDC available) at the rate AllScale publishes
                with the checkout intent.
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

const features = [
  "100 audits/month (vs. 5 on free)",
  "Persistent audit history with citation-grounded coach prose",
  "Multi-agent paper market access + A2A trade intake",
  "Priority routing through Clōd + the DragonLLM finance expert",
  "Full TradingView Pine-alert audit webhooks",
];
