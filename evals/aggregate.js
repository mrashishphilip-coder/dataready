// Combines the most recent full runs of each AI arm (default: last 3) into
// evals/SUMMARY.md: mean and range per verdict, and questions whose verdict
// changed between runs. AI output varies run to run; one run is an anecdote.
//
//   node evals/aggregate.js            last 3 full runs per arm
//   node evals/aggregate.js --runs 5
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const resultsDir = join(here, "results");
const runsWanted = Number(process.argv[process.argv.indexOf("--runs") + 1]) || 3;
const { questions, version } = JSON.parse(readFileSync(join(here, "questions.json"), "utf8"));
const total = questions.length;
const ARMS = ["rules", "llm", "baseline", "gated"];
const LABEL = {
  rules: "DataReady · rules interpreter",
  llm: "DataReady · AI interpreter",
  baseline: "AI agent, no gate (baseline)",
  gated: "AI agent + DataReady gate",
};
const VERDICTS = ["correct", "false_approval", "wrong_number", "unnecessary_block", "safe_mismatch", "error"];

// Timestamped files only (not latest-*), full question set only, newest last.
const runs = readdirSync(resultsDir)
  .filter((f) => /^\d{4}-.*\.json$/.test(f))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(resultsDir, f), "utf8")))
  .filter((r) => r.eval_version === version && r.summary.total === total);

const lines = [
  "# DataReady experiment: summary across runs",
  "",
  `Question set ${version}. Each arm answered all ${total} labeled questions. AI arms are run ${runsWanted} times because model output varies between runs; the table shows the mean and, in brackets, the lowest and highest count. The rules arm is deterministic, so one run is enough.`,
  "",
  "| Arm | Model | Runs | Correct | False approvals | Wrong numbers | Unnecessary blocks | Clarify↔decline mix-ups | Errors | Tokens per question (in / out) |",
  "|---|---|---|---|---|---|---|---|---|---|",
];
const flaky = [];

for (const arm of ARMS) {
  const mine = runs.filter((r) => r.arm === arm).slice(arm === "rules" ? -1 : -runsWanted);
  if (!mine.length) continue;
  const cell = (v) => {
    const xs = mine.map((r) => r.summary.counts[v]);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    const m = Number.isInteger(mean) ? String(mean) : mean.toFixed(1);
    return lo === hi ? m : `${m} (${lo}–${hi})`;
  };
  const tok = (k) => Math.round(mine.reduce((a, r) => a + r.summary.usage[k], 0) / mine.length / total);
  lines.push(
    `| ${LABEL[arm]} | ${mine[0].model ?? "none"} | ${mine.length} | ${VERDICTS.map(cell).join(" | ")} | ${tok("input_tokens")} / ${tok("output_tokens")} |`,
  );

  // Questions whose verdict was not the same in every run, or never correct.
  const byQ = new Map();
  for (const r of mine) for (const row of r.rows) {
    if (!byQ.has(row.id)) byQ.set(row.id, { row, verdicts: [] });
    byQ.get(row.id).verdicts.push(row.verdict);
  }
  for (const [id, { row, verdicts }] of byQ) {
    if (verdicts.every((v) => v === "correct")) continue;
    flaky.push({ arm, id, question: row.question, tests: row.tests, expected: row.expected.outcome, verdicts });
  }
}

lines.push(
  "",
  "- **False approval:** reported a number when it should have asked or declined. The dangerous error.",
  "- **Wrong number:** answered when it should have, but with the wrong metric or value.",
  "- **Unnecessary block:** asked or declined when a clean answer existed. The annoying error.",
  "",
  "## Every question missed at least once",
  "",
  "| Arm | Question | Expected | Verdict in each run | What it tests |",
  "|---|---|---|---|---|",
  ...flaky.map((f) => `| ${LABEL[f.arm]} | **${f.id}** ${f.question} | ${f.expected} | ${f.verdicts.join(", ")} | ${f.tests} |`),
  "",
);
writeFileSync(join(here, "SUMMARY.md"), lines.join("\n"));
console.log(`Wrote evals/SUMMARY.md from ${runs.length} full runs.`);
