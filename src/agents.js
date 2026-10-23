// Two agents for the experiment, both the same AI model with tools:
//
// - baseline: what a company could set up today without DataReady. Metric
//   definitions, a semantic-layer style query tool, a data-health tool, and a
//   careful system prompt. Checking data health is available but up to the agent.
// - gated: the same assistant, but its only data tool is DataReady's
//   check_readiness. It cannot query metrics directly.
//
// Both finish by calling submit_response, so outcomes can be scored the same way.
import { startChat } from "./llm.js";
import { loadContext, metricById } from "./context.js";
import { computeMetric } from "./engine.js";
import { checkQuestion } from "./dataready.js";
import { calendarConventions } from "./conventions.js";

const MAX_TURNS = 10;

const submitTool = {
  name: "submit_response",
  description:
    "Give your final response to the user. outcome: 'answer' when you report a number, 'clarify' when you need the user to choose or specify something, 'decline' when the data cannot support a reliable answer.",
  parameters: {
    type: "object",
    properties: {
      outcome: { type: "string", enum: ["answer", "clarify", "decline"] },
      metric_id: { type: ["string", "null"], description: "The metric reported, if outcome is answer." },
      value: { type: ["number", "null"], description: "The number reported, if outcome is answer." },
      message: { type: "string", description: "What you say to the user." },
    },
    required: ["outcome", "metric_id", "value", "message"],
    additionalProperties: false,
  },
};

const regionsProp = { type: "array", items: { type: "string", enum: ["North", "South", "East", "West"] } };
const channelsProp = { type: "array", items: { type: "string", enum: ["online", "store"] } };
const dateProp = { type: "string", description: "YYYY-MM-DD, inclusive" };

const baselineTools = [
  {
    name: "list_metrics",
    description: "List the metric catalogue: ids, definitions, synonyms, owners, whether each metric is certified, and terms that are ambiguous on their own.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "query_metric",
    description: "Compute a metric over a date range from the sales_daily table. Empty regions or channels means all.",
    parameters: {
      type: "object",
      properties: { metric_id: { type: "string" }, start_date: dateProp, end_date: dateProp, regions: regionsProp, channels: channelsProp },
      required: ["metric_id", "start_date", "end_date", "regions", "channels"],
      additionalProperties: false,
    },
  },
  {
    name: "get_data_health",
    description:
      "Data observability for sales_daily over a date range: table refresh time, load status by date and channel, and upstream quality check results by date and region.",
    parameters: {
      type: "object",
      properties: { start_date: dateProp, end_date: dateProp },
      required: ["start_date", "end_date"],
      additionalProperties: false,
    },
  },
  submitTool,
];

const gatedTools = [
  {
    name: "check_readiness",
    description:
      "DataReady: checks whether a metric question can be answered reliably and returns READY with the value and evidence, CLARIFY with options for the user, or BLOCKED with reasons. Pass the user's question exactly as asked. To answer a CLARIFY after the user chooses, pass the chosen metric_id.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string" },
        metric_id: { type: ["string", "null"], description: "Only when the user has chosen a definition." },
      },
      required: ["question", "metric_id"],
      additionalProperties: false,
    },
  },
  submitTool,
];

function baseSystem(ctx, role) {
  return `You are the analytics assistant for ${ctx.registry.company}. The user's role is "${role}".\n${calendarConventions(ctx)}`;
}

const BASELINE_RULES = `
Answer questions about sales metrics using your tools.
- Use only certified metrics.
- If the question could mean more than one metric definition, or the period is unclear, ask the user to clarify instead of guessing.
- If the data cannot support a reliable answer, say so instead of reporting a number.
Finish by calling submit_response.`;

const GATED_RULES = `
Answer questions about sales metrics. Before reporting any number, call check_readiness with the user's question.
- READY: report the value it returns, with the definition used.
- CLARIFY: ask the user to choose, listing the options it returns.
- BLOCKED: explain the reasons it returns; do not estimate a number.
Finish by calling submit_response.`;

