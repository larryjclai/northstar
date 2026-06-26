import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.resolve(root, process.env.NORTHSTAR_PRIVATE_ASSETS_DIR || "private-assets");
const sourceBank = path.join(sourceRoot, "bank");
const publicBank = path.join(root, "public", "bank");
// Plan 071: the bundled common-ETF sector snapshot (mirrors the bank-logo path).
const sourceEtfFeed = path.join(sourceRoot, "etf", "etf-sector-feed.json");
const publicEtfFeed = path.join(root, "public", "etf-sector-feed.json");

async function existsDir(dir) {
  try {
    return (await stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

async function existsFile(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

// ── Bank logos ──────────────────────────────────────────────────────────────
if (await existsDir(sourceBank)) {
  await mkdir(path.dirname(publicBank), { recursive: true });
  await rm(publicBank, { recursive: true, force: true });
  await cp(sourceBank, publicBank, { recursive: true });
  console.log(`[private-assets] injected bank logos from ${path.relative(root, sourceBank)}.`);
} else {
  await rm(publicBank, { recursive: true, force: true });
  console.log("[private-assets] no private bank assets found; removed public/bank and building without bundled bank logos.");
}

// ── ETF sector feed (Plan 071) ───────────────────────────────────────────────
// The bundled snapshot is the zero-network common case. Build stays green when
// absent (the client just falls back to the on-demand public feed pull).
if (await existsFile(sourceEtfFeed)) {
  await mkdir(path.dirname(publicEtfFeed), { recursive: true });
  await rm(publicEtfFeed, { force: true });
  await cp(sourceEtfFeed, publicEtfFeed);
  console.log(`[private-assets] injected ETF sector feed from ${path.relative(root, sourceEtfFeed)}.`);
} else {
  await rm(publicEtfFeed, { force: true });
  console.log("[private-assets] no bundled ETF sector feed found; building without the bundled snapshot.");
}
