// Rules-based interpreter: keyword and pattern matching, no model.
// It is the baseline the Claude interpreter is compared against, and the
// fallback when no API key is configured. Its limits are deliberate: it only
// understands the phrasings written below.
import { todayIn, addDays, startOfWeek, endOfMonth } from "./dates.js";

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

export function interpretWithRules(question, ctx) {
  const q = ` ${question.toLowerCase().replace(/[?!.,]/g, " ")} `;
  const { registry } = ctx;
  return {
    source: "rules",
    metric_candidates: matchMetric(q, registry),
    period: matchPeriod(q, todayIn(ctx.now)),
    regions: registry.regions.filter((r) => q.includes(` ${r.toLowerCase()} `)),
    channels: matchChannels(q),
    notes: "",
  };
}

function matchMetric(q, registry) {
  // Specific synonyms first, longest phrase wins; then ambiguous terms.
  const phrases = registry.metrics
    .flatMap((m) => m.synonyms.map((s) => ({ s, id: m.id })))
    .sort((a, b) => b.s.length - a.s.length);
  for (const { s, id } of phrases) if (q.includes(` ${s} `)) return [id];
  const ambiguous = Object.entries(registry.ambiguous_terms).sort((a, b) => b[0].length - a[0].length);
  for (const [term, ids] of ambiguous) if (q.includes(` ${term} `)) return ids;
  return [];
}

function matchChannels(q) {
  const out = [];
  if (/ (online|e-?commerce|website|web) /.test(q)) out.push("online");
  if (/ (store|stores|offline|in-store) /.test(q)) out.push("store");
  return out;
}

function monthIndex(token) {
  return MONTHS.findIndex((m) => m.startsWith(token.slice(0, 3)));
}

function iso(year, monthIdx, day) {
  return `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function matchPeriod(q, today) {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - 1;
  const one = (d) => ({ start: d, end: d });
  let m;

  if (/ today /.test(q)) return one(today);
  if (/ yesterday /.test(q)) return one(addDays(today, -1));
  if (/ last week /.test(q)) {
    const start = addDays(startOfWeek(today), -7);
    return { start, end: addDays(start, 6) };
  }
  if (/ this week /.test(q)) return { start: startOfWeek(today), end: today };
  if ((m = q.match(/ last (\d+) days /))) return { start: addDays(today, -Number(m[1])), end: addDays(today, -1) };
  if (/ (this month|month to date|mtd|so far this month) /.test(q) || /(october|oct) so far/.test(q))
    return { start: iso(year, month, 1), end: today };
  if (/ last month /.test(q)) {
    const y = month === 0 ? year - 1 : year;
    const mi = month === 0 ? 11 : month - 1;
    return { start: iso(y, mi, 1), end: endOfMonth(y, mi + 1) };
  }
  if ((m = q.match(/ (\d{4}-\d{2}-\d{2}) /))) return one(m[1]);
  // "5 october", "5 oct 2026", "october 5", "oct 5th"
  if ((m = q.match(new RegExp(` (\\d{1,2})(?:st|nd|rd|th)? ${MONTH_RE}(?: (\\d{4}))? `))))
    return one(iso(m[3] ? Number(m[3]) : year, monthIndex(m[2]), Number(m[1])));
  if ((m = q.match(new RegExp(` ${MONTH_RE} (\\d{1,2})(?:st|nd|rd|th)?(?: (\\d{4}))? `))))
    return one(iso(m[3] ? Number(m[3]) : year, monthIndex(m[1]), Number(m[2])));
  // A bare month name: the whole month.
  if ((m = q.match(new RegExp(` (?:in |for |during )?${MONTH_RE}(?: (\\d{4}))? `)))) {
    const y = m[2] ? Number(m[2]) : year;
    const mi = monthIndex(m[1]);
    return { start: iso(y, mi, 1), end: endOfMonth(y, mi + 1) };
  }
  if (/ q3 /.test(q)) return { start: iso(year, 6, 1), end: iso(year, 8, 30) };
  return null;
}