export async function runAgent({ arm, question, role }) {
  const ctx = loadContext();
  const chat = startChat({
    system: baseSystem(ctx, role) + (arm === "gated" ? GATED_RULES : BASELINE_RULES),
    tools: arm === "gated" ? gatedTools : baselineTools,
    user: question,
  });
  const trace = [];
  const usage = { input_tokens: 0, output_tokens: 0 };
  let nudged = false;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const step = await chat.next();
    usage.input_tokens += step.usage.input_tokens;
    usage.output_tokens += step.usage.output_tokens;
    if (step.refused) return { outcome: "error", message: "Model declined.", trace, usage };

    const submit = step.calls.find((c) => c.name === "submit_response");
    if (submit) return { ...submit.input, trace, usage, turns: turn + 1 };

    if (step.calls.length === 0) {
      if (nudged) break;
      nudged = true;
      chat.addUserMessage("Please give your final response by calling submit_response.");
      continue;
    }

    const results = [];
    for (const call of step.calls) {
      let output;
      try {
        output = await runTool(call.name, call.input, { ctx, role });
      } catch (err) {
        output = { error: err.message };
      }
      trace.push({ tool: call.name, input: call.input, output });
      results.push({ id: call.id, content: JSON.stringify(output), isError: Boolean(output?.error) });
    }
    chat.addToolResults(results);
  }
  return { outcome: "error", message: "No final response.", trace, usage };
}

async function runTool(name, input, { ctx, role }) {
  switch (name) {
    case "list_metrics":
      // Same catalogue knowledge DataReady's interpreter gets: synonyms and ambiguous terms.
      return {
        metrics: ctx.registry.metrics.map(({ id, label, description, formula, synonyms, certified, owner, version }) => ({
          id, label, description, formula, also_called: synonyms, certified, owner, version,
        })),
        ambiguous_terms: ctx.registry.ambiguous_terms,
      };
    case "query_metric":
      return queryMetric(input, ctx, role);
    case "get_data_health":
      return dataHealth(input, ctx);
    case "check_readiness": {
      const { assessment } = await checkQuestion({ question: input.question, role, interpreter: "llm", metric_id: input.metric_id ?? undefined });
      const { decision, headline, options, blockers, value, value_formatted, metric, evidence, request } = assessment;
      return { decision, headline, options, blockers, value, value_formatted, metric, evidence, scope: request.period ? request : undefined };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}

// Behaves like a typical semantic-layer query: enforces access and returns
// whatever rows exist. It does not know about gaps, partial loads or failed checks.
function queryMetric({ metric_id, start_date, end_date, regions, channels }, ctx, role) {
  const metric = metricById(ctx, metric_id);
  if (!metric) return { error: `Unknown metric ${metric_id}` };
  if (!metric.allowed_roles.includes(role)) return { error: `Access denied: role ${role} cannot query ${metric_id}` };
  if (!metric.terms && !metric.ratio) return { error: `${metric_id} has no executable definition` };
  const rs = regions?.length ? regions : ctx.registry.regions;
  const cs = channels?.length ? channels : ctx.registry.channels;
  const rows = ctx.rows.filter((r) => r.date >= start_date && r.date <= end_date && rs.includes(r.region) && cs.includes(r.channel));
  return { metric_id, start_date, end_date, regions: rs, channels: cs, value: computeMetric(metric, rows), rows_scanned: rows.length };
}

// Summarised like an observability dashboard: problems listed, passes counted.
function dataHealth({ start_date, end_date }, ctx) {
  const inRange = (d) => d >= start_date && d <= end_date;
  const loads = ctx.loadLog.loads.filter((l) => inRange(l.date));
  const checks = ctx.quality.results.filter((q) => inRange(q.date));
  const ran = new Set(checks.map((q) => `${q.date}|${q.region}`));
  const missingRuns = [...new Set(loads.map((l) => l.date))].flatMap((d) =>
    ctx.registry.regions.filter((r) => !ran.has(`${d}|${r}`)).map((r) => ({ date: d, region: r })),
  );
  return {
    table: "sales_daily",
    last_refreshed_at: ctx.loadLog.last_refreshed_at,
    loads_complete: loads.filter((l) => l.status === "complete").length,
    loads_not_complete: loads.filter((l) => l.status !== "complete"),
    quality_checks_passed: checks.filter((q) => q.status === "pass").length,
    quality_checks_failed: checks.filter((q) => q.status !== "pass").map(({ date, region, check, detail }) => ({ date, region, check, detail })),
    missing_check_runs: missingRuns,
  };
}
