#!/usr/bin/env node
/**
 * Bumps the version in all five version files atomically:
 *   package.json · package-lock.json · src-tauri/tauri.conf.json ·
 *   src-tauri/Cargo.toml · src-tauri/Cargo.lock (the northstar package entry)
 *
 * Usage:
 *   npm run version 0.1.0-alpha.7
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const next = process.argv[2];
if (!next) {
  console.error("Usage: npm run version <new-version>\nExample: npm run version 0.1.0-alpha.7");
  process.exit(1);
}
if (!/^\d+\.\d+\.\d+/.test(next)) {
  console.error(`Invalid version format: "${next}". Expected semver, e.g. 0.1.0-alpha.7`);
  process.exit(1);
}

function bumpJson(relPath, key = "version") {
  const abs = resolve(root, relPath);
  const obj = JSON.parse(readFileSync(abs, "utf8"));
  const prev = obj[key];
  obj[key] = next;
  writeFileSync(abs, JSON.stringify(obj, null, 2) + "\n");
  console.log(`  ${relPath}: ${prev} → ${next}`);
}

function bumpCargo(relPath) {
  const abs = resolve(root, relPath);
  const src = readFileSync(abs, "utf8");
  const prev = src.match(/^version = "(.+)"/m)?.[1] ?? "?";
  const updated = src.replace(/^version = ".+"/m, `version = "${next}"`);
  writeFileSync(abs, updated);
  console.log(`  ${relPath}: ${prev} → ${next}`);
}

// package-lock.json repeats package.json's version in two places: the top-level
// `version` and the root package entry `packages[""].version`. Both must track
// package.json, or the next `npm install` (in CI or a fresh worktree) rewrites
// them and produces a spurious diff. Edit the fields in place rather than
// shelling out to `npm install --package-lock-only`, which re-resolves
// dependency ranges and can churn unrelated entries into the bump commit.
function bumpPackageLock(relPath) {
  const abs = resolve(root, relPath);
  const obj = JSON.parse(readFileSync(abs, "utf8"));
  const prev = obj.version;
  obj.version = next;
  if (obj.packages?.[""]) {
    obj.packages[""].version = next;
  } else {
    console.warn(`  ${relPath}: no root package entry — only top-level version bumped`);
  }
  writeFileSync(abs, JSON.stringify(obj, null, 2) + "\n");
  console.log(`  ${relPath}: ${prev} → ${next}`);
}

// Cargo.lock's own `[[package]] name = "northstar"` entry must track Cargo.toml,
// or the lockfile drifts (it silently sat 2 versions behind through alpha.5x
// because only Cargo.toml was bumped). Update just that block, not the first
// `version =` line (which belongs to some dependency).
function bumpCargoLock(relPath) {
  const abs = resolve(root, relPath);
  const src = readFileSync(abs, "utf8");
  const re = /(name = "northstar"\nversion = ")[^"]+(")/;
  if (!re.test(src)) {
    console.warn(`  ${relPath}: no northstar package entry found — skipped (run cargo check to regenerate)`);
    return;
  }
  const prev = src.match(/name = "northstar"\nversion = "([^"]+)"/)?.[1] ?? "?";
  writeFileSync(abs, src.replace(re, `$1${next}$2`));
  console.log(`  ${relPath} (northstar): ${prev} → ${next}`);
}

console.log(`\nBumping version to ${next}…`);
bumpJson("package.json");
bumpPackageLock("package-lock.json");
bumpJson("src-tauri/tauri.conf.json");
bumpCargo("src-tauri/Cargo.toml");
bumpCargoLock("src-tauri/Cargo.lock");
console.log(`\nDone. Next steps:`);
console.log(`  git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock`);
console.log(`  git commit -m "chore: bump version to ${next}"`);
console.log(`  git tag v${next} && git push && git push --tags`);
