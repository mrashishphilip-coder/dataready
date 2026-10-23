// Runs the labeled questions through one or more arms and scores them.
//
//   npm run eval                          rules arm only (no API key needed)
//   npm run eval -- --arms rules,llm,baseline
//   npm run eval -- --arms baseline --only A01,B03
//
// Arms:
//   rules     DataReady with the rules interpreter (no model)
//   llm       DataReady with the AI interpreter
//   baseline  AI agent with definitions, a query tool and a data-health tool
//   gated     AI agent whose only data tool is DataReady
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { checkQuestion } from "../src/dataready.js";
import { runAgent } from "../src/agents.js";
import { llmConfigured, provider, modelName } from "../src/llm.js";
import { trueValue, valueMatches } from "./truth.js";

const here = dirname(fileURLToPath(import.meta.url));
const resultsDir = join(here, "results");
const ALL_ARMS = ["rules", "llm", "baseline", "gated"];
const CONCURRENCY = 4;

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const arms = (args.arms ?? "rules").split(",");
for (const a of arms) if (!ALL_ARMS.includes(a)) throw new Error(`Unknown arm ${a}. Use: ${ALL_ARMS.join(", ")}`);
if (arms.some((a) => a !== "rules") && !llmConfigured()) {
  console.error("These arms call an AI model. Add an API key to .env first (see .env.example).");
  process.exit(1);
}
const only = args.only ? new Set(args.only.split(",")) : null;
const { questions, version: evalVersion } = JSON.parse(readFileSync(join(here, "questions.json"), "utf8"));
const items = questions.filter((q) => !only || only.has(q.id));

async function runArm(arm, q) {
  const started = Date.now();
  if (arm === "rules" || arm === "llm") {
    const { interpretation, assessment } = await checkQuestion({ question: q.question, role: q.role, interpreter: arm });
    const outcome = { READY: "answer", CLARIFY: "clarify", BLOCKED: "decline" }[assessment.decision];
    return {
      outcome,
      metric_id: assessment.metric?.id ?? null,
      value: assessment.value ?? null,
      message: assessment.headline,
      detail: { interpretation, blockers: assessment.blockers },
      usage: interpretation.usage,
      ms: Date.now() - started,
    };
  }
  const r = await runAgent({ arm, question: q.question, role: q.role });
  return { ...r, detail: { trace: r.trace }, trace: undefined, ms: Date.now() - started };
}

function score(q, got) {
  const exp = q.expected;
  if (got.outcome === "error") return "error";
  if (exp.outcome === "answer") {
    if (got.outcome !== "answer") return "unnecessary_block";
    const truth = trueValue(exp);
    return got.metric_id === exp.metric_id && valueMatches(got.value, truth) ? "correct" : "wrong_number";
  }
  if (got.outcome === "answer") return "false_approval";
  return got.outcome === exp.outcome ? "correct" : "safe_mismatch";
}

async function pool(list, fn) {
  const out = new Array(list.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, list.length) }, async () => {
      while (next < list.length) {
        const i = next++;
        out[i] = await fn(list[i]);
      }
    }),
  );
  return out;
}

mkdirSync(resultsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

for (const arm of arms) {
  console.log(`\n▶ ${arm} · ${items.length} questions`);
  const rows = await pool(items, async (q) => {
    let got;
    try {
      got = await runArm(arm, q);
    } catch (err) {
      got = { outcome: "error", message: err.message };
    }
    const verdict = score(q, got);
    const mark = verdict === "correct" ? "✓" : verdict === "error" ? "!" : "✗";
    console.log(`  ${mark} ${q.id} ${verdict.padEnd(17)} expected ${q.expected.outcome.padEnd(7)} got ${got.outcome}`);
    return { id: q.id, question: q.question, role: q.role, tests: q.tests, expected: q.expected, got, verdict };
  });
  const record = { arm, eval_version: evalVersion, model: arm === "rules" ? null : `${provider()} · ${modelName()}`, run_at: new Date().toISOString(), summary: summarise(rows), rows };
  writeFileSync(join(resultsDir, `${stamp}-${arm}.json`), JSON.stringify(record, null, 2));
  writeFileSync(join(resultsDir, `latest-${arm}.json`), JSON.stringify(record, null, 2));
  console.log(`  → ${JSON.stringify(record.summary.counts)}`);
}

writeReport();

function summarise(rows) {
  const counts = { correct: 0, false_approval: 0, wrong_number: 0, unnecessary_block: 0, safe_mismatch: 0, error: 0 };
  for (const r of rows) counts[r.verdict]++;
  const byGroup = {};
  for (const r of rows) {
    const g = r.expected.outcome;
    byGroup[g] ??= { total: 0, correct: 0 };
    byGroup[g].total++;
    if (r.verdict === "correct") byGroup[g].correct++;
  }
  const usage = rows.reduce(
    (a, r) => ({ input_tokens: a.input_tokens + (r.got.usage?.input_tokens ?? 0), output_tokens: a.output_tokens + (r.got.usage?.output_tokens ?? 0) }),
    { input_tokens: 0, output_tokens: 0 },
  );
  return { total: rows.length, counts, byGroup, usage };
}

// Rebuilds evals/RESULTS.md from the latest run of each arm.
function writeReport() {
  const latest = readdirSync(resultsDir)
    .filter((f) => f.startsWith("latest-"))
    .map((f) => JSON.parse(readFileSync(join(resultsDir, f), "utf8")))
    .sort((a, b) => ALL_ARMS.indexOf(a.arm) - ALL_ARMS.indexOf(b.arm));
  const label = {
    rules: "DataReady · rules interpreter",
    llm: "DataReady · AI interpreter",
    baseline: "AI agent, no gate (baseline)",
    gated: "AI agent + DataReady gate",
  };
  const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : "–");
  const lines = [
    "# DataReady experiment results",
    "",
    "Generated by `npm run eval`. Each arm answers the same labeled questions (`evals/questions.json`).",
    "",
    "| Arm | Model | Correct | False approvals | Wrong numbers | Unnecessary blocks | Clarify↔decline mix-ups | Errors | Questions | Run |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...latest.map((r) => {
      const c = r.summary.counts;
      return `| ${label[r.arm]} | ${r.model ?? "none"} | ${c.correct} (${pct(c.correct, r.summary.total)}) | ${c.false_approval} | ${c.wrong_number} | ${c.unnecessary_block} | ${c.safe_mismatch} | ${c.error} | ${r.summary.total} | ${r.run_at.slice(0, 16)} |`;
    }),
    "",
    "- **False approval:** reported a number when it should have asked or declined. The dangerous error.",
    "- **Wrong number:** answered when it should have, but with the wrong metric or value.",
    "- **Unnecessary block:** asked or declined when a clean answer existed. The annoying error.",
    "- **Clarify↔decline mix-up:** safe, but the wrong kind of non-answer.",
    "",
    "## Misses by arm",
    "",
    ...latest.flatMap((r) => {
      const misses = r.rows.filter((x) => x.verdict !== "correct");
      return [
        `### ${label[r.arm]}`,
        "",
        ...(misses.length
          ? misses.map((x) => `- **${x.id}** (${x.verdict}) "${x.question}" — expected ${x.expected.outcome}, got ${x.got.outcome}. _${x.tests}_`)
          : ["- None."]),
        "",
      ];
    }),
  ];
  writeFileSync(join(here, "RESULTS.md"), lines.join("\n"));
  console.log(`\nReport: evals/RESULTS.md`);
}
