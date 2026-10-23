// Builds the published prototype: the playground page (public/index.html) running
// entirely in the browser, with no server.
//
// - The readiness engine, rules interpreter and interpreter prompt are bundled
//   from src/ (the same code the server runs), with the sample data inlined.
// - The AI interpreter asks Claude through the artifact's `sample` capability,
//   on the viewer's own Claude account: no API key in the page.
// - The two-agent comparison shows the recorded evaluation runs (gpt-5.5).
//
//   node prototype/build.js   →   prototype/dataready-prototype.html
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const read = (...p) => readFileSync(join(root, ...p), "utf8");

// 1. Bundle the browser-safe modules in dependency order. They only import each
//    other, so dropping import lines and `export` keywords makes one script.
const MODULES = ["hash.js", "dates.js", "context-core.js", "conventions.js", "interpret-prompt.js", "engine.js", "interpret-rules.js"];
const bundle = MODULES.map((f) => {
  const src = read("src", f)
    .split(/\r?\n/)
    .filter((line) => !/^import\s/.test(line) && !/^export\s*\{/.test(line))
    .map((line) => line.replace(/^export\s+/, ""))
    .join("\n");
  if (/\bimport\(|require\(/.test(src)) throw new Error(`${f} is not browser-safe`);
  return `// ---- src/${f} ----\n${src}`;
}).join("\n\n");

// 2. Data: the raw files (so the evidence hash matches the server's) and the recorded runs.
const raw = {
  registry: read("data", "registry.json"),
  sales: read("data", "sales_daily.csv"),
  loads: JSON.stringify(JSON.parse(read("data", "load_log.json"))),
  quality: JSON.stringify(JSON.parse(read("data", "quality_checks.json"))),
};
// Compacting two files changes their text, so recompute nothing here: the
// browser builds its own evidence hash from exactly these strings.

const { questions, version } = JSON.parse(read("evals", "questions.json"));
const RUN = "2026-10-22T09-27"; // run 1 of 3, the run shown in the case study and the recorded demo
const resultsDir = join(root, "evals", "results");
const runFile = (arm) => {
  const f = readdirSync(resultsDir).find((x) => x.startsWith(RUN) && x.endsWith(`-${arm}.json`));
  if (!f) throw new Error(`No ${arm} run starting ${RUN}`);
  const run = JSON.parse(readFileSync(join(resultsDir, f), "utf8"));
  if (run.eval_version !== version) throw new Error(`${f} is from question set ${run.eval_version}, not ${version}`);
  return run;
};
const slimTrace = (trace) =>
  trace.map(({ tool, input, output }) => {
    if (tool === "list_metrics") return { tool, input, output: { metrics: (output.metrics ?? []).map((m) => m.id) } };
    if (tool === "check_readiness") {
      const { decision, headline, blockers, options, value, metric } = output;
      return { tool, input, output: { decision, headline, blockers, options: options?.map(({ id, label }) => ({ id, label })), value, metric } };
    }
    return { tool, input, output };
  });
const runs = {};
for (const arm of ["baseline", "gated"]) {
  for (const row of runFile(arm).rows) {
    const key = `${row.role}|${row.question.trim().toLowerCase()}`;
    runs[key] ??= {};
    runs[key][arm] = {
      outcome: row.got.outcome,
      metric_id: row.got.metric_id ?? null,
      value: row.got.value ?? null,
      message: row.got.message,
      usage: row.got.usage,
      seconds: Math.round(row.got.ms / 100) / 10,
      trace: slimTrace(row.got.detail.trace),
      recorded: true,
    };
  }
}
const labels = questions.map(({ id, question, role, expected, tests }) => ({ id, question, role, expected: expected.outcome, tests }));
const replays = { b10: JSON.parse(read("public", "replays", "b10.json")) };

const json = (v) => JSON.stringify(v).replace(/<\//g, "<\\/");

// 3. The in-browser implementation of the playground's API.
const shim = `
${bundle}

// ---- published-prototype API ----
const RAW = ${json(raw)};
const RUNS = ${json(runs)};
const LABELS = ${json(labels)};
const REPLAYS = ${json(replays)};
const ctx = createContext(RAW);

let samplePromise;
function getSample() {
  // Resolves Claude's sample function, or null where this view can't use it.
  samplePromise ??= Promise.race([
    window.claude?.use ? window.claude.use("sample").catch(() => null) : Promise.resolve(null),
    new Promise((resolve) => setTimeout(() => resolve(null), 4000)),
  ]);
  return samplePromise;
}

const SAMPLE_ERRORS = {
  not_granted: "Claude isn't allowed for this page. Switch to the Rules interpreter, or reload the page to be asked again.",
  sampling_disabled: "Claude isn't available on this account. Use the Rules interpreter.",
  rate_limited: "Claude is busy for your account right now. Try again in a minute, or use the Rules interpreter.",
  invalid_json: "Claude's answer couldn't be read. Try again.",
  session_expired: "Your Claude session expired. Sign in again, then retry.",
};

async function interpretWithClaude(question) {
  const sample = await getSample();
  if (!sample) throw new Error("Claude isn't available in this view. Use the Rules interpreter.");
  const started = Date.now();
  const prompt = systemPrompt(ctx) + "\\n\\n" +
    'Reply with only one JSON object with exactly these keys: metric_candidates (array of metric ids), period ({"start":"YYYY-MM-DD","end":"YYYY-MM-DD"}, or null), regions (array), channels (array), notes (string).\\n' +
    'Example: {"metric_candidates":["gross_sales"],"period":{"start":"2026-10-12","end":"2026-10-18"},"regions":["North"],"channels":[],"notes":"Last week runs Monday to Sunday."}\\n\\n' +
    "Question: " + question;
  try {
    const data = await sample.json(prompt, { modelTier: "default", effort: "low" });
    return { source: "llm", provider: "claude", model: "Claude", latency_ms: Date.now() - started, ...validateInterpretation(data, ctx) };
  } catch (e) {
    throw new Error(SAMPLE_ERRORS[e?.code] ?? "Claude couldn't answer (" + (e?.code ?? "error") + "). Try again, or use the Rules interpreter.");
  }
}

window.dataReadyApi = async (path, body = {}) => {
  if (path === "/api/context") {
    const sample = await getSample();
    return {
      company: ctx.registry.company,
      now: ctx.registry.now,
      data_starts: ctx.registry.data_starts,
      roles: ctx.registry.roles,
      metrics: ctx.registry.metrics.map(({ id, label, formula, certified, owner, version }) => ({ id, label, formula, certified, owner, version })),
      table_refreshed_at: ctx.loadLog.last_refreshed_at,
      llm: sample ? { provider: "claude", model: "Claude (your account)" } : null,
      llm_default: false,
      recorded_agents: true,
      note: "Runs in your browser",
      labels: LABELS,
    };
  }
  if (path === "/api/check") {
    const question = String(body.question ?? "").trim().slice(0, 500);
    if (!question) throw new Error("Ask a question first.");
    if (!ctx.registry.roles[body.role]) throw new Error("Unknown role: " + body.role);
    const interpretation = body.interpreter === "llm" ? await interpretWithClaude(question) : interpretWithRules(question, ctx);
    const candidates = body.metric_id ? [body.metric_id] : interpretation.metric_candidates;
    const assessment = assess({ ...interpretation, metric_candidates: candidates, role: body.role }, ctx);
    return { question, role: body.role, interpretation, assessment };
  }
  if (path === "/api/agent") {
    const run = RUNS[body.role + "|" + String(body.question ?? "").trim().toLowerCase()]?.[body.arm];
    if (!run) throw new Error("This published version replays the recorded runs for the 41 eval questions. Pick one of the examples (with its role), or run the project locally to try any question live.");
    return run;
  }
  const replay = path.match(/^\\/replays\\/([a-z0-9]+)\\.json$/);
  if (replay && REPLAYS[replay[1]]) return REPLAYS[replay[1]];
  throw new Error("Not available in the published version: " + path);
};
`;

// 4. Assemble the artifact page from the playground's own markup and script.
const page = read("public", "index.html");
const title = page.match(/<title>[\s\S]*?<\/title>/)[0];
const style = page.match(/<style>[\s\S]*?<\/style>/)[0];
let body = page.match(/<body>([\s\S]*)<\/body>/)[1];
if ((body.match(/<script>/g) ?? []).length !== 1) throw new Error("Expected exactly one inline script in public/index.html");
// Module scripts run in order, so the API exists before the page script calls it.
body = body.replace("<script>", `<script type="module">${shim}</script>\n<script type="module">`);

const out = `${title}
<meta name="claude:viewport-fit-sides" content="cover">
${style}
${body}`;
writeFileSync(join(here, "dataready-prototype.html"), out);
console.log(`Built prototype/dataready-prototype.html (${Math.round(out.length / 1024)} KB): ${Object.keys(runs).length} recorded questions, question set ${version}.`);
