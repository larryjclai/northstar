#!/usr/bin/env node
// Copy catalog round-trip tool.
//
// The translation JSON files (src/locales/<lng>/translation.json) are the
// single source of truth for all user-facing copy. This script projects them
// into one flat spreadsheet (src/locales/copy.csv) so copy can be reviewed and
// edited in Excel / Numbers, then writes the edits back into the JSON files.
//
//   npm run copy:export   JSON  ->  copy.csv   (regenerate the sheet)
//   npm run copy:import   copy.csv  ->  JSON    (apply your edits)
//
// CSV columns: key | note | zh-TW | en | zh-TW 修改時間 | en 修改時間 | en 待更新?
//   - key          : dot-path into the JSON (do not edit; it's the join key)
//   - note         : free-text location hint (editable; stored in _notes.json)
//   - zh-TW / en   : copy for each locale (edit these). Blank en falls back to zh-TW.
//   - <lng> 修改時間 : when that cell was last changed (read-only; tracked in _meta.json)
//   - en 待更新?    : ⚠ when zh-TW was edited more recently than en (translation may be stale)
//
// Per-cell "last modified" is tracked in _meta.json: each cell stores its last
// synced value (v) and timestamp (t). On export/import, a cell whose value
// differs from its recorded snapshot gets its timestamp bumped to now; unchanged
// cells keep their old timestamp. Both _meta.json and _notes.json are committed.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = join(__dirname, "..", "src", "locales");
const CSV_PATH = join(LOCALES_DIR, "copy.csv");
const NOTES_PATH = join(LOCALES_DIR, "_notes.json");
const META_PATH = join(LOCALES_DIR, "_meta.json");

// Locales that participate in the catalog. zh-TW is the base (authored first),
// so its key order drives the row order in the sheet.
const LOCALES = ["zh-TW", "en"];
const BASE_LOCALE = "zh-TW";

const translationPath = (lng) => join(LOCALES_DIR, lng, "translation.json");
const COL_UPDATED = (lng) => `${lng} 修改時間`;
const COL_STALE = "en 待更新?";

// ---------------------------------------------------------------------------
// flatten / unflatten between nested JSON and dot-path maps
// ---------------------------------------------------------------------------

/** Nested object -> { "a.b.c": "string" } for string leaves only. */
function flatten(obj, prefix = "", out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flatten(value, path, out);
    } else if (typeof value === "string") {
      out[path] = value;
    }
  }
  return out;
}

/** { "a.b.c": "string" } -> nested object, preserving insertion order. */
function unflatten(map) {
  const root = {};
  for (const [path, value] of Object.entries(map)) {
    const parts = path.split(".");
    let node = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const part = parts[i];
      if (typeof node[part] !== "object" || node[part] === null) node[part] = {};
      node = node[part];
    }
    node[parts[parts.length - 1]] = value;
  }
  return root;
}

// ---------------------------------------------------------------------------
// minimal RFC 4180 CSV serialize / parse (handles quotes, commas, newlines)
// ---------------------------------------------------------------------------

function csvEscape(field) {
  const value = field ?? "";
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function toCsv(rows) {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}

function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // swallow; the following \n closes the row
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// metadata (per-cell value snapshot + last-modified timestamp)
// ---------------------------------------------------------------------------

function loadJson(path, fallback) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;
}

const nowIso = () => new Date().toISOString();

/** ISO -> "YYYY-MM-DD HH:mm" in the local timezone (blank if no timestamp). */
function fmtLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Reconcile a meta map against current values: bump the timestamp of any cell
 * whose value changed (or is newly tracked), drop cells that became empty, and
 * keep unchanged cells untouched. Mutates and returns `meta`.
 */
function reconcileMeta(meta, valuesByLocale, stamp) {
  for (const lng of LOCALES) {
    const values = valuesByLocale[lng];
    for (const [key, value] of Object.entries(values)) {
      if (value === "") {
        if (meta[key]) delete meta[key][lng];
        continue;
      }
      const cell = (meta[key] ??= {});
      if (!cell[lng] || cell[lng].v !== value) cell[lng] = { v: value, t: stamp };
    }
    // Drop tracking for keys whose value disappeared entirely.
    for (const key of Object.keys(meta)) {
      if (meta[key][lng] && !(key in values)) delete meta[key][lng];
      if (meta[key] && Object.keys(meta[key]).length === 0) delete meta[key];
    }
  }
  return meta;
}

// ---------------------------------------------------------------------------
// export: JSON -> copy.csv
// ---------------------------------------------------------------------------

