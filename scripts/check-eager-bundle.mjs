// Plan 267: guard the eager startup graph, not just the chunk count.
//
// vite.config.ts assigns vendors via rolldown's `codeSplitting.groups`, each with
// an explicit `priority`. Groups also capture their matched modules' dependencies
// recursively (`includeDependenciesRecursively` defaults to true), so a shared
// transitive dep can be pulled into the wrong chunk if priorities don't settle it —
// that is how clsx once landed in `charts` and made all 388 kB of recharts eager on
// every route. See docs/performance-budget.md R5 for the full story.
//
// This script walks the static-import graph reachable from dist/index.html's
// entry script(s) and reports the eager set. It exits non-zero if the
// `charts` chunk is part of that eager graph, so it can be used as a CI/local
// regression check, not just a report.
//
// Usage: npm run build && node scripts/check-eager-bundle.mjs

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(root, "dist");
const assetsDir = path.join(distDir, "assets");
const indexHtmlPath = path.join(distDir, "index.html");

if (!existsSync(indexHtmlPath)) {
  console.error(`[check-eager-bundle] ${path.relative(root, indexHtmlPath)} not found. Run "npm run build" first.`);
  process.exit(1);
}

const html = readFileSync(indexHtmlPath, "utf8");
const entryFiles = [...html.matchAll(/assets\/[a-zA-Z0-9_-]+\.js/g)].map((m) => path.basename(m[0]));

const seen = new Set();

function walk(file) {
  if (seen.has(file)) return;
  const filePath = path.join(assetsDir, file);
  if (!existsSync(filePath)) return;
  seen.add(file);
  const source = readFileSync(filePath, "utf8");
  for (const m of source.matchAll(/from"\.\/([a-zA-Z0-9_-]+\.js)"/g)) {
    walk(m[1]);
  }
}

entryFiles.forEach(walk);

let total = 0;
const rows = [...seen].map((file) => {
  const bytes = statSync(path.join(assetsDir, file)).size;
  total += bytes;
  return [file, bytes];
});
rows.sort((a, b) => b[1] - a[1]);

console.log("Eager chunk graph (reachable statically from dist/index.html):");
for (const [file, bytes] of rows) {
  console.log(String(bytes).padStart(8), file);
}
console.log(`EAGER TOTAL ${total} across ${seen.size} chunks`);

const chartsChunks = [...seen].filter((f) => f.startsWith("charts-"));
if (chartsChunks.length > 0) {
  console.error(`[check-eager-bundle] FAIL: charts chunk(s) are eager: ${chartsChunks.join(", ")}`);
  console.error("[check-eager-bundle] recharts must load lazily via lazyRouteComponent, not from the entry graph.");
  process.exit(1);
}

console.log("[check-eager-bundle] OK: charts chunk is not in the eager set.");
