# Plan 170: Extend the restore preview (counts diff + typed confirm) to the JSON-import and sync-backup restore paths

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4ac63576..HEAD -- src/routes/settings/GeneralSection.tsx src/routes/settings/ConnectSection.tsx src/features/connect/sync/backup.ts src/features/local-backup/backupDiff.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (read-only preview added in front of existing restore calls; no restore semantics change)
- **Depends on**: none
- **Category**: direction (roadmap 5.2 completion)
- **Planned at**: commit `4ac63576`, 2026-07-12

## Why this matters

Restoring a backup **silently overwrites the live database** — it is the most
destructive action a user can take in Northstar. Roadmap item 5.2 (還原前預覽)
asks for a counts-diff preview so a user who picks a wrong/too-old backup sees
「交易 1,203 → 486」in red and aborts. Plan 047 already built exactly this for
the **local backups** list (`buildBackupDiff` + typed「還原」phrase in
`GeneralSection.tsx`), but the app has **two more restore paths that still
overwrite with no preview**:

1. **JSON file import** — `GeneralSection.tsx` `importBackup()` (staged file +
   one inline confirm click, no diff, no typed phrase).
2. **Sync pre-pull backups** — `ConnectSection.tsx` `handleRestore()` (two-click
   confirm only).

This plan reuses the shipped plan-047 machinery on those two paths so all three
restore flows behave identically.

## Current state

- `src/features/local-backup/backupDiff.ts` — the shipped diff builder:
  `buildBackupDiff(current: RepositorySnapshot, backup: RepositorySnapshot): BackupDiff`
  returning `{ rows: BackupDiffRow[] }` with per-entity current/backup counts.
  **Reuse it as-is; do not modify it.**
- `src/routes/settings/GeneralSection.tsx` — plan 047's local-backup preview is
  the exemplar pattern to copy. Around lines 96–170:

  ```tsx
  // GeneralSection.tsx:98 (excerpt)
  const RESTORE_CONFIRM_PHRASE = "還原";
  const [restoreDiff, setRestoreDiff] = useState<BackupDiff | null>(null);
  const [restoreDiffLoading, setRestoreDiffLoading] = useState(false);
  const [restoreConfirmInput, setRestoreConfirmInput] = useState("");
  // ...
  // GeneralSection.tsx:127 beginRestoreLocal(id): loads
  //   [readLocalBackupSnapshot(id), repository.exportSnapshot()]
  //   then setRestoreDiff(buildBackupDiff(current, backup)) — WITHOUT touching the DB.
  ```

  The JSON-import path in the same file has **no preview** (~line 235):

  ```tsx
  // GeneralSection.tsx:235 (excerpt)
  async function importBackup(file: File) {
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as RepositorySnapshot;
      if (!parsed || !Array.isArray(parsed.accounts)) throw new Error("無效的備份檔（缺少 accounts 欄位）");
      const repository = await getFinanceRepository();
      await repository.importSnapshot(parsed);
  ```

  There is already a staged-file state: `pendingImportFile` (~line 87), rendered
  further down as an inline confirm block — find it by grepping
  `pendingImportFile` in the JSX.
- `src/routes/settings/ConnectSection.tsx:571-587` — sync pre-pull backup
  restore, two-click confirm only:

  ```tsx
  // ConnectSection.tsx:574 (excerpt)
  const [confirmRestoreTs, setConfirmRestoreTs] = useState<string | null>(null);
  async function handleRestore(timestamp: string) {
    setConfirmRestoreTs(null);
    try {
      const repo = await getFinanceRepository();
      await restoreBackup(timestamp, repo);
  ```

- `src/features/connect/sync/backup.ts` — sync backups (3 retained, IndexedDB).
  Exports `saveBackup`, `listBackups(): Promise<BackupEntry[]>`,
  `restoreBackup(timestamp, repo)`. It has **no read-without-restore accessor**;
  you will add one (Step 2). Read the file first to see how `restoreBackup`
  looks the snapshot up by timestamp — mirror that lookup.
- Conventions: no `window.confirm` (no-op in the Tauri webview — the existing
  comments in both files say so); zh-TW copy written inline in these files
  (match surrounding strings); toasts via `toast.success/error`; styling via
  existing `ns-*` classes — copy the classes used by the plan-047 diff render
  block in `GeneralSection.tsx` verbatim.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0              |
| Tests     | `npm test`         | all pass            |
| Lint      | `npm run lint`     | exit 0, 0 errors    |

## Scope

