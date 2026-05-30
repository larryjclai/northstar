#!/usr/bin/env node
/**
 * Bumps the version in all three version files atomically:
 *   package.json · src-tauri/tauri.conf.json · src-tauri/Cargo.toml
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

console.log(`\nBumping version to ${next}…`);
bumpJson("package.json");
bumpJson("src-tauri/tauri.conf.json");
bumpCargo("src-tauri/Cargo.toml");
console.log(`\nDone. Next steps:`);
console.log(`  git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml`);
console.log(`  git commit -m "chore: bump version to ${next}"`);
console.log(`  git tag v${next} && git push && git push --tags`);
