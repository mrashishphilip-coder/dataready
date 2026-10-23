// Generates the fictional Acme Retail sample data with a fixed seed, so every run
// produces identical files. Problems are planted on purpose; each is listed in
// data/PLANTED_ISSUES.md so readers can check the readiness decisions themselves.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "data");

// mulberry32: small deterministic PRNG
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261022);

const START = "2026-09-01";
const LAST_LOADED = "2026-10-21";
const REGIONS = ["North", "South", "East", "West"];
const CHANNELS = ["online", "store"];
const BASE = {
  North: { online: 180000, store: 220000 },
  South: { online: 150000, store: 260000 },
  East: { online: 120000, store: 140000 },
  West: { online: 200000, store: 170000 },
};
const AOV = { online: 2500, store: 1800 };

// Planted issues
const MISSING_REGION_DAY = { date: "2026-10-19", region: "South" }; // silent gap
const PARTIAL_DAY = { date: "2026-10-21", channel: "store" }; // load still pending
const BAD_RETURNS = { date: "2026-10-14", region: "West", channel: "online" }; // duplicated returns

function days(from, to) {
  const list = [];
  for (let d = new Date(from + "T00:00:00Z"); d <= new Date(to + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
    list.push(d.toISOString().slice(0, 10));
  }
  return list;
}

const rows = [];
const loads = [];
const quality = [];

for (const date of days(START, LAST_LOADED)) {
  const dow = new Date(date + "T00:00:00Z").getUTCDay();
  const weekend = dow === 0 || dow === 6;
  for (const channel of CHANNELS) {
    const pending = date === PARTIAL_DAY.date && channel === PARTIAL_DAY.channel;
    loads.push({ date, channel, status: pending ? "pending" : "complete" });
  }
  for (const region of REGIONS) {
    for (const channel of CHANNELS) {
      if (date === MISSING_REGION_DAY.date && region === MISSING_REGION_DAY.region) continue;
      if (date === PARTIAL_DAY.date && channel === PARTIAL_DAY.channel) continue;
      const lift = weekend ? (channel === "store" ? 1.25 : 1.1) : 1;
      const gross = Math.round(BASE[region][channel] * lift * (0.9 + rand() * 0.2));
      let returns = Math.round(gross * (0.04 + rand() * 0.02));
      if (date === BAD_RETURNS.date && region === BAD_RETURNS.region && channel === BAD_RETURNS.channel) returns *= 2;
      const tax = Math.round(gross * 0.15);
      const orders = Math.round(gross / (AOV[channel] * (0.95 + rand() * 0.1)));
      rows.push({ date, region, channel, gross, returns, tax, orders });
    }
    // Quality checks run per date and region on whatever rows have landed.
    if (date === MISSING_REGION_DAY.date && region === MISSING_REGION_DAY.region) continue;
    for (const check of ["row_count", "non_negative_amounts", "returns_reconciliation"]) {
      const failed = check === "returns_reconciliation" && date === BAD_RETURNS.date && region === BAD_RETURNS.region;
      quality.push({
        date,
        region,
        check,
        status: failed ? "fail" : "pass",
        detail: failed ? "Returns are 2× the 28-day average; possible duplicate return events." : "",
        checked_at: `${nextDay(date)}T05:30:00+05:30`,
      });
    }
  }
}

function nextDay(date) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const header = "date,region,channel,gross,returns,tax,orders";
const csv = [header, ...rows.map((r) => [r.date, r.region, r.channel, r.gross, r.returns, r.tax, r.orders].join(","))].join("\n") + "\n";
writeFileSync(join(out, "sales_daily.csv"), csv);
writeFileSync(
  join(out, "load_log.json"),
  JSON.stringify({ table: "sales_daily", last_refreshed_at: "2026-10-22T06:10:00+05:30", loads }, null, 2) + "\n",
);
writeFileSync(join(out, "quality_checks.json"), JSON.stringify({ table: "sales_daily", results: quality }, null, 2) + "\n");
console.log(`Wrote ${rows.length} rows, ${loads.length} load records, ${quality.length} quality results to ${out}`);
