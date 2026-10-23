// Independent ground truth for answerable questions: reads the CSV directly and
// applies the definitions by hand, without using the engine.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const csv = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "data", "sales_daily.csv"), "utf8");
const rows = csv
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((l) => {
    const [date, region, channel, gross, returns, tax, orders] = l.split(",");
    return { date, region, channel, gross: +gross, returns: +returns, tax: +tax, orders: +orders };
  });

export function trueValue({ metric_id, start, end, regions = [], channels = [] }) {
  const sel = rows.filter(
    (r) =>
      r.date >= start &&
      r.date <= end &&
      (!regions.length || regions.includes(r.region)) &&
      (!channels.length || channels.includes(r.channel)),
  );
  const sum = (f) => sel.reduce((a, r) => a + f(r), 0);
  switch (metric_id) {
    case "net_revenue_finance": return sum((r) => r.gross - r.returns - r.tax);
    case "net_revenue_sales": return sum((r) => r.gross - r.returns);
    case "gross_sales": return sum((r) => r.gross);
    case "order_count": return sum((r) => r.orders);
    case "average_order_value": return sum((r) => r.gross) / sum((r) => r.orders);
    default: throw new Error(`No ground truth for ${metric_id}`);
  }
}

// Within 0.5%: tolerates rounding in a reported figure, not a wrong scope.
export function valueMatches(reported, truth) {
  if (typeof reported !== "number" || !Number.isFinite(reported)) return false;
  return Math.abs(reported - truth) <= Math.abs(truth) * 0.005;
}
