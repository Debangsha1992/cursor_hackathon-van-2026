export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  inputModes: string[];
  outputModes: string[];
  tags: string[];
}

export const SUBMIT_TRADE_INTENT: AgentSkill = {
  id: "submit_trade_intent",
  name: "Submit a paper trade intent",
  description:
    "Submit a proposed paper trade. PaperPilot audits the intent against the bot's declared policy, may interrupt the task to request clarification, attempts to match the intent against resting orders, and emits a citation-grounded coach report as the final artifact. Returns a streaming Task.",
  inputModes: ["application/json"],
  outputModes: ["application/json", "text/plain"],
  tags: ["paper-trading", "audit", "market"],
};

export const RESPOND_TO_CLARIFICATION: AgentSkill = {
  id: "respond_to_clarification",
  name: "Respond to a mid-task clarification",
  description:
    "Continue an interrupted task whose state is TASK_STATE_INPUT_REQUIRED by supplying the requested justification (e.g. a longer signalReason, a corrected stopLoss). PaperPilot re-audits using the supplied input and either proceeds to matching or rejects the intent.",
  inputModes: ["application/json", "text/plain"],
  outputModes: ["application/json", "text/plain"],
  tags: ["paper-trading", "audit", "interrupt"],
};

export const SUBSCRIBE_TO_MARKET_EVENTS: AgentSkill = {
  id: "subscribe_to_market_events",
  name: "Subscribe to market events",
  description:
    "Long-lived Server-Sent Events channel on which PaperPilot pushes counterparty fill notifications, regime-change advisories, and unsolicited coaching nudges. Consume in addition to per-task subscriptions for situational awareness.",
  inputModes: ["application/json"],
  outputModes: ["text/event-stream"],
  tags: ["paper-trading", "market", "streaming"],
};

export const ALL_SKILLS: AgentSkill[] = [
  SUBMIT_TRADE_INTENT,
  RESPOND_TO_CLARIFICATION,
  SUBSCRIBE_TO_MARKET_EVENTS,
];
