// Local web server for the DataReady playground. No framework: Node's http module.
//   npm start  →  http://localhost:4173
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, extname } from "node:path";
import { checkQuestion } from "./src/dataready.js";
import { runAgent } from "./src/agents.js";
import { loadContext } from "./src/context.js";
import { llmConfigured, provider, modelName } from "./src/llm.js";

const PORT = Number(process.env.PORT ?? 4173);
const evalQuestions = JSON.parse(await readFile(new URL("./evals/questions.json", import.meta.url), "utf8")).questions;
const publicDir = join(dirname(fileURLToPath(import.meta.url)), "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml" };

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  // Objects from API routes are encoded here; file contents (Buffers) pass through as-is.
  res.end(type === "application/json" && !Buffer.isBuffer(body) ? JSON.stringify(body) : body);
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 20_000) throw new Error("Request too large.");
  }
  return JSON.parse(raw || "{}");
}

const routes = {
  "GET /api/context": () => {
    const { registry, loadLog } = loadContext();
    return {
      company: registry.company,
      now: registry.now,
      data_starts: registry.data_starts,
      roles: registry.roles,
      metrics: registry.metrics.map(({ id, label, formula, certified, owner, version }) => ({ id, label, formula, certified, owner, version })),
      table_refreshed_at: loadLog.last_refreshed_at,
      llm: llmConfigured() ? { provider: provider(), model: modelName() } : null,
      // Lets the playground show the labeled expectation when a question comes from the eval set.
      labels: evalQuestions.map(({ id, question, role, expected, tests }) => ({ id, question, role, expected: expected.outcome, tests })),
    };
  },
  "POST /api/check": async (body) => {
    const question = String(body.question ?? "").trim().slice(0, 500);
    if (!question) throw new Error("Ask a question first.");
    return checkQuestion({ question, role: body.role, interpreter: body.interpreter ?? "auto", metric_id: body.metric_id || undefined });
  },
  "POST /api/agent": async (body) => {
    if (!llmConfigured()) throw new Error("Add an API key to .env to run the agents.");
    const question = String(body.question ?? "").trim().slice(0, 500);
    if (!["baseline", "gated"].includes(body.arm)) throw new Error("Unknown agent.");
    return runAgent({ arm: body.arm, question, role: body.role });
  },
};

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const route = routes[`${req.method} ${url.pathname}`];
  try {
    if (route) return send(res, 200, await route(req.method === "POST" ? await readJson(req) : {}));
    if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });
    const file = normalize(join(publicDir, url.pathname === "/" ? "index.html" : url.pathname));
    if (!file.startsWith(publicDir)) return send(res, 403, { error: "Forbidden" });
    const body = await readFile(file);
    send(res, 200, body, TYPES[extname(file)] ?? "application/octet-stream");
  } catch (err) {
    const status = err.code === "ENOENT" ? 404 : 400;
    send(res, status, { error: status === 404 ? "Not found" : err.message });
  }
}).listen(PORT, () => {
  console.log(`DataReady playground: http://localhost:${PORT}`);
  console.log(llmConfigured() ? `AI interpreter on (${provider()} · ${modelName()}).` : "No API key in .env: using the rules interpreter only.");
});
