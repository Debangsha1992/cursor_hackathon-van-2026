"use client";

import * as React from "react";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { AiThinkingSkeleton } from "./ai-thinking-skeleton";

export type AiStatus = "idle" | "thinking" | "streaming" | "done" | "error";

export interface AiOutputProps {
  status: AiStatus;
  text: string;
  error?: string;
  hasUserSent: boolean;
  modelLabel?: string;
  onClear?: () => void;
  onRetry?: () => void;
}

export function AiOutput({
  status,
  text,
  error,
  hasUserSent,
  modelLabel = "gpt-4o",
  onClear,
  onRetry,
}: AiOutputProps) {
  const showClear =
    onClear && (status === "done" || status === "error" || status === "streaming") &&
    text.length > 0;

  const showGreeting = status === "idle" && !hasUserSent && text.length === 0;

  return (
    <div className="rounded-2xl border border-border bg-card/80 p-4 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <header className="mb-3 flex items-center gap-2">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: "#1EAEDB" }}
            aria-hidden="true"
          />
          <span className="text-xs font-medium tracking-tight text-foreground">
            Clōd
          </span>
        </span>
        <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {modelLabel}
        </span>
        <div className="ml-auto" />
        {showClear ? (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear conversation"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </header>

      <Body
        status={status}
        text={text}
        error={error}
        showGreeting={showGreeting}
        onRetry={onRetry}
      />
    </div>
  );
}

function Body({
  status,
  text,
  error,
  showGreeting,
  onRetry,
}: {
  status: AiStatus;
  text: string;
  error?: string;
  showGreeting: boolean;
  onRetry?: () => void;
}) {
  if (showGreeting) {
    return (
      <p className="text-xs leading-relaxed text-muted-foreground">
        Ask Clōd about today&apos;s NVDA paper market — try:{" "}
        <span className="italic">
          &ldquo;Why did Gridhawk sell at 11:42?&rdquo;
        </span>
      </p>
    );
  }

  if (status === "thinking" && text.length === 0) {
    return <AiThinkingSkeleton />;
  }

  if (status === "error" && text.length === 0) {
    return (
      <div className="flex items-center gap-3">
        <p className="text-xs text-muted-foreground">
          {error ?? "Something went wrong."}
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-accent"
          >
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  return <Markdown text={text} />;
}

/**
 * Tiny inline markdown renderer — handles **bold**, *italic*, `code`, and
 * blank-line-separated paragraphs. Intentionally not a dependency.
 */
function Markdown({ text }: { text: string }) {
  if (!text) return null;
  const paragraphs = text.split(/\n{2,}/);
  return (
    <div className={cn("space-y-3 text-sm leading-relaxed text-foreground")}>
      {paragraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-wrap break-words">
          {renderInline(p)}
        </p>
      ))}
    </div>
  );
}

function renderInline(input: string): React.ReactNode[] {
  // Tokens: **bold**, *italic*, `code`. Simple non-overlapping pass.
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  const parts = input.split(re);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return (
        <em key={i} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
