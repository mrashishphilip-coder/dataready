// The readiness engine. Deterministic code, no model calls: given an interpreted
// request, decide READY, CLARIFY or BLOCKED and show the evidence for that decision.
//
// Design rules:
// - Ambiguity is resolved by the person asking, never by the engine or a model.
// - Access is checked before any data is read, so a blocked role learns nothing.
// - Data checks are scoped to the request: a problem outside the requested
//   dates, regions or channels does not block it.
// - A READY result is bound to the request and the evidence it was made on.
import { hashHex } from "./hash.js";
import { metricById } from "./context-core.js";
import { todayIn, dateRange, isIsoDate } from "./dates.js";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("en-IN");

export function assess(request, ctx) {
  const { registry } = ctx;
  const checks = [];
  const add = (id, label, status, detail) => checks.push({ id, label, status, detail });
  const result = (decision, headline, extra = {}) => ({
    decision,
    headline,
    checks,
    request: normalise(request, registry),
    assessed_at: ctx.now,
    ...extra,
  });

  // 1. Meaning: exactly one metric must be in play.
  const candidates = [...new Set(request.metric_candidates ?? [])].filter((id) => metricById(ctx, id));
  if (candidates.length === 0) {
    add("meaning", "Metric", "fail", "The question does not name a metric DataReady recognises.");
    return result("CLARIFY", "Which metric do you mean?", {
      options: registry.metrics.filter((m) => m.certified).map(optionFor),
    });
  }
  if (candidates.length > 1) {
    const labels = candidates.map((id) => metricById(ctx, id).label).join(" or ");
    add("meaning", "Metric", "fail", `The wording fits more than one approved definition: ${labels}.`);
    return result("CLARIFY", `This could mean ${labels}. Which one?`, {
      options: candidates.map((id) => optionFor(metricById(ctx, id))),
    });
  }
  const metric = metricById(ctx, candidates[0]);
  add("meaning", "Metric", "pass", `${metric.label} · v${metric.version} · ${metric.formula}`);

  // 2. Certification.
  if (!metric.certified) {
    add("certified", "Certified definition", "fail", `${metric.label} is a draft (v${metric.version}). ${metric.description}`);
    return result("BLOCKED", `${metric.label} has no approved definition yet.`, { metric: metricSummary(metric) });
  }
  add("certified", "Certified definition", "pass", `Owner: ${metric.owner}`);

  // 3. Access, before any data is read.
  const role = request.role;
  if (!metric.allowed_roles.includes(role)) {
    add("access", "Access", "fail", `The ${role} role may not see ${metric.label}.`);
    return result("BLOCKED", `You don't have access to ${metric.label}.`, { metric: metricSummary(metric) });
  }
  add("access", "Access", "pass", `${role} may see ${metric.label}.`);

  // 4. Period.
  const period = request.period;
  if (!period || !isIsoDate(period.start) || !isIsoDate(period.end) || period.start > period.end) {
    add("period", "Time period", "fail", "The question does not give a clear time period.");
    return result("CLARIFY", `For which period do you want ${metric.label}?`, { metric: metricSummary(metric) });
  }
  add("period", "Time period", "pass", period.start === period.end ? period.start : `${period.start} to ${period.end}`);

  const regions = request.regions?.length ? request.regions : registry.regions;
  const channels = request.channels?.length ? request.channels : registry.channels;
  const days = dateRange(period.start, period.end);
  const blockers = [];

  // 5. Completeness: the period must have finished and be inside the data window.
  const today = todayIn(ctx.now);
  if (period.end >= today) {
    const msg = `The period includes ${today} (today), which is still in progress. Data is loaded up to yesterday at most.`;
    add("complete", "Period complete", "fail", msg);
    blockers.push(msg);
  } else if (period.start < registry.data_starts) {
    const msg = `Data starts on ${registry.data_starts}; the period begins on ${period.start}.`;
    add("complete", "Period complete", "fail", msg);
    blockers.push(msg);
  } else {
    const pending = ctx.loadLog.loads.filter(
      (l) => l.status !== "complete" && days.includes(l.date) && channels.includes(l.channel),
    );
    if (pending.length) {
      const msg = pending.map((l) => `the ${l.channel} load for ${l.date} is still ${l.status}`).join("; ");
      add("complete", "Period complete", "fail", `Partial data: ${msg}.`);
      blockers.push(`Partial data: ${msg}.`);
    } else {
      add("complete", "Period complete", "pass", `All loads for this period and channel scope are complete.`);
    }
  }

  // 6. Coverage: every date × region × channel in scope must have a row.
  const inWindow = days.filter((d) => d >= registry.data_starts && d < today);
  const have = new Set(ctx.rows.map((r) => `${r.date}|${r.region}|${r.channel}`));
  const pendingKeys = new Set(ctx.loadLog.loads.filter((l) => l.status !== "complete").map((l) => `${l.date}|${l.channel}`));
  const gaps = [];
  for (const d of inWindow)
    for (const r of regions)
      for (const c of channels)
        if (!have.has(`${d}|${r}|${c}`) && !pendingKeys.has(`${d}|${c}`)) gaps.push(`${r} ${c} on ${d}`);
  if (gaps.length) {
    const msg = `No rows for ${summariseGaps(gaps)}, although the loads are marked complete.`;
    add("coverage", "Coverage", "fail", msg);
    blockers.push(msg);
  } else {
    add("coverage", "Coverage", "pass", `${regions.length} region(s) × ${channels.length} channel(s) present for every loaded day.`);
  }

  // 7. Quality: upstream checks for the scope must have passed, but only checks
  // on columns this metric uses. A returns problem does not affect order counts.
  const uses = metricColumns(metric);
  const failedInScope = ctx.quality.results.filter(
    (q) => q.status !== "pass" && days.includes(q.date) && regions.includes(q.region),
  );
  const relevant = failedInScope.filter((q) => (registry.quality_checks[q.check]?.columns ?? uses).some((c) => uses.includes(c)));
  const irrelevant = failedInScope.filter((q) => !relevant.includes(q));
  if (relevant.length) {
    const msg = relevant.map((q) => `${q.check} failed for ${q.region} on ${q.date}: ${q.detail}`).join(" ");
    add("quality", "Quality checks", "fail", msg);
    blockers.push(msg);
  } else if (irrelevant.length) {
    const msg = irrelevant
      .map((q) => `${q.check} failed for ${q.region} on ${q.date}, but ${metric.label} doesn't use ${registry.quality_checks[q.check].columns.join(", ")}.`)
      .join(" ");
    add("quality", "Quality checks", "pass", `Checks for this metric passed. Note: ${msg}`);
  } else {
    add("quality", "Quality checks", "pass", "Row count, non-negative amounts and returns reconciliation passed for this scope.");
  }

  // 8. Freshness of the table as a whole.
  const ageHours = (Date.parse(ctx.now) - Date.parse(ctx.loadLog.last_refreshed_at)) / 3_600_000;
  if (ageHours > registry.policy.freshness_sla_hours) {
    const msg = `Table last refreshed ${ageHours.toFixed(1)} h ago; the SLA is ${registry.policy.freshness_sla_hours} h.`;
    add("freshness", "Freshness", "fail", msg);
    blockers.push(msg);
  } else {
    add("freshness", "Freshness", "pass", `Refreshed ${ageHours.toFixed(1)} h ago (SLA ${registry.policy.freshness_sla_hours} h).`);
  }

  if (blockers.length) {
    return result("BLOCKED", `${metric.label} can't be reported reliably for this request.`, {
      metric: metricSummary(metric),
      blockers,
    });
  }

  // READY: compute the value from the scoped rows only.
  const scoped = ctx.rows.filter(
    (r) => r.date >= period.start && r.date <= period.end && regions.includes(r.region) && channels.includes(r.channel),
  );
  const value = computeMetric(metric, scoped);
  const expiresAt = new Date(Date.parse(ctx.now) + registry.policy.assessment_ttl_minutes * 60_000).toISOString();
  const normalised = normalise(request, registry);
  return result("READY", `${metric.label}: ${format(metric, value)}`, {
    metric: metricSummary(metric),
    value,
    value_formatted: format(metric, value),
    evidence: {
      rows_used: scoped.length,
      definition: `${metric.formula} (v${metric.version})`,
      owner: metric.owner,
      table_refreshed_at: ctx.loadLog.last_refreshed_at,
      evidence_hash: ctx.evidenceHash,
    },
    expires_at: expiresAt,
    fingerprint: fingerprint(normalised, ctx),
  });
}

