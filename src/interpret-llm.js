// AI interpreter: turns a plain-English question into the same structured
// request the rules interpreter produces. The model only interprets. It never
// decides whether the answer is ready; the engine does that.
import { completeJson, provider, modelName } from "./llm.js";
import { SCHEMA, systemPrompt, validateInterpretation } from "./interpret-prompt.js";

export async function interpretWithLlm(question, ctx) {
  const started = Date.now();
  const { data, usage } = await completeJson({ system: systemPrompt(ctx), user: question, schema: SCHEMA, name: "metric_request" });
  return {
    source: "llm",
    provider: provider(),
    model: modelName(),
    latency_ms: Date.now() - started,
    usage,
    ...validateInterpretation(data, ctx),
  };
}
