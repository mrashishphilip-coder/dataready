// Calendar helpers. All dates are ISO "YYYY-MM-DD" strings in the business timezone (IST).

export function todayIn(nowIso) {
  // registry.now carries an explicit +05:30 offset, so the date part is already local.
  return nowIso.slice(0, 10);
}

export function addDays(date, n) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dayOfWeek(date) {
  return new Date(date + "T00:00:00Z").getUTCDay(); // 0 = Sunday
}

export function dateRange(start, end) {
  const list = [];
  for (let d = start; d <= end; d = addDays(d, 1)) list.push(d);
  return list;
}

export function startOfWeek(date) {
  // Weeks run Monday to Sunday.
  const dow = dayOfWeek(date);
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

export function endOfMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export function isIsoDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export function weekdayName(date) {
  return WEEKDAYS[dayOfWeek(date)];
}