**In scope** (the only files you should modify):
- `src/routes/settings/GeneralSection.tsx` (JSON-import path only)
- `src/routes/settings/ConnectSection.tsx` (restore-backup block only)
- `src/features/connect/sync/backup.ts` (add one read-only export)
- `src/features/connect/sync/backup.test.ts` or the file's existing test home
  (extend; create only if none exists)

**Out of scope** (do NOT touch, even though they look related):
- `src/features/local-backup/backupDiff.ts` and the existing local-backup
  preview flow — already shipped and correct; changing it risks regressing plan 047.
- `restoreBackup` / `importSnapshot` semantics — the preview goes in FRONT of
  them; the restore call itself must remain byte-identical.
- `src/routes/settings/FxSection.tsx`, `MerchantsSection.tsx`,
  `CategoriesSection.tsx`, `ExportSection.tsx` — they import `listBackups`/
  `restoreBackup` but (verify before touching anything) are not the restore UI
  this plan targets.

## Git workflow

- Branch: `fix/ai-restore-preview-gaps`
- Conventional commits, e.g. `feat(backup): show counts diff before JSON import restore`
- Do NOT push or merge; leave the branch for review.

## Steps

### Step 1: JSON-import preview in GeneralSection

When a file is staged (`pendingImportFile` set), parse it immediately (reuse the
existing validation), call `repository.exportSnapshot()`, build
`buildBackupDiff(current, parsed)`, and render the same diff rows + typed
「還原」phrase gate that the local-backup block uses (copy that JSX/classes).
The final confirm button stays disabled until the typed phrase matches. Parsing
errors surface where the current validation error does. `importBackup(file)`
itself keeps its logic, minus the now-duplicated parse (pass the parsed
snapshot through instead of re-reading the file, or re-parse — either is fine,
but validation must still run before `importSnapshot`).

**Verify**: `npx tsc --noEmit` → exit 0; `npm run lint` → 0 errors.

### Step 2: Read-only accessor in sync backup store

In `src/features/connect/sync/backup.ts`, add
`export async function readBackupSnapshot(timestamp: string): Promise<RepositorySnapshot | null>`
that returns the stored snapshot without applying it — extract the lookup logic
`restoreBackup` already uses (refactor `restoreBackup` to call it, so there is
one lookup path).

**Verify**: `npm test` → all pass (existing backup tests unaffected).

### Step 3: Sync-backup restore preview in ConnectSection

Mirror the plan-047 flow: when the user clicks restore on a backup entry, load
`[readBackupSnapshot(timestamp), repo.exportSnapshot()]`, show the diff + typed
phrase gate; only then call the existing `handleRestore`. Reuse the same state
shape (`restoreDiff`, `restoreDiffLoading`, `restoreConfirmInput`) and the same
copy strings as GeneralSection so the two surfaces read identically.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: Tests

See test plan.

**Verify**: `npm test` → all pass including new tests.

## Test plan

- `readBackupSnapshot`: returns the stored snapshot for a known timestamp;
  returns `null` for an unknown timestamp; `restoreBackup` still applies the
  snapshot (model after the existing tests around `saveBackup`/`restoreBackup` —
  locate with `grep -rln "restoreBackup" src/ --include="*.test.ts"`).
- No new tests are required for the JSX gating itself (jsdom coverage of these
  settings sections is thin by convention), but if `GeneralSection`/
  `ConnectSection` already have test files, add a render test asserting the
  confirm button is disabled until the phrase matches.
- Verification: `npm test` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc --noEmit` exits 0; `npm run lint` 0 errors; `npm test` all pass
- [ ] `grep -n "readBackupSnapshot" src/features/connect/sync/backup.ts` shows the new export
- [ ] `grep -n "buildBackupDiff" src/routes/settings/ConnectSection.tsx` ≥ 1 match
- [ ] In `GeneralSection.tsx`, `importSnapshot(` is reachable only after the typed-phrase gate (read the JSX to confirm; no second unguarded call site: `grep -c "importSnapshot(" src/routes/settings/GeneralSection.tsx` → 1)
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The plan-047 preview block in `GeneralSection.tsx` doesn't match the excerpt
  (drifted since planning).
- `backup.ts`'s storage layout makes a read-without-restore accessor require
  changing the stored shape — report instead of migrating stored backups.
- You find the sync-backup restore UI actually lives outside `ConnectSection.tsx`.

## Maintenance notes

- Any future restore surface (e.g. roadmap 5.2 follow-ups, cloud restore) must
  route through the same `buildBackupDiff` + typed-phrase pattern — three
  consistent surfaces now exist to copy.
- Reviewer should scrutinize: the JSON path still validates before import, and
  the diff is computed from the staged file, not from a re-read after confirm.
- Deferred: field-level diff (which records changed) — roadmap 5.3③ territory,
  explicitly out of scope here.
