import { z } from "zod";
import { load as parseYaml } from "js-yaml";

const RetrievalSchema = z
  .object({
    default_top_k: z.number().int().positive(),
    default_mode: z.enum(["universal", "query", "web", "deep"]),
    citation_format: z.string(),
    max_excerpt_chars: z.number().int().positive().optional(),
    always_include_citations: z.boolean().optional(),
  })
  .passthrough();

const WhenToRetrieveRuleSchema = z.record(z.string(), z.unknown());

const SourceSchema = z
  .object({
    id: z.string().min(1),
    title: z.string(),
    title_short: z.string().optional(),
    authors: z.array(z.string()).min(1),
    authors_short: z.string().optional(),
    year: z.number().int(),
    publisher: z.string().optional(),
    license: z.string().optional(),
    local_path: z.string().optional(),
    pages: z.number().int().positive().optional(),
    nia_source_id: z.string(),
    indexed_at: z.string().optional(),
    topical_tags: z.array(z.string()).optional(),
    when_to_retrieve: z.array(WhenToRetrieveRuleSchema).optional(),
    summary: z.string().optional(),
    informs_coach_sections: z.array(z.string()).optional(),
  })
  .passthrough();

const QueryCompositionSchema = z
  .object({
    template: z.string(),
    fallback_template: z.string().optional(),
  })
  .passthrough();

const GuardrailsSchema = z
  .object({
    forbidden_phrases_in_output: z.array(z.string()).optional(),
    required_disclaimer_in_output: z.string().optional(),
    citations_required_when_advice_given: z.boolean().optional(),
  })
  .passthrough();

export const ManifestSchema = z
  .object({
    version: z.number().int(),
    retrieval: RetrievalSchema,
    sources: z.array(SourceSchema),
    query_composition: QueryCompositionSchema.optional(),
    guardrails: GuardrailsSchema.optional(),
  })
  .passthrough();

export type Manifest = z.infer<typeof ManifestSchema>;
export type ManifestSource = z.infer<typeof SourceSchema>;

export function loadManifest(yamlString: string): Manifest {
  const raw = parseYaml(yamlString);
  return ManifestSchema.parse(raw);
}
