import type { AuditPipelineDeps } from "./auditPipeline";
import type { Manifest } from "@/lib/corpus/manifestLoader";

// Lazy module-level singleton of the audit-pipeline dependencies. Same idea
// as `src/lib/a2a/runtime.ts` but stripped down: TradingView webhooks don't
// need the orchestrator graph, order book, or event bus.

let cached: AuditPipelineDeps | null = null;

const emptyManifest: Manifest = {
  version: 0,
  sources: [],
  retrieval: {
    default_top_k: 4,
    default_mode: "universal",
    citation_format: "{title_short}, p.{page}",
  },
  query_composition: {
    template: "{trade.strategyType}: {violation_codes_joined}",
    fallback_template: "{trade.strategyType}",
  },
};

export function getAuditDeps(): AuditPipelineDeps {
  if (cached) return cached;

  cached = {
    niaClient: { async search() { return []; } },
    manifest: emptyManifest,
    coach: {
      async narrate({ violations, score, band, recurringCodes }) {
        const codes = violations.map((v) => v.code).join(", ") || "none";
        return {
          prose:
            `Compliance score: ${score} (${band}). ` +
            `Violations detected: ${codes}. ` +
            (recurringCodes.length > 0
              ? `Recurring patterns: ${recurringCodes.join(", ")}. `
              : "") +
            `Continue paper testing; this report does not authorize live deployment.`,
          excerpts: [],
          llmFallbackUsed: true,
          llmLatencyMs: 0,
        };
      },
    },
  };
  return cached;
}

export function __resetAuditDeps() {
  cached = null;
}

// Override the cached deps. Used by tests that want to inject a stub coach or
// Nia client without mutating module state through environmental side
// channels.
export function __setAuditDeps(deps: AuditPipelineDeps) {
  cached = deps;
}
