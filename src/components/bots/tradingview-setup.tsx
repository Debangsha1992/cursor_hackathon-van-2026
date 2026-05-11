"use client";

import * as React from "react";
import {
  ArrowRightIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  CopyIcon,
  PlayIcon,
  XCircleIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StrategyType =
  | "trend_following"
  | "mean_reversion"
  | "breakout"
  | "momentum"
  | "range_trading"
  | "custom";

interface Props {
  botId: string;
  botName: string;
  strategyType: StrategyType;
  webhookUrl: string;
  sharedSecret: string;
}

type Variant = "clean" | "no_stop_loss" | "overconfident" | "poor_rr";

interface AuditResponse {
  ok: boolean;
  score: number;
  band: string;
  violations: Array<{ code: string; severity: string; message: string }>;
  recurringCodes: string[];
  coachReport: {
    prose: string;
    excerpts: Array<{ citation: string; text: string }>;
    llmFallbackUsed: boolean;
  };
  trade: Record<string, unknown>;
}

const VARIANT_LABELS: Record<Variant, string> = {
  clean: "Clean trade",
  no_stop_loss: "Missing stop loss",
  overconfident: "Overconfident",
  poor_rr: "Poor risk/reward",
};

const PINE_TEMPLATE_FILES: Record<StrategyType, string> = {
  trend_following: "/pine-templates/trend-following.pine",
  mean_reversion: "/pine-templates/mean-reversion.pine",
  breakout: "/pine-templates/breakout.pine",
  momentum: "/pine-templates/momentum.pine",
  range_trading: "/pine-templates/range-trading.pine",
  custom: "/pine-templates/custom.pine",
};

function buildAlertMessage(opts: {
  botId: string;
  sharedSecret: string;
  strategyType: StrategyType;
}): string {
  const obj = {
    webhookSecret: opts.sharedSecret,
    botId: opts.botId,
    symbol: "{{ticker}}",
    assetType: "crypto",
    side: "{{strategy.order.action}}",
    entryPrice: "{{strategy.order.price}}",
    quantity: "{{strategy.order.contracts}}",
    stopLoss: "{{plot_0}}",
    takeProfit: "{{plot_1}}",
    strategyType: opts.strategyType,
    signalReason: "{{strategy.order.alert_message}}",
    confidenceScore: 0.7,
    marketRegime: "trending",
  };
  // Pretty-printed for paste-and-tweak. TradingView strips the Pine
  // {{...}} placeholders out as raw strings, so they survive JSON
  // serialization unchanged on the user's side.
  return JSON.stringify(obj, null, 2);
}

export function TradingViewSetup(props: Props) {
  const alertMessage = React.useMemo(
    () =>
      buildAlertMessage({
        botId: props.botId,
        sharedSecret: props.sharedSecret,
        strategyType: props.strategyType,
      }),
    [props.botId, props.sharedSecret, props.strategyType]
  );

  return (
    <div className="space-y-8">
      <Block
        letter="A"
        title="Webhook URL"
        description="Paste this into TradingView's alert dialog under Notifications → Webhook URL."
        value={props.webhookUrl}
        language="text"
      />
      <Block
        letter="B"
        title="Alert message"
        description="Paste this into the alert's Message field. The {{...}} placeholders are TradingView Pine variables — TradingView substitutes them on fire. confidenceScore and marketRegime are placeholders you may want to tune."
        value={alertMessage}
        language="json"
      />

      <PineTemplateBlock strategyType={props.strategyType} />

      <TestRunner botId={props.botId} botName={props.botName} />

      <FootNote />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Block (copyable code block)
// ---------------------------------------------------------------------------

function Block({
  letter,
  title,
  description,
  value,
  language,
}: {
  letter: string;
  title: string;
  description: string;
  value: string;
  language: "text" | "json" | "pine";
}) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-start justify-between gap-4 p-5 pb-3">
        <div className="flex items-start gap-3">
          <div className="flex size-7 items-center justify-center rounded-md border bg-background font-mono text-xs font-medium">
            {letter}
          </div>
          <div>
            <h3 className="text-sm font-medium">{title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={copy}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-input px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
        >
          <CopyIcon className="size-3" />
          {copied ? "Copied" : "Copy"}
        </button>
      </header>
      <pre
        className={cn(
          "max-h-[420px] overflow-auto rounded-b-lg border-t border-border bg-background p-4 font-mono text-xs leading-relaxed",
          language === "pine" ? "whitespace-pre" : "whitespace-pre"
        )}
      >
        {value}
      </pre>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pine template block - fetches the template file from /public/pine-templates
// ---------------------------------------------------------------------------

function PineTemplateBlock({ strategyType }: { strategyType: StrategyType }) {
  const [contents, setContents] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    const url = PINE_TEMPLATE_FILES[strategyType];
    fetch(url, { cache: "no-store" })
      .then(async (res) => {
        if (!alive) return;
        if (!res.ok) {
          setError(`HTTP ${res.status}`);
          return;
        }
        setContents(await res.text());
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "fetch failed");
      });
    return () => {
      alive = false;
    };
  }, [strategyType]);

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-start justify-between gap-4 p-5 pb-3">
        <div className="flex items-start gap-3">
          <div className="flex size-7 items-center justify-center rounded-md border bg-background font-mono text-xs font-medium">
            C
          </div>
          <div>
            <h3 className="text-sm font-medium">
              Pine strategy template ({strategyType.replace(/_/g, " ")})
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Paste this into TradingView's Pine editor as a starting point.
              It plots stopLoss/takeProfit on hidden series 0 and 1 so the
              `{`{{plot_0}}`}` / `{`{{plot_1}}`}` placeholders in block B
              line up correctly.
            </p>
          </div>
        </div>
        {contents ? (
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(contents);
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-input px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
          >
            <CopyIcon className="size-3" />
            Copy
          </button>
        ) : null}
      </header>
      <div className="border-t border-border bg-background">
        {error ? (
          <p className="p-4 text-xs text-destructive">
            Failed to load template: {error}
          </p>
        ) : !contents ? (
          <p className="p-4 text-xs text-muted-foreground">Loading template...</p>
        ) : (
          <pre className="max-h-[420px] overflow-auto rounded-b-lg p-4 font-mono text-xs leading-relaxed">
            {contents}
          </pre>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

function TestRunner({ botId, botName }: { botId: string; botName: string }) {
  const [variant, setVariant] = React.useState<Variant>("clean");
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<AuditResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const fire = async () => {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/webhooks/tradingview/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ botId, variant }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? `HTTP ${res.status}`);
        return;
      }
      setResult(data as AuditResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-lg border-2 border-primary/40 bg-primary/5 p-5">
      <header className="flex items-center gap-3">
        <PlayIcon className="size-5 text-primary" />
        <div>
          <h3 className="text-sm font-medium">Send a test alert</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Run a synthetic TradingView-shaped payload through the same
            handler your real alerts will hit. The audit result renders
            inline.
          </p>
        </div>
      </header>

      <div className="mt-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Sample
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(VARIANT_LABELS) as Variant[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVariant(v)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs transition-colors",
                variant === v
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input bg-background hover:bg-accent"
              )}
            >
              {VARIANT_LABELS[v]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Bot: <span className="font-medium text-foreground">{botName}</span>
        </span>
        <Button onClick={fire} disabled={submitting}>
          {submitting ? "Running..." : "Send test alert"}
          {!submitting ? <ArrowRightIcon className="ml-2 size-4" /> : null}
        </Button>
      </div>

      {error ? (
        <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {result ? <AuditResultPanel result={result} /> : null}
    </section>
  );
}

function AuditResultPanel({ result }: { result: AuditResponse }) {
  const passing = result.violations.length === 0;
  return (
    <div className="mt-5 rounded-md border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {passing ? (
            <CheckCircle2Icon className="size-4 text-emerald-500" />
          ) : (
            <XCircleIcon className="size-4 text-amber-500" />
          )}
          <span className="text-sm font-medium">
            Score {result.score}{" "}
            <span className="text-muted-foreground">({result.band})</span>
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {result.violations.length} violation{result.violations.length === 1 ? "" : "s"}
        </span>
      </div>

      {result.violations.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {result.violations.map((v) => (
            <li
              key={v.code}
              className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono">{v.code}</span>
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] text-amber-700 dark:text-amber-300">
                  {v.severity}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground">{v.message}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {result.recurringCodes.length > 0 ? (
        <div className="mt-4 rounded-md border border-border bg-muted/30 p-3 text-xs">
          <p className="font-mono uppercase tracking-wider text-muted-foreground">
            Recurring patterns
          </p>
          <p className="mt-1 font-mono">
            {result.recurringCodes.join(", ")}
          </p>
        </div>
      ) : null}

      <div className="mt-4 rounded-md bg-muted/30 p-3 text-xs">
        <p className="font-mono uppercase tracking-wider text-muted-foreground">
          Coach prose
          {result.coachReport.llmFallbackUsed ? (
            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] normal-case text-muted-foreground">
              fallback template
            </span>
          ) : null}
        </p>
        <p className="mt-1 leading-relaxed">{result.coachReport.prose}</p>
        {result.coachReport.excerpts.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {result.coachReport.excerpts.map((ex, i) => (
              <li key={i} className="font-mono text-[10px] text-muted-foreground">
                <BookOpenIcon className="mr-1 inline size-3" />
                {ex.citation}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Footer copy
// ---------------------------------------------------------------------------

function FootNote() {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-5 text-xs leading-relaxed text-muted-foreground">
      <p>
        <span className="font-medium text-foreground">Trust tier:</span>{" "}
        TradingView submissions are stamped{" "}
        <span className="font-mono">trust_tier=&quot;shared_secret&quot;</span> in
        the audit log. Direct API submissions are{" "}
        <span className="font-mono">trust_tier=&quot;hmac&quot;</span>. The
        dashboard distinguishes them; rule engine and scoring are identical.
      </p>
      <p className="mt-3">
        <span className="font-medium text-foreground">Reply channel:</span>{" "}
        TradingView does not surface webhook response bodies back to the Pine
        script. The audit result is rendered here and in the dashboard, but
        the bot itself receives no signal. Use the A2A path if you want
        bidirectional clarification interrupts.
      </p>
    </div>
  );
}
