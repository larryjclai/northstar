# Plan 047: Restore preview — show a diff summary before a restore overwrites data

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise. When
> done, update this plan's row in `plans/README.md` unless a reviewer told you
> they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 8f2e90bd..HEAD -- src/features/local-backup/localBackup.ts src/routes/settings/GeneralSection.tsx src/data/repositories.ts`
> If any in-scope file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (restore is destructive; the change adds a safety gate but must
  not alter the actual restore semantics)
- **Depends on**: none
- **Category**: direction (trust/safety feature)
- **Planned at**: commit `8f2e90bd`, 2026-06-21

## Why this matters

`ROADMAP.md` 進行中 **5.2 還原前預覽** is an open, committed item:
*"JSON / 備份還原都是直接覆蓋，使用者看不到『會還原成什麼』… 還原前顯示摘要 diff
（時間點、帳戶/交易/持倉筆數 vs 目前），紅字標示會減少的部分；以輸入確認字句取代單純
按鈕。"* 驗收: *"選錯舊備份時，使用者在預覽即可發現筆數異常並中止。"*

Today a restore is a one-click overwrite: the confirm step shows only「確定還原
（覆蓋現有）」with no information about what the backup actually contains. On a
finance app, restoring the wrong (e.g. months-old) backup silently destroys
recent data. A counts-diff preview turns a blind overwrite into an informed
decision. This is pure UI + a read-only snapshot inspection — **no change to how
data is actually written**.

## Current state

Files and roles:

- `src/features/local-backup/localBackup.ts` — backup engine. A backup stores a
  full `RepositorySnapshot`. Restore reads it and applies it:

  ```ts
  /** Restore a specific backup into the repository (overwrites current data). */
  export async function restoreLocalBackup(id: string, repo: FinanceRepository): Promise<void> {
    const snapshot = await store().read(id);     // ← reads the snapshot
    if (!snapshot) throw new Error("備份不存在或已損毀");
    await repo.importSnapshot(snapshot);          // ← overwrites
  }
  export async function listLocalBackups(): Promise<LocalBackupEntry[]> {
    return store().list();
  }
  ```

  `store()` returns a `BackupStore` with `read(id): Promise<RepositorySnapshot | null>`
  (both the fs and IDB stores implement it).

- `src/data/repositories.ts:310` — `RepositorySnapshot` is the snapshot shape;
  the count-bearing arrays:

  ```ts
  export interface RepositorySnapshot {
    version: number;
    exportedAt: string;
    accounts: Account[];
    ledgerTransactions: LedgerTransaction[];
    portfolioAssets: PortfolioAsset[];
    investmentRecords: InvestmentRecord[];
    recurringTransactions: RecurringTransaction[];
    // ... financialGoals?, manualPriceSnapshots?, etc.
  }
  ```
  `FinanceRepository` already exposes `exportSnapshot(): Promise<RepositorySnapshot>`
  (used by `createBackup`) — use it to get the *current* snapshot for comparison.

- `src/routes/settings/GeneralSection.tsx` — the local-backup restore UI. It uses
  a **two-click inline confirm** (no `window.confirm` — it's a no-op in the Tauri
  webview, see the comment at the top of the file). The current confirm path:

  ```ts
  async function handleRestoreLocal(id: string) {
    setConfirmRestoreId(null);
    setBackupBusy(true);
    try {
      const repository = await getFinanceRepository();
      await restoreLocalBackup(id, repository);
      await queryClient.invalidateQueries();
      toast.success("已還原備份");
    } catch (e) { /* toast.error */ } finally { setBackupBusy(false); }
  }
  ```

  And the inline confirm UI (around line 487):

  ```tsx
  {confirmRestoreId === b.id ? (
    <>
      <Button variant="outline" style={{ color: "var(--ns-neg)", ... }}
        disabled={backupBusy} onClick={() => handleRestoreLocal(b.id)}>
        確定還原（覆蓋現有）
      </Button>
      <Button variant="ghost" onClick={() => setConfirmRestoreId(null)}>取消</Button>
    </>
  ) : confirmDeleteId === b.id ? ( /* delete confirm */ ) : (
    /* default: 還原 / delete buttons */
  )}
  ```

### Conventions to follow

- **No `window.confirm`** in this codebase (Tauri webview no-op) — use the inline
  two-stage confirm already in this file. The existing `confirmRestoreId` state is
  the hook for the preview.
- Pure helpers live in a domain/feature module with a co-located `*.test.ts`
  (vitest). The diff is a **pure function** over two snapshots — put it next to
  the backup engine so it's testable without UI.
- zh-TW copy; 紅字 = `var(--ns-neg)` (already used on the restore button). Counts
  that **decrease** vs current must be shown in `--ns-neg` per the 驗收 wording.
- `RepositorySnapshot` has optional arrays (`financialGoals?`,
  `manualPriceSnapshots?`, `recurringInvestments?`) — guard with `?? []`.

## Commands you will need

| Purpose   | Command                                              | Expected on success |
|-----------|------------------------------------------------------|---------------------|
| Typecheck | `npx tsc --noEmit`                                   | exit 0              |
| Tests     | `npm test`                                            | all pass            |
| Test one  | `npx vitest run src/features/local-backup/backupDiff.test.ts` | all pass    |
| Lint      | `npm run lint`                                        | exit 0 (0 errors)   |
| Build     | `npm run build`                                       | exit 0              |

## Scope

**In scope:**
- `src/features/local-backup/backupDiff.ts` (create) — pure diff: counts per
  entity for `{ current, backup }` and a per-entity delta.
- `src/features/local-backup/backupDiff.test.ts` (create) — see Test plan.
- `src/features/local-backup/localBackup.ts` — add a small exported
  `readLocalBackupSnapshot(id): Promise<RepositorySnapshot | null>` (wraps
  `store().read(id)`) so the UI can inspect a backup without restoring it. Do NOT
  change `restoreLocalBackup`'s behavior.
- `src/routes/settings/GeneralSection.tsx` — render the diff in the existing
  `confirmRestoreId` branch (the 時間點 + per-entity counts, 紅字 on decreases),
  and require typing a confirm phrase (per 驗收, replace the bare button).

**Out of scope (do NOT touch):**
- `repo.importSnapshot` / `restoreLocalBackup` write semantics — unchanged.
- The **sync** Recovery-Kit restore (`restoreFromRecoveryKit`) and the
  `connect/sync/backup.ts` `restoreBackup` path — different flow; this plan is
  the **local-backup** restore only. (A follow-up can apply the same preview to
  the JSON-import restore and sync restore; note it, don't build it here.)
- Pruning/retention, the daily-backup scheduler.

## Git workflow

- Branch from current main: `git checkout -B advisor/047-restore-preview main`.
- Match the repo's short imperative commit style. Do NOT push/PR unless told.

## Steps

### Step 1: the pure diff helper
Create `src/features/local-backup/backupDiff.ts`:

```ts
import type { RepositorySnapshot } from "../../data/repositories";

