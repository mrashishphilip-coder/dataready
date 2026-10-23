// DataReady's public entry point: interpret a question, then let the engine decide.
import { loadContext } from "./context.js";
import { assess } from "./engine.js";
import { interpretWithRules } from "./interpret-rules.js";
import { interpretWithLlm } from "./interpret-llm.js";
import { llmConfigured } from "./llm.js";

// interpreter: "rules", "llm", or "auto" (llm when an API key is configured).
export async function checkQuestion({ question, role, interpreter = "auto", metric_id }) {
  const ctx = loadContext();
  if (!ctx.registry.roles[role]) throw new Error(`Unknown role: ${role}`);
  const useLlm = interpreter === "llm" || (interpreter === "auto" && llmConfigured());
  const interpretation = useLlm ? await interpretWithLlm(question, ctx) : interpretWithRules(question, ctx);
  // The asker's answer to a clarification question overrides the interpretation.
  const candidates = metric_id ? [metric_id] : interpretation.metric_candidates;
  const assessment = assess({ ...interpretation, metric_candidates: candidates, role }, ctx);
  return { question, role, interpretation, assessment };
}
