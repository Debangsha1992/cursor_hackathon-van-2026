"use client";

import * as React from "react";
import {
  BotIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  SparklesIcon,
  UserIcon,
  WrenchIcon,
} from "lucide-react";

import { PromptInputBox } from "@/components/ui/ai-prompt-box";
import { cn } from "@/lib/utils";

// AssistantRail — the right-hand chat column on /dashboard.
//
// Owns the multi-agent chat state (transcript, pending, errors, send()) and
// renders it alongside the new `PromptInputBox` composer.
//
// Wire shape: POST /api/chat with { messages: [{role, content}, ...] }
//
// The PromptInputBox can attach files in its UI but the current /api/chat
// route doesn't accept attachments, so the `files` argument is intentionally
// dropped here. Image upload still works in the composer (preview, paste,
// drag/drop) — the files just aren't transmitted yet.

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

export function AssistantRail() {
  const [turns, setTurns] = React.useState<ChatTurn[]>([]);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns.length, pending]);

  const send = React.useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || pending) return;
      setError(null);
      const nextTurns: ChatTurn[] = [
        ...turns,
        { role: "user", content: trimmed },
      ];
      setTurns(nextTurns);
      setPending(true);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: nextTurns.map((t) => ({
              role: t.role,
              content: t.content,
            })),
          }),
        });
        const data = (await res.json()) as
          | ChatApiResponse
          | { error: string; details?: string };
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
    },
    [pending, turns],
  );

  return (
    <aside
      className={cn(
        "flex w-full flex-col gap-3 rounded-2xl border border-border bg-card p-4",
        "lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)]",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="bg-background flex size-8 items-center justify-center rounded-md border">
            <SparklesIcon className="size-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-medium leading-none">
              Multi-agent chat
            </h3>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              Clōd routes Pine Script &amp; strategy questions to the Lightning
              AI vLLM finance expert.
            </p>
          </div>
        </div>
        <span className="bg-background border-border text-muted-foreground inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wider">
          <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
          live
        </span>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto pr-1 lg:min-h-[280px]"
      >
        {turns.length === 0 ? (
          <EmptyState onPick={send} disabled={pending} />
        ) : (
          turns.map((t, i) => <Bubble key={i} turn={t} />)
        )}
        {pending ? <PendingBubble /> : null}
        {error ? (
          <p className="border-destructive/40 bg-destructive/5 text-destructive rounded-md border p-3 text-xs">
            {error}
          </p>
        ) : null}
      </div>

      <PromptInputBox
        onSend={(message) => {
          // `files` arg is currently dropped: /api/chat has no attachment
          // schema yet. UI still accepts/previews images.
          void send(message);
        }}
        isLoading={pending}
        placeholder="Ask about your Pine Script, your strategy idea, or PaperPilot itself…"
      />
    </aside>
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
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs leading-relaxed">
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
            className="border-border bg-background hover:bg-accent rounded-md border px-3 py-2 text-left text-xs leading-relaxed transition-colors disabled:opacity-50"
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
      <div className="bg-background flex size-7 shrink-0 items-center justify-center rounded-md border">
        <BotIcon className="size-3.5 text-primary" />
      </div>
      <div className="border-border/60 bg-background/50 text-muted-foreground flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs">
        <span className="bg-primary inline-block size-1.5 animate-pulse rounded-full" />
        <span>Clōd is reasoning…</span>
      </div>
    </div>
  );
}

function Bubble({ turn }: { turn: ChatTurn }) {
  const isUser = turn.role === "user";
  return (
    <div className={cn("flex items-start gap-3", isUser && "flex-row-reverse")}>
      <div className="bg-background flex size-7 shrink-0 items-center justify-center rounded-md border">
        {isUser ? (
          <UserIcon className="text-foreground size-3.5" />
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
              : "border-border/60 bg-background/50",
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
    <div className="border-border/40 bg-muted/30 mt-2 max-w-[88%] rounded-md border text-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-muted-foreground hover:text-foreground flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left"
      >
        {open ? (
          <ChevronDownIcon className="size-3" />
        ) : (
          <ChevronRightIcon className="size-3" />
        )}
        <span className="font-mono uppercase tracking-wider">trace</span>
        <span className="text-[10px]">{summary}</span>
        {fallbackUsed ? (
          <span className="bg-muted ml-auto rounded px-1.5 py-0.5 text-[10px] normal-case">
            fallback
          </span>
        ) : null}
      </button>
      {open ? (
        <ol className="border-border/40 space-y-1.5 border-t p-2.5 font-mono">
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
          <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-[10px] uppercase">
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
          <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-[10px] uppercase">
            clod
          </span>
          <WrenchIcon className="text-muted-foreground size-3" />
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
          <span className="text-muted-foreground ml-1 mt-1 block whitespace-pre-wrap font-sans text-[11px]">
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