// Is an earlier READY assessment still usable for this request right now?
export function stillValid(assessment, request, ctx, at = ctx.now) {
  if (assessment?.decision !== "READY") return { valid: false, reason: "There is no READY assessment." };
  if (assessment.fingerprint !== fingerprint(normalise(request, ctx.registry), ctx))
    return { valid: false, reason: "The request or the evidence changed. Assess again." };
  if (Date.parse(at) >= Date.parse(assessment.expires_at))
    return { valid: false, reason: "The assessment expired. Assess again." };
  return { valid: true, reason: "Same request, same evidence, within the validity window." };
}

// The table columns a metric's formula reads.
export function metricColumns(metric) {
  if (metric.ratio) return [metric.ratio.numerator, metric.ratio.denominator];
  return Object.keys(metric.terms ?? {});
}

export function computeMetric(metric, rows) {
  if (metric.ratio) {
    const n = rows.reduce((a, r) => a + r[metric.ratio.numerator], 0);
    const d = rows.reduce((a, r) => a + r[metric.ratio.denominator], 0);
    return d ? Math.round((n / d) * 100) / 100 : null;
  }
  return rows.reduce((a, r) => a + Object.entries(metric.terms).reduce((s, [k, w]) => s + w * r[k], 0), 0);
}

function format(metric, value) {
  if (value == null) return "n/a";
  return metric.id === "order_count" ? `${num.format(value)} orders` : inr.format(value);
}

function normalise(request, registry) {
  return {
    metric_candidates: [...(request.metric_candidates ?? [])].sort(),
    period: request.period ?? null,
    regions: [...(request.regions?.length ? request.regions : registry.regions)].sort(),
    channels: [...(request.channels?.length ? request.channels : registry.channels)].sort(),
    role: request.role,
  };
}

function fingerprint(normalised, ctx) {
  return hashHex(JSON.stringify(normalised) + ctx.evidenceHash);
}

function optionFor(m) {
  return { id: m.id, label: m.label, description: m.description, formula: m.formula };
}

function metricSummary(m) {
  return { id: m.id, label: m.label, formula: m.formula, version: m.version, owner: m.owner };
}

function summariseGaps(gaps) {
  return gaps.length <= 3 ? gaps.join(", ") : `${gaps.slice(0, 3).join(", ")} and ${gaps.length - 3} more`;
}
