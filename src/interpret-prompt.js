// The AI interpreter's instructions, output schema and validation. No provider
// code here, so the same prompt runs locally (src/interpret-llm.js) and in the
// published prototype, which asks Claude through the viewer's own account.
import { calendarConventions } from "./conventions.js";

// Strict structured-output schema: every property required, no extras.
export const SCHEMA = {
  type: "object",
  properties: {
    metric_candidates: {
      type: "array",
      items: { type: "string" },
      description: "Every metric id the wording could reasonably mean. Empty if no metric is named.",
    },
    period: {
      anyOf: [
        {
          type: "object",
          properties: { start: { type: "string" }, end: { type: "string" } },
          required: ["start", "end"],
          additionalProperties: false,
        },
        { type: "null" },
      ],
    },
    regions: { type: "array", items: { type: "string", enum: ["North", "South", "East", "West"] } },
    channels: { type: "array", items: { type: "string", enum: ["online", "store"] } },
    notes: { type: "string", description: "One short sentence on anything ambiguous or assumed." },
  },
  required: ["metric_candidates", "period", "regions", "channels", "notes"],
  additionalProperties: false,
};

export function systemPrompt(ctx) {
  const { registry } = ctx;
  const glossary = registry.metrics
    .map((m) => `- ${m.id}: ${m.label}. ${m.description} Formula: ${m.formula}. Also called: ${m.synonyms.join(", ")}.`)
    .join("\n");
  const ambiguous = Object.entries(registry.ambiguous_terms)
    .map(([term, ids]) => `- "${term}" on its own could mean: ${ids.join(", ")}`)
    .join("\n");
  return `You translate business questions about ${registry.company} sales into a structured request for a metrics service.

${calendarConventions(ctx)}

Metrics:
${glossary}

Terms that are ambiguous on their own:
${ambiguous}

How to fill each field:
- metric_candidates: list every metric id the wording could reasonably mean. When a term is ambiguous and the question does not say which definition (for example "Finance" or "Sales" net revenue), list all of its candidates. Do not pick one for the user; a person will choose. Include draft metrics if named. Leave it empty if no metric is named.
- period: resolve to ISO dates (inclusive) using the calendar conventions above. Use null if no period is given or it cannot be resolved without guessing.
- regions: empty means all regions.
- channels: empty means all channels.
- notes: one short sentence on anything ambiguous or assumed.`;
}

// The schema constrains shape where the provider enforces it; this also drops
// ids that are not in the registry and anything malformed.
export function validateInterpretation(out, ctx) {
  const ids = new Set(ctx.registry.metrics.map((m) => m.id));
  const list = (x) => (Array.isArray(x) ? x.map(String) : []);
  const p = out?.period;
  return {
    metric_candidates: list(out?.metric_candidates).filter((id) => ids.has(id)),
    period: p && typeof p.start === "string" && typeof p.end === "string" ? { start: p.start, end: p.end } : null,
    regions: list(out?.regions).filter((r) => ctx.registry.regions.includes(r)),
    channels: list(out?.channels).filter((c) => ctx.registry.channels.includes(c)),
    notes: typeof out?.notes === "string" ? out.notes : "",
  };
}
