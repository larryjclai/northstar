# Plan 180: Quick Add 商家 autocomplete + 商家/名稱 disambiguation (operator-reported pain points)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update the status row in `plans/README.md` — unless a reviewer
> dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat f8473bef..HEAD -- src/components/QuickAdd.tsx src/domain/quickAdd.ts src/domain/quickAdd.test.ts src/domain/userLexicon.ts`
> On drift, compare the "Current state" excerpts against live code; on a
> mismatch, treat as STOP.

## Status

- **Priority**: P2 (operator-reported daily-use friction)
- **Effort**: M
- **Risk**: MED (Part B deliberately changes documented parse behavior — see
  the explicit test-update carve-out below)
- **Depends on**: none
- **Category**: direction / UX correctness
- **Planned at**: commit `f8473bef`, 2026-07-13

## Why this matters

The operator reported two concrete Quick Add pain points (2026-07-13):

1. **商家欄位沒有 autocomplete** — typing in the confirm card's 商家 field
   offers no dropdown of known merchants, so every entry is manual typing.
2. **商家/名稱 混淆** — for input like「花了 50 元在 50嵐吃晚餐」, the same
   text blob lands in BOTH 名稱 and 商家 (e.g.「50嵐吃晚餐」duplicated). The
   user can't tell how the two fields work.

Root causes (verified):
- The 商家 field is a plain `ns-input` (`QuickAdd.tsx:348`) — the only help is
  a few suggestion buttons below.
- Without `@` syntax the parser assigns the ENTIRE remaining text to
  `merchant` (`quickAdd.ts:276`), and the confirm card then copies it into
  `name` (`QuickAdd.tsx:36` `name: parsed.name ?? parsed.merchant`). Saving
  writes the blob to both fields, polluting merchant statistics and the
  self-learning lexicon.

**⚠ Operator-sanctioned behavior change**: Part B changes the documented
default (`quickAdd.ts:2`「拿鐵 120 → merchant 拿鐵」). The previous standing
rule "never modify `quickAdd.test.ts`" is **partially lifted for this plan
only**: you MAY update existing assertions on the `merchant` / `name` fields
to match the new semantics, and MUST list every changed assertion in your
report. Assertions on amounts, dates, accounts, entryType, and category
values must NOT change (category assertions may change only where the
expected category is identical but derived via name instead of merchant — if
a category VALUE changes, that's STOP #2).

## Current state (verified at `f8473bef`)

- `src/domain/quickAdd.ts`:
  - `:233-242` — `@merchant` explicit syntax (`/@([^\d\s０-９]\S*)/`), sets
    `explicitMerchant`, removes the tag from `body`.
  - `:274-276` — the fallback this plan changes:

    ```ts
    // When @ syntax is used: merchant = @value, name (description) = remainingText.
    // Without @: merchant = remainingText (backward-compatible).
    const merchant = explicitMerchant ?? remainingText;
    ```

  - `:279-280` — `resolveCategory(merchant, ctx)`; a follow-up branch already
    tries `name` when merchant yields nothing — read it and keep category
    resolution able to see BOTH fields' tokens after the change.
- `src/components/QuickAdd.tsx`:
  - `:24` — `LedgerConfirm` has separate `name` + `merchant`.
  - `:34-36` — `toConfirm`: `name: parsed.name ?? parsed.merchant` (the
    duplication site).
  - `:126-127` — `buildLedgerSuggestions(ledgerRows, { category, merchant })`
    already derives suggestion lists; `:372-376` renders merchant suggestion
    Buttons.
  - `:239-247` — `chooseMerchant(merchant)` — sets the merchant AND applies
    its known category from `merchantCat`. **Reuse this as the autocomplete's
    select handler.**
  - `:342-348` — the 名稱 / 商家 plain inputs.
  - `:529-535` — PreviewChips already renders 名稱/商家 as separate chips when
    they differ.
- Merchant data sources for autocomplete: `merchantCat` (`QuickAdd.tsx:51`,
  history-derived `Map` keyed by merchant name) and `settings.merchants` (the
  rename registry — check its shape in `src/domain/types.ts`). History
  merchants ordered by frequency is the natural ranking; `buildLedgerSuggestions`
  may already do this (read `src/domain/ledgerSuggestions.ts` first — don't
  re-derive what exists).
- `src/domain/userLexicon.ts` — read-only; exposes learned merchants. Do not
  modify.
- Combobox precedent: the repo has a searchable account Combobox
  (`grep -rln "Combobox\|cmdk\|command" src/components/ src/components/ui/`) —
  prefer reusing that pattern over inventing a dropdown, but a lightweight
  filtered list under the input is acceptable if the existing component
  doesn't fit an inline field (record the choice in the commit message).
  QuickAdd renders inside its own overlay — beware nested-popover z-index;
  test the simplest thing that works.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Install   | `npm install`      | exit 0 (fresh worktree — run FIRST) |
| Typecheck | `npx tsc --noEmit` | exit 0              |
| Tests     | `npm test`         | all pass            |
| Lint      | `npm run lint`     | exit 0, 0 errors    |

## Scope

**In scope**:
- `src/components/QuickAdd.tsx` (autocomplete + confirm-card duplication fix)
- `src/domain/quickAdd.ts` (Part B parser change)
- `src/domain/quickAdd.test.ts` (ONLY merchant/name assertions, per the
  carve-out above; add new cases)
- A small new component file under `src/components/` only if the dropdown
  genuinely needs extraction

**Out of scope** (do NOT touch):
- `src/domain/nlParser.ts` (orchestrator), the Tier-1 Swift plugin,
  `userLexicon.ts`, `quickAddCorrections.ts`, `ledgerSuggestions.ts` (consume
  only).
- The `@merchant` syntax — unchanged.
- The ledger EntryDrawer's merchant field (CashFlowRoute) — QuickAdd only;
  if the fix obviously belongs in both, note it as a follow-up instead.

## Git workflow

- Branch: `feat/ai-quickadd-merchant-ux`
- Conventional commits, e.g. `feat(quick-add): merchant autocomplete dropdown`,
  `feat(quick-add): known-merchant extraction, stop name/merchant duplication`
- Do NOT push or merge; leave the branch for review.

## Steps

### Step 1 (Part A): 商家 autocomplete in the confirm card

Replace the plain 商家 input (`QuickAdd.tsx:348`) with an
autocomplete-enabled input: as the user types, show a dropdown (max ~8) of
known merchants filtered by substring match (case-insensitive; CJK needs no
tokenization — plain `includes` is fine), ranked by history frequency.
Sources: history merchants (from `merchantCat` keys / `ledgerSuggestions` —
whichever already carries frequency) merged with `settings.merchants` names,
deduped. Selecting an entry calls the existing `chooseMerchant(merchant)` so
the known category auto-applies exactly as the suggestion buttons do today.
Keyboard: ArrowDown/Up + Enter selects, Escape closes WITHOUT closing
QuickAdd itself (stopPropagation — QuickAdd's overlay listens for Escape).
Free text stays allowed (it's an input, not a select).

**Verify**: `npx tsc --noEmit` → 0; `npm run lint` → 0 errors.

### Step 2 (Part B): known-merchant extraction in the parser

In `quickAdd.ts`, replace the `:276` fallback with:

1. `@` syntax present → unchanged (merchant = tag, name = remainder).
2. Else, scan `remainingText`'s tokens (whitespace + full-width space split)
   for a **known merchant**: exact match against (a) the history-derived
   merchant set and (b) lexicon merchant entries — pass whatever the parse
   context already carries (`ctx.merchantCategory` keys; check what else
   `ParseContext` exposes before adding a field — if a new `knownMerchants`
   set must be added to the context, wire it from `QuickAdd.tsx` where
   `merchantCat` is built). Longest matching token wins; also try matching a
   known merchant as a SUBSTRING of a token (「50嵐吃晚餐」contains「50嵐」)
   — on a substring hit, split the token: matched part → merchant, the
   remainder rejoins the name.
3. Hit → `merchant = matched`, `name = remainingText minus the matched part`
   (trimmed; if that leaves nothing, name = merchant so the record still has
   a display name).
4. No hit → `merchant = ""`, `name = remainingText`. Category resolution must
   then consider name tokens (the `:279-280` follow-up branch — verify it
   fires when merchant is empty, adjust its guard if it only runs when
   "name differs from merchant").

Update the module-header examples (`quickAdd.ts:2-14`) to document the new
rules. In `QuickAdd.tsx:36`, stop copying merchant into name — `name:
parsed.name ?? ""` when merchant is set separately; keep the save-time
fallback (`:169` `name || merchant`) so records never save with an empty name.

**Verify**: `npx tsc --noEmit` → 0; `npm test` → quickAdd suite green after
the sanctioned assertion updates (list each in the report).

### Step 3: Tests

See test plan.

**Verify**: `npm test` → all pass.

## Test plan

New cases in `quickAdd.test.ts` (fixture style, matching the file):
- 「晚餐 50嵐 120」 with 50嵐 in the known-merchant context → merchant=50嵐,
  name=晚餐, category = 50嵐's learned category.
- 「花了 50 元在 50嵐吃晚餐」 → merchant=50嵐 (substring split), name contains
  晚餐, amount=50.
- Unknown merchant:「拿鐵 120」 with empty context → merchant="", name=拿鐵,
  category still resolves via the seed keyword through the name path.
- `@` syntax regression:「午餐 @添飯 120」 → unchanged (name=午餐, merchant=添飯).
- Known merchant ties: two known merchants both matching → longest token wins
  (document the rule in the test name).

Part A: no jsdom dropdown test required (repo convention for QuickAdd UI);
the select path is covered by `chooseMerchant` reuse.

## Done criteria

- [ ] `npx tsc --noEmit` 0; `npm run lint` 0 errors; `npm test` all pass with ≥ 5 new parser cases
- [ ] `grep -n "parsed.name ?? parsed.merchant" src/components/QuickAdd.tsx` → no match (duplication removed)
- [ ] 商家 field has a filtered dropdown (read the JSX; describe it in the report)
- [ ] Every changed existing assertion is listed in the report, and none of them concerns amount/date/account/entryType or changes a category VALUE
- [ ] `plans/README.md` status row updated

## STOP conditions

- The `remainingText` pipeline turns out to strip or reorder tokens in a way
  that makes "name = remainder after removing the merchant" ambiguous — report
  with 3 concrete inputs/outputs rather than guessing.
- A required assertion change would alter an expected **category value** (not
  just its derivation path) — that's a financial-semantics change; stop.
- The autocomplete cannot render inside QuickAdd's overlay without z-index or
  focus-trap surgery in shared components (ModalShell etc.) — ship Part B
  alone, report Part A's obstacle.
- More than ~15 existing assertions need updating — the behavior change is
  bigger than scoped; stop and report the list.

## Maintenance notes

- The known-merchant set makes the parser context slightly heavier; if input
  latency appears (spec §11.6 concern), memoize the set where `merchantCat`
  is already memoized — do not rebuild per keystroke.
- Follow-up (deliberately out of scope): the same autocomplete belongs on the
  CashFlow EntryDrawer merchant field; a `商家` field in the ledger edit flow
  could reuse the extracted component.
- Reviewer: scrutinize the substring-split rule (「50嵐吃晚餐」) — it's the
  one heuristic; wrong splits show up immediately in PreviewChips, which is
  the intended feedback loop.
