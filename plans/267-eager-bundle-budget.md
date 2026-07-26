# Plan 267: Get recharts out of the eager startup graph, and put a budget on it

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 79032d3b..HEAD -- vite.config.ts src/lib/utils.ts src/routes/router.tsx`
> If any in-scope file changed since this plan was written, **rebuild and re-run
> the Step 1 measurement** before trusting the chunk names and sizes below —
> content-hashed filenames change on every build.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (chunking changes can cause load-order regressions that only
  surface at runtime)
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `79032d3b`, 2026-07-25

## Why this matters

The app's entry chunk transitively pulls in **all 388 kB of recharts**, on every
launch, on every route — including routes with no charts at all.

The cause is a one-line utility. `src/lib/utils.ts` defines `cn()` from `clsx` +
`tailwind-merge`. Those two packages are **not** named in `vite.config.ts`'s
`manualChunks` function, so it returns `undefined` for them and Rollup falls back
to its own heuristic — which parked them inside the `charts` chunk. Every shared
UI component calls `cn()`, so the shared component chunk now has a hard static
import of the recharts chunk, and the entry imports the shared component chunk.

Measured at `79032d3b`:

```
index-CO-Y3K6R.js   (entry)  →  card-Cc4ZiyAu.js  (286 kB, shared UI + repositories)
card-Cc4ZiyAu.js             →  charts-BpcWpMch.js (388 kB, recharts)
```

Verbatim from the head of `dist/assets/card-Cc4ZiyAu.js`:

```js
import{r as e}from"./rolldown-runtime-QTnfLwEv.js";
import{d as t,f as n,m as r}from"./tanstack-TX5pICgu.js";
import{S as i,_ as a,g as o,x as s}from"./baseui-N4-kGfbc.js";
import{Gt as c}from"./icons-Cokcb0C3.js";
import{_ as l}from"./charts-BpcWpMch.js";   // ← recharts, for a className helper
```

`l` is then used as the class-merging function inside the `cva` implementation
(`d(e, n?.class, n?.className)`) — i.e. this is `cn`, not anything chart-related.

The eager payload at `79032d3b` is roughly **1.7 MB** across
`icons` (415 kB) + `charts` (388 kB) + `card` (286 kB) + `index` (212 kB) +
`react` (178 kB) + `baseui` (133 kB) + `tanstack` (116 kB) + `i18n` (54 kB).
Fixing this one misplacement should remove 388 kB of it — the single largest
startup win available in the build config, for a three-line change.

`docs/performance-budget.md` already has a rule (**R2**) watching the *chunk
count*, but nothing watches which chunks are *eager*. That is why this regressed
silently. Step 4 adds the missing guardrail.

## Current state

### The chunking config (`vite.config.ts:29-57`, verified at `79032d3b`)

```ts
  build: {
    // Main chunk is ~580 kB: the four eager tab routes + repositories/domain.
    // Acceptable for Tauri (chunks load from disk); vendors are split below.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Split heavy third-party libraries out of the main entry so the
        // initial load isn't a single multi-MB chunk. Low-frequency routes
        // are additionally code-split via lazyRouteComponent (see router.tsx).
        // Function form: the object form resolves package *roots* only, so
        // subpath imports like react-dom/client never matched and react-dom
        // stayed in the main chunk.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react";
          if (id.includes("node_modules/recharts") || /node_modules\/(d3-|victory-)/.test(id)) return "charts";
          if (id.includes("node_modules/@tanstack/")) return "tanstack";
          if (id.includes("node_modules/@phosphor-icons/")) return "icons";
          if (/node_modules\/(i18next|react-i18next)/.test(id)) return "i18n";
          if (id.includes("node_modules/@base-ui/")) return "baseui";
          return undefined;
        },
      },
    },
  },
