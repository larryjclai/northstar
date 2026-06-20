# Plan 044: Set 延後入帳 in-place on the Reconcile screen (no editor detour, no getting stranded)

> **Renumbered 038 → 044** (2026-06-20): the original `038` collided with
> `038-custom-manual-priced-assets.md`. Branch: `advisor/044-inline-defer-posting`.

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report. When done, update the
> status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 4e40f7c6..HEAD -- src/routes/ReconcileRoute.tsx src/data/repositories.ts`
> Compare the "Current state" excerpts to live code; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 036 (延後入帳 / `postDate`) — MERGED on main; 035 (reconcile edit deep-link) — MERGED
- **Category**: feature / UX
- **Planned at**: commit `4e40f7c6`, 2026-06-19

## Why this matters

Plan 036 added 延後入帳 (a charge can post to a later statement via `postDate`),
but the only way to set it is the full transaction editor. From the Reconcile
(對帳) screen the operator must: tap ✏️ on a row → get navigated **away** to the
現金流 detail panel → tap 編輯 → open the right-side drawer → toggle 入帳時間 →
延後到 → pick a date → save → and then is **stranded on 現金流** with no way back
to 對帳. The operator reported this directly: deferring one charge is a 6-step,
context-losing detour.

Deferring a charge to the next statement is inherently a **reconcile-time**
action, so it should be doable **in-place on the Reconcile row** — exactly like
the ✓「已對帳」toggle already is. The app already has the pattern: `setLedgerReviewed`
is a focused one-field setter the ✓ toggle uses. This plan adds the twin
`setLedgerPostDate` and an inline 延後入帳 control on each charge row, so the
operator sets the posting date without ever leaving 對帳. The row then re-buckets
to the correct cycle automatically (036's `buildStatementPeriods` already buckets
by `postDate ?? date`). The ✏️ full-editor deep-link stays for other edits.

## Current state

- `src/data/repositories.ts` — the focused-setter PATTERN to mirror,
  `setLedgerReviewed` (interface line 227; browser line 728; Tauri override line
  2070):
  ```ts
  // interface
  setLedgerReviewed(id: string, reviewed: boolean): Promise<void>;
  // browser
  async setLedgerReviewed(id: string, reviewed: boolean) {
    this.data.ledgerTransactions = this.data.ledgerTransactions.map((row) =>
      row.id === id ? bump({ ...row, isReviewed: reviewed }) : row,
    );
    await this.persist();
  }
  // Tauri override
  override async setLedgerReviewed(id: string, reviewed: boolean) {
    await this.db.execute(
      `update ledger_transactions set is_reviewed = $1, updated_at = $2, revision = revision + 1 where id = $3`,
      [Number(reviewed), nowIso(), id],
    );
  }
  ```
  Note: `setLedgerReviewed` does **not** call recompute — correct, because (like
  `postDate`) the field doesn't affect account balances. `post_date` already
  exists as a column (added by plan 036) and `LedgerTransaction.postDate` is in
  the type.
- `src/routes/ReconcileRoute.tsx`:
  - Imports already present: `Button`, `Badge`, `useState`, `useRepositoryMutation`,
    `useToast` (as `toast`), `useNavigate` (as `navigate`), `formatNumber`,
    `todayInTimezone`, `useUiPreferences` (timezone). Phosphor icons are imported
    on line 1.
  - The `setReviewed` mutation (line 25) is the wiring pattern:
    ```ts
    const setReviewed = useRepositoryMutation(
      (repository, input: { id: string; reviewed: boolean }) => repository.setLedgerReviewed(input.id, input.reviewed),
      ["ledger"],
    );
    ```
  - The charge row (lines 312–337) — currently ✓ toggle + content + amount + ✏️:
    ```tsx
    period.rows.map((row, i) => (
      <div key={row.id} onClick={() => toggle(row.id, row.isReviewed)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", ... }}>
        {row.isReviewed ? <CheckCircle .../> : <Circle .../>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="text-sm" ...>{row.merchant || row.name || row.category || "交易"}</div>
          <div className="muted text-caption">{row.date.slice(0, 10)}{row.category ? ` · ${row.category}` : ""}</div>
        </div>
        <div className="num text-sm" style={{ color: row.amount < 0 ? "var(--ns-neg)" : "var(--ns-pos)", whiteSpace: "nowrap" }}>
          {row.amount < 0 ? "−" : "+"}NT${formatNumber(Math.abs(row.amount))}
        </div>
        <Button variant="ghost" size="icon-sm" title="編輯交易" onClick={(e) => { e.stopPropagation(); navigate({ to: "/cash-flow", search: { account: accountId, tx: row.id } }); }}>
          <PencilSimple size={14} />
        </Button>
      </div>
    ))
    ```
  - The file already contains a modal pattern to copy: `PayCardModal` (a fixed-inset
    overlay, click-backdrop-to-close, `var(--ns-bg-elev)` card body) added by plan
    034 — model the new modal on it.
  - `account` (the credit card), `accountId`, `timezone` are all in scope; the
    rows carry `postDate` (the LedgerTransaction field).

**Conventions to match:**
- zh-TW UI. Focused setters mirror `setLedgerReviewed` exactly (no recompute).
- Mutations via `useRepositoryMutation(fn, ["ledger"])` — invalidating `["ledger"]`
  refetches the reconcile periods so the row re-buckets without a manual reload.
- Modal overlay = copy `PayCardModal`'s structure in this same file.
- Date inputs use `<input type="date">` with `var(--ns-font-mono)` (see other
  date inputs in the repo, e.g. CashFlowRoute's EntryDrawer 入帳日 control).

## Commands you will need

| Purpose   | Command                                          | Expected         |
|-----------|--------------------------------------------------|------------------|
| Typecheck | `npx tsc --noEmit`                               | exit 0           |
| Tests     | `npm run test`                                   | all pass         |
| One file  | `npx vitest run src/data/repositories.refund.test.ts` | pass (pattern ref) |
| Lint      | `npm run lint`                                   | exit 0, 0 errors |
| Build     | `npm run build`                                  | exit 0           |

## Scope

**In scope**:
- `src/data/repositories.ts` — add `setLedgerPostDate` (interface + browser + Tauri override), mirroring `setLedgerReviewed`.
- `src/routes/ReconcileRoute.tsx` — inline 延後入帳 control + a small `DeferPostingModal`.
- A focused repo test (new `src/data/repositories.postdate.test.ts`, or extend an existing repo test) for `setLedgerPostDate`.

**Out of scope**:
- `buildStatementPeriods` / `creditCardStatements.ts` — already buckets by `postDate ?? date` (036); do not touch.
- The ✏️ full-editor deep-link (line 326–336) — keep it; it serves other edits.
- `deriveAccountBalances` — balance must not depend on postDate (036's invariant).
- The CashFlow EntryDrawer 入帳日 control (036) — leave it; this plan is additive.

## Git workflow

- Branch: `git checkout -B advisor/044-inline-defer-posting main`
  (verify `git rev-parse HEAD` starts with `4e40f7c6`; if the worktree default base
  is older, this checkout fixes it).
- Commit per step; conventional commits
  (e.g. `feat(reconcile): set 延後入帳 in-place from the reconcile row`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add the `setLedgerPostDate` focused setter

In `src/data/repositories.ts`, mirroring `setLedgerReviewed`:
1. Interface (next to `setLedgerReviewed` at line 227):
   ```ts
   setLedgerPostDate(id: string, postDate: string | null): Promise<void>;
   ```
2. Browser impl (next to the browser `setLedgerReviewed` at ~line 728):
   ```ts
   async setLedgerPostDate(id: string, postDate: string | null) {
     this.data.ledgerTransactions = this.data.ledgerTransactions.map((row) =>
       row.id === id ? bump({ ...row, postDate }) : row,
     );
     await this.persist();
   }
   ```
3. Tauri override (next to the Tauri `setLedgerReviewed` at ~line 2070):
   ```ts
   override async setLedgerPostDate(id: string, postDate: string | null) {
     await this.db.execute(
       `update ledger_transactions set post_date = $1, updated_at = $2, revision = revision + 1 where id = $3`,
       [postDate, nowIso(), id],
     );
   }
   ```
   Like `setLedgerReviewed`, do NOT call recompute (postDate never affects balance).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Wire the mutation + modal state in ReconcileRoute

Near the `setReviewed` mutation, add:
```ts
const setPostDate = useRepositoryMutation(
  (repository, input: { id: string; postDate: string | null }) => repository.setLedgerPostDate(input.id, input.postDate),
  ["ledger"],
);
const [deferRow, setDeferRow] = useState<LedgerTransaction | null>(null);
```
(`LedgerTransaction` type: import it from `../domain` — the file already imports
`Account` from there; extend that import.)

Add a handler:
```ts
async function applyDefer(id: string, postDate: string | null) {
  try {
    await setPostDate.mutateAsync({ id, postDate });
    toast.success(postDate ? `已設定延後入帳 ${postDate}` : "已改回當下入帳");
    setDeferRow(null);
  } catch {
    toast.error("更新失敗");
  }
}
```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Add the inline 延後 control + a deferred indicator to each charge row

In the row (lines 312–337), for **expense** rows (`row.amount < 0`):
1. When `row.postDate` is set, append a deferred marker to the caption line so it's
   visible at a glance, e.g. after the date/category:
   ```tsx
   {row.postDate ? <Badge variant="outline" className="rounded-full text-micro" style={{ marginLeft: 6, padding: "1px 6px", color: "var(--ns-accent)", borderColor: "var(--ns-accent)" }}>延後 {row.postDate.slice(5, 10)}</Badge> : null}
   ```
   (put it inside the caption `<div className="muted text-caption">`).
2. Add a ghost icon button BEFORE the ✏️ button that opens the defer modal (must
   `stopPropagation` so it doesn't toggle ✓). Use a phosphor calendar/clock icon —
   add `CalendarPlus` to the line-1 import:
   ```tsx
   {row.amount < 0 ? (
     <Button variant="ghost" size="icon-sm" title="延後入帳"
       onClick={(e) => { e.stopPropagation(); setDeferRow(row); }}>
       <CalendarPlus size={14} weight={row.postDate ? "fill" : "regular"} />
     </Button>
   ) : null}
   ```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: Build the `DeferPostingModal` (copy PayCardModal's overlay)

Add a `DeferPostingModal` component in the same file, modeled on `PayCardModal`'s
overlay (fixed inset, click-backdrop-to-close, `var(--ns-bg-elev)` card). Render
`{deferRow && <DeferPostingModal row={deferRow} ... />}` near the PayCardModal
render. Contents:
- Title「延後入帳」+ a one-line hint:「選擇入帳日；這筆消費會歸到該日所屬的帳單週期。仍會立即計為負債，餘額不變。」
- An `<input type="date">` defaulting to `row.postDate?.slice(0,10) ?? row.date.slice(0,10)`.
- A primary「確認延後」button → `applyDefer(row.id, <picked date>)`.
- A「改回當下入帳」button (only when `row.postDate` is set) → `applyDefer(row.id, null)`.
- A「取消」button → `setDeferRow(null)`.
- Disable the confirm buttons while `setPostDate.isPending`.

**Verify**:
- `npx tsc --noEmit` → exit 0.
- `npm run build` → exit 0.
- Manual (if runnable): on a card's 對帳 screen, tap the 延後 icon on a charge →
  pick a date in the next cycle → 確認延後 → the modal closes, you stay on 對帳, the
  charge shows a「延後 MM/DD」badge and moves into the next statement period; tap
  again →「改回當下入帳」→ it returns to its original cycle. If you cannot run the
  app, rely on tsc/build + Step 5's test.

### Step 5: Test the setter

Add a focused repo test (new `src/data/repositories.postdate.test.ts`, modeled on
`src/data/repositories.refund.test.ts` which builds a `BrowserFinanceRepository`):
- Create an account + a ledger expense row. Call `setLedgerPostDate(rowId, "2026-07-01")`
  → `listLedgerTransactions` shows that row's `postDate === "2026-07-01"`.
- Call `setLedgerPostDate(rowId, null)` → `postDate === null`.
- (Balance independence) assert the account balance is identical before and after
  setting postDate.

**Verify**: `npx vitest run src/data/repositories.postdate.test.ts` → pass; `npm run test` → all pass.

## Test plan

- `src/data/repositories.postdate.test.ts` (new): set/clear postDate via the focused
  setter; balance unchanged. Pattern: `repositories.refund.test.ts`.
- The re-bucketing itself is already covered by 036's `creditCardStatements.test.ts`.
- Verification: `npm run test` → all pass including the new file.

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run build` exits 0
- [ ] `npm run test` exits 0; new `setLedgerPostDate` test passes
- [ ] `npm run lint` exits 0, 0 errors
- [ ] `grep -n "setLedgerPostDate" src/data/repositories.ts` → 3 matches (interface + browser + Tauri)
- [ ] `grep -n "setLedgerPostDate\|DeferPostingModal" src/routes/ReconcileRoute.tsx` → matches
- [ ] Only `src/data/repositories.ts`, `src/routes/ReconcileRoute.tsx`, and the new test file modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `setLedgerReviewed` no longer matches the excerpt (the pattern changed) — re-read
  and adapt, or STOP.
- The reconcile row block no longer matches the excerpt (drift) — STOP.
- `buildStatementPeriods` does not re-bucket after `postDate` changes (i.e. 036
  isn't actually on this base) — `grep -n "postDate" src/domain/creditCardStatements.ts`
  must return matches; if it doesn't, STOP (wrong base).

## Maintenance notes

- `setLedgerPostDate` is balance-neutral by design (mirrors `setLedgerReviewed`'s
  no-recompute). If a future change makes postDate affect anything beyond statement
  bucketing, revisit this assumption.
- The defer modal defaults to a manual date. A nice follow-up: a one-tap「延到下一期
  帳單」that computes the next cycle's start from `account.statementDay` (the periods
  are already built in this component) — deferred here to keep the change focused.
- The ✏️ full-editor deep-link (035) still exists for editing amount/海外手續費/折扣;
  this plan only removes the editor detour for the *posting-date* action.
