# Plan 154: Persist category 收入/支出 kind (and rollover) — normalizeCategoryGroups drops them

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat da946482..HEAD -- src/data/repositories.ts src/components/CategoryManagementDrawer.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: MED (touches the settings persistence path both repos share)
- **Depends on**: none (uses the plan-126 `describeEachRepo` harness, already on main)
- **Category**: bug (data loss)
- **Planned at**: commit `da946482`, 2026-07-11

## Why this matters

Operator report: 「分類自定義是在『支出』『收入』類別出現儲存後，到記帳那邊看還是
沒有改動到，然後回到分類裡面我剛剛的設定就跑掉了。」 — setting a category's
收入/支出 kind in 設定 → 分類, saving, then finding the entry form unchanged and
the setting reverted.

Root cause (confirmed by code inspection, and it is worse than reported):
`normalizeCategoryGroups` — run inside **every** `updateAppSettings` in BOTH
repositories — rebuilds each category from a hard whitelist of fields and
**silently discards `kind`, `rollover`, and `rolloverStart`**. The domain type
has carried all three for a while (`kind` since plan 056, `rollover`/
`rolloverStart` since plan 039), and the Settings edit form writes all three,
but no save has ever persisted them. That means:

- the 收入/支出 picker filter (plans 056/098) can never actually take effect
  from user settings;
- budget rollover opt-in (plan 039) is wiped on the next settings save of any
  kind;
- every UI that saves *any* settings change destroys these fields on every
  category.

Secondary bug (same symptom cluster): `CategoryManagementDrawer` seeds its
editable copy from props **once at mount** and only hides itself with
`if (!open) return null`, so reopening the drawer shows a stale category list;
pressing 儲存變更 then overwrites the settings with that stale snapshot,
resurrecting deleted categories and reverting recent edits.

## Current state

- `src/data/repositories.ts` — single file containing both repository
  implementations (in-memory/browser and SQLite) plus shared normalizers.

  The bug, `normalizeCategoryGroups` (lines 4837–4850 as of `da946482`):
  ```ts
  function normalizeCategoryGroups(input: unknown) {
    const source = Array.isArray(input) ? input : [];
    return source.map((item) => {
      if (typeof item === "string") return { name: item, children: [] };
      const group = item as { name?: unknown; children?: unknown; icon?: unknown; iconName?: unknown; color?: unknown; budget?: unknown };
      return {
        name: String(group.name ?? "").trim(),
        children: uniqueClean(group.children, []),
        iconName: group.iconName ? String(group.iconName) : group.icon ? String(group.icon) : undefined,
        color: group.color ? String(group.color) : undefined,
        budget: typeof group.budget === "number" ? group.budget : group.budget ? Number(group.budget) : undefined,
      };
    }).filter((item) => item.name);
  }
  ```

  Both save paths run it via `normalizeSettings` (line 4820):
  - memory repo `updateAppSettings` (line 1430): `this.data.settings = normalizeSettings(input)`
  - SQLite repo `updateAppSettings` (line 3065): `const settings = normalizeSettings(input)` → JSON into the `app_settings` table.

  The domain contract it must honor — `CategoryGroup`
  (`src/domain/types.ts:341-369`, doc comments abridged):
  ```ts
  export interface CategoryGroup {
    name: string;
    children: string[];
    budget?: number | null;
    color?: string;
    iconName?: string;
    rollover?: boolean;          // opt-in monthly budget rollover (plan 039)
    rolloverStart?: string;      // YYYY-MM carry-accumulation start
    kind?: "income" | "expense" | "both";  // 收入/支出 picker filter (plan 056)
  }
  ```

- The write side that proves the fields flow in:
  `src/routes/settings/CategoriesSection.tsx:444` —
  `onSave({name,iconName:icon,color,budget:budget?+budget:null,rollover,kind})`
  → `saveEdit` → `SettingsRoute.submit` → `updateSettings.mutateAsync` (a
  `useRepositoryMutation(..., ["settings"])`, which DOES invalidate the query —
  invalidation is not the problem; persistence is).

