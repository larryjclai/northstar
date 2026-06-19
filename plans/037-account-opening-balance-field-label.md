# Plan 037: Relabel the account「當前餘額」field as「期初餘額」so it stops claiming to be the current balance

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report. When done, update the
> status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 85b07a83..HEAD -- src/routes/AccountsRoute.tsx`
> Compare the "Current state" excerpts to live code; on mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (sits next to plan 029's credit-card hint, already merged)
- **Category**: docs / UX copy
- **Planned at**: commit `85b07a83`, 2026-06-19

## Why this matters

The account add/edit drawer has a balance input **labeled「當前餘額」(current
balance)**, but it is bound to the account's **`openingBalance`** (期初餘額), not
its current balance. For a brand-new account the two coincide (no transactions
yet), so the mislabel is invisible. But when **editing an account that already
has transactions**, the field shows the *opening* balance and editing it sets the
*opening* balance — the displayed current balance then becomes
`openingBalance + Σ(transactions)`, **not** the number the user typed. A user who
opens the editor intending to "fix the current balance to X" instead silently
rewrites the starting balance and gets a different current balance.

This bit a real user: a credit card showed a stray +302 because the value entered
at creation went into `openingBalance`. This is the same class of mislabel as the
credit-card hint that plan 029 corrected — fix the **copy**, not the behavior (the
field genuinely should edit the opening balance; it just must say so, and point
users at 調整餘額 when they want to set the current balance directly).

## Current state

`src/routes/AccountsRoute.tsx`:
- The app already establishes the right vocabulary elsewhere:
  - `openingBalance` field on `AccountFormState` (line 24).
  - The **調整餘額** modal shows the live computed balance with the label
    **「目前餘額」** (line 497): `目前餘額：{formatNumber(adjustingAccount.balance)} {adjustingAccount.currency}`.
  - The field is bound to `openingBalance` (line 541):
    `const openingBalanceField = useNumericField(form.openingBalance, (v) => setForm({ ...form, openingBalance: v }));`
- The mislabeled field + its existing per-type captions (lines 773–790):
  ```tsx
  <div style={{ marginBottom: 20 }}>
    <DrawerField label={`${form.type === "alternative" ? "目前市值" : "當前餘額"}（${form.currency}）`}>
      <input
        className="ns-input text-stat"
        style={{ fontFamily: 'var(--ns-font-mono)', fontVariantNumeric: 'tabular-nums', height: 56 }}
        placeholder="0"
        {...openingBalanceField}
      />
    </DrawerField>
    {form.type === "alternative" && (
      <div className="muted text-xs" style={{ marginTop: 6 }}>輸入此資產目前的估計市值，日後可用「調整餘額」手動更新。</div>
    )}
    {form.type === 'credit' && (
      <div className="muted text-xs" style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
        信用卡尚未繳清的金額請以負數輸入（例：輸入 −302 表示尚欠 302）；已結清請填 0。
      </div>
    )}
  </div>
  ```
- `DrawerField` is a small label+children wrapper already used throughout this
  file (grep `function DrawerField` to confirm its shape — it takes a `label`
  string and renders children below it).

**Conventions to match:**
- zh-TW UI copy. Use **「期初餘額」** (the term already used by the 帳本維護 settings
  card and matching `openingBalance`) and **「目前餘額」** for the live balance (the
  term the 調整餘額 modal already uses). Do not invent new terms.
- Helper captions use `className="muted text-xs"` with `style={{ marginTop: 6 }}`
  (see the alternative/credit captions above). Match that exactly.
- `alternative` accounts keep their「目前市值」label and existing caption — that
  type stores a mark-to-market value and is conceptually fine as-is.

## Commands you will need

| Purpose   | Command            | Expected         |
|-----------|--------------------|------------------|
| Typecheck | `npx tsc --noEmit` | exit 0           |
| Build     | `npm run build`    | exit 0           |
| Lint      | `npm run lint`     | exit 0, 0 errors |
| Tests     | `npm run test`     | all pass         |

## Scope

**In scope**: `src/routes/AccountsRoute.tsx` only (copy + one caption).

**Out of scope**:
- The binding to `openingBalance` — do **not** change what the field edits, and
  do **not** add silent recomputation of an "implied opening balance" from a
  typed current balance. That behavior change is explicitly not wanted here.
- `useNumericField`, `createAccount`/`updateAccount`, balance math.
- The `alternative` type's「目前市值」label and caption — leave unchanged.
- The credit-card caption (line 785–789) — leave unchanged (plan 029 owns it).

## Git workflow

- Branch: `git checkout -B advisor/037-opening-balance-label main`
  (verify `git rev-parse HEAD` starts with `85b07a83`; if the worktree's default
  base is older, this checkout fixes it).
- Single commit; conventional commits
  (e.g. `docs(accounts): label the balance field 期初餘額, clarify vs 目前餘額`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Relabel「當前餘額」→「期初餘額」

In the `DrawerField` label template (line 774), change the non-alternative label
from `當前餘額` to `期初餘額`:
```tsx
<DrawerField label={`${form.type === "alternative" ? "目前市值" : "期初餘額"}（${form.currency}）`}>
```
Leave the `"目前市值"` branch untouched.

**Verify**: `grep -n "當前餘額" src/routes/AccountsRoute.tsx` → **no matches**.

### Step 2: Add a clarifying caption for the default (non-alternative, non-credit) case

Add a caption that explains the field is the *starting* balance and tells the
user how to set the *current* balance directly. Place it alongside the existing
type-specific captions (after the credit caption, before the closing `</div>` at
line 790), shown only when neither alternative nor credit:
```tsx
{form.type !== "alternative" && form.type !== "credit" && (
  <div className="muted text-xs" style={{ marginTop: 6 }}>
    這是帳戶的起始餘額；目前餘額 = 期初餘額 + 已結算交易。若要直接修正目前餘額，請用帳戶列的「調整餘額」。
  </div>
)}
```

**Verify**:
- `npx tsc --noEmit` → exit 0.
- `npm run build` → exit 0.
- Manual (if runnable): open 新增帳戶 / 編輯帳戶 for a bank account → the field
  reads「期初餘額」with the clarifying caption; an `alternative` account still
  reads「目前市值」; a credit card still shows its negative-input hint.

## Test plan

Copy-only change to a presentational component; no new unit test required (there
is no logic to assert). Verification is typecheck + build + lint + the grep in
Step 1. Existing tests must still pass (`npm run test`).

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run build` exits 0
- [ ] `npm run lint` exits 0, 0 errors
- [ ] `npm run test` exits 0 (no regressions)
- [ ] `grep -n "當前餘額" src/routes/AccountsRoute.tsx` → no matches
- [ ] `grep -n "期初餘額" src/routes/AccountsRoute.tsx` → matches (label + caption)
- [ ] The field still binds to `openingBalance` (the `{...openingBalanceField}` spread is unchanged)
- [ ] Only `src/routes/AccountsRoute.tsx` modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The `DrawerField` label line or the `openingBalanceField` binding no longer
  matches the "Current state" excerpt (drift / someone already refactored it).
- You find the field has been changed to actually edit the live balance (then a
  relabel back to「目前餘額」would be correct instead) — STOP and report.

## Maintenance notes

- This is a copy fix; the field intentionally still edits `openingBalance`. If a
  future plan wants a true "set current balance" input in the editor, it must
  compute `openingBalance = target − Σ(settled transactions)` at the form
  boundary (or just route the user to the existing 調整餘額 flow, which already
  does the right thing by inserting a 餘額調整 transaction).
- Pairs with plan 029 (credit-card hint + 未繳/溢繳 display) — both are "make the
  account balance UI tell the truth" fixes.
