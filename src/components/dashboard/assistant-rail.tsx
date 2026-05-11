"use client";

import * as React from "react";

import { PromptInputBox } from "@/components/ui/ai-prompt-box";
import type { BotTrade } from "@/lib/market/nvda-fixture";

import { AiOutput, type AiStatus } from "./ai-output";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantRailProps {
  symbol?: string;
  lastPrice: number;
  recentTrades: BotTrade[];
}

interface ChatState {
  status: AiStatus;
  text: string;
  error?: string;
  history: ChatMessage[];
  hasUserSent: boolean;
}

export function AssistantRail({
  symbol = "NVDA",
  lastPrice,
  recentTrades,
}: AssistantRailProps) {
  const [state, setState] = React.useState<ChatState>({
    status: "idle",
    text: "",
    history: [],
    hasUserSent: false,
  });
  const abortRef = React.useRef<AbortController | null>(null);
  const lastUserInputRef = React.useRef<string | null>(null);

  const send = React.useCallback(
    async (input: string) => {
      lastUserInputRef.current = input;
      const nextHistory: ChatMessage[] = [
        ...state.history,
        { role: "user", content: input },
      ];
      setState({
        status: "thinking",
        text: "",
        history: nextHistory,
        hasUserSent: true,
      });

      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            messages: nextHistory,
            context: {
              symbol,
              lastPrice,
              recentTrades: recentTrades.slice(0, 5),
            },
          }),
        });

        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          throw new Error(
            `Chat failed: ${res.status} ${res.statusText}${
              detail ? ` — ${detail.slice(0, 200)}` : ""
            }`,
          );
        }
        if (!res.body) throw new Error("No response stream");

        await pumpSse(res.body, (delta) => {
          setState((prev) => ({
            ...prev,
            status: "streaming",
            text: prev.text + delta,
          }));
        });

        setState((prev) => ({
          ...prev,
          status: "done",
          history: [
            ...nextHistory,
            { role: "assistant", content: prev.text },
          ],
        }));
      } catch (err) {
        if (controller.signal.aborted) return;
        setState((prev) => ({
          ...prev,
          status: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        }));
      }
    },
    [state.history, symbol, lastPrice, recentTrades],
  );

  const onPromptSend = React.useCallback(
    (message: string) => {
      void send(message);
    },
    [send],
  );

  const onClear = React.useCallback(() => {
    abortRef.current?.abort();
    setState({
      status: "idle",
      text: "",
      history: [],
      hasUserSent: false,
    });
  }, []);

  const onRetry = React.useCallback(() => {
    if (lastUserInputRef.current) {
      // Drop the failed turn from history (the trailing user message).
      setState((prev) => ({
        ...prev,
        history: prev.history.slice(0, -1),
      }));
      void send(lastUserInputRef.current);
    }
  }, [send]);

  const isLoading =
    state.status === "thinking" || state.status === "streaming";

  return (
    <div className="flex w-full flex-col gap-3">
      <AiOutput
        status={state.status}
        text={state.text}
        error={state.error}
        hasUserSent={state.hasUserSent}
        onClear={onClear}
        onRetry={onRetry}
      />
      <PromptInputBox
        onSend={onPromptSend}
        isLoading={isLoading}
        placeholder="Ask Clōd about today's NVDA paper market…"
      />
    </div>
  );
}

async function pumpSse(
  body: ReadableStream<Uint8Array>,
  onDelta: (delta: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const sep = nextFrameBoundary(buffer);
        if (sep === -1) break;
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep).replace(/^(\r?\n){2}/, "");
        const dataLines = frame
          .split(/\r?\n/)
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim());
        if (dataLines.length === 0) continue;
        const payload = dataLines.join("\n");
        if (!payload) continue;
        if (payload === "[DONE]") return;
        try {
          const obj = JSON.parse(payload) as { delta?: string };
          if (typeof obj.delta === "string") onDelta(obj.delta);
        } catch {
          // ignore non-JSON heartbeats
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function nextFrameBoundary(s: string): number {
  const a = s.indexOf("\n\n");
  const b = s.indexOf("\r\n\r\n");
  if (a === -1) return b;
  if (b === -1) return a;
  return Math.min(a, b);
}
