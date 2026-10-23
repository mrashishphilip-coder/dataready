// Extracts one question's real recorded runs (baseline and gated agents) from
// evals/results into public/replays/<id>.json, for the playground's replay mode.
// Nothing is re-run or edited: the replay shows what the agents actually did.
//
//   node scripts/make-replay.js B10
//   node scripts/make-replay.js B10 --run 2026-10-22T09-27    (a specific run, by file prefix)
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const id = process.argv[2];
if (!id) throw new Error("Usage: node scripts/make-replay.js <question id>");
const runPrefix = process.argv.includes("--run") ? process.argv[process.argv.indexOf("--run") + 1] : "";
const resultsDir = join(root, "evals", "results");
const { version } = JSON.parse(readFileSync(join(root, "evals", "questions.json"), "utf8"));

function latestRow(arm) {
  const files = readdirSync(resultsDir)
    .filter((f) => f.endsWith(`-${arm}.json`) && /^\d/.test(f) && f.startsWith(runPrefix))
    .sort()
    .reverse();
  for (const f of files) {
    const run = JSON.parse(readFileSync(join(resultsDir, f), "utf8"));
    if (run.eval_version !== version) continue;
    const row = run.rows.find((r) => r.id === id);
    if (row) return { run_at: run.run_at, model: run.model, row };
  }
  throw new Error(`No ${arm} result for ${id}`);
}

const lanes = {};
let question;
for (const arm of ["baseline", "gated"]) {
  const { run_at, model, row } = latestRow(arm);
  question = { id: row.id, question: row.question, role: row.role, expected: row.expected.outcome, tests: row.tests };
  lanes[arm] = {
    run_at,
    model,
    verdict: row.verdict,
    outcome: row.got.outcome,
    value: row.got.value,
    message: row.got.message,
    usage: row.got.usage,
    seconds: Math.round((row.got.ms ?? 0) / 100) / 10,
    trace: row.got.detail.trace,
  };
}

mkdirSync(join(root, "public", "replays"), { recursive: true });
const out = join(root, "public", "replays", `${id.toLowerCase()}.json`);
// How many full runs of this question each arm has, and how often each verdict occurred.
const consistency = {};
for (const arm of ["baseline", "gated"]) {
  const verdicts = readdirSync(resultsDir)
    .filter((f) => f.endsWith(`-${arm}.json`) && /^\d/.test(f))
    .map((f) => JSON.parse(readFileSync(join(resultsDir, f), "utf8")))
    .filter((r) => r.eval_version === version && r.summary.total > 3)
    .map((r) => r.rows.find((x) => x.id === id)?.verdict)
    .filter(Boolean);
  consistency[arm] = { runs: verdicts.length, same_as_shown: verdicts.filter((v) => v === lanes[arm].verdict).length };
}
writeFileSync(out, JSON.stringify({ question, lanes, consistency }, null, 2));
console.log(`Wrote ${out}: baseline ${lanes.baseline.verdict}, gated ${lanes.gated.verdict}`);
