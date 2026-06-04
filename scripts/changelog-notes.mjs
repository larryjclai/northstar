#!/usr/bin/env node
/**
 * Print the CHANGELOG.md section body for a given version, so the release
 * workflow can put "what's new" into the GitHub release notes (private repo
 * release + the mirrored public `northstar-releases` release).
 *
 * Usage:
 *   node scripts/changelog-notes.mjs 0.1.0-alpha.23   # bare version, no 'v'
 *
 * Prints nothing (exit 0) if the version has no section — callers fall back to
 * just the install table, so a missing entry never breaks a release.
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const version = (process.argv[2] || "").replace(/^v/, "").trim();
if (!version) process.exit(0);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let md;
try {
  md = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
} catch {
  process.exit(0);
}

const lines = md.split(/\r?\n/);
const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
if (start === -1) process.exit(0);

const body = [];
for (let i = start + 1; i < lines.length; i++) {
  const line = lines[i];
  if (line.startsWith("## [")) break; // next version section
  if (/^---\s*$/.test(line)) break; // section divider
  body.push(line);
}

const text = body.join("\n").trim();
if (text) process.stdout.write(text + "\n");