```

Note there is **no** branch for `clsx`, `tailwind-merge`, or
`class-variance-authority` — all three fall through to `return undefined`.

### The utility that causes it (`src/lib/utils.ts:1-2`)

```ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
```

### Chunk sizes at `79032d3b`

```
415572  icons-Cokcb0C3.js
388133  charts-BpcWpMch.js
286472  card-Cc4ZiyAu.js
212317  index-CO-Y3K6R.js
178316  react-DRzlAwCS.js
148164  CashFlowRoute-DSmbulAu.js
133395  baseui-N4-kGfbc.js
129605  SettingsRoute-CLhl_4D1.js
115971  tanstack-TX5pICgu.js
```

Total `dist/assets` ≈ 11 MB across 51 chunks.

### Routes are already lazy (`src/routes/router.tsx:8-21`)

Fourteen routes use `lazyRouteComponent`. That part is working and is **not** what
this plan changes.

### Two things that are NOT findings — do not "fix" them

1. **The `icons` chunk (415 kB) is correctly tree-shaken.** It contains ~134
   icons × 6 weights. The advisor verified unused icons are absent
   (`grep -c Acorn dist/assets/icons-*.js` → 0). The app uses four of the six
   weights (`regular`, `bold` ×61, `duotone` ×42, `fill` ×24), so stripping
   weights would save roughly a third of one chunk in an app that loads from
   local disk, in exchange for maintaining a custom Vite plugin. **Rejected as
   not worth doing** — do not reopen it.
2. **`repositories.ts` being eager is correct.** It is 7061 lines and sits inside
   the `card` chunk, but `getFinanceRepository()` must run before the first
   render. Splitting it out saves nothing on the critical path. (Its *size* is a
   tech-debt concern tracked separately by `plans/009-repositories-seam-extraction.md`,
   not a startup concern.)

### Conventions to match

- `vite.config.ts` comments explain *why* a chunking decision exists, including
  what was tried before (see the "Function form: the object form resolves package
  *roots* only…" comment). Match that — write down why `clsx` needs an explicit
  branch, or someone will delete it as redundant.
- `docs/performance-budget.md` states rules as **R<n> — <imperative>** with a
  runnable check underneath. Match that format exactly in Step 4.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm install` | exit 0 |
| Build | `npm run build` | exit 0 |
| Chunk count | `ls dist/assets/*.js \| wc -l` | 45–60 (rule R2) |
| Total bytes | `ls -la dist/assets/*.js \| awk '{s+=$5} END {print s}'` | record it |
| Entry graph | see Step 1 | — |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | all pass |
| Lint | `npm run lint` | exit 0 |
| E2E | `npm run test:e2e` | all pass |
| Desktop app | `npm run tauri dev` | app launches |

## Scope

**In scope**:
- `vite.config.ts` — the `manualChunks` function
- `docs/performance-budget.md` — the new guardrail rule
- `scripts/` — a small eager-graph check script, if Step 4 needs one

**Out of scope** (do NOT touch, even though they look related):
- `src/lib/utils.ts` — `cn()` is fine. The bug is in chunk assignment, not in the
  utility.
- **Any file under `src/`.** This is a build-configuration change. If a source
  change seems necessary, that is a STOP condition.
- The `icons` chunk / Phosphor weights — explicitly rejected above.
- `repositories.ts` size or structure — see `plans/009-repositories-seam-extraction.md`.
- `lazyRouteComponent` usage in `src/routes/router.tsx` — already correct.
- `chunkSizeWarningLimit` — do not raise it to silence a warning. If a chunk
  exceeds it, that is information.

## Git workflow

- Branch: `perf/ai-eager-bundle`
- Commits:
  1. `perf(build): keep class utilities out of the charts chunk`
  2. `docs(perf): add an eager-graph guardrail rule`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Measure the eager graph, before changing anything

```bash
npm run build
```

Record total bytes, chunk count, and the ten largest chunks
(`ls -laS dist/assets/*.js | head -10`).

Then map what the entry actually reaches. The entry is the chunk referenced by
`dist/index.html`:

```bash
grep -o 'assets/[a-zA-Z0-9_-]*\.js' dist/index.html
```

Walk its static imports transitively and record the set. A quick way:

```bash
node -e "
const fs=require('fs'),path=require('path');
const dir='dist/assets';
const html=fs.readFileSync('dist/index.html','utf8');
const entry=(html.match(/assets\/[a-zA-Z0-9_-]+\.js/g)||[]).map(p=>path.basename(p));
const seen=new Set();
const walk=f=>{ if(seen.has(f)||!fs.existsSync(path.join(dir,f)))return; seen.add(f);
  const s=fs.readFileSync(path.join(dir,f),'utf8');
  for(const m of s.matchAll(/from\"\.\/([a-zA-Z0-9_-]+\.js)\"/g)) walk(m[1]);
};
entry.forEach(walk);
let total=0; const rows=[...seen].map(f=>{const b=fs.statSync(path.join(dir,f)).size; total+=b; return [f,b];});
rows.sort((a,b)=>b[1]-a[1]).forEach(([f,b])=>console.log(String(b).padStart(8), f));
console.log('EAGER TOTAL', total, 'across', seen.size, 'chunks');
"
```

