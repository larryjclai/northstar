import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards against dead Design System tokens.
 *
 * CSS resolves `var(--nope)` to an invalid value and silently drops the
 * declaration — no error anywhere. tsc, eslint, prettier and the Vite build all
 * pass, so a typo'd or never-defined `--ns-*` token just renders as nothing.
 * That is exactly how `--ns-shadow-xl` / `-md` / `-sm` survived: the mobile
 * Quick-Add FAB shipped with `box-shadow: none` and every `.ns-modal-panel`
 * modal lost its elevation, with a green CI the whole time.
 *
 * A reference *with* a fallback (`var(--ns-x, var(--ns-y))`) is not that bug —
 * it renders the fallback by design — so it is tracked separately rather than
 * failing the build.
 */

const SRC = path.resolve(import.meta.dirname, "..");
const THIS_FILE = path.resolve(import.meta.dirname, "designTokens.test.ts");

/** `var(--ns-x, fallback)` referencing an undefined token: renders the fallback,
 * so it is not a silent break — but it still points at a token that does not
 * exist, which is drift worth noticing. Each entry is a pending design call:
 *
 * - `--ns-border-subtle` — falls back to `--ns-border`, visually identical today.
 * - `--ns-warn-soft`     — 7 ConnectSection banners. Five fall back to the neutral
 *   `--ns-bg-hover`, two to a hard-coded `#fef3c7`, so warning banners are
 *   inconsistent. `--ns-warning-soft` is the defined amber token they likely want.
 *
 * Shrink this list; do not grow it.
 */
const KNOWN_FALLBACK_ONLY_TOKENS = ["--ns-border-subtle", "--ns-warn-soft"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|css)$/.test(full) && full !== THIS_FILE) out.push(full);
  }
  return out;
}

/** Tokens the app actually defines: CSS declarations (`--ns-x: …`) plus inline
 * style objects in TSX (`style={{ "--ns-x": … }}`), which define them at runtime. */
function collectDefinedTokens(files: string[]): Set<string> {
  const defined = new Set<string>();
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/(--ns-[a-zA-Z0-9-]+)\s*:/g)) defined.add(m[1]);
    for (const m of text.matchAll(/["'`](--ns-[a-zA-Z0-9-]+)["'`]\s*:/g)) defined.add(m[1]);
  }
  return defined;
}

type Reference = { token: string; file: string; line: number; hasFallback: boolean };

/** Finds every `var(--ns-…)`, recording whether a comma-separated fallback follows
 * at the top level of that `var()` — nested `var()`s do not count as one. */
function collectReferences(files: string[]): Reference[] {
  const refs: Reference[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/var\(\s*(--ns-[a-zA-Z0-9-]+)/g)) {
      let depth = 0;
      let hasFallback = false;
      for (let i = m.index + "var".length; i < text.length; i++) {
        const ch = text[i];
        if (ch === "(") depth++;
        else if (ch === ")") {
          depth--;
          if (depth === 0) break;
        } else if (ch === "," && depth === 1) hasFallback = true;
      }
      refs.push({
        token: m[1],
        file: path.relative(SRC, file),
        line: text.slice(0, m.index).split("\n").length,
        hasFallback,
      });
    }
  }
  return refs;
}

const files = walk(SRC);
const defined = collectDefinedTokens(files);
const references = collectReferences(files);

describe("Design System tokens", () => {
  it("scans the source tree", () => {
    // Cheap canary: if a refactor moves styles and these collapse to ~0, the
    // checks below would pass vacuously.
    expect(files.length).toBeGreaterThan(100);
    expect(defined.size).toBeGreaterThan(50);
    expect(references.length).toBeGreaterThan(100);
  });

  it("has no var(--ns-*) without a fallback pointing at an undefined token", () => {
    const orphans = references.filter((r) => !r.hasFallback && !defined.has(r.token));
    const report = orphans.map((r) => `  ${r.token} → ${r.file}:${r.line}`).join("\n");
    expect(
      orphans,
      `Undefined --ns-* token(s) referenced with no fallback. CSS drops these\n` +
        `declarations silently, so the style renders as nothing:\n${report}\n\n` +
        `Fix: use a token defined in src/styles/globals.css.`,
    ).toEqual([]);
  });

  it("only falls back on the known set of undefined tokens", () => {
    const fallbackOnly = [
      ...new Set(
        references.filter((r) => r.hasFallback && !defined.has(r.token)).map((r) => r.token),
      ),
    ].sort();
    expect(
      fallbackOnly,
      `Update KNOWN_FALLBACK_ONLY_TOKENS in ${path.basename(THIS_FILE)}.`,
    ).toEqual([...KNOWN_FALLBACK_ONLY_TOKENS].sort());
  });
});
