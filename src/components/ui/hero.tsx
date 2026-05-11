"use client";

import {
  ActivityIcon,
  ArrowRightIcon,
  PlayIcon,
  ShieldCheckIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function HeroSection() {
  return (
    <section className="relative mx-auto w-full max-w-5xl overflow-hidden pt-16">
      {/* Ambient shades */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 size-full overflow-hidden"
      >
        <div
          className={cn(
            "absolute inset-0",
            "bg-[radial-gradient(20%_80%_at_20%_0%,hsl(var(--foreground)/0.08),transparent)]",
          )}
        />
        <div
          className={cn(
            "absolute inset-x-0 top-0 h-[480px]",
            "bg-grid-fade opacity-60 dark:opacity-30",
          )}
        />
      </div>

      <div className="relative z-10 flex max-w-2xl flex-col gap-5 px-4">
        <a
          className={cn(
            "group flex w-fit items-center gap-3 rounded-sm border bg-card p-1 shadow-xs",
            "fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards transition-all delay-500 duration-500 ease-out",
          )}
          href="#link"
        >
          <div className="rounded-xs border bg-card px-1.5 py-0.5 shadow-sm">
            <p className="font-mono text-xs">NEW</p>
          </div>

          <span className="text-xs">
            paper-trading audits for AI agents — no live execution
          </span>
          <span className="block h-5 border-l" />

          <div className="pr-1">
            <ArrowRightIcon className="size-3 -translate-x-0.5 duration-150 ease-out group-hover:translate-x-0.5" />
          </div>
        </a>

        <h1
          className={cn(
            "text-balance font-semibold text-4xl text-foreground leading-tight md:text-5xl tracking-tight",
            "fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards delay-100 duration-500 ease-out",
          )}
        >
          Score whether your trading agent{" "}
          <span className="text-muted-foreground">obeys its own rules.</span>
        </h1>

        <p
          className={cn(
            "text-muted-foreground text-sm tracking-wide sm:text-lg md:text-xl",
            "fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards delay-200 duration-500 ease-out",
          )}
        >
          PaperPilot AI is a behavior-audit and discipline-coach environment for
          AI trading agents. Submit paper trades, get a deterministic compliance
          score, explicit violation codes, and a persistent audit trail —
          <br className="hidden md:inline" />
          never a green-light to deploy.
        </p>

        <div className="fade-in slide-in-from-bottom-10 flex w-fit animate-in items-center justify-center gap-3 fill-mode-backwards pt-2 delay-300 duration-500 ease-out">
          <Button variant="outline">
            <PlayIcon className="size-4 mr-2" data-icon="inline-start" />
            Watch demo
          </Button>
          <Button>
            Register a bot
            <ArrowRightIcon className="size-4 ml-2" data-icon="inline-end" />
          </Button>
        </div>

        <div className="fade-in slide-in-from-bottom-10 flex flex-wrap items-center gap-x-4 gap-y-2 pt-3 text-xs text-muted-foreground animate-in fill-mode-backwards delay-500 duration-500 ease-out">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheckIcon className="size-3.5" /> HMAC-signed intake
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ActivityIcon className="size-3.5" /> Deterministic scoring
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Paper trading only — no live execution
          </span>
        </div>
      </div>

      <div className="relative">
        <div
          className={cn(
            "absolute -inset-x-20 inset-y-0 -translate-y-1/3 scale-110 rounded-full",
            "bg-[radial-gradient(ellipse_at_center,hsl(var(--foreground)/0.10),transparent,transparent)]",
            "blur-[60px]",
          )}
        />
        <div
          className={cn(
            "relative mt-8 -mr-56 overflow-hidden px-2 sm:mt-12 sm:mr-0 md:mt-20",
            "fade-in slide-in-from-bottom-5 animate-in fill-mode-backwards delay-100 duration-1000 ease-out",
          )}
          style={{
            maskImage:
              "linear-gradient(to bottom, black 0%, black 60%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, black 0%, black 60%, transparent 100%)",
          }}
        >
          <div className="relative mx-auto max-w-5xl overflow-hidden rounded-lg border bg-background p-2 shadow-xl ring-1 ring-card">
            <DashboardMock />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * A self-contained, theme-aware mock of the PaperPilot dashboard.
 * Replaces the static light/dark screenshot pair from the source design,
 * so the hero artwork respects the active theme automatically.
 */
function DashboardMock() {
  return (
    <div className="aspect-video w-full rounded-lg border bg-card text-card-foreground overflow-hidden">
      {/* Window chrome */}
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-red-400/70" />
          <span className="size-2.5 rounded-full bg-amber-400/70" />
          <span className="size-2.5 rounded-full bg-emerald-400/70" />
        </div>
        <div className="rounded-md border bg-muted/50 px-3 py-0.5 text-[11px] font-mono text-muted-foreground">
          paperpilot.ai/dashboard
        </div>
        <div className="w-10" />
      </div>

      <div className="grid h-[calc(100%-2.6rem)] grid-cols-12 gap-3 p-3">
        {/* Sidebar */}
        <aside className="col-span-3 flex flex-col gap-1 rounded-md border bg-background p-2">
          <div className="px-2 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            Bots
          </div>
          {[
            { name: "polyclaw-demo", active: true },
            { name: "gridhawk-v3", active: false },
            { name: "mean-revert-7", active: false },
          ].map((b) => (
            <div
              key={b.name}
              className={cn(
                "flex items-center justify-between rounded px-2 py-1.5 text-xs",
                b.active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground",
              )}
            >
              <span className="font-mono">{b.name}</span>
              {b.active ? (
                <span className="size-1.5 rounded-full bg-emerald-500" />
              ) : null}
            </div>
          ))}
          <div className="mt-3 px-2 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            Pages
          </div>
          {["Dashboard", "Bots", "Billing"].map((p, i) => (
            <div
              key={p}
              className={cn(
                "rounded px-2 py-1.5 text-xs",
                i === 0
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground",
              )}
            >
              {p}
            </div>
          ))}
        </aside>

        {/* Main */}
        <main className="col-span-9 flex flex-col gap-3">
          {/* Top stat row */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              label="Compliance score"
              value="64"
              hint="Notable gaps"
              valueClass="text-amber-600 dark:text-amber-400"
            />
            <StatCard
              label="Audits used"
              value="3 / 5"
              hint="Free tier · this month"
            />
            <StatCard
              label="Top violation"
              value="BOT_NO_STOP_LOSS"
              hint="recurred 4× in last 20"
              mono
            />
          </div>

          {/* Sparkline + violations */}
          <div className="grid flex-1 grid-cols-3 gap-3">
            <div className="col-span-2 rounded-md border bg-background p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-medium">
                  Score over last 20 trades
                </div>
                <div className="text-[11px] text-muted-foreground">
                  band: Notable gaps
                </div>
              </div>
              <Sparkline />
            </div>
            <div className="rounded-md border bg-background p-3">
              <div className="mb-2 text-xs font-medium">Top violations</div>
              <ul className="space-y-2 text-[11px] font-mono text-muted-foreground">
                <li className="flex items-center justify-between">
                  <span>BOT_NO_STOP_LOSS</span>
                  <span className="text-foreground">4×</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>BOT_OVERCONFIDENCE</span>
                  <span className="text-foreground">3×</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>BOT_POOR_RISK_REWARD</span>
                  <span className="text-foreground">3×</span>
                </li>
              </ul>
              <div className="mt-3 rounded border border-dashed p-2 text-[10px] text-muted-foreground">
                History modifier: <span className="text-foreground">−10</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  mono,
  valueClass,
}: {
  label: string;
  value: string;
  hint: string;
  mono?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-lg font-semibold",
          mono && "font-mono text-xs leading-relaxed",
          valueClass,
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function Sparkline() {
  // Hand-tuned series: trending downward, with one recovery, ends ~64
  const points = [
    82, 78, 80, 74, 71, 69, 72, 68, 65, 60, 63, 67, 70, 66, 62, 58, 61, 65, 60,
    64,
  ];
  const w = 600;
  const h = 110;
  const max = 100;
  const min = 40;
  const stepX = w / (points.length - 1);

  const path = points
    .map((v, i) => {
      const x = i * stepX;
      const y = h - ((v - min) / (max - min)) * h;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  const area = `${path} L ${w} ${h} L 0 ${h} Z`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-[140px] w-full"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            stopColor="currentColor"
            stopOpacity="0.18"
            className="text-foreground"
          />
          <stop
            offset="100%"
            stopColor="currentColor"
            stopOpacity="0"
            className="text-foreground"
          />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark-fill)" className="text-foreground" />
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-foreground"
      />
    </svg>
  );
}