**Verify**: you have an "EAGER TOTAL" number and the list includes a
`charts-*.js` entry. The advisor measured the entry reaching `charts` via `card`.
**If `charts` is NOT in the eager set, the defect is already fixed** — stop and
report that, and skip to Step 4 (the guardrail is still worth adding).

Save this script to `scripts/check-eager-bundle.mjs` — Step 4 reuses it.

### Step 2: Give the class utilities their own chunk

In `vite.config.ts`, add a branch to `manualChunks` **before** the `charts`
branch:

```ts
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react";
          // clsx / tailwind-merge / cva back `cn()` (src/lib/utils.ts), which every
          // shared UI component calls. Left unnamed, Rollup's heuristic parked them
          // inside the `charts` chunk — which gave the eager UI chunk a static import
          // of all 388 kB of recharts, on every route, including chart-less ones
          // (plan 267). They must have their own tiny chunk. Keep this branch ABOVE
          // the charts branch and do not delete it as "redundant".
          if (/node_modules\/(clsx|tailwind-merge|class-variance-authority)\//.test(id)) return "classutils";
          if (id.includes("node_modules/recharts") || /node_modules\/(d3-|victory-)/.test(id)) return "charts";
          if (id.includes("node_modules/@tanstack/")) return "tanstack";
          if (id.includes("node_modules/@phosphor-icons/")) return "icons";
          if (/node_modules\/(i18next|react-i18next)/.test(id)) return "i18n";
          if (id.includes("node_modules/@base-ui/")) return "baseui";
          return undefined;
        },
```

**Verify**:
- `npm run build` → exit 0
- Re-run the Step 1 eager-graph script. `charts-*.js` must **no longer** appear
  in the eager set, and a small `classutils-*.js` should.
- Record the new EAGER TOTAL and the delta from Step 1. The advisor's expectation
  is roughly **−388 kB**; report what you actually get.

### Step 3: Confirm charts still work — they now load lazily

This is where a chunking change can break things: recharts now arrives with the
chart routes rather than up front.

`npm run tauri dev`, then visit every chart-bearing surface and confirm each
renders with no console errors:

- 總覽 (DashboardRoute) — the net-worth trend
- 現金流 (CashFlowRoute) — the grouped bars + cumulative net line
- 投資 (InvestmentsRoute) and the 投資分析 tab — value series, TWR, benchmark
- 持股明細 (HoldingDetailRoute) — the per-holding chart
- 目標 (GoalsRoute) and 分類明細 (CategoryDetailRoute)

Also check `ls dist/assets/*.js | wc -l` is still in the 45–60 band (rule **R2**)
— a chunking change is exactly what could collapse or explode it.

**Verify**: every chart surface renders; chunk count within band; no new console
errors.

### Step 4: Add the missing guardrail

The reason this regressed silently is that `docs/performance-budget.md` watches
chunk *count* but not the *eager set*. Add a rule in the file's existing style
(read its R1–R4 section first and match the format exactly):

> ### R5 — Watch the eager chunk graph, not just the chunk count
>
> `manualChunks` assigns named vendors to their own chunks, but anything it
> returns `undefined` for is placed by Rollup's heuristic — which once put
> `clsx`/`tailwind-merge` inside the `charts` chunk and thereby made all 388 kB
> of recharts eager on every route (plan 267).
>
> After any change to `vite.config.ts` or to a widely-imported utility, run:
>
> ```bash
> npm run build && node scripts/check-eager-bundle.mjs
> ```
>
> `charts-*.js` must **not** appear in the eager set, and the eager total must
> not grow materially. Heavy, route-specific vendors belong behind
> `lazyRouteComponent`, not in the entry graph.

Tidy `scripts/check-eager-bundle.mjs` from Step 1 so it prints the eager list and
total, and **exits non-zero if `charts` is in the eager set** — that makes it
usable as a check, not just a report.

Follow the conventions of the existing scripts in `scripts/` (look at
`scripts/inject-private-assets.mjs` for the house style — plain Node ESM, no
dependencies).