export interface BackupDiffRow {
  label: string;        // "帳戶", "交易", "持倉", ...
  current: number;
  backup: number;
  delta: number;        // backup - current ; negative = will shrink
}
export interface BackupDiff {
  exportedAt: string;   // backup.exportedAt
  rows: BackupDiffRow[];
  hasDecrease: boolean; // any row with delta < 0
}

export function buildBackupDiff(current: RepositorySnapshot, backup: RepositorySnapshot): BackupDiff {
  const rows: BackupDiffRow[] = [
    row("帳戶", current.accounts, backup.accounts),
    row("交易", current.ledgerTransactions, backup.ledgerTransactions),
    row("持倉", current.portfolioAssets, backup.portfolioAssets),
    row("投資紀錄", current.investmentRecords, backup.investmentRecords),
    row("週期交易", current.recurringTransactions, backup.recurringTransactions),
    row("目標", current.financialGoals ?? [], backup.financialGoals ?? []),
    // include the other count-bearing arrays similarly, guarding optionals with ?? []
  ];
  return { exportedAt: backup.exportedAt, rows, hasDecrease: rows.some((r) => r.delta < 0) };
}
// helper `row(label, a, b)` => { label, current: a.length, backup: b.length, delta: b.length - a.length }
```

**Verify**: `npx vitest run src/features/local-backup/backupDiff.test.ts` → all pass.

### Step 2: expose a read-only snapshot accessor
In `localBackup.ts` add:

```ts
/** Read a backup's snapshot without restoring it (for the restore preview). */
export async function readLocalBackupSnapshot(id: string): Promise<RepositorySnapshot | null> {
  return store().read(id);
}
```

Do **not** modify `restoreLocalBackup`.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: wire the preview into the confirm step
In `GeneralSection.tsx`, when the user clicks 還原 (sets `confirmRestoreId`),
load the diff: `readLocalBackupSnapshot(id)` + `repo.exportSnapshot()` →
`buildBackupDiff`. In the `confirmRestoreId === b.id` branch, render the diff
table (時間點 = backup `exportedAt`; per-entity 現在 → 備份 counts; rows where
`delta < 0` in `var(--ns-neg)`). Per 驗收, replace the single 確定還原 button with
a **typed-phrase confirm**: a text input that must equal a fixed phrase (e.g.
`還原`) before 確定還原（覆蓋現有）enables. Keep 取消 as-is. The actual restore
still calls the unchanged `handleRestoreLocal`/`restoreLocalBackup`.

**Verify**: `npx tsc --noEmit` → exit 0; `npm run lint` → 0 errors.

### Step 4: full verification
**Verify**: `npx tsc --noEmit` exit 0; `npm test` all pass; `npm run lint` 0
errors; `npm run build` exit 0.

## Test plan

Add `src/features/local-backup/backupDiff.test.ts` (vitest; build minimal
`RepositorySnapshot` literals — only the arrays the diff reads need entries):

- backup with **more** of everything than current → all `delta > 0`,
  `hasDecrease === false`.
- backup with **fewer** transactions than current → that row `delta < 0`,
  `hasDecrease === true` (this is the 驗收 case: spotting a too-small old backup).
- optional arrays missing on one side → treated as 0, no crash.
- `exportedAt` is carried through from the backup.

Verification: `npx vitest run src/features/local-backup/backupDiff.test.ts` →
all pass.

## Done criteria

ALL must hold:

- [ ] `buildBackupDiff` exists, is pure, and is unit-tested (incl. the
      decrease/`hasDecrease` case)
- [ ] `readLocalBackupSnapshot` reads a snapshot without restoring;
      `restoreLocalBackup` is byte-for-byte unchanged
- [ ] The restore confirm step shows the backup timestamp + per-entity counts,
      with decreases in red, and requires typing the confirm phrase
- [ ] `npx tsc --noEmit` exits 0; `npm test` exits 0; `npm run lint` 0 errors;
      `npm run build` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the cited lines doesn't match the excerpts (drift since `8f2e90bd`).
- `store().read` does not return a `RepositorySnapshot` (the store interface
  changed) — the preview depends on reading the snapshot read-only.
- Adding the preview would require changing `restoreLocalBackup` or
  `importSnapshot` — it must not; if it seems to, stop and report.
- A backup snapshot is too large to load for preview without a noticeable hang
  (>1–2s) — report so we can decide on lazy/streamed counts instead.

## Maintenance notes

- For the reviewer: confirm the **write path is untouched** — the only behavioral
  change is an informational gate before the existing restore. The typed-phrase
  confirm replaces the bare button per the roadmap 驗收.
- Deferred follow-up: apply the same `buildBackupDiff` preview to (a) the JSON
  full-DB import restore and (b) the sync Recovery-Kit / `restoreBackup` path —
  both currently overwrite blind too. Same helper, different call sites.
- If `RepositorySnapshot` gains a new entity array, add a `row(...)` for it in
  `buildBackupDiff` so the preview stays complete (add a test row too).