function exportCsv() {
  const flatByLocale = {};
  for (const lng of LOCALES) flatByLocale[lng] = flatten(loadJson(translationPath(lng), {}));
  const notes = loadJson(NOTES_PATH, {});
  const meta = reconcileMeta(loadJson(META_PATH, {}), flatByLocale, nowIso());

  // Key order: base locale first, then keys that exist only in other locales.
  const orderedKeys = [];
  const seen = new Set();
  const pushKeys = (keys) => {
    for (const key of keys) if (!seen.has(key)) (seen.add(key), orderedKeys.push(key));
  };
  pushKeys(Object.keys(flatByLocale[BASE_LOCALE]));
  for (const lng of LOCALES) pushKeys(Object.keys(flatByLocale[lng]));

  const header = ["key", "note", ...LOCALES, ...LOCALES.map(COL_UPDATED), COL_STALE];
  const rows = [header];
  for (const key of orderedKeys) {
    const cell = meta[key] ?? {};
    const zhT = cell["zh-TW"]?.t;
    const enT = cell["en"]?.t;
    const stale = zhT && enT && new Date(zhT) > new Date(enT) ? "⚠" : "";
    rows.push([
      key,
      notes[key] ?? "",
      ...LOCALES.map((lng) => flatByLocale[lng][key] ?? ""),
      ...LOCALES.map((lng) => fmtLocal(cell[lng]?.t)),
      stale,
    ]);
  }

  writeFileSync(META_PATH, JSON.stringify(meta, null, 2) + "\n", "utf8");
  writeFileSync(CSV_PATH, "﻿" + toCsv(rows), "utf8"); // BOM so Excel reads UTF-8
  console.log(`Exported ${orderedKeys.length} keys -> ${rel(CSV_PATH)}`);
}

// ---------------------------------------------------------------------------
// import: copy.csv -> JSON
// ---------------------------------------------------------------------------

function importCsv() {
  if (!existsSync(CSV_PATH)) {
    console.error(`Missing ${rel(CSV_PATH)} — run "npm run copy:export" first.`);
    process.exit(1);
  }
  const rows = parseCsv(readFileSync(CSV_PATH, "utf8"));
  if (!rows.length) {
    console.error("copy.csv is empty.");
    process.exit(1);
  }
  const header = rows[0];
  const col = (name) => header.indexOf(name);
  if (col("key") !== 0 || col("note") !== 1) {
    console.error(`Unexpected header: ${JSON.stringify(header)}. Expected key,note,<locales...>.`);
    process.exit(1);
  }
  // Map columns by name so export-only columns (修改時間 / 待更新?) are ignored.
  const localeCol = Object.fromEntries(LOCALES.map((lng) => [lng, col(lng)]));
  for (const lng of LOCALES) {
    if (localeCol[lng] === -1) {
      console.error(`Header is missing the "${lng}" column.`);
      process.exit(1);
    }
  }

  const valuesByLocale = Object.fromEntries(LOCALES.map((lng) => [lng, {}]));
  const notes = {};

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const key = (row[col("key")] ?? "").trim();
    if (!key) continue; // skip blank spacer rows
    const note = row[col("note")] ?? "";
    if (note) notes[key] = note;
    for (const lng of LOCALES) valuesByLocale[lng][key] = row[localeCol[lng]] ?? "";
  }

  const meta = reconcileMeta(loadJson(META_PATH, {}), valuesByLocale, nowIso());

  for (const lng of LOCALES) {
    // Omit empty cells so i18next falls back to the base locale.
    const nonEmpty = Object.fromEntries(Object.entries(valuesByLocale[lng]).filter(([, v]) => v !== ""));
    const json = unflatten(nonEmpty);
    writeFileSync(translationPath(lng), JSON.stringify(json, null, 2) + "\n", "utf8");
    console.log(`Wrote ${Object.keys(nonEmpty).length} keys -> ${rel(translationPath(lng))}`);
  }
  writeFileSync(NOTES_PATH, JSON.stringify(notes, null, 2) + "\n", "utf8");
  writeFileSync(META_PATH, JSON.stringify(meta, null, 2) + "\n", "utf8");
  console.log(`Wrote ${Object.keys(notes).length} notes, tracked ${Object.keys(meta).length} keys`);
}

function rel(p) {
  return p.replace(join(__dirname, "..") + "/", "");
}

const cmd = process.argv[2];
if (cmd === "export") exportCsv();
else if (cmd === "import") importCsv();
else {
  console.error("Usage: node scripts/copy-catalog.mjs <export|import>");
  process.exit(1);
}
