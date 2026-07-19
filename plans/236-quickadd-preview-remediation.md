# Plan 236: Quick Add §6.3 — low-confidence remediation at the PREVIEW stage

> **Executor instructions**: Follow steps exactly; verify each. STOP conditions
> binding. Do NOT update `plans/README.md`.
>
> **Drift check**: `git diff --stat 82839b85..HEAD -- src/components/QuickAdd.tsx src/domain/quickAdd.ts src/domain/ledgerSuggestions.ts`
> Non-empty = compare excerpts first.

## Status

- **Priority**: P3 · **Effort**: S–M · **Risk**: LOW-MED (parser itself is
  frozen; UI + existing suggestion helpers only)
- **Depends on**: none
- **Category**: UX (docs/quick-add-nlp-plan.md §6.3)
- **Planned at**: commit `82839b85`, 2026-07-19

## Why this matters

Quick Add's real-time preview (§6.1, shipped) shows chips of what was parsed —
but when parsing is UNSURE the user only finds out at the confirm card. §6.3
(spec: `docs/quick-add-nlp-plan.md:268-269`): 「帳戶沒 match → 直接在預覽列出
帳戶 chips；分類靠猜 → 標『建議』可一鍵改」. The confirm card already has this
remediation (`buildLedgerSuggestions` chips); this plan brings it forward to
the preview so the user fixes gaps BEFORE hitting Enter.

## Current state

- `src/components/QuickAdd.tsx`:
  - `:126-134` — 150ms debounced `preview` state (`QuickAddParsed`).
  - `:494` — `<PreviewChips parsed={preview} accounts={accountRows} />`.
  - `:556-600` — `PreviewChips({ parsed, accounts })`: builds label/value chips
    (金額/帳戶/分類/日期…) — READ it fully to learn how it detects which fields
    parsed and what the parsed union carries (account id vs none, category +
    whether it came from a lexicon guess). Cite in your report which parsed
    fields distinguish "matched" from "absent/guessed"; if the union carries NO
    signal for "category was guessed" vs "category user-typed", the 建議 badge
    applies to any lexicon-derived category — read `parseQuickAdd`'s category
    sourcing in `src/domain/quickAdd.ts` to decide, and report the rule you
    implemented.
  - Confirm-card remediation exemplar (~`:355-366` per the spec doc; grep
    `buildLedgerSuggestions` / `ledgerSuggestions` in the file) — account/merchant
    chips + the mutation-free one-tap apply pattern. Mirror its interaction.
- `src/domain/ledgerSuggestions.ts` — `buildLedgerSuggestions`,
  `defaultAccountForCategory` (plan 175) — reuse, do not modify.
- Parser: `src/domain/quickAdd.ts` + its 39 tests — **FROZEN. Zero changes.**
  All remediation is presentation over the existing parse result.

## Steps

1. In `PreviewChips` (or a sibling component beside it — keep `PreviewChips`
   itself lean if cleaner), when the parse has an amount but NO account match:
   render up to 3 account chips (source: `buildLedgerSuggestions`-style ranking
   or the account list the confirm card uses — mirror it). Tapping a chip
   stores the choice in QuickAdd state such that `toConfirm()` / the confirm
   card picks it up as the selected account (find where the confirm card's
   account default comes from and pre-seed the same state — do NOT invent a
   parallel channel).
2. When the preview's category came from a guess (per your step-1 rule), badge
   the category chip with 「建議」 (dashed border or muted style consistent with
   the chip row) and make tapping it cycle/open the same category choices the
   confirm card offers (simplest acceptable: tap clears the guess so the
   confirm card's picker takes over — choose the least-code option and note it).
3. Keyboard safety: chips must not steal Enter/Escape from the input (mirror
   how existing interactive elements inside QuickAdd stop propagation).

**Verify** after each: `npx tsc --noEmit` → 0. Final: `npm run lint` → 0/761 ·
`npm test` → 1414 pass (parser suite byte-unchanged — `npx vitest run
src/domain/quickAdd.test.ts` → 39 pass) · live check: type 「晚餐 120」 with no
account word → preview shows account chips; tap one → confirm card carries it.

## Scope

In: `src/components/QuickAdd.tsx` only (plus a pure helper file + test ONLY if
extraction is genuinely cleaner). Out: `domain/quickAdd.ts`, `nlParser.ts`,
`ledgerSuggestions.ts`, the confirm card's existing chips.

## Done criteria

- [ ] Gates green; parser tests byte-unchanged
- [ ] Preview shows account chips when unmatched; tap flows into confirm
- [ ] Guessed category shows 建議 affordance
- [ ] No files outside scope modified

## STOP conditions

- The parsed union genuinely cannot distinguish "no account" from "account
  matched" at preview time (would need parser changes — frozen): report.
- Pre-seeding the confirm account requires restructuring `toConfirm()`.

## Maintenance notes

- §6.2 (input token highlight) was resolved WON'T-DO-for-now (see index):
  chips carry the same information; the spec doc's own status note records the
  substitution. If it's ever revived, spans must be added to the parser first.
