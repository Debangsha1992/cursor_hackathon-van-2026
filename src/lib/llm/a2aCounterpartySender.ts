// Bridges the strategyInterrogator's `CounterpartySender` interface to the
// outbound A2A client. Discovers the peer's agent-card once, then on each
// `ask(question)` it sends a JSON-RPC `message/send` containing the
// question as a single text part, parses the resulting Task, and returns
// the concatenated text from the agent's reply.
//
// Pure orchestration — every external call is injected, so the adapter is
// unit-testable with stubs.

import type { CounterpartySender } from "./strategyInterrogator";
import type { AgentCard } from "../a2a/agentCard";
import type { AuthHeaderProvider } from "../a2a/a2aClient";
import {
  discoverAgentCard,
  sendMessage,
  type A2AClientOpts,
} from "../a2a/a2aClient";
import type { TaskValue, MessageValue } from "../a2a/envelope";

export interface A2ASenderOpts {
  /** Either pre-fetched agent card... */
  agentCard?: AgentCard;
  /** ...or a base URL we will discover the card from on first use. */
  agentBaseUrl?: string;
  fetchImpl?: typeof fetch;
  auth?: AuthHeaderProvider;
  timeoutMs?: number;
  /** Stable contextId so the peer can stitch a multi-turn conversation. */
  contextId?: string;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/**
 * Walk a Task and pull human-readable text out of it. We prefer artifact
 * text, fall back to the most recent agent message in `history`, and
 * finally to the status message. This is intentionally lenient: peers vary
 * in where they stash their reply, and the interrogator just needs the
 * answer text.
 */
export function extractAnswerText(task: TaskValue): string {
  const artifactText = task.artifacts
    .flatMap((a) =>
      a.parts
        .map((p) => (p.kind === "text" ? p.text : ""))
        .filter((t) => t.length > 0)
    )
    .join("\n")
    .trim();
  if (artifactText) return artifactText;

  const lastAgentMsg = [...task.history]
    .reverse()
    .find((m) => m.role === "ROLE_AGENT");
  if (lastAgentMsg) {
    const txt = lastAgentMsg.parts
      .map((p) => (p.kind === "text" ? p.text : ""))
      .filter((t) => t.length > 0)
      .join("\n")
      .trim();
    if (txt) return txt;
  }

  const statusMsg = task.status.message;
  if (statusMsg) {
    const txt = statusMsg.parts
      .map((p) => (p.kind === "text" ? p.text : ""))
      .filter((t) => t.length > 0)
      .join("\n")
      .trim();
    if (txt) return txt;
  }

  return `[no text reply; task state ${task.status.state}]`;
}

export interface A2ACounterpartySender extends CounterpartySender {
  /** Resolved agent card, populated after the first call (or upfront). */
  getAgentCard(): Promise<AgentCard>;
}

export function createA2ACounterpartySender(
  opts: A2ASenderOpts
): A2ACounterpartySender {
  if (!opts.agentCard && !opts.agentBaseUrl) {
    throw new Error(
      "createA2ACounterpartySender: either agentCard or agentBaseUrl is required"
    );
  }

  let cardPromise: Promise<AgentCard> | null = null;
  const contextId = opts.contextId ?? newId("ctx");
  const clientOpts: A2AClientOpts = {
    fetchImpl: opts.fetchImpl,
    auth: opts.auth,
    timeoutMs: opts.timeoutMs,
  };

  async function getAgentCard(): Promise<AgentCard> {
    if (opts.agentCard) return opts.agentCard;
    if (!cardPromise) {
      cardPromise = discoverAgentCard(opts.agentBaseUrl!, clientOpts);
    }
    return cardPromise;
  }

  return {
    getAgentCard,
    async ask(question: string): Promise<string> {
      const card = await getAgentCard();
      const message: MessageValue = {
        messageId: newId("msg"),
        role: "ROLE_USER",
        parts: [{ kind: "text", text: question }],
        contextId,
      };
      const task = await sendMessage(card.url, message, clientOpts);
      return extractAnswerText(task);
    },
  };
}
