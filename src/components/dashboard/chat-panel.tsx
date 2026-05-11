"use client";

import * as React from "react";
import {
  ArrowUpIcon,
  BotIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  SparklesIcon,
  UserIcon,
  WrenchIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// User-facing chat surface for the multi-agent stack:
//
//   user --> Clōd (generic conversational layer, api.clod.io)
//                |  consult_finance_expert(...)
//                v
//          Lightning AI vLLM (DragonLLM/Qwen-Open-Finance-R-8B)
//
// The panel renders the user-visible transcript and, expandably, the
// per-message agent trace so demo viewers can see when Clōd routed a
// question to the finance expert.

type Role = "user" | "assistant";

interface ChatTurn {
  role: Role;
  content: string;
  steps?: AgentStep[];
  fallbackUsed?: boolean;
  toolCalls?: number;
  totalLatencyMs?: number;
}

type AgentStep =
  | {
      kind: "clod_reply";
      content: string;
      model: string;
      latencyMs: number;
      promptTokens: number;
      completionTokens: number;
    }
  | {
      kind: "clod_tool_call";
      tool: string;
      argumentsJson: string;
      model: string;
      latencyMs: number;
    }
  | {
      kind: "finance_expert";
      tool: string;
      input: string;
      analysis: string;
      model: string;
      latencyMs: number;
      totalTokens: number;
    }
  | { kind: "fallback"; reason: string };

interface ChatApiResponse {
  reply: string;
  steps: AgentStep[];
  fallbackUsed: boolean;
  toolCalls: number;
  totalLatencyMs: number;
}

const STARTER_PROMPTS: string[] = [
  "Here's my EMA crossover Pine script — can you flag any look-ahead bias?",
  "I'm building a mean-reversion bot on BTCUSDT. What stop-loss should it use?",
  "Explain what BOT_STRATEGY_MISMATCH means and how to avoid it.",
];

export function ChatPanel() {
  const [turns, setTurns] = React.useState<ChatTurn[]>([]);
  const [draft, setDraft] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns.length, pending]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setError(null);
    const nextTurns: ChatTurn[] = [
      ...turns,
      { role: "user", content: trimmed },
    ];
    setTurns(nextTurns);
    setDraft("");
    setPending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: nextTurns.map((t) => ({ role: t.role, content: t.content })),
        }),
      });
      const data = (await res.json()) as ChatApiResponse | { error: string; details?: string };
      if (!res.ok || "error" in data) {
        const err =
          "error" in data
            ? `${data.error}${data.details ? `: ${data.details}` : ""}`
            : `HTTP ${res.status}`;
        setError(err);
        return;
      }
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply,
          steps: data.steps,
          fallbackUsed: data.fallbackUsed,
          toolCalls: data.toolCalls,
          totalLatencyMs: data.totalLatencyMs,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "request failed");
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border/60 p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-8 items-center justify-center rounded-md border bg-background">
            <SparklesIcon className="size-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-medium">Multi-agent chat</h3>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Clōd (generic conversational layer) reads your query and
              consults the Lightning AI vLLM — a Pine Script &amp; trading-
              strategy specialist — whenever real finance expertise is
              required.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
          Clōd + vLLM
        </div>
      </header>

      <div
        ref={scrollRef}
        className="max-h-[480px] min-h-[280px] space-y-4 overflow-y-auto p-5"
      >
        {turns.length === 0 ? (
          <EmptyState onPick={send} disabled={pending} />
        ) : (
          turns.map((t, i) => <Bubble key={i} turn={t} />)
        )}
        {pending ? <PendingBubble /> : null}
        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="flex items-end gap-2 border-t border-border/60 p-3"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(draft);
            }
          }}
          rows={2}
          placeholder="Ask about your Pine Script, your strategy idea, or PaperPilot itself…"
          className="min-h-[44px] flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          disabled={pending}
        />
        <button
          type="submit"
          disabled={pending || draft.trim().length === 0}
          className={cn(
            "inline-flex h-10 items-center justify-center rounded-md border bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity",
            (pending || draft.trim().length === 0) && "opacity-50"
          )}
          aria-label="Send"
        >
          <ArrowUpIcon className="size-4" />
        </button>
      </form>
    </section>
  );
}

