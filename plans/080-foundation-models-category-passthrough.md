# Plan 080: Complete on-device Foundation Models — pass the category list through to Tier 1

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If anything in the
> "STOP conditions" section occurs, stop and report — do not improvise. Touch only
> the files listed as in scope. Commit per the Git workflow section.
>
> **Drift check (run first)**: `git diff --stat 2bfb7636..HEAD -- src/domain/quickAdd.ts src/lib/foundationModels.ts src/components/QuickAdd.tsx`
> If any in-scope file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW — additive optional field + threading existing data through; no change
  to financial math or to the Tier 0 rules parser
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `2bfb7636`, 2026-06-27

## Why this matters

Northstar's Quick Add (⌘N) has a working two-tier natural-language parser: Tier 0
(synchronous rules) and Tier 1 (on-device Apple Foundation Models on macOS 26+/iOS
26+). The Tier 1 Swift prompt instructs the model: *"category must exactly match one
of the provided category names or be null."* **But the provided category list is
always empty** — the TypeScript that builds the on-device context hardcodes
`categories: []`. As a result the on-device model can never assign a category to a
parsed transaction; it always returns `category: null`, and the user must pick the
category by hand even when Apple Intelligence is active. This plan threads the real
category list (already loaded in the Quick Add component) through to the model,
turning on dead functionality with a one-field change. This is the highest-leverage
"complete the Foundation Models integration" fix available.

## Current state

The category list exists in the component but is dropped before it reaches the model.
Three files, three gaps:

1. **`src/lib/foundationModels.ts:20-29`** — `buildOnDeviceCtx` hardcodes an empty
   array with a comment that claims (incorrectly) the categories are populated elsewhere:
   ```ts
   function buildOnDeviceCtx(ctx: QuickAddContext): OnDeviceContext {
     const today = ctx.nowDatetimeLocal?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
     return {
       accounts: ctx.accounts.map((a) => ({ id: a.id, name: a.name })),
       categories: [], // populated from settings in QuickAdd.tsx via ctx extension
       today,
       nowDatetimeLocal: ctx.nowDatetimeLocal ?? `${today}T00:00`,
       mode: ctx.mode,
     };
   }
   ```
   The comment is false: `QuickAddContext` has no `categories` field, and nothing
   populates it. `OnDeviceContext.categories` is typed `string[]` (line 14).

2. **`src/domain/quickAdd.ts:29-51`** — `QuickAddContext` has no `categories` field:
   ```ts
   export interface QuickAddContext {
     accounts: QuickAddAccount[];
     merchantCategory?: Map<string, { category: string; subcategory: string }>;
     lexicon?: UserLexicon;
     mode?: "ledger" | "investment";
     nowDatetimeLocal?: string;
   }
   ```

3. **`src/components/QuickAdd.tsx`** — the component already has the category names
   loaded (line ~48: `const categoryGroups = settings.data?.categories ?? [];`) but
   does NOT put them in the ctx passed to the parser. The `parse()` function (line
   ~123) builds:
   ```ts
   const ctx = { accounts: accountRows, merchantCategory: merchantCat, lexicon, mode, nowDatetimeLocal: now };
   const { result: parsed, source } = await orchestrate(text, ctx, onDeviceParser);
   ```
   `categoryGroups` is `Array<{ name: string; children: string[] }>` (the
   `settings.data.categories` shape).

The Swift side already consumes a category list correctly — no Swift change needed.
`src-tauri/gen/apple/Sources/northstar/FoundationModels.swift:86-88` renders
`context.categories` into the prompt and falls back to "(none provided)" when empty.
Once the array is non-empty, Tier 1 categorization works with no further change.

### Conventions to follow

- The on-device path must stay a **silent no-op** when unavailable — never throw to
  the user (see the existing try/catch in `foundationModels.ts`). Your change is pure
  data plumbing; preserve that.
- Tests use **vitest** with the `describe/it/expect/vi` API. Model the new test on
  `src/domain/nlParser.test.ts` (same directory style, same imports). Example header:
  ```ts
  import { describe, expect, it } from "vitest";
  ```
- Do NOT touch the Tier 0 rules parser (`parseQuickAdd`) — categories are only used
  to constrain Tier 1's output. Tier 0 categorization already works via
  `merchantCategory` + `lexicon`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install (worktree) | `npm install` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0, no errors |
| Tests | `npm test` | all pass |
| Targeted test | `npx vitest run src/lib/foundationModels.test.ts` | new test passes |
| Lint | `npm run lint` | exit 0 |

> Note: a fresh worktree has no `node_modules`. Run `npm install` first.

## Scope

**In scope** (the only files you may modify):
- `src/domain/quickAdd.ts` — add optional `categories?: string[]` to `QuickAddContext`
- `src/lib/foundationModels.ts` — read `ctx.categories`; export `buildOnDeviceCtx` for testing; fix the false comment
- `src/components/QuickAdd.tsx` — pass category names into the parser ctx
- `src/lib/foundationModels.test.ts` — new test file (create)

**Out of scope** (do NOT touch):
- `src-tauri/gen/apple/Sources/northstar/FoundationModels.swift` — already handles a
  non-empty category list correctly; no change needed
- `src/domain/nlParser.ts` and `parseQuickAdd` (Tier 0 rules) — unaffected
- Subcategory passing — the on-device `OnDeviceContext.categories` is a flat
  `string[]` of top-level category names by contract; enriching it with subcategories
  is a separate, larger change (see Maintenance notes). Pass top-level names only.
- Any financial calculation, sync, or repository code

## Git workflow

