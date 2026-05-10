import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { retrieveExcerpts } from "@/lib/corpus/niaRetriever";
import { getDeps } from "../deps";
import type {
  PaperPilotStateUpdate,
  PaperPilotStateValue,
} from "../state";

// FINALIZE_AUDIT node: retrieves citation-grounded excerpts from Nia, asks
// the coach narrator to generate prose, and produces the final coach report.
// This is the last node before the graph terminates; the report is emitted
// to the A2A stream as a TaskArtifactUpdateEvent with `final: true`.
export async function finalizeAuditNode(
  state: PaperPilotStateValue,
  config: LangGraphRunnableConfig
): Promise<PaperPilotStateUpdate> {
  const deps = getDeps(config);

  const violationCodes = state.violations.map((v) => v.code);
  const excerpts = await retrieveExcerpts({
    tradeContext: {
      strategyType: state.intent.strategyType,
      signalReason: state.intent.signalReason,
      marketRegime: state.intent.marketRegime,
      violationCodes,
    },
    manifest: deps.manifest,
    niaClient: deps.niaClient,
    historyModifierTriggered:
      (state.historyModifier?.recurringCodes.length ?? 0) > 0,
  });

  const report = await deps.coach.narrate({
    violations: state.violations,
    excerpts,
    score: state.score?.score ?? 0,
    band: state.score?.band ?? "Severe",
    recurringCodes: state.historyModifier?.recurringCodes ?? [],
  });

  return { coachReport: report };
}