function EmptyState({
  onPick,
  disabled,
}: {
  onPick: (s: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Start with one of these, or paste your own Pine Script / strategy
        question:
      </p>
      <div className="flex flex-col gap-2">
        {STARTER_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            disabled={disabled}
            onClick={() => onPick(p)}
            className="rounded-md border border-border bg-background px-3 py-2 text-left text-xs leading-relaxed transition-colors hover:bg-accent disabled:opacity-50"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function PendingBubble() {
  return (
    <div className="flex items-start gap-3">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background">
        <BotIcon className="size-3.5 text-primary" />
      </div>
      <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-background/50 px-3 py-2 text-xs text-muted-foreground">
        <span className="inline-block size-1.5 animate-pulse rounded-full bg-primary" />
        <span>Clōd is reasoning…</span>
      </div>
    </div>
  );
}

function Bubble({ turn }: { turn: ChatTurn }) {
  const isUser = turn.role === "user";
  return (
    <div className={cn("flex items-start gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-md border bg-background"
        )}
      >
        {isUser ? (
          <UserIcon className="size-3.5 text-foreground" />
        ) : (
          <BotIcon className="size-3.5 text-primary" />
        )}
      </div>
      <div className={cn("min-w-0 flex-1", isUser && "flex flex-col items-end")}>
        <div
          className={cn(
            "max-w-[88%] whitespace-pre-wrap rounded-md border px-3 py-2 text-sm leading-relaxed",
            isUser
              ? "border-primary/30 bg-primary/5"
              : "border-border/60 bg-background/50"
          )}
        >
          {turn.content || (
            <span className="text-muted-foreground">(empty)</span>
          )}
        </div>
        {!isUser && turn.steps && turn.steps.length > 0 ? (
          <AgentTrace
            steps={turn.steps}
            fallbackUsed={turn.fallbackUsed}
            toolCalls={turn.toolCalls ?? 0}
            totalLatencyMs={turn.totalLatencyMs ?? 0}
          />
        ) : null}
      </div>
    </div>
  );
}

function AgentTrace({
  steps,
  fallbackUsed,
  toolCalls,
  totalLatencyMs,
}: {
  steps: AgentStep[];
  fallbackUsed: boolean | undefined;
  toolCalls: number;
  totalLatencyMs: number;
}) {
  const [open, setOpen] = React.useState(false);
  const summary = `${toolCalls} expert consultation${toolCalls === 1 ? "" : "s"} · ${Math.round(totalLatencyMs)}ms`;
  return (
    <div className="mt-2 max-w-[88%] rounded-md border border-border/40 bg-muted/30 text-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-muted-foreground hover:text-foreground"
      >
        {open ? (
          <ChevronDownIcon className="size-3" />
        ) : (
          <ChevronRightIcon className="size-3" />
        )}
        <span className="font-mono uppercase tracking-wider">trace</span>
        <span className="text-[10px]">{summary}</span>
        {fallbackUsed ? (
          <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] normal-case">
            fallback
          </span>
        ) : null}
      </button>
      {open ? (
        <ol className="space-y-1.5 border-t border-border/40 p-2.5 font-mono">
          {steps.map((s, i) => (
            <li key={i} className="leading-relaxed">
              <StepLine step={s} />
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function StepLine({ step }: { step: AgentStep }) {
  switch (step.kind) {
    case "clod_reply":
      return (
        <span className="flex items-baseline gap-1.5">
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase text-primary">
            clod
          </span>
          <span className="text-muted-foreground">
            reply ({step.model}, {Math.round(step.latencyMs)}ms,{" "}
            {step.completionTokens} out tokens)
          </span>
        </span>
      );
    case "clod_tool_call":
      return (
        <span className="flex items-baseline gap-1.5">
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase text-primary">
            clod
          </span>
          <WrenchIcon className="size-3 text-muted-foreground" />
          <span className="text-muted-foreground">
            call <span className="text-foreground">{step.tool}</span>(
            <span className="text-[10px]">
              {truncate(step.argumentsJson, 80)}
            </span>
            )
          </span>
        </span>
      );
    case "finance_expert":
      return (
        <span className="block">
          <span className="flex items-baseline gap-1.5">
            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] uppercase text-emerald-600 dark:text-emerald-400">
              vLLM
            </span>
            <span className="text-muted-foreground">
              {step.tool} · {step.model} · {Math.round(step.latencyMs)}ms ·{" "}
              {step.totalTokens} tokens
            </span>
          </span>
          <span className="ml-1 mt-1 block whitespace-pre-wrap font-sans text-[11px] text-muted-foreground">
            {truncate(step.analysis, 360)}
          </span>
        </span>
      );
    case "fallback":
      return (
        <span className="flex items-baseline gap-1.5">
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] uppercase text-amber-600 dark:text-amber-400">
            fallback
          </span>
          <span className="text-muted-foreground">{step.reason}</span>
        </span>
      );
  }
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
