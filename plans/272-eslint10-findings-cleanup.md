# Plan 272: Clear the 8 ESLint 10 findings, and close the coverage gap one of them exposed

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in "STOP conditions" occurs, stop and report — do not
> improvise. **The eight findings are four different kinds of problem with four
> different fixes — do not apply one pattern to all of them.** When done, update
> the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 62e935d8..HEAD -- src/data/demoData.ts src/domain/fireGoal.ts src/domain/nlParser.ts src/domain/portfolioMetrics.ts src/data/repositories.ts eslint.config.js`

## Status

- **Priority**: P3
- **Effort**: S–M
- **Risk**: LOW for groups 1, 2, 4 — **MED for group 3** (XIRR solver, see below)
- **Depends on**: `plans/264-lint-stack-upgrade.md` — DONE, merged in `62e935d8`
- **Category**: tech-debt
- **Planned at**: commit `62e935d8`, 2026-07-25

## Why this matters

ESLint 10 (landed by plan 264) promoted two rules to `error`:
`no-useless-assignment` and `preserve-caught-error`. They found 8 real issues in
existing code. Plan 264 set both rules to `warn` so CI would not break, and
deliberately left the findings unfixed — fixing product code inside a dependency
upgrade would have made both changes unreviewable. This plan clears them.

Two of the eight are worth more than lint hygiene:

- **`preserve-caught-error` ×2** are in the browser persistence fallback. Both
  swallow the original exception and throw a fresh user-facing message with no
  `cause`. When a user reports "儲存空間不足", the actual `QuotaExceededError` (or
  whatever IndexedDB really threw) is gone from the error chain. These are
  diagnostics we are currently discarding.
- **`no-useless-assignment` at `portfolioMetrics.ts:325`** is a dead assignment
  inside the **XIRR bisection solver** that makes the algorithm look like it
  maintains a bracket it does not. Investigating it exposed that
  `bisectXirr` — the fallback path when Newton's method fails — appears to have
  **no test that forces it**. This plan closes that gap.

## Current state — the eight findings, in four groups

### Group 1 — initializer made dead by a redundant `catch` assignment (4 sites)

`src/data/demoData.ts:519` and `:524`:

```ts
  let snapshot: RepositorySnapshot | null = null;
  try { snapshot = await readStash(); } catch { snapshot = null; }

  if (!snapshot) {
    let raw: string | null = null;
    try { raw = localStorage.getItem(DEMO_BACKUP_KEY); } catch { raw = null; }
```

`src/domain/nlParser.ts:150` and `:162`:

```ts
  let available = false;
  try {
    available = await Promise.race([...]);
  } catch {
    available = false;
  }
```
```ts
  let tier1: QuickAddParseResult | null = null;
  try {
    tier1 = await Promise.race([...]);
  } catch {
    tier1 = null;
  }
```

In all four, the declaration's initial value is never read **because the `catch`
re-assigns the same value**.

**The fix is to delete the redundant assignment in the `catch`, NOT the
initializer.** That keeps the "fall back to the initial value" intent visible and
satisfies the rule (the initializer is then genuinely read on the catch path).
Deleting the initializer instead would leave a bare `let x;` and rely on
definite-assignment analysis — more churn, less clarity.

### Group 2 — initializer dead because every branch assigns (1 site)

`src/domain/fireGoal.ts:66`:

```ts
  let months: number | null = null;

  if (monthlyRate === 0) {
    if (monthlyContribution <= 0) { months = null; } else { months = Math.ceil(...); }
  } else if (monthlyRate < 0) {
    if (monthlyContribution <= 0) { months = null; } else { months = Math.ceil(...); }
  } else {
    …
    if (denominator <= 0 || numerator / denominator <= 0) { months = null; }
    else { … months = Math.ceil(raw); }
  }
```

The `if / else if / else` chain is exhaustive and every branch assigns `months`,
so the initializer is dead. Group 1's fix does not apply — there is no single
redundant assignment to remove.

**Fix**: drop the initializer, keeping the type annotation:

```ts
  let months: number | null;
```

TypeScript's definite-assignment analysis will confirm every path assigns. If
`tsc` complains, that is a real finding — a path exists that does not assign, and
you should STOP and report it rather than restoring the initializer to silence it.

### Group 3 — dead assignment in the XIRR bisection solver (1 site)

`src/domain/portfolioMetrics.ts:313-330`, `bisectXirr`:

```ts
function bisectXirr(npv: (rate: number) => number): number | null {
  let lo = -0.9999;
  let hi = 10;
  let flo = npv(lo);
  let fhi = npv(hi);                                                        // 317
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;  // 318
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-7) return mid;
    if (flo * fm < 0) {                                                     // 323
      hi = mid;
      fhi = fm;                                                             // 325 ← dead
    } else {
      lo = mid;
      flo = fm;                                                             // 328 ← live
    }
  }
  return (lo + hi) / 2;
}
```

**Proof that line 325 is dead**, verified by the advisor — `fhi` appears exactly
three times in the function: written at 317, read at 318, written at 325. It is
**never read after line 318**. By contrast `flo` (line 328) *is* read at 323 on
the following iteration, which is why only one of the two is flagged.

So deleting line 325 cannot change behaviour. It is also worth deleting rather
than suppressing: as written, `hi = mid; fhi = fm;` implies the algorithm tracks
both bracket endpoints. It does not — correct bisection only needs one endpoint's
sign — and the vestigial line misleads the next reader of a financial solver.

**But note the coverage gap.** `src/domain/portfolioMetrics.test.ts` has a
`describe("calculateXirr")` block, yet `grep -in "bisect\|fallback\|newton"`
returns **nothing** — no test appears to force the bisection fallback (it only
runs when Newton's method fails to converge). So "the tests will catch it" is
**not** a claim you may rely on here. Step 3 adds that test.

### Group 4 — thrown errors discard their cause (2 sites)

`src/data/repositories.ts:2727-2750`, `persistBrowserRepositoryData`:

```ts
    } catch (indexedDbError) {
      try {
        writeLocalStorageRepositoryData(storageKey, data);
        return;
      } catch (localStorageError) {
        console.error("[repository] browser persistence failed", { indexedDbError, localStorageError });
        throw new Error("瀏覽器儲存空間不足，無法寫入這份備份。請使用支援 IndexedDB 的瀏覽器，或改用桌面 App 匯入。");   // 2739
      }
    }
  }

  try {
    writeLocalStorageRepositoryData(storageKey, data);
  } catch (error) {
    console.error("[repository] localStorage persistence failed", error);
    throw new Error("瀏覽器 localStorage 空間不足，無法寫入這份備份。請改用支援 IndexedDB 的瀏覽器或桌面 App。");        // 2748
  }
