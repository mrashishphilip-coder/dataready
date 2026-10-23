// Builds the engine's context from the raw data files. No file or network
// access here, so the same code runs in Node (src/context.js) and the browser.
import { hashHex } from "./hash.js";

export function parseCsv(text) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const keys = header.split(",");
  return lines.map((line) => {
    const cells = line.split(",");
    const row = Object.fromEntries(keys.map((k, i) => [k, cells[i]]));
    for (const k of ["gross", "returns", "tax", "orders"]) row[k] = Number(row[k]);
    return row;
  });
}

// files: the raw text of registry.json, sales_daily.csv, load_log.json, quality_checks.json
export function createContext(files) {
  const registry = JSON.parse(files.registry);
  return {
    registry,
    rows: parseCsv(files.sales),
    loadLog: JSON.parse(files.loads),
    quality: JSON.parse(files.quality),
    now: registry.now,
    // A change to any input changes this hash, which invalidates earlier assessments.
    evidenceHash: hashHex([files.registry, files.sales, files.loads, files.quality].join("\u0000")),
  };
}

export function metricById(ctx, id) {
  return ctx.registry.metrics.find((m) => m.id === id);
}
