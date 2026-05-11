import type { Manifest, ManifestSource } from "./manifestLoader";

export interface RawHit {
  sourceId: string;
  page: number;
  text: string;
}

export interface NiaClient {
  search(opts: {
    query: string;
    sourceIds: string[];
    topK: number;
  }): Promise<RawHit[]>;
}

export interface TradeContext {
  strategyType: string;
  signalReason?: string;
  marketRegime?: string;
  violationCodes: string[];
}

export interface Excerpt {
  sourceId: string;
  page: number;
  text: string;
  citation: string;
}

export interface RetrieveOpts {
  tradeContext: TradeContext;
  manifest: Manifest;
  niaClient: NiaClient;
  topK?: number;
  historyModifierTriggered?: boolean;
}

export interface RetrieveResult {
  excerpts: Excerpt[];
  queryUsed: string;
  sourceIdsQueried: string[];
}

function shouldRetrieveFromSource(
  source: ManifestSource,
  ctx: TradeContext,
  historyModifierTriggered: boolean
): boolean {
  if (!source.when_to_retrieve || source.when_to_retrieve.length === 0) {
    return false;
  }

  for (const rule of source.when_to_retrieve) {
    let allKeysSatisfied = true;
    let anyRuleKeyEvaluated = false;

    for (const [key, value] of Object.entries(rule)) {
      anyRuleKeyEvaluated = true;
      if (key === "always_for_strategy_consistency_check" && value === true) {
        continue;
      }
      if (key === "violation_codes_present_any" && Array.isArray(value)) {
        const hit = value.some((code) =>
          ctx.violationCodes.includes(code as string)
        );
        if (!hit) {
          allKeysSatisfied = false;
          break;
        }
        continue;
      }
      if (key === "history_modifier_triggered" && value === true) {
        if (!historyModifierTriggered) {
          allKeysSatisfied = false;
          break;
        }
        continue;
      }
      // Unknown rule keys are conservatively treated as not satisfied.
      allKeysSatisfied = false;
      break;
    }

    if (anyRuleKeyEvaluated && allKeysSatisfied) {
      return true;
    }
  }

  return false;
}

function renderTemplate(
  template: string,
  ctx: TradeContext
): string {
  return template
    .replace(/\{trade\.strategyType\}/g, ctx.strategyType)
    .replace(/\{trade\.signalReason\}/g, ctx.signalReason ?? "")
    .replace(/\{trade\.marketRegime\}/g, ctx.marketRegime ?? "unknown")
    .replace(
      /\{violation_codes_joined\}/g,
      ctx.violationCodes.join(", ") || "none"
    );
}

function formatCitation(
  source: ManifestSource,
  page: number,
  citationFormat: string
): string {
  return citationFormat
    .replace(/\{authors_short\}/g, source.authors_short ?? source.authors[0])
    .replace(/\{year\}/g, String(source.year))
    .replace(/\{title_short\}/g, source.title_short ?? source.title)
    .replace(/\{title\}/g, source.title)
    .replace(/\{page\}/g, String(page));
}

export async function retrieveExcerpts(
  opts: RetrieveOpts
): Promise<RetrieveResult> {
  const { tradeContext, manifest, niaClient } = opts;
  const historyTriggered = opts.historyModifierTriggered ?? false;
  const topK = opts.topK ?? manifest.retrieval.default_top_k;

  const matchingSources = manifest.sources.filter((source) =>
    shouldRetrieveFromSource(source, tradeContext, historyTriggered)
  );

  const usePrimaryTemplate =
    tradeContext.violationCodes.length > 0 &&
    manifest.query_composition?.template;

  const template = usePrimaryTemplate
    ? manifest.query_composition!.template
    : manifest.query_composition?.fallback_template ??
      manifest.query_composition?.template ??
      "{trade.strategyType}: {violation_codes_joined}";

  const queryUsed = renderTemplate(template, tradeContext);

  const sourceIdsQueried = matchingSources.map((s) => s.id);

  if (sourceIdsQueried.length === 0) {
    return { excerpts: [], queryUsed, sourceIdsQueried };
  }

  const hits = await niaClient.search({
    query: queryUsed,
    sourceIds: sourceIdsQueried,
    topK,
  });

  const sourceById = new Map(
    matchingSources.map((s) => [s.id, s] as const)
  );

  const excerpts: Excerpt[] = hits.map((hit) => {
    const source = sourceById.get(hit.sourceId);
    const citation = source
      ? formatCitation(source, hit.page, manifest.retrieval.citation_format)
      : `${hit.sourceId}, p.${hit.page}`;
    return {
      sourceId: hit.sourceId,
      page: hit.page,
      text: hit.text,
      citation,
    };
  });

  return { excerpts, queryUsed, sourceIdsQueried };
}
