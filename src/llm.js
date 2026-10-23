// The only file that knows which AI provider is in use. Everything else calls
// completeJson() for structured interpretation and startChat() for tool-using agents.
//
// Provider is chosen from .env: OPENAI_API_KEY → OpenAI, ANTHROPIC_API_KEY → Anthropic.
// Set LLM_PROVIDER=openai|anthropic to choose explicitly when both are present.
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

const MODELS = {
  openai: () => process.env.OPENAI_MODEL || "gpt-5.5",
  anthropic: () => process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
};

export function provider() {
  if (process.env.LLM_PROVIDER) return process.env.LLM_PROVIDER;
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

export function llmConfigured() {
  return provider() !== null;
}

export function modelName() {
  const p = provider();
  return p ? MODELS[p]() : null;
}

let openaiClient;
let anthropicClient;
const openai = () => (openaiClient ??= new OpenAI());
const anthropic = () => (anthropicClient ??= new Anthropic());

// Structured output: returns { data, usage } where data matches `schema`.
export async function completeJson({ system, user, schema, name }) {
  if (provider() === "openai") {
    const res = await openai().chat.completions.create({
      model: modelName(),
      reasoning_effort: "low",
      max_completion_tokens: 8000,
      messages: [
        { role: "developer", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
    });
    const msg = res.choices[0].message;
    if (msg.refusal) throw new Error(`Model declined: ${msg.refusal}`);
    return { data: JSON.parse(msg.content), usage: openaiUsage(res) };
  }
  // If a safety classifier declines, the API re-runs on Anthropic's recommended fallback model.
  const res = await anthropic().beta.messages.create({
    model: modelName(),
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    max_tokens: 4000,
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    system,
    messages: [{ role: "user", content: user }],
  });
  if (res.stop_reason === "refusal") throw new Error("Model declined.");
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return { data: JSON.parse(text), usage: { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens } };
}

// A tool-using conversation. Tools are { name, description, parameters } with a
// strict JSON schema. next() returns { calls: [{ id, name, input }], text, usage, refused }.
export function startChat({ system, tools, user }) {
  return provider() === "openai" ? openaiChat({ system, tools, user }) : anthropicChat({ system, tools, user });
}

// OpenAI agents use the Responses API: reasoning models only accept function
// tools there. Turns are chained with previous_response_id so the model's
// reasoning carries across tool calls; only new input is sent each turn.
function openaiChat({ system, tools, user }) {
  let previousId = null;
  let pending = [{ role: "user", content: user }];
  const toolDefs = tools.map((t) => ({ type: "function", name: t.name, description: t.description, parameters: t.parameters, strict: true }));
  return {
    async next() {
      const res = await openai().responses.create({
        model: modelName(),
        instructions: system,
        input: pending,
        previous_response_id: previousId,
        tools: toolDefs,
        reasoning: { effort: "medium" },
        max_output_tokens: 16000,
      });
      previousId = res.id;
      pending = [];
      const calls = res.output
        .filter((o) => o.type === "function_call")
        .map((o) => ({ id: o.call_id, name: o.name, input: parseArgs(o.arguments) }));
      const refused = res.output.some((o) => o.type === "message" && o.content?.some((c) => c.type === "refusal"));
      return {
        calls,
        text: res.output_text ?? "",
        usage: { input_tokens: res.usage?.input_tokens ?? 0, output_tokens: res.usage?.output_tokens ?? 0 },
        refused,
      };
    },
    addToolResults(results) {
      for (const r of results) pending.push({ type: "function_call_output", call_id: r.id, output: r.content });
    },
    addUserMessage(text) {
      pending.push({ role: "user", content: text });
    },
  };
}

function anthropicChat({ system, tools, user }) {
  const messages = [{ role: "user", content: user }];
  const toolDefs = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters, strict: true }));
  return {
    async next() {
      const res = await anthropic().beta.messages.create({
        model: modelName(),
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        max_tokens: 16000,
        output_config: { effort: "medium" },
        system,
        tools: toolDefs,
        messages,
      });
      messages.push({ role: "assistant", content: res.content });
      const calls = res.content.filter((b) => b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, input: b.input }));
      const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      return { calls, text, usage: { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens }, refused: res.stop_reason === "refusal" };
    },
    addToolResults(results) {
      messages.push({
        role: "user",
        content: results.map((r) => ({ type: "tool_result", tool_use_id: r.id, content: r.content, is_error: r.isError })),
      });
    },
    addUserMessage(text) {
      messages.push({ role: "user", content: text });
    },
  };
}

function parseArgs(json) {
  try {
    return JSON.parse(json || "{}");
  } catch {
    return { __invalid_json: json };
  }
}

function openaiUsage(res) {
  return { input_tokens: res.usage?.prompt_tokens ?? 0, output_tokens: res.usage?.completion_tokens ?? 0 };
}
