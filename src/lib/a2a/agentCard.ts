import { ALL_SKILLS, type AgentSkill } from "./skills";

export interface AgentCardCapabilities {
  streaming: boolean;
  pushNotifications: boolean;
  extendedAgentCard: boolean;
}

export interface AgentCard {
  protocolVersion: string;
  name: string;
  description: string;
  version: string;
  url: string;
  defaultInputModes: string[];
  defaultOutputModes: string[];
  capabilities: AgentCardCapabilities;
  skills: AgentSkill[];
  securitySchemes: Record<string, unknown>;
  preferredTransport: "JSONRPC" | "GRPC" | "HTTP";
  documentationUrl?: string;
}

const A2A_PROTOCOL_VERSION = "1.0.0";

export interface BuildAgentCardOpts {
  baseUrl: string;
  version: string;
}

// The PaperPilot AgentCard is published unauthenticated at
// /.well-known/agent-card.json. Authentication for actual task submission is
// the existing HMAC scheme; we declare it in securitySchemes so well-behaved
// A2A clients pre-flight with the right headers.
export function buildAgentCard(opts: BuildAgentCardOpts): AgentCard {
  const base = opts.baseUrl.replace(/\/$/, "");
  return {
    protocolVersion: A2A_PROTOCOL_VERSION,
    name: "PaperPilot AI",
    description:
      "Behavior-audit and discipline-coach environment for AI trading agents. Audits paper trades against a declared policy, retrieves citation-grounded recommendations from a corpus of canonical finance literature, and refuses to authorize live deployment. Hosts a multi-agent paper market in which registered bots can act as counterparties.",
    version: opts.version,
    url: `${base}/api/a2a`,
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    capabilities: {
      streaming: true,
      pushNotifications: true,
      extendedAgentCard: false,
    },
    skills: ALL_SKILLS,
    preferredTransport: "JSONRPC",
    securitySchemes: {
      paperpilotHmac: {
        type: "http",
        scheme: "hmac-sha256",
        description:
          "Each call must carry X-PaperPilot-Bot-Id, X-PaperPilot-Timestamp (Unix seconds, ±300s skew), and X-PaperPilot-Signature (hex HMAC-SHA256 of `<timestamp>.<raw-body>`).",
      },
    },
    documentationUrl: `${base}/docs/agent-protocols`,
  };
}
