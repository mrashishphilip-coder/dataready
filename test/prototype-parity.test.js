// The published prototype bundles the engine for the browser. This runs that
// bundle in a sandbox and checks it decides exactly like the server code, and
// that every eval question has recorded agent runs. Run `node prototype/build.js` first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import { checkQuestion } from "../src/dataready.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const built = join(root, "prototype", "dataready-prototype.html");
const { questions } = JSON.parse(readFileSync(join(root, "evals", "questions.json"), "utf8"));

test("browser bundle matches the server for every eval question", { skip: !existsSync(built) && "prototype not built" }, async () => {
  const html = readFileSync(built, "utf8");
  const shim = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  const sandbox = { window: {}, setTimeout, Promise, Intl, Date, Math, JSON, Number, String, Object, Array, Set, Map, RegExp, Error };
  vm.runInNewContext(shim, sandbox);
  const api = sandbox.window.dataReadyApi;

  for (const q of questions) {
    const browser = await api("/api/check", { question: q.question, role: q.role, interpreter: "rules" });
    const server = await checkQuestion({ question: q.question, role: q.role, interpreter: "rules" });
    assert.equal(browser.assessment.decision, server.assessment.decision, q.id);
    assert.equal(browser.assessment.value, server.assessment.value, q.id);
    // Compared as JSON: arrays from the sandbox belong to another realm, which strict deepEqual rejects.
    const statuses = (a) => JSON.stringify(a.assessment.checks.map((c) => [c.id, c.status, c.detail]));
    assert.equal(statuses(browser), statuses(server), q.id);
    for (const arm of ["baseline", "gated"]) {
      const run = await api("/api/agent", { arm, question: q.question, role: q.role });
      assert.ok(run.recorded && run.outcome, `${q.id} ${arm}`);
    }
  }
});
