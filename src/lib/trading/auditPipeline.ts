import { detectBotRuleViolations } from "./botRuleEngine";
import { computeHistoryModifier } from "./historyModifier";
import { calculateScore, type ScoreResult } from "./scoreCalculator";
import { retrieveExcerpts } from "@/lib/corpus/niaRetriever";
import type { Manifest } from "@/lib/corpus/manifestLoader";
import type { NiaClient, RetrieveResult } from "@/lib/corpus/niaRetriever";
import type { CoachNarrator } from "@/lib/orchestrator/deps";
import type { CoachReport } from "@/lib/orchestrator/state";
import type {
  BotPaperTrade,
  BotTradingProfile,
  RuleViolation,
} from "./types";

// Shared single-trade audit pipeline. Used by:
//  * the TradingView webhook (`POST /api/webhooks/tradingview`)
//  * the dashboard's `Send test alert` button
//  * any future synchronous channel that does NOT need bidirectional
//    streaming / order-book matching.
//
// The A2A `submit_trade_intent` skill still goes through the LangGraph
// orchestrator because it needs interrupts and counterparty matching; this
// pipeline is the "audit-only" subset of the same deep modules and produces
// an identical compliance score, the same violations, and the same
// citation-grounded coach prose.

export interface AuditPipelineDeps {
  niaClient: NiaClient;
  manifest: Manifest;
  coach: CoachNarrator;
}

export interface AuditInput {
  trade: BotPaperTrade;
  profile: BotTradingProfile;
  recentTrades: BotPaperTrade[];
  recentViolations: RuleViolation[];
}

export interface AuditResult {
  trade: BotPaperTrade;
  violations: RuleViolation[];
  score: ScoreResult;
  recurringCodes: string[];
  excerpts: RetrieveResult;
  coachReport: CoachReport;
}

export async function auditTrade(
  input: AuditInput,
  deps: AuditPipelineDeps
): Promise<AuditResult> {
  const violations = detectBotRuleViolations(
    input.trade,
    input.profile,
    input.recentTrades,
    input.recentViolations
  );
  const historyModifier = computeHistoryModifier(input.recentViolations);
  const score = calculateScore(violations, historyModifier.modifier);

  const excerpts = await retrieveExcerpts({
    tradeContext: {
      strategyType: input.trade.strategyType,
      signalReason: input.trade.signalReason,
      marketRegime: input.trade.marketRegime,
      violationCodes: violations.map((v) => v.code),
    },
    manifest: deps.manifest,
    niaClient: deps.niaClient,
    historyModifierTriggered: historyModifier.recurringCodes.length > 0,
  });

  const coachReport = await deps.coach.narrate({
    violations,
    excerpts,
    score: score.score,
    band: score.band,
    recurringCodes: historyModifier.recurringCodes,
  });

  return {
    trade: input.trade,
    violations,
    score,
    recurringCodes: historyModifier.recurringCodes,
    excerpts,
    coachReport,
  };
}
