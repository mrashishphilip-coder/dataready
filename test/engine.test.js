import { test } from "node:test";
import assert from "node:assert/strict";
import { loadContext } from "../src/context.js";
import { assess, stillValid, computeMetric } from "../src/engine.js";
import { interpretWithRules } from "../src/interpret-rules.js";

const ctx = loadContext();
const req = (over) => ({
  metric_candidates: ["gross_sales"],
  period: { start: "2026-09-01", end: "2026-09-30" },
  regions: [],
  channels: [],
  role: "analyst",
  ...over,
});

test("a clean, complete period is READY with a value", () => {
  const r = assess(req(), ctx);
  assert.equal(r.decision, "READY");
  assert.equal(r.evidence.rows_used, 30 * 4 * 2);
  assert.ok(r.value > 0);
});

test("two candidate definitions ask for clarification instead of picking one", () => {
  const r = assess(req({ metric_candidates: ["net_revenue_finance", "net_revenue_sales"] }), ctx);
  assert.equal(r.decision, "CLARIFY");
  assert.equal(r.options.length, 2);
});

test("no metric asks for clarification", () => {
  assert.equal(assess(req({ metric_candidates: [] }), ctx).decision, "CLARIFY");
});

test("a missing period asks for clarification", () => {
  assert.equal(assess(req({ period: null }), ctx).decision, "CLARIFY");
});

test("a draft metric is blocked", () => {
  assert.equal(assess(req({ metric_candidates: ["contribution_margin"] }), ctx).decision, "BLOCKED");
});

test("a role without access is blocked and sees no value", () => {
  const r = assess(req({ metric_candidates: ["net_revenue_finance"], role: "sales" }), ctx);
  assert.equal(r.decision, "BLOCKED");
  assert.equal(r.value, undefined);
  assert.equal(r.checks.find((c) => c.id === "coverage"), undefined, "no data checks run after an access failure");
});

test("today is blocked as incomplete", () => {
  const r = assess(req({ period: { start: "2026-10-22", end: "2026-10-22" } }), ctx);
  assert.equal(r.decision, "BLOCKED");
});

test("yesterday is blocked overall but READY for the online channel only", () => {
  const day = { start: "2026-10-21", end: "2026-10-21" };
  assert.equal(assess(req({ period: day }), ctx).decision, "BLOCKED");
  assert.equal(assess(req({ period: day, channels: ["online"] }), ctx).decision, "READY");
});

test("the silent South gap blocks South but not North", () => {
  const day = { start: "2026-10-19", end: "2026-10-19" };
  const south = assess(req({ period: day, regions: ["South"] }), ctx);
  assert.equal(south.decision, "BLOCKED");
  assert.equal(south.checks.find((c) => c.id === "coverage").status, "fail");
  assert.equal(assess(req({ period: day, regions: ["North"] }), ctx).decision, "READY");
});

test("the failed West returns check blocks metrics that use returns, in scopes that include it", () => {
  const lastWeek = { start: "2026-10-12", end: "2026-10-18" };
  const net = ["net_revenue_finance"];
  assert.equal(assess(req({ metric_candidates: net, period: lastWeek }), ctx).decision, "BLOCKED");
  assert.equal(assess(req({ metric_candidates: net, period: lastWeek, regions: ["North"] }), ctx).decision, "READY");
});

test("a failed returns check does not block metrics that don't use returns", () => {
  const lastWeek = { start: "2026-10-12", end: "2026-10-18" };
  for (const id of ["gross_sales", "order_count", "average_order_value"]) {
    const r = assess(req({ metric_candidates: [id], period: lastWeek, regions: ["West"] }), ctx);
    assert.equal(r.decision, "READY", id);
    assert.match(r.checks.find((c) => c.id === "quality").detail, /doesn't use returns/);
  }
});

test("periods before the data window are blocked", () => {
  assert.equal(assess(req({ period: { start: "2026-08-01", end: "2026-08-31" } }), ctx).decision, "BLOCKED");
});

test("a READY assessment is invalid for a different request or after expiry", () => {
  const request = req();
  const r = assess(request, ctx);
  assert.equal(stillValid(r, request, ctx).valid, true);
  assert.equal(stillValid(r, { ...request, regions: ["North"] }, ctx).valid, false);
  assert.equal(stillValid(r, request, ctx, "2026-10-22T10:20:00+05:30").valid, false);
});

test("average order value is a ratio of sums, not an average of ratios", () => {
  const rows = [
    { gross: 100, orders: 1 },
    { gross: 300, orders: 3 },
  ];
  assert.equal(computeMetric(ctx.registry.metrics.find((m) => m.id === "average_order_value"), rows), 100);
});

test("rules interpreter: ambiguous revenue, explicit definitions and periods", () => {
  const a = interpretWithRules("What was revenue last month?", ctx);
  assert.deepEqual(a.metric_candidates.sort(), ["net_revenue_finance", "net_revenue_sales"]);
  assert.deepEqual(a.period, { start: "2026-09-01", end: "2026-09-30" });
  const b = interpretWithRules("Gross sales for North last week", ctx);
  assert.deepEqual(b.metric_candidates, ["gross_sales"]);
  assert.deepEqual(b.regions, ["North"]);
  assert.deepEqual(b.period, { start: "2026-10-12", end: "2026-10-18" });
  const c = interpretWithRules("GMV on 5 October 2026", ctx);
  assert.deepEqual(c.period, { start: "2026-10-05", end: "2026-10-05" });
});