```

`Error`'s `cause` option is available — `tsconfig.json` has `"target": "ES2022"`
and `"lib": [… "ES2022"]`.

**Fix**: attach the proximate cause. **Do not change the user-facing message
text** — it is 繁體中文 product copy and out of scope.

```ts
        throw new Error("瀏覽器儲存空間不足，…", { cause: localStorageError });
```
```ts
    throw new Error("瀏覽器 localStorage 空間不足，…", { cause: error });
```

At site 2739 two errors are in scope (`indexedDbError` and `localStorageError`).
Use **`localStorageError`** as `cause` — it is the proximate failure — and leave
the existing `console.error` logging both, which is what preserves the full
picture.

### Conventions to match

- The repo comments *why*, not *what*, and cites plan numbers for non-obvious
  decisions.
- Product copy is 繁體中文 and round-tripped through `copy.csv`
  (`npm run copy:export/import`) — **do not hand-edit the message strings**.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm install` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Targeted lint | `npx eslint src/data/demoData.ts src/domain/fireGoal.ts src/domain/nlParser.ts src/domain/portfolioMetrics.ts src/data/repositories.ts` | 0 findings for the two rules |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | 129 files / 1505 pass (1506+ after Step 3) |
| Metrics suite | `npx vitest run src/domain/portfolioMetrics.test.ts` | all pass |
| Analytics suites | `npx vitest run src/domain/portfolioAnalytics.test.ts src/domain/portfolioTwr.test.ts` | all pass, **unedited** |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**:
- `src/data/demoData.ts`, `src/domain/nlParser.ts` (group 1)
- `src/domain/fireGoal.ts` (group 2)
- `src/domain/portfolioMetrics.ts` (group 3)
- `src/data/repositories.ts` (group 4 — **only** the two `throw new Error` lines)
- `src/domain/portfolioMetrics.test.ts` (Step 3's new test)
- `eslint.config.js` — **only** in Step 5, and only if every finding is cleared

**Out of scope**:
- The 繁體中文 message strings. Copy lives in `copy.csv`.
- Any other logic in the five source files. You are removing dead assignments and
  adding `cause`, nothing else.
- `src/domain/portfolioAnalytics.ts` — untouched, and its tests must pass unedited.
- The 764 pre-existing warnings from other rules. Not this plan's business.
- `npm run format:check` — fails with ~279 files, pre-existing, tracked by plan 270.

## Git workflow

- Branch: `fix/ai-eslint10-findings`
- Commits:
  1. `refactor: drop redundant assignments flagged by no-useless-assignment`
  2. `fix(data): preserve the original error as cause on persistence failures`
  3. `test(metrics): cover the XIRR bisection fallback`
  4. `chore(lint): restore no-useless-assignment and preserve-caught-error to error`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Baseline

```bash
npm run lint 2>&1 | tail -3     # expect exit 0, 772 problems (0 errors, 772 warnings)
npm test 2>&1 | tail -3         # expect 129 files / 1505 tests
```

Record both. If lint already reports errors, STOP — you are not on `62e935d8`.

### Step 1: Groups 1 and 2 — the dead assignments outside the solver

Apply the group-1 fix to all four sites (`demoData.ts` ×2, `nlParser.ts` ×2):
delete the assignment **inside the `catch`**, leaving an empty catch block with a
short comment, e.g.:

```ts
  try { snapshot = await readStash(); } catch { /* no stash — keep null */ }
```

Apply the group-2 fix to `fireGoal.ts:66`: drop the `= null` initializer.

**Verify**:
- `npx tsc --noEmit` → exit 0. **If it reports `months` is used before assigned,
  STOP** — that means a branch does not assign, which is a real bug worth
  reporting, not something to paper over.
- `npx eslint src/data/demoData.ts src/domain/fireGoal.ts src/domain/nlParser.ts` →
  no `no-useless-assignment` findings
- `npm test` → 1505 passing, unchanged

Commit as commit 1 (excluding `portfolioMetrics.ts`, which is Step 3).

### Step 2: Group 4 — attach `cause`

Add the `cause` option to both `throw new Error(...)` calls in
`src/data/repositories.ts` as shown in Current state. Change nothing else —
not the messages, not the `console.error` calls.

**Verify**:
- `npx tsc --noEmit` → exit 0
- `npx eslint src/data/repositories.ts` → no `preserve-caught-error` findings
- `npm test` → 1505 passing

Commit as commit 2.

### Step 3: Cover the bisection fallback, THEN delete the dead line

Order matters: write the test first and watch it pass **before** the deletion, so
you have a baseline that the behaviour is unchanged after.

1. Add a test to `src/domain/portfolioMetrics.test.ts`, inside or beside the
   existing `describe("calculateXirr")` block, that exercises `bisectXirr`.
   Read the file first and match its style. You need a cash-flow series where
   Newton's method fails to converge but a root exists in `[-0.9999, 10]` — a
   sign-changing, badly-conditioned series (e.g. alternating large in/outflows)
   is the usual way. Assert the returned rate is finite and that `npv(rate)` is
   near zero.

   If `bisectXirr` is not exported, do **not** export it just for the test —
   drive it through the public `calculateXirr` entry point. If you cannot
   construct a series that reaches the fallback, **STOP and report that**; it is
   a meaningful finding either way (the fallback may be unreachable).

2. Run it and confirm it passes **before** any change to `portfolioMetrics.ts`.

3. Delete line 325 (`fhi = fm;`) and its now-unnecessary block braces if the
   branch becomes a single statement — but prefer leaving braces alone to keep
   the diff minimal.

4. Confirm the new test still passes, with the same asserted values.

**Verify**:
- `npx vitest run src/domain/portfolioMetrics.test.ts` → all pass, including the
  new test, both before and after the deletion
- `npx vitest run src/domain/portfolioAnalytics.test.ts src/domain/portfolioTwr.test.ts` →
  pass **unedited**
- `npm test` → 1506+ passing (1505 + your new test)
- `npx eslint src/domain/portfolioMetrics.ts` → no `no-useless-assignment`

Commit as commit 3.

### Step 4: Confirm every finding is gone

```bash
npx eslint src --format json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);const ids={};for(const f of r)for(const m of f.messages)ids[m.ruleId]=(ids[m.ruleId]||0)+1;console.log(ids['no-useless-assignment']||0, ids['preserve-caught-error']||0)})"
```

**Verify**: prints `0 0`. If either is non-zero, there are findings this plan did
not enumerate — report them rather than fixing blind.

### Step 5: Restore both rules to `error`

Only if Step 4 printed `0 0`. In `eslint.config.js`, change the two entries plan
264 added from `"warn"` to `"error"`, and update the comment to say the findings
were cleared by plan 272 — so the rules now guard against regressions instead of
merely reporting.

Leave the other six `warn` rules exactly as they are.

**Verify**:
- `npm run lint` → **exit 0** (this is what proves the findings are genuinely
  gone, not merely downgraded)
- `npx tsc --noEmit`, `npm test`, `npm run build` → all exit 0

Commit as commit 4.

## Test plan

- **One new test** in `src/domain/portfolioMetrics.test.ts` covering the XIRR
  bisection fallback (Step 3). This is the only new test, and it is the point of
  Step 3 — it closes a real coverage gap on a financial code path this plan
  touches.
- **Everything else is a behaviour-preserving deletion or an added `cause`
  field.** The assertion is that the existing 1505 tests pass unchanged.
- `portfolioAnalytics.test.ts` and `portfolioTwr.test.ts` must pass **unedited** —
  they encode locked financial semantics.

## Done criteria

- [ ] `npm run lint` exits 0 with both rules set to `error`
- [ ] The Step 4 command prints `0 0`
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` → at least 1506 passing (1505 baseline + the new test)
- [ ] `npm run build` exits 0
- [ ] `grep -c "cause:" src/data/repositories.ts` returns at least 2
- [ ] `grep -c "fhi = fm" src/domain/portfolioMetrics.ts` returns 0
- [ ] `git diff -- src/domain/portfolioAnalytics.ts` is empty
- [ ] No 繁體中文 message string was modified (`git diff | grep -c "^[-+].*瀏覽器"` → 2, the two `throw` lines only)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `tsc` reports `months` used before assignment in `fireGoal.ts` — a branch does
  not assign, which is a real bug. Report it; do not restore the initializer.
- You cannot construct a cash-flow series that reaches `bisectXirr` (Step 3). That
  is a finding — report it rather than deleting line 325 without coverage.
- Any test in `portfolioMetrics.test.ts`, `portfolioAnalytics.test.ts` or
  `portfolioTwr.test.ts` fails after the Step 3 deletion. The line is provably
  dead, so a failure means the proof is wrong — stop immediately and report.
- Step 4 finds findings this plan did not enumerate.
- You are about to edit a 繁體中文 message string, or `copy.csv`.
- You are tempted to fix any of the 764 other warnings. Out of scope.

## Maintenance notes

- **Why the group-1 fix removes the `catch` assignment rather than the
  initializer**: it keeps "on failure, keep the initial value" legible at the
  declaration. A bare `let x;` relying on definite-assignment reads worse and
  churns more lines.
- **`bisectXirr` now has a test.** If a future change touches the solver, that
  test is the safety net — it did not exist before this plan. Whoever reads
  `calculateXirr` next should know the bisection path is the *fallback*, only
  reached when Newton's method fails.
- **`Error.cause` is now used in `persistBrowserRepositoryData`.** Anything that
  catches those errors and logs them should log `error.cause` too, or the
  diagnostic this plan restored is discarded again one level up. Worth checking
  the callers if backup-failure reports ever come in.
- Both rules are back at `error` after this plan, so a regression fails CI rather
  than being absorbed into the warning count.