**Verify**:
- `node scripts/check-eager-bundle.mjs` → exits 0 and prints the eager set
- Temporarily revert the Step 2 change, rebuild, re-run the script → it exits
  **non-zero**. Then restore Step 2. (This proves the guardrail actually guards.)

### Step 5: Full verification pass

**Verify**, in order, each exiting 0:
1. `npx tsc --noEmit`
2. `npm run lint`
3. `npm test`
4. `npm run build`
5. `node scripts/check-eager-bundle.mjs`
6. `npm run test:e2e`

## Test plan

No unit tests — this is build output, and the meaningful assertions are about
the built artifact:

- **`scripts/check-eager-bundle.mjs` exits 0**, and exits non-zero when the fix
  is reverted (Step 4's deliberate-failure check). That is the regression test
  for this plan, and it is the part that keeps the fix from silently undoing
  itself.
- **Chunk count stays in 45–60** (existing rule R2).
- **`npm run test:e2e` passes.** ⚠️ Corrected after execution: this does **not**
  cover the production chunking graph. `playwright.config.ts` sets
  `webServer.command: "npm run dev"`, so e2e runs against the Vite **dev server**,
  not `dist/`. Treat it as a smoke test only. The verification that actually
  covers built output is the per-route static reachability check in Step 3 plus
  `scripts/check-eager-bundle.mjs`.
- **The Step 3 manual chart pass.** A lazily-loaded chart library that fails to
  load produces an empty panel, not a test failure — only looking catches it.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0 with an unchanged passing count
- [ ] `npm run build` exits 0
- [ ] `npm run test:e2e` exits 0
- [ ] `ls dist/assets/*.js | wc -l` is between 45 and 60
- [ ] `grep -c "charts-" dist/assets/card-*.js` returns 0
- [ ] `node scripts/check-eager-bundle.mjs` exits 0; and exits non-zero with the
      Step 2 change reverted (recorded in the report)
- [ ] `grep -c "classutils" vite.config.ts` returns 1
- [ ] `grep -c "R5" docs/performance-budget.md` returns at least 1
- [ ] `git diff --name-only` lists only `vite.config.ts`,
      `docs/performance-budget.md`, `scripts/check-eager-bundle.mjs`
- [ ] Before/after EAGER TOTAL recorded in the report
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1 shows `charts` is **not** in the eager set — the defect is already
  fixed; report it and do Step 4 only.
- Any chart route in Step 3 stops reaching the `charts` chunk.
- ⚠️ Note `npm run test:e2e` runs against the dev server (`npm run dev`), not
  `dist/` — it cannot catch a broken production lazy-load. Do not treat a green
  e2e as proof the chunking is correct.
- The chunk count leaves the 45–60 band.
- The eager total does not drop by roughly the size of the charts chunk.
  Something else is also pulling recharts in eagerly — find out what before
  claiming the fix works.
- A file under `src/` seems to need changing.
- You are tempted to raise `chunkSizeWarningLimit` to silence a warning.
- You are tempted to revisit the Phosphor icon weights or split
  `repositories.ts`. Both are explicitly out of scope and the first is a recorded
  rejection.

## Maintenance notes

- **The general lesson, worth more than this specific fix**: anything
  `manualChunks` does not name is placed by a heuristic that optimises for
  deduplication, not for startup cost. Small, universally-imported utilities are
  the dangerous case — they act as a bridge that drags a heavy neighbour into the
  eager graph. When adding a widely-used dependency, give it an explicit branch.
- The `classutils` branch must stay **above** the `charts` branch and must not be
  deleted as redundant-looking. The comment in `vite.config.ts` says so; keep it.
- Chunk filenames are content-hashed, so any measurement in this plan is tied to
  a build. Always rebuild before comparing.
- `scripts/check-eager-bundle.mjs` is worth wiring into CI eventually. It is
  deliberately not wired in here — adding a CI gate is a separate decision and
  this plan is already touching build config.
- Deferred out of this plan: the remaining eager payload (icons 415 kB, `card`
  286 kB, react 178 kB, baseui 133 kB, tanstack 116 kB). After this fix, the next
  largest eager item is the icons chunk, and the recorded verdict is that
  trimming it is not worth the maintenance cost. The honest position is that the
  eager graph is close to its floor once recharts is out.