- The read side that consumes `kind`: `src/domain/categoryKind.ts`
  (`categoryMatchesType` treats absent/`"both"` as show-everywhere), used by
  QuickAdd and the EntryDrawer pickers.

- Secondary bug — `src/components/CategoryManagementDrawer.tsx:22,35`:
  ```ts
  const [local, setLocal] = useState<CategoryGroup[]>(categories);
  // ...
  if (!open) return null;
  ```
  Rendered unconditionally (with an `open` prop) from three parents:
  `CashFlowRoute.tsx:1309`, `CategoriesRoute.tsx:426`,
  `CategoryDetailRoute.tsx:298` — so the component mounts once per route and
  `local` never resyncs.

- Test harness to use: `src/data/repositories.testHarness.ts` exports
  `describeEachRepo(name, (makeRepo, repoLabel) => ...)` which runs a suite
  against BOTH repositories (memory + real-SQL SQLite shim). Exemplars: any
  `src/data/repositories.*.test.ts`, e.g. `repositories.refund.test.ts`.

## Commands you will need

| Purpose   | Command                                              | Expected on success |
|-----------|------------------------------------------------------|---------------------|
| Typecheck | `npx tsc`                                            | exit 0              |
| One suite | `npx vitest run src/data/repositories.settings.test.ts` | all pass (new file) |
| Full tests| `npm test`                                           | all pass            |
| Lint      | `npm run lint`                                       | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `src/data/repositories.ts` (only `normalizeCategoryGroups`)
- `src/data/repositories.settings.test.ts` (create)
- `src/components/CategoryManagementDrawer.tsx` (stale-props resync only)

**Out of scope** (do NOT touch, even though they look related):
- `src/domain/categoryKind.ts`, `budgetRollover.ts` — the consumers are
  correct; only persistence is broken.
- `src/routes/settings/CategoriesSection.tsx`, `SettingsRoute.tsx` — the write
  path is correct.
- Sync/settings revision machinery (`bumpSqliteSettingsRevision`, settings
  sync payloads) — they serialize whatever `updateAppSettings` stored; fixing
  the normalizer fixes them for free.
- `normalizeSettings`' other fields (merchants, exchangeRates).

## Git workflow

- Branch: `fix/ai-category-kind-persistence`
- Commit style: conventional commits, e.g.
  `fix(data): persist category kind/rollover/rolloverStart through updateAppSettings`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Write the failing round-trip test first

Create `src/data/repositories.settings.test.ts` using `describeEachRepo`
(model the file skeleton on `repositories.refund.test.ts` — imports, harness
call, async makeRepo):

Cases (all inside one `describeEachRepo("settings categories", ...)`):
1. **kind round-trips**: `updateAppSettings` with a category
   `{ name: "薪資", children: [], kind: "income" }` → `getAppSettings()`
   returns that category with `kind === "income"`.
2. **rollover + rolloverStart round-trip**: category with
   `{ rollover: true, rolloverStart: "2026-07" }` survives.
3. **invalid kind is dropped, not stored**: input `kind: "banana" as never`
   → stored category has `kind` undefined.
4. **absent fields stay absent**: a plain `{ name, children }` category comes
   back without `kind`/`rollover`/`rolloverStart` keys set to junk (undefined
   is fine).
5. **second save of an unrelated field preserves them**: save settings with
   kind+rollover set; then save again with only `primaryCurrency` changed
   (same categories array as read back); read → fields still present.

Run it and **confirm cases 1, 2, 5 FAIL** on the unfixed code (this proves the
test bites).

**Verify**: `npx vitest run src/data/repositories.settings.test.ts` → cases
1/2/5 fail with missing fields; 3/4 pass.

### Step 2: Fix `normalizeCategoryGroups`

Extend the returned object (keep the existing fields byte-identical):

```ts
const group = item as { name?: unknown; children?: unknown; icon?: unknown; iconName?: unknown; color?: unknown; budget?: unknown; rollover?: unknown; rolloverStart?: unknown; kind?: unknown };
// ...
rollover: group.rollover === true ? true : undefined,
rolloverStart: typeof group.rolloverStart === "string" && group.rolloverStart.trim() ? group.rolloverStart.trim() : undefined,
kind: group.kind === "income" || group.kind === "expense" || group.kind === "both" ? group.kind : undefined,
```

