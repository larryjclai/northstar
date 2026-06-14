import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.resolve(root, process.env.NORTHSTAR_PRIVATE_ASSETS_DIR || "private-assets");
const sourceBank = path.join(sourceRoot, "bank");
const publicBank = path.join(root, "public", "bank");

async function exists(dir) {
  try {
    return (await stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

if (!(await exists(sourceBank))) {
  await rm(publicBank, { recursive: true, force: true });
  console.log("[private-assets] no private bank assets found; removed public/bank and building without bundled bank logos.");
  process.exit(0);
}

await mkdir(path.dirname(publicBank), { recursive: true });
await rm(publicBank, { recursive: true, force: true });
await cp(sourceBank, publicBank, { recursive: true });
console.log(`[private-assets] injected bank logos from ${path.relative(root, sourceBank)}.`);
