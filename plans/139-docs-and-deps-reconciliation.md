# Plan 139: Reconcile actively-wrong docs with shipped reality + drop unused dependencies

> **Executor instructions**: Follow this plan step by step. Run every
> verification command. If anything in the "STOP conditions" section occurs,
> stop and report. When done, update this plan's status row in
> `plans/README.md` — unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 65fe04c1..HEAD -- docs/architecture.md README.md README.en.md ROADMAP.md docs/DEVELOPMENT.md docs/coss-ui-migration-plan.md package.json`
> Verify each claim below against the live file before editing; skip any
> already fixed.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none (plan 130 also touches DEVELOPMENT.md:13 + ROADMAP:78
  for Stronghold — if 130 landed, skip those two edits here)
- **Category**: docs
- **Planned at**: commit `65fe04c1`, 2026-07-09

## Why this matters

Several canonical docs state things that are no longer true — worse than
missing docs, because contributors (and AI agents reading them as ground
truth) build wrong mental models: the architecture doc names the wrong sync
backend entirely; the README advertises a hidden feature; the roadmap lists
shipped work as planned and a retired decision as pending. Three declared npm
dependencies have zero imports.

## Current state (each verified at planning)

1. **`docs/architecture.md`** — 5 occurrences of "Supabase" describing the
   sync backend ("Push encrypted envelope to Supabase" etc.). Reality: the
   backend is the Cloudflare Worker in `worker/` (D1, `relay_sequence`
   cursor pull), consumed via `src/features/connect/sync/client.ts` with
   `VITE_NORTHSTAR_SYNC_WORKER_URL`. The `supabase/` dir contains only an
   empty legacy `functions/` folder.
2. **`README.md:25`** — 「收支記帳、轉帳、週期性收支、定期定額（定股）提醒。」
   and the matching line in `README.en.md` — but DCA is hidden
   (`InvestmentsRoute.tsx:427`: "定期定額 (recurring DCA) is hidden until the
   workflow is finalised"; ROADMAP lists it as awaiting rework).
3. **`ROADMAP.md`** (last substantive edit 2026-06-16; app now alpha.53):
   items under 規劃中 that have since shipped (per CHANGELOG + code): 年度報
   稅明細 (annualReport + AnnualReportRoute, alpha.52), Taiwan fund NAV
   (sitcaFundProvider), custom-asset valuation Phase 1 (manualPriceImport +
   snapshot-based valuation), holding-identity merge, DRIP (dripGroupId),
   budget rollover (budgetRollover.ts), net-worth projection
   (netWorthProjection.ts + NetWorthProjectionCard). Also `ROADMAP.md:136`
   still proposes the 手續費/證交稅 split that was RETIRED 2026-07-04
   (operator decision: TW filing doesn't need it — recorded in
   plans/README.md).
4. **`docs/DEVELOPMENT.md`**: `:11` lists **Zod** in the stack (zero imports
   in src/, not in package.json); `:13` claims Stronghold stores the vault
   key (it doesn't yet — see plan 130; if 130 landed, verify wording is
   already fixed); platform table "CI 驗證 ✅" conflates release.yml with the
   everyday ci.yml gate (see plan 128) — clarify which pipeline verifies what.
5. **`docs/coss-ui-migration-plan.md`**: `:255` "Phases 0–10 COMPLETE" is
   contradicted by the deliberate whitelist in `src/components/ui/README.md`
   (command/popover/date-picker/calendar/month-picker kept — COSS has no
   equivalents; 17 files import ui/popover). Also its "two Base UI packages
   coexist" note (~:96-98) is resolved (only `@base-ui/react` remains — its
   removal already happened). Add a "2026-07 reality" addendum: migration
   complete EXCEPT the documented permanent whitelist; dead COSS primitives
   (`coss/checkbox.tsx`, `coss/field.tsx`, `coss/label.tsx`,
   `coss/select.tsx` — zero importers) are intentional scaffolding for the
   deferred form-primitive migration, note them as such.
6. **Unused dependencies** (zero imports across src/, worker/, scripts/ —
   re-verify with `grep -rln "react-hook-form\|@tanstack/react-table\|next-themes" src worker/src scripts`):
   `react-hook-form`, `@tanstack/react-table`, `next-themes`.

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Verify unused | the grep above | no output |
| After dep removal | `npm install && npx tsc && npm run build && npm test` | all green |
| Lint | `npm run lint` | exit 0 |

## Scope

**In scope**: the six items' files + `package.json`/`package-lock.json` (item
6). **Out of scope**: PRODUCT.md, DESIGN.md, product-spec (checked, no
falsehoods found); deleting `supabase/` or `Design System/` (operator-owned
history — you may ADD a one-line "legacy, unused" README note inside
`supabase/`, nothing more); any code change.

## Git workflow

Branch `docs/ai-reconcile-reality`; conventional commits per item
(`docs(architecture): sync backend is the Connect Worker, not Supabase`,
`chore(deps): drop react-hook-form, @tanstack/react-table, next-themes`).
No push/merge.

## Steps

1. Rewrite architecture.md's sync sections: replace Supabase with the Connect
   Worker (name the real pieces: Cloudflare Worker + D1, Bearer auth,
   envelope push/pull with per-user cursor on `relay_sequence`, key-envelope
   mailbox, pairing sessions — all from `worker/src/index.ts`; keep the E2EE
   claims, they're true). Add the one-line legacy note in `supabase/`.
2. README ×2: drop or requalify the DCA clause (suggest: move to a
   「規劃中/重做中」 mention or delete the clause). Keep both language files
   in sync.
3. ROADMAP pass: move the seven shipped items to the shipped section (match
   the file's existing structure); strike the fee/tax-split line with a
   one-line retirement note; refresh the Stronghold line if plan 130 hasn't
   already.
4. DEVELOPMENT.md: remove Zod; fix the Stronghold line (if needed); clarify
   ci.yml vs release.yml verification scopes.
5. coss-ui-migration-plan.md addendum (item 5 wording above).
6. Remove the three deps; run the full verify battery (install, tsc, build,
   test) — build matters here (tree-shaking config could reference them;
   it doesn't, but prove it).

**Verify each step**: the file no longer contains the false claim (grep the
old phrase → 0 hits); step 6's battery green.

## Done criteria

- [ ] `grep -c "Supabase" docs/architecture.md` → 0
- [ ] `grep -n "定期定額" README.md README.en.md` → no unqualified
      shipped-feature claim
- [ ] ROADMAP shipped-items moved; fee-split struck
- [ ] `grep -n "Zod" docs/DEVELOPMENT.md` → 0
- [ ] 3 deps gone; install/tsc/build/test green
- [ ] `plans/README.md` updated

## STOP conditions

- The unused-dep grep finds a NEW import (someone started using one since
  planning) — drop only the still-unused ones.
- ROADMAP's structure has diverged so much that "move to shipped" is
  ambiguous — do the strike-throughs + a dated addendum instead of
  restructuring.

## Maintenance notes

- ROADMAP will drift again; suggest (in your report, not as a change) a
  release-time checklist line: "reconcile ROADMAP with this release's
  CHANGELOG entries".
- Reviewer: README is user-facing zh-TW marketing surface — check tone
  matches the file, not translationese.
