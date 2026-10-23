// Loads the registry, warehouse table, load log and quality results once (Node).
// Everything the readiness engine knows comes from here.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createContext } from "./context-core.js";

export { metricById } from "./context-core.js";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

let cached;

export function loadContext() {
  if (cached) return cached;
  const read = (name) => readFileSync(join(dataDir, name), "utf8");
  cached = createContext({
    registry: read("registry.json"),
    sales: read("sales_daily.csv"),
    loads: read("load_log.json"),
    quality: read("quality_checks.json"),
  });
  return cached;
}
