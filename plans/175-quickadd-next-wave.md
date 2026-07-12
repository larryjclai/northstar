# Plan 175: 快速記帳再強化 — inventory the NLP spec's undelivered items, ship the offline ones, spec Tier 2 for decision

> **Executor instructions**: This plan is inventory-first: Step 1 produces a
> shipped/unshipped table, Steps 2–3 build only what Step 1 confirms missing
> AND offline. Tier 2 (cloud) is spec-only — it must NOT be built here. If
> anything in "STOP conditions" occurs, stop and report. When done, update the
> status row in `plans/README.md` — unless a reviewer dispatched you and told
> you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4ac63576..HEAD -- src/components/QuickAdd.tsx src/domain/quickAdd.ts src/domain/nlParser.ts docs/quick-add-nlp-plan.md`
> On drift, compare "Current state" excerpts against live code; on a mismatch,
> treat as STOP.

## Status

- **Priority**: P3
- **Effort**: M (inventory S + builds S each; Tier 2 spec S)
- **Risk**: LOW–MED (QuickAdd parse changes are regression-prone; the spec's
  own test strategy is the guard)
- **Depends on**: none
- **Category**: direction (operator-requested; grounded in docs/quick-add-nlp-plan.md)
- **Planned at**: commit `4ac63576`, 2026-07-12

## Why this matters

⌘N 快速記帳 is a flagship feature with its own 371-line spec
(`docs/quick-add-nlp-plan.md`). Phases P0–P6 (rules engine, lexicon, on-device
Apple Foundation Models) shipped; the spec still carries undelivered items:
**P7 Tier 2** (opt-in cloud parse), several **§6 UX items** whose shipped
status is unverified (e.g. §6.4 example chips, §6.5 remember-account-per-
category, §6.6 voice input), and **§11's six open questions**. The operator
asked for「快速記帳再強化」; the honest next step is an inventory against the
spec, shipping the small offline wins, and turning Tier 2 into a decidable
spec — Tier 2 sends user text to a cloud provider, which crosses Northstar's
local-first invariant and therefore requires an explicit operator decision,
not an executor's judgment.

## Current state

- `docs/quick-add-nlp-plan.md` — the authoritative spec. Key sections:
  - §6 (lines 260-272): seven UX items. §6.1 即時預覽 and §6.2 token 高亮
    shipped in P5 (per §9 table); §6.3 低信心補救, §6.4 範例 chips, §6.5
    記住每分類的常用帳戶, §6.6 語音輸入, §6.7 解析來源標示 — status unknown,
    Step 1 verifies each.
  - §8 (Tier 2 spec): opt-in setting default OFF, explicit「輸入文字會送往
    <provider>」disclosure, user-supplied API key via the existing secret
    mechanism, called only when Tier 0/1 fail, 1.2s timeout, sends only the
    input line + account/category name lists — never amounts history.
  - §9: P7 =「Tier 2 雲端 opt-in（純加分、可延後）」— the only unshipped phase.
  - §11: six open questions (corrections storage/sync, seed-dictionary i18n,
    Tier 1 context, Tier 2 provider/key storage, lexicon rebuild latency).
- `src/components/QuickAdd.tsx` — the UI; `src/domain/quickAdd.ts`,
  `nlParser.ts`, `userLexicon.ts`, `quickAddCorrections.ts`,
  `parseAmount.ts`, `parseDate.ts`, `categoryKeywords.ts` — the shipped
  pipeline. `src/domain/quickAdd.test.ts` is the regression suite the spec
  mandates keeping green.
- Secret storage precedent (for the Tier 2 spec): Stronghold-backed secret
  store is live (`USE_STRONGHOLD=true`; see `docs/secret-storage-plan.md`) —
  an API key must go there, never localStorage.
- On-device AI precedent: the Tier 1 plugin gating/timeout/fallback pattern is
  the model Tier 2 must mirror (§7, lines 287-293: trigger only on
  low-confidence, loading state, timeout → fall back to Tier 0 partial result).

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0              |
| Tests     | `npm test`         | all pass (quickAdd.test.ts green is mandatory) |
| Lint      | `npm run lint`     | exit 0, 0 errors    |

## Scope

**In scope**:
- `docs/quick-add-nlp-plan.md` (Step 1 annotates shipped status inline; Step 3
  appends the Tier 2 decision section)
- `src/components/QuickAdd.tsx` + the `src/domain/quickAdd*`/`nlParser`
  modules and their tests — ONLY for items Step 1 confirms unshipped and this
  plan's Step 2 selects
- New tests alongside changed modules

**Out of scope** (do NOT touch):
- Building Tier 2 (any network call from the parse path) — spec-only here.
- The Swift Tier 1 plugin and anything under `src-tauri/`.
- §6.6 語音輸入 — mobile-dependent, spec marks it 後續; inventory-only.
- copy.csv round-trip — QuickAdd strings are inline zh-TW today; match that.

## Git workflow

- Branch: `feat/ai-quickadd-next-wave`
- Conventional commits, e.g. `feat(quick-add): example chips for empty input`
- Do NOT push or merge; leave the branch for review.

## Steps

### Step 1: Inventory §6 + §11 against the code

For each §6 item (1–7) and §11 question (1–6), find code evidence
(`file:line`) that it is shipped / partially shipped / absent. Annotate the
spec doc inline (a short `> 狀態 2026-07:` blockquote under each item) and
produce the table in your report. Expected-unshipped candidates to check
hardest: §6.4 example chips (grep QuickAdd for an empty-input state), §6.5
per-category default account (grep for last-used-account logic), §6.7 source
icon (grep for `source` / `on-device` rendering in the confirm card).

**Verify**: every §6/§11 row in your table has a `file:line` or "no matches
for <grep pattern>" as evidence.

### Step 2: Ship the confirmed-missing offline quick wins

Build, in this priority order, ONLY items Step 1 confirmed absent — and stop
after at most three so the diff stays reviewable:

1. **§6.5 記住每分類的常用帳戶** — when the parser resolves a category but no
   account, default the account to the one last used with that category
   (derive from ledger history inside the existing lexicon build if it isn't
   already there — check `buildUserLexicon` first; it may already compute
   this, in which case the gap is only the QuickAdd wiring).
2. **§6.4 範例 chips** — 2–3 clickable examples (one 記帳, one 投資) on empty
   input that fill the input box.
3. **§6.7 解析來源標示** — small icon on the confirm card when
   `source: "on-device"` (the field exists per §7; render it).

Each: minimal diff, spec section quoted in the commit body, tests per the
spec's §10 strategy (fixture-style asserts on parse output for 1; render
asserts for 2–3 only if QuickAdd already has a test file).

**Verify** after each item: `npm test` → all pass, `quickAdd.test.ts`
unchanged-and-green (regression mandate).

### Step 3: Tier 2 decision spec (no code)

Append a「Tier 2 實作決定稿」section to `docs/quick-add-nlp-plan.md`
answering §11's open questions with concrete proposals the operator can
approve line-by-line:

- Provider + model default (spec suggests Claude Haiku; name the current
  model id and per-call cost estimate), key storage = Stronghold secret store
  (cite `docs/secret-storage-plan.md`), settings placement (進階設定, default
  OFF, disclosure copy verbatim per §8).
- Exact payload (input line + account/category NAME lists only) and an
  explicit "never sent" list (amounts, history, notes).
- Failure/timeout chain reusing the Tier 1 orchestrator seam (§7).
- Corrections storage/sync answer (§11.2) — propose: app_settings key, synced,
  with rationale.
- A build-plan sketch (files touched, test list) so approval → build is one
  step.

**Verify**: the section exists; every proposal cites the spec section it
resolves.

## Test plan

- Mandatory: `src/domain/quickAdd.test.ts` passes UNMODIFIED (spec §10 —
  regression protection; if a change requires editing existing assertions,
  that's a STOP, not an edit).
- New tests per Step 2 item, colocated with the module changed, modeled after
  the existing per-function test files (`parseAmount.test.ts` style).

## Done criteria

- [ ] Inventory table delivered (in the report + spec annotations committed)
- [ ] ≤ 3 offline items shipped, each with tests; `npm test` all pass;
      `quickAdd.test.ts` untouched (`git diff --stat` confirms)
- [ ] Tier 2 decision section appended to the spec; no network code added
      (`grep -rn "fetch\|invoke" src/domain/nlParser.ts` shows no new cloud path)
- [ ] `npx tsc --noEmit` 0; `npm run lint` 0 errors
- [ ] `plans/README.md` status row updated

## STOP conditions

- Any Step 2 item requires changing existing `quickAdd.test.ts` assertions —
  the regression suite is the spec's contract; report the conflict.
- §6.5 turns out to require a schema/settings change (not derivable from
  history) — report the design options instead of adding schema.
- The Step 1 inventory finds MORE than three §6 items missing — ship the top
  three, list the rest in the report for a follow-up plan.

## Maintenance notes

- The Tier 2 decision stays with the operator; nothing should implement it
  until the appended section is explicitly approved.
- Reviewer: watch for parse-behavior drift — Step 2 item 1 changes *defaults*,
  not parses; confidence labels must not change.
- §6.6 voice input belongs with the iOS wave (plan 177's RWD/mobile scope
  boundary), not here.