Semantics to preserve (from the `CategoryGroup` doc comments): absent means
"legacy default" — `kind` absent behaves as `"both"`, `rollover` absent means
off. Normalizing invalid values to `undefined` (not a default string) keeps
old data byte-compatible.

**Verify**: `npx vitest run src/data/repositories.settings.test.ts` → ALL pass.
Then `npm test` → all pass (regression sweep: recompute/migration/sync suites
touch settings too).

### Step 3: Resync `CategoryManagementDrawer` when it opens

In `src/components/CategoryManagementDrawer.tsx`, make the editable copy
re-seed from props each time the drawer transitions closed → open. Smallest
correct change, keeping hooks above the early return:

```ts
const [local, setLocal] = useState<CategoryGroup[]>(categories);
const wasOpen = useRef(open);
useEffect(() => {
  if (open && !wasOpen.current) setLocal(categories);
  wasOpen.current = open;
}, [open, categories]);
```

(Import `useEffect`, `useRef`. Do not resync while open — that would clobber
in-progress edits if a background sync lands.) Also reset transient edit state
(`expanded`, `addingMain`, `confirmRemove`, …) in the same effect if trivial;
otherwise leave — stale expansion state is cosmetic.

**Verify**: `npx tsc` → exit 0; `npm test` → all pass.

### Step 4: Live verification

Dev server (`northstar-dev`), demo mode is fine:
1. 設定 → 分類 → edit a category → set 類型 to 收入 → save.
2. 記帳 → 記一筆 → type 支出: the category must NOT appear among the chips;
   switch to 收入: it must appear. (Guard: if NO category is tagged income,
   `filterCategoriesByType` falls back to the full list — tag at least one.)
3. Back to 設定 → 分類 → the 收入 selection is still shown after a reload (⌘R).
4. 記帳 → 分類 tab → gear icon → drawer shows current categories; close it,
   rename a category in 設定, reopen the drawer → it shows the NEW name
   (stale-props fix), and 儲存變更 without edits does not revert anything.

## Test plan

Step 1's five round-trip cases via `describeEachRepo` (both repos ×5). No
component test for the drawer resync (jsdom modal tests exist for ModalShell,
not this drawer; the live check covers it — creating a drawer test file is
optional, not required).

## Done criteria

Machine-checkable / observable. ALL must hold:

- [ ] `npx tsc` exits 0; `npm run lint` exits 0
- [ ] `npm test` exits 0; `repositories.settings.test.ts` exists, runs against
      BOTH repos (harness prints memory + sqlite variants), and passes
- [ ] `grep -n "kind" src/data/repositories.ts | grep -n "normalizeCategoryGroups" -A0` — manual check: `normalizeCategoryGroups` now handles kind/rollover/rolloverStart
- [ ] Live check 2 (picker follows kind) and 3 (survives reload) observed
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `normalizeCategoryGroups` at ~4837 doesn't match the excerpt.
- Step 1's cases 1/2/5 do NOT fail before the fix (the bug may have been fixed
  independently — reconcile with `git log -- src/data/repositories.ts`).
- Fixing the round-trip surfaces failures in existing sync or migration tests
  that are not obviously "the field now survives" — report the diff instead of
  adjusting those tests.
- The drawer resync requires touching its three parent routes.

## Maintenance notes

- **Any future `CategoryGroup` field must be added to `normalizeCategoryGroups`
  or it will be silently dropped.** Reviewer: consider asking for a comment on
  the normalizer pointing at `CategoryGroup` to make the coupling loud. (A
  spread-based normalizer was considered and rejected: the whitelist also
  sanitizes sync-delivered junk, which is worth keeping.)
- The settings sync path serializes normalized categories; after this lands,
  cross-device syncs will start carrying `kind`/`rollover` — old app versions
  ignore unknown fields (they load via the same tolerant parse), so no
  migration is needed.
- Deferred: the 設定 form (`SettingsRoute`) seeds `form` once per mount
  (`seededRef`) — if settings change from another page while Settings stays
  mounted, the form is stale. Pre-existing, unrelated to this fix; note only.
