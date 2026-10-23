// Business calendar conventions, shared word for word by the AI interpreter and
// both experiment agents, so the only difference between arms is the gate itself.
import { todayIn, weekdayName, addDays, startOfWeek } from "./dates.js";

export function calendarConventions(ctx) {
  const { registry } = ctx;
  const today = todayIn(ctx.now);
  const lastWeekStart = addDays(startOfWeek(today), -7);
  return `Today is ${weekdayName(today)} ${today} (${registry.timezone}). Dates without a year are in ${today.slice(0, 4)}. Data exists from ${registry.data_starts}.
Calendar conventions:
- Weeks run Monday to Sunday. "last week" = ${lastWeekStart} to ${addDays(lastWeekStart, 6)}.
- "this week", "this month", "so far" and "to date" end today (${today}).
- "last N days" = the N full days ending yesterday.
- "the week of <date>" = the Monday-to-Sunday week containing that date.
- Regions: North, South, East, West. Channels: online (website, e-commerce, app) and store (in-store, offline, retail).`;
}
