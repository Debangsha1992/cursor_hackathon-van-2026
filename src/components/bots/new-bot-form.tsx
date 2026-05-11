"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, CopyIcon, ShieldAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StrategyType =
  | "trend_following"
  | "mean_reversion"
  | "breakout"
  | "momentum"
  | "range_trading"
  | "custom";

type BotType = "rule_based" | "ai_agent" | "hybrid";

interface FormState {
  botName: string;
  strategyType: StrategyType;
  maxRiskPerTradePercent: number;
  maxTradesPerDay: number;
  maxAllowedDrawdownPercent: number;
  botType: BotType;
}

const STRATEGY_LABELS: Record<StrategyType, string> = {
  trend_following: "Trend following",
  mean_reversion: "Mean reversion",
  breakout: "Breakout",
  momentum: "Momentum",
  range_trading: "Range trading",
  custom: "Custom",
};

const BOT_TYPE_LABELS: Record<BotType, string> = {
  rule_based: "Rule-based",
  ai_agent: "AI agent",
  hybrid: "Hybrid",
};

interface CreatedBot {
  botId: string;
  secrets: {
    hmacSecret: string;
    tradingviewSharedSecret: string;
  };
  nextStep: string;
}

export function NewBotForm() {
  const router = useRouter();
  const [form, setForm] = React.useState<FormState>({
    botName: "",
    strategyType: "trend_following",
    maxRiskPerTradePercent: 2,
    maxTradesPerDay: 5,
    maxAllowedDrawdownPercent: 20,
    botType: "rule_based",
  });
  const [submitting, setSubmitting] = React.useState(false);
  const [created, setCreated] = React.useState<CreatedBot | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  if (created) {
    return <SecretsRevealCard created={created} onContinue={() => router.push(created.nextStep)} />;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/bots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? `HTTP ${res.status}`);
        return;
      }
      setCreated(data as CreatedBot);
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-6 rounded-lg border border-border bg-card p-6"
    >
      <Field label="Bot name" hint="Used in the dashboard. Pick something memorable.">
        <input
          type="text"
          required
          value={form.botName}
          maxLength={120}
          onChange={(e) => setForm({ ...form, botName: e.target.value })}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="e.g. EMA-crossover BTC"
        />
      </Field>

      <Field
        label="Strategy type"
        hint="What kind of edge does this agent claim to exploit? PaperPilot will flag BOT_STRATEGY_MISMATCH if its actual trades don't align."
      >
        <select
          value={form.strategyType}
          onChange={(e) =>
            setForm({ ...form, strategyType: e.target.value as StrategyType })
          }
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {Object.entries(STRATEGY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Field label="Max risk / trade (%)" hint="Daily-policy ceiling.">
          <input
            type="number"
            min={0.25}
            max={50}
            step={0.25}
            required
            value={form.maxRiskPerTradePercent}
            onChange={(e) =>
              setForm({
                ...form,
                maxRiskPerTradePercent: Number(e.target.value),
              })
            }
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </Field>
        <Field label="Max trades / day" hint="Overtrading guard.">
          <input
            type="number"
            min={1}
            max={1000}
            step={1}
            required
            value={form.maxTradesPerDay}
            onChange={(e) =>
              setForm({ ...form, maxTradesPerDay: Number(e.target.value) })
            }
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </Field>
        <Field label="Max drawdown (%)" hint="Soft cap; tracked over time.">
          <input
            type="number"
            min={1}
            max={100}
            step={1}
            required
            value={form.maxAllowedDrawdownPercent}
            onChange={(e) =>
              setForm({
                ...form,
                maxAllowedDrawdownPercent: Number(e.target.value),
              })
            }
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </Field>
      </div>

      <Field label="Bot type" hint="Just metadata - does not affect the audit logic.">
        <div className="flex flex-wrap gap-2">
          {(Object.entries(BOT_TYPE_LABELS) as [BotType, string][]).map(
            ([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setForm({ ...form, botType: value })}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm transition-colors",
                  form.botType === value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-input bg-background hover:bg-accent"
                )}
              >
                {label}
              </button>
            )
          )}
        </div>
      </Field>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button type="submit" disabled={submitting || !form.botName}>
          {submitting ? "Creating..." : "Create bot"}
          {!submitting ? <ArrowRightIcon className="ml-2 size-4" /> : null}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <p className="mb-2 mt-0.5 text-xs text-muted-foreground">{hint}</p>
      {children}
    </label>
  );
}

function SecretsRevealCard({
  created,
  onContinue,
}: {
  created: CreatedBot;
  onContinue: () => void;
}) {
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-6">
      <div className="flex items-start gap-3">
        <ShieldAlertIcon className="mt-0.5 size-5 text-amber-500" />
        <div className="flex-1">
          <h2 className="text-base font-medium">
            Bot registered. Save these secrets now.
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The HMAC secret will <span className="font-medium">never be shown again</span>.
            The TradingView shared secret is recoverable from the integration
            page later but you should still store it somewhere safe.
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <SecretBlock
          label="Bot ID"
          value={created.botId}
          hint="Public identifier. Include on every submission."
        />
        <SecretBlock
          label="HMAC secret (direct API)"
          value={created.secrets.hmacSecret}
          hint="Signs POST /api/bots/trades and POST /api/a2a payloads. Never shown again."
          highlight
        />
        <SecretBlock
          label="TradingView shared secret"
          value={created.secrets.tradingviewSharedSecret}
          hint="Embedded inside the Pine alert message body (Pine can't compute HMAC)."
        />
      </div>

      <div className="mt-6 flex items-center justify-end">
        <Button onClick={onContinue}>
          Continue to integrations
          <ArrowRightIcon className="ml-2 size-4" />
        </Button>
      </div>
    </div>
  );
}

function SecretBlock({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: string;
  hint: string;
  highlight?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs font-medium hover:bg-accent"
        >
          <CopyIcon className="size-3" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre
        className={cn(
          "mt-1 overflow-x-auto rounded-md border bg-background px-3 py-2 text-xs",
          highlight
            ? "border-amber-500/50 font-mono"
            : "border-border font-mono"
        )}
      >
        {value}
      </pre>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