- Branch: `feat/ai-fm-category-passthrough` (create it in the worktree)
- Conventional commits, e.g. `fix(quick-add): pass category list to on-device model`
- Commit when done. Do NOT push or open a PR.

## Steps

### Step 1: Add `categories` to `QuickAddContext`

In `src/domain/quickAdd.ts`, add an optional field to the `QuickAddContext` interface
(after `nowDatetimeLocal`):
```ts
  /**
   * Top-level category names available to constrain the on-device (Tier 1)
   * parser's category output. Tier 0 ignores this. Empty/undefined when the
   * caller has no category list.
   */
  categories?: string[];
```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Read `ctx.categories` in `buildOnDeviceCtx` and export it

In `src/lib/foundationModels.ts`:
- Change `categories: []` to `categories: ctx.categories ?? []`.
- Replace the false comment with an accurate one (e.g. `// top-level category names
  the model must choose from; empty when the caller provides none`).
- Add `export` to `function buildOnDeviceCtx` so the test can call it directly.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Pass category names from QuickAdd into the parser ctx

In `src/components/QuickAdd.tsx`, in the `parse()` function (around line 123-127),
include the category names in the ctx. `categoryGroups` is already in scope
(`const categoryGroups = settings.data?.categories ?? [];`):
```ts
const ctx = {
  accounts: accountRows,
  merchantCategory: merchantCat,
  lexicon,
  mode,
  nowDatetimeLocal: now,
  categories: categoryGroups.map((g) => g.name),
};
```
Leave the debounced **preview** effect (the `parseQuickAdd(...)` call ~line 108)
unchanged — preview is Tier 0 only and does not use categories. If `categoryGroups`
is not in scope inside `parse()` for any reason, STOP and report (do not relocate
state).

**Verify**: `npx tsc --noEmit` → exit 0; `npm run lint` → exit 0.

### Step 4: Add a unit test for the context builder

Create `src/lib/foundationModels.test.ts`. Test `buildOnDeviceCtx` directly (it is a
pure function after Step 2):
- **Case A**: ctx with `categories: ["飲食", "交通", "居住"]` → returned object's
  `categories` deep-equals that array.
- **Case B**: ctx with no `categories` field → returned `categories` equals `[]`.
- **Case C**: accounts are mapped to `{id, name}` only (no extra fields leak).

Minimal shape:
```ts
import { describe, expect, it } from "vitest";
import { buildOnDeviceCtx } from "./foundationModels";
import type { QuickAddContext } from "../domain/quickAdd";

describe("buildOnDeviceCtx", () => {
  it("passes the category list through to the on-device context", () => {
    const ctx: QuickAddContext = {
      accounts: [{ id: "a1", name: "信用卡" }],
      categories: ["飲食", "交通", "居住"],
      nowDatetimeLocal: "2026-06-27T10:00",
    };
    expect(buildOnDeviceCtx(ctx).categories).toEqual(["飲食", "交通", "居住"]);
  });

  it("defaults to an empty list when no categories are provided", () => {
    const ctx: QuickAddContext = {
      accounts: [{ id: "a1", name: "信用卡" }],
      nowDatetimeLocal: "2026-06-27T10:00",
    };
    expect(buildOnDeviceCtx(ctx).categories).toEqual([]);
  });
});
```
If importing `foundationModels.ts` in the test fails because of the top-level
`import { invoke } from "@tauri-apps/api/core"` (module resolution under vitest/jsdom),
STOP and report — do NOT mock Tauri globally or restructure the module to work around
it without flagging it first.

**Verify**: `npx vitest run src/lib/foundationModels.test.ts` → 2 tests pass.

## Test plan

- New file `src/lib/foundationModels.test.ts` with the two cases above (category
  pass-through, empty default), modeled on `src/domain/nlParser.test.ts`.
- The assertions check the actual mapped value, not just truthiness — Case A asserts
  exact array equality so it fails if the field is dropped again.
- Verification: `npm test` → all pass, including the 2 new tests.

## Done criteria

ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0; `src/lib/foundationModels.test.ts` exists and its 2 tests pass
- [ ] `grep -n "categories: \[\]" src/lib/foundationModels.ts` returns **no** match
  (the hardcoded empty array is gone)
- [ ] `grep -n "categories?: string\[\]" src/domain/quickAdd.ts` returns a match
- [ ] `grep -n "categoryGroups.map" src/components/QuickAdd.tsx` returns a match
- [ ] No files outside the in-scope list are modified (`git status`)

## STOP conditions

Stop and report back (do not improvise) if:

- The "Current state" excerpts don't match the live code (drift since `2bfb7636`).
- `categoryGroups` is not in scope inside `parse()` in `QuickAdd.tsx` (the component
  was refactored) — report rather than moving state around.
- Importing `foundationModels.ts` in vitest fails due to the Tauri import — report;
  do not add a global Tauri mock without flagging.
- Any change appears to require editing the Swift file or the Tier 0 parser.

## Maintenance notes

- **Subcategory enrichment (deferred)**: the model is also asked for a `subcategory`,
  but the on-device context only carries a flat list of top-level category names.
  Passing the category→subcategory tree would require changing the Swift
  `OnDeviceContext` struct and prompt — a larger, separate change. Not in this plan.
- **Reviewer focus**: confirm the preview path stays Tier 0 (no behavior change while
  typing) and that the category list is only added to the `parse()` ctx that can reach
  Tier 1. Confirm the new test asserts exact values, not just truthiness.
- This plan completes the data path that plan 077 Phase 7 ("deepen Apple Intelligence")
  assumed already worked. Any future on-device feature that needs the category list can
  now rely on `QuickAddContext.categories`.
