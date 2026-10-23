// Builds the case-study page: injects real recorded agent runs and the summary
// numbers from evals/results into template.html → dataready-case-study.html.
//
//   node case-study/build.js
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const resultsDir = join(root, "evals", "results");
const { version, questions } = JSON.parse(readFileSync(join(root, "evals", "questions.json"), "utf8"));

// Run 1 of the three v2 runs: the one shown in the recorded demo.
const RUN = "2026-10-22T09-27";
const SHOWCASE = ["B10", "B08", "C01", "A19", "A04", "B06"];

const fullRuns = readdirSync(resultsDir)
  .filter((f) => /^\d/.test(f))
  .sort()
  .map((f) => ({ file: f, ...JSON.parse(readFileSync(join(resultsDir, f), "utf8")) }))
  .filter((r) => r.eval_version === version && r.summary.total === questions.length);

function runFor(arm) {
  const r = fullRuns.find((x) => x.arm === arm && x.file.startsWith(RUN));
  if (!r) throw new Error(`No ${arm} run starting ${RUN}`);
  return r;
}

// Keep only what the page shows for each tool call.
function slimOutput(tool, o) {
  if (o?.error) return { error: o.error };
  switch (tool) {
    case "list_metrics": return { metrics: o.metrics?.length ?? 0 };
    case "query_metric": return { value: o.value, rows_scanned: o.rows_scanned };
    case "get_data_health":
      return { failed: o.quality_checks_failed?.length ?? 0, pending: o.loads_not_complete?.length ?? 0, missing: o.missing_check_runs?.length ?? 0 };
    case "check_readiness": return { decision: o.decision, headline: o.headline, blockers: o.blockers ?? [], options: (o.options ?? []).map((x) => x.label) };
    default: return {};
  }
}

const baseline = runFor("baseline");
const gated = runFor("gated");
const replays = SHOWCASE.map((id) => {
  const q = questions.find((x) => x.id === id);
  const lane = (run) => {
    const row = run.rows.find((x) => x.id === id);
    return {
      verdict: row.verdict,
      outcome: row.got.outcome,
      metric_id: row.got.metric_id ?? null,
      value: row.got.value,
      message: row.got.message,
      seconds: Math.round(row.got.ms / 100) / 10,
      tokens: row.got.usage,
      steps: row.got.detail.trace.map((t) => ({ tool: t.tool, input: t.input, output: slimOutput(t.tool, t.output) })),
    };
  };
  // How often each arm gave this verdict across all v2 runs.
  const across = (arm) => {
    const vs = fullRuns.filter((r) => r.arm === arm).map((r) => r.rows.find((x) => x.id === id).verdict);
    return { runs: vs.length, correct: vs.filter((v) => v === "correct").length };
  };
  return { id, question: q.question, role: q.role, expected: q.expected.outcome, tests: q.tests, baseline: lane(baseline), gated: lane(gated), across: { baseline: across("baseline"), gated: across("gated") } };
});

// Summary table, same arithmetic as evals/aggregate.js.
function summarise(arm, n) {
  const runs = fullRuns.filter((r) => r.arm === arm).slice(-n);
  const stat = (k) => {
    const xs = runs.map((r) => r.summary.counts[k]);
    return { mean: xs.reduce((a, b) => a + b, 0) / xs.length, min: Math.min(...xs), max: Math.max(...xs) };
  };
  const tok = (k) => Math.round(runs.reduce((a, r) => a + r.summary.usage[k], 0) / runs.length / questions.length);
  return {
    arm,
    runs: runs.length,
    correct: stat("correct"),
    false_approval: stat("false_approval"),
    wrong_number: stat("wrong_number"),
    unnecessary_block: stat("unnecessary_block"),
    safe_mismatch: stat("safe_mismatch"),
    tokens_in: tok("input_tokens"),
    tokens_out: tok("output_tokens"),
  };
}
const summary = {
  version,
  questions: questions.length,
  model: baseline.model,
  arms: [summarise("gated", 3), summarise("llm", 3), summarise("baseline", 3), summarise("rules", 1)],
};

const template = readFileSync(join(here, "template.html"), "utf8");
const html = template.replace("/*__DATA__*/null", JSON.stringify({ replays, summary }));
writeFileSync(join(here, "dataready-case-study.html"), html);
console.log(`Built case-study/dataready-case-study.html with ${replays.length} replays.`);
for (const r of replays) console.log(`  ${r.id}: baseline ${r.baseline.verdict}, gated ${r.gated.verdict}`);
console.log(summary.arms.map((a) => `${a.arm}: correct ${a.correct.mean.toFixed(1)}, FA ${a.false_approval.mean}, tokens ${a.tokens_in}/${a.tokens_out}`).join("\n"));
