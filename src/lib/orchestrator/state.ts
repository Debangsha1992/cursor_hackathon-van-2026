import { Annotation } from "@langchain/langgraph";
import type {
  BotPaperTrade,
  BotTradingProfile,
  RuleViolation,
  TradeIntent,
} from "@/lib/trading/types";
import type { ScoreResult } from "@/lib/trading/scoreCalculator";
import type { HistoryModifierResult } from "@/lib/trading/historyModifier";
import type { Excerpt } from "@/lib/corpus/niaRetriever";
import type { MarketEvent, PaperFill, PaperOrder } from "@/lib/market/types";

export interface ClarificationRequest {
  reason: string;
  violationCode: string;
  promptToAgent: string;
}

export interface ClarificationResponse {
  // The agent's free-text justification. For a high-severity rule like
  // BOT_NO_STOP_LOSS, this is also where the agent may *correct* the trade
  // by supplying e.g. `correctedStopLoss`.
  text?: string;
  correctedStopLoss?: number;
  correctedSignalReason?: string;
}

export interface CoachReport {
  prose: string;
  excerpts: Excerpt[];
  llmFallbackUsed: boolean;
  llmLatencyMs: number;
}

export type Outcome =
  | { kind: "filled"; fills: PaperFill[] }
  | { kind: "resting"; order: PaperOrder }
  | { kind: "rejected"; reason: string };

// The graph state. Each field uses LastValue semantics (Annotation default)
// unless otherwise noted.
export const PaperPilotState = Annotation.Root({
  taskId: Annotation<string>(),
  contextId: Annotation<string>(),
  botId: Annotation<string>(),

  // Input
  intent: Annotation<TradeIntent>(),
  profile: Annotation<BotTradingProfile>(),
  recentTrades: Annotation<BotPaperTrade[]>({
    reducer: (_l, r) => r,
    default: () => [],
  }),
  recentViolations: Annotation<RuleViolation[]>({
    reducer: (_l, r) => r,
    default: () => [],
  }),

  // Audit phase
  violations: Annotation<RuleViolation[]>({
    reducer: (_l, r) => r,
    default: () => [],
  }),
  historyModifier: Annotation<HistoryModifierResult | null>({
    reducer: (_l, r) => r,
    default: () => null,
  }),
  score: Annotation<ScoreResult | null>({
    reducer: (_l, r) => r,
    default: () => null,
  }),

  // Clarification phase
  clarificationRequest: Annotation<ClarificationRequest | null>({
    reducer: (_l, r) => r,
    default: () => null,
  }),
  clarificationResponse: Annotation<ClarificationResponse | null>({
    reducer: (_l, r) => r,
    default: () => null,
  }),
  reAuditAttempts: Annotation<number>({
    reducer: (_l, r) => r,
    default: () => 0,
  }),

  // Market phase
  outcome: Annotation<Outcome | null>({
    reducer: (_l, r) => r,
    default: () => null,
  }),
  marketEvents: Annotation<MarketEvent[]>({
    reducer: (left: MarketEvent[], right: MarketEvent[]) => [...left, ...right],
    default: () => [],
  }),

  // Final
  coachReport: Annotation<CoachReport | null>({
    reducer: (_l, r) => r,
    default: () => null,
  }),
});

export type PaperPilotStateValue =
  typeof PaperPilotState.State;
export type PaperPilotStateUpdate =
  typeof PaperPilotState.Update;
