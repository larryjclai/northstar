# Plan 255: 信用卡群組 Phase B — credit_groups 一等 synced 實體（資料層，無 UI）

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files in scope. If any STOP condition occurs, stop immediately and
> report — do not improvise. **This plan adds a new END-TO-END SYNCED entity;
> the #1 rule is: mirror the existing `client` entity at EVERY touchpoint. A
> missed touchpoint = the entity silently doesn't sync or pull crashes.** When
> done, update this plan's row in `plans/README.md` unless a reviewer told you
> they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 8fed759d..HEAD -- src/data/repositories.ts src/data/migrations.ts src/domain/sync.ts src/domain/types.ts`
> If any changed, re-locate the `client` anchors below by grep before editing.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED-HIGH — new synced entity crosses migration / outbox triggers /
  tableByEntity / getSyncPayload / pull-apply / snapshot. Mitigated by mirroring
  `client` exactly and by push/pull + snapshot-roundtrip tests.
- **Depends on**: 254 (decisions locked: **derive-on-read**, confirmed by larry
  2026-07-24). 253 DONE.
- **Category**: architecture / migration
- **Planned at**: commit `8fed759d`, 2026-07-24

## Why this matters

254 locked the model: a first-class **credit group** owns `{credit_limit,
statement_day, payment_due_day, currency}`; a credit account with
`credit_group_id` set **derives those three fields from the group at read time**
(derive-on-read, larry-confirmed). This plan builds the entire **data layer** —
the `credit_groups` table, its full E2E sync registration, account
`credit_group_id`, derive-on-read, leave-group snapshot, and a non-destructive
backfill of the existing free-text `credit_limit_group`. **No UI** — 256 does UI
and rewires 253's grouping. During the gap, the reconcile page (253) keeps its
old field-match trigger; because grouped cards now derive identical
statement/due days, the old match still fires, so the two coexist safely.

## ⚠ Corrected touchpoint list (advisor sweep after 255 executor STOP, 2026-07-24)

The original map missed SIX synced touchpoints — **two are non-compile-forced
silent gaps**. Full corrected set beyond types/SyncEntity/CRUD/tableByEntity:

- **`src/domain/sync.ts` `SyncSource` (:72)** — add `creditGroups?: SyncSourceRecord[];`
- **`src/domain/sync.ts` `ENTITY_BY_KEY` (:86)** — add `creditGroups: "creditGroup",`
  (becomes compile-forced once SyncSource has the key)
- **base `allSyncRecords()` (repositories.ts:2111 `return {…}`)** — add `creditGroups: this.data.creditGroups,`
  (this is the LIVE browser push path via `collectPendingChanges` :2132)
- **sqlite `allSyncRecords()` override (repositories.ts:4612)** — add `q("credit_groups")` + destructure + field (dead code today, mirror for safety)
- **`pull.ts` `VALID_ENTITIES` Set (:281)** — add `"creditGroup"`. **NOT compile-forced;
  omit → incoming credit-group envelopes are REJECTED on pull. Most dangerous gap.**
- **`pull.ts` `DERIVED_FIELDS` (:253)** — `Partial<>`; creditGroup has no derived fields → **NO entry needed**.
- **`conflictSummary.ts` `ENTITY_LABELS` (:8)** — add `creditGroup: "信用卡群組",` (compile-forced)
- **`tableByEntity` is ×4 not ×3** — add to repositories.ts **:4725, :4757, :4790, AND :5597**
- **`backfillSyncOutbox` table list (repositories.ts:5554)** — add `["credit_groups", "creditGroup"],`
- **Backfill (Step 9) must NOT suppress the outbox** for its credit_groups inserts /
  account credit_group_id updates — those changes must propagate. Cross-device
  duplicate-group dedup (two devices backfill offline then sync) is a known
  follow-up (mirror `mergeAndHealBooksInMemory`), **OUT OF SCOPE for v1**.
- **`AccountDraft.creditGroupId`**: keep it **optional** (`creditGroupId?: string | null`)
  mirroring `bookId`, NOT in the strict `Pick` — the strict Pick breaks out-of-scope
  UI files and the build gate. (Advisor-approved deviation.)

Completeness oracle: `grep -rn "\bclient\b\|\bclients\b" src/domain/sync.ts
src/features/connect/sync/*.ts src/data/repositories.ts` — every hit must have a
`creditGroup`/`credit_groups` twin (except `client.ts` the HTTP module, unrelated).

## The mirror template: `client` entity (verified at `8fed759d`)

`client` (plan 190) is the most recent entity that went through every synced
touchpoint. **For each step below, the `client` code is shown; produce the
`creditGroup` twin.** New entity name: `creditGroup`; new table: `credit_groups`.

`CreditGroup` shape (all scalar — no booleans, no JSON):
`id, spaceId, revision, createdAt, updatedAt, deletedAt` (from `SyncFields`) +
`name: string, currency: string, creditLimit: number | null, statementDay:
number | null, paymentDueDay: number | null`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Build/typecheck | `npm run build` | exit 0 |
| Sync tests | `npx vitest run push pull` | all pass |
| Snapshot/backup tests | `npx vitest run snapshot backup books` | all pass |
| New credit-group tests | `npx vitest run creditGroup` | all pass |
| Lint | `npm run lint` | exit 0 (warnings ok) |
| Full suite (final gate) | `npm test` | all pass |

## Scope

**In scope**:
- `src/domain/types.ts` (CreditGroup type; Account.creditGroupId)
- `src/domain/sync.ts` (SyncEntity)
- `src/data/migrations.ts` (migration id:8)
- `src/data/repositories.ts` (all repo touchpoints + derive-on-read + backfill)
- `src/data/repositories.creditGroup.test.ts` (**create** — sync + derive + backfill tests)

**Out of scope**:
- Any UI file (`src/routes/AccountsRoute.tsx`, `ReconcileRoute.tsx`, components) — that is 256.
- The worker / relay server — the relay is entity-agnostic (it forwards opaque envelopes); no server change is needed. If you believe it is, STOP and report.
- Do NOT delete or stop reading the `credit_limit_group` column — backfill is non-destructive; retiring it is 256.

## Git workflow

- Branch: `feat/ai-credit-group-data-layer` (fresh from `main`/`8fed759d`).
- Conventional commits; suggested: `feat(sync): credit_groups as a first-class synced entity (plan 255)`.
- Do NOT push or open a PR.

## Steps

### Step 1 — Types: `CreditGroup` + `Account.creditGroupId`

In `src/domain/types.ts`, near `Client` (`:91`), add:
```ts
/** 信用卡群組 (Credit group, plan 254) — first-class owner of a shared billing
 *  cycle + limit for same-bank cards. Cards with credit_group_id derive
 *  statementDay/paymentDueDay/creditLimit from here (derive-on-read). */
export interface CreditGroup extends SyncFields {
  name: string;
  currency: string;
  creditLimit: number | null;
  statementDay: number | null;
  paymentDueDay: number | null;
}
```
In the `Account` interface, add `creditGroupId: string | null;` (near `creditLimitGroup`, `types.ts:142`). Keep `creditLimitGroup` — it stays for backfill/fallback.

**Verify**: `npm run build` → will error at every place that constructs `Account` without `creditGroupId` (tests, drafts). That's expected; Steps 2–8 fill them. If errors appear OUTSIDE account construction / the files in scope, STOP.

### Step 2 — `SyncEntity` union

`src/domain/sync.ts:18-29`: add `| "creditGroup"` to the union (after `"client"`).

**Verify**: `npm run build` → new TS errors now appear in `repositories.ts` at the `Record<Exclude<SyncEntity,"settings">,string>` maps and the apply switch (they became non-exhaustive). Expected — fixed in Steps 6–7.

### Step 3 — Migration id:8 (new table)

`src/data/migrations.ts`: append a new object to the `migrations` array (after id:7, before the closing `]`):
```ts
{
  id: 8,
  description: "信用卡群組 (Credit groups) — first-class shared billing cycle + limit (plan 254)",
  sql: `
    create table if not exists credit_groups (
      id text primary key,
      space_id text not null,
      revision integer not null,
      created_at text not null,
      updated_at text not null,
      deleted_at text,
      name text not null default '',
      currency text not null,
      credit_limit real,
      statement_day integer,
      payment_due_day integer
    );
  `,
},
```

**Verify**: `npm run build` → no new errors from this file.

### Step 4 — `accounts.credit_group_id` column (ensure-column, not ALTER migration)

In the SQLite `initialize()` ensure-column block (`repositories.ts:2687-2700`, where `credit_limit_group`, `statement_day` etc. are ensured), add:
```ts
await this.ensureSqliteColumn("accounts", "credit_group_id", "text");
```

**Verify**: `grep -n 'ensureSqliteColumn("accounts", "credit_group_id"' src/data/repositories.ts` → 1 match.

### Step 5 — `RepositorySnapshot`, `RepositoryData`, `Repository` interface, `AccountDraft`

- `RepositorySnapshot` (`repositories.ts:449`): add `creditGroups: CreditGroup[];` (mirror `clients`).
- `RepositoryData` (the in-memory shape; find via `grep -n "clients:" src/data/repositories.ts` in the interface, and in `createInitialData` `:5810-5832`): add `creditGroups: CreditGroup[];` to the interface and `creditGroups: [],` to `createInitialData`.
- `Repository` interface (`:303-305`, the `listClients/createClient/updateClient` block): add
  ```ts
  listCreditGroups(): Promise<CreditGroup[]>;
  createCreditGroup(input: CreditGroupDraft): Promise<void>;
  updateCreditGroup(id: string, input: CreditGroupDraft): Promise<void>;
  deleteCreditGroup(id: string): Promise<void>;
  ```
- Add `export type CreditGroupDraft = Pick<CreditGroup, "name" | "currency" | "creditLimit" | "statementDay" | "paymentDueDay">;` near `ClientDraft` (`:107`).
- `AccountDraft` (`:87`): add `"creditGroupId"` to the `Pick<Account, …>` list. Then every `updateAccount`/`createAccount` writer must include `credit_group_id` (Step 8).

**Verify**: `npm run build` → errors now concentrate in the two repo classes' missing method implementations. Expected.

### Step 6 — Browser (in-memory) repo: CRUD + sync maps

Mirror `client` at each spot:
- **CRUD** (after `updateClient`, `:1093`): add `listCreditGroups` (`return active(this.data.creditGroups);`), `createCreditGroup` (mirror `createClient` `:1065`, `id: createId("creditGroup")`, fields name/currency/creditLimit/statementDay/paymentDueDay), `updateCreditGroup` (mirror `:1082` with `bump(...)`), and `deleteCreditGroup` (soft-delete: `map` → `bump({ ...g, deletedAt: nowIso() })` for the id; mirror how another entity soft-deletes, e.g. `grep -n "deleteBook\|deleteClient" ` — if no `deleteClient` exists, mirror `deleteAccount`'s soft-delete + `bump`).
- **getSyncPayload** `rowsByEntity` (`:2183-2194`): add `creditGroup: this.data.creditGroups,`.
- **applySyncChanges** `keyByEntity` (`:2252-2263`): add `creditGroup: "creditGroups",`.
- **importSnapshot** (browser, `:2211-2227`): add `creditGroups: snapshot.creditGroups,` (guard `?? []` if the surrounding code does).
- **getSnapshot** (browser export — `grep -n "clients: " src/data/repositories.ts` in the browser snapshot builder): add `creditGroups: active(this.data.creditGroups)` (mirror how clients are exported).

**Verify**: `npm run build` → browser-class errors gone; only SQLite-class errors remain.

### Step 7 — SQLite repo: CRUD + sync maps + insert-row + snapshot

- **Overrides** (after `updateClient` override `:3113`): `listCreditGroups` (mirror `:3088` select, snake→camel columns: `credit_limit as creditLimit, statement_day as statementDay, payment_due_day as paymentDueDay`), `createCreditGroup` (mirror `:3099` insert), `updateCreditGroup` (mirror `:3108` update), `deleteCreditGroup` (soft-delete: `update credit_groups set revision = revision + 1, updated_at = $1, deleted_at = $1 where id = $2`).
- **insertCreditGroupRow** (private, mirror `insertClientRow` `:5100`): full-column insert from a `CreditGroup` row.
- **Outbox trigger table list** (`:5485-5496`): add `["credit_groups", "creditGroup"],`.
- **tableByEntity × 3** (`:4725`, `:4757`, `:4790`): add `creditGroup: "credit_groups",` to each map.
- **applySyncChanges switch** (`:5636-5646`): add `case "creditGroup": await this.insertCreditGroupRow(payload as unknown as CreditGroup); break;`.
- **getSnapshot** SQLite (`Promise.all` at `:4570-4585`): add `this.listCreditGroups(),` and destructure it; include `creditGroups` in the returned snapshot object.
- **importSnapshot** SQLite (`:4892-4896` insert loops): add `for (const g of snapshot.creditGroups ?? []) await this.insertCreditGroupRow(g);`.
- **normalizeSqliteSyncPayload** (`:5774`): **no change needed** — generic snake→camel covers all scalar columns; creditGroup has no boolean/JSON fields. (Confirm by reading it; do not add a branch.)

**Verify**: `npm run build` → exit 0 (all exhaustiveness/method errors resolved).
`grep -c '"credit_groups"' src/data/repositories.ts` → ≥ 4 (3 tableByEntity + 1 outbox list).

### Step 8 — Derive-on-read + leave-group snapshot on accounts

**Derive-on-read**: when an account has `creditGroupId` set (and the group exists, not deleted), its `statementDay`, `paymentDueDay`, `creditLimit` come from the group. Implement in BOTH repos' account read:
- Browser `listAccounts` (`:1114`): after building the account list, map over it; for each with `creditGroupId`, look up `this.data.creditGroups.find(g => g.id === creditGroupId && !g.deletedAt)` and override the three fields.
- SQLite `listAccounts` (find via `grep -n "override async listAccounts"`; if none, the base `listAccounts` runs against `this.db` — override or post-process): simplest robust approach — after selecting accounts, fetch `listCreditGroups()` once, build a `Map<id, CreditGroup>`, and override the three fields for grouped accounts in JS (avoid a SQL JOIN so both repos share identical logic). Prefer a shared private helper `applyCreditGroupDerivation(accounts, groups)` used by both.

**Leave-group snapshot** (Decision 2): in `updateAccount` (both repos), if the incoming draft sets `creditGroupId` to null AND the stored account previously had a non-null `creditGroupId`, copy that group's current `statementDay/paymentDueDay/creditLimit` into the account's own columns before clearing the link. (Read the prior account + its group first.)

> **Escape hatch**: if `listAccounts` is consumed in a hot path where fetching groups each call is costly, still do it — accounts lists are small (personal finance). Do NOT add caching; if you think you must, STOP and report.

**Verify**: `npm run build` → exit 0.

### Step 9 — Non-destructive backfill: free-text `credit_limit_group` → groups

One-time, idempotent, runs in `initialize()` AFTER migrations + ensure-columns, in BOTH repos (or a shared helper called from both). Logic:
1. Gather non-deleted credit accounts with a non-empty `creditLimitGroup` AND `creditGroupId == null`.
2. Group them by `creditLimitGroup` string. For each group with **≥2** members:
   - If a `credit_groups` row with matching `name` already exists (from a prior run/device), reuse it; else create one. Seed `currency` = members' common currency (if they differ, SKIP this group and log — mismatched currency can't share a bill); `statementDay`/`paymentDueDay`/`creditLimit` = the value held by the **most members**, ties broken by the member with the latest `updatedAt` (Decision 4).
   - Set each member's `creditGroupId` to that group id (via `updateAccount`-level write or a direct column write with outbox suppression — mirror how backfills like `book_id` write; `grep -n "book_id" ` in initialize()).
3. Idempotent guard: because step 1 filters `creditGroupId == null` and step 2 reuses an existing group by name, re-running is a no-op.

Keep `credit_limit_group` values intact (non-destructive).

> **STOP** if you cannot make the backfill idempotent across restarts/reseeds — a backfill that re-creates groups every launch is a data bug. Report instead.

**Verify**: covered by tests in Step 10.

### Step 10 — Tests (`src/data/repositories.creditGroup.test.ts`, create)

Model structure after `src/features/connect/sync/push.test.ts` / `pull.test.ts` (sync) and the books/invoices snapshot roundtrip test (`grep -rln "snapshot" src/features/connect/sync src/data`). Cover:
1. **CRUD**: create a credit group, `listCreditGroups` returns it; update mutates + bumps revision; delete soft-deletes (excluded from list).
2. **Sync push**: after `createCreditGroup`, `collectPendingChanges` yields a `creditGroup` change and `getSyncPayload("creditGroup", id)` returns the row (SQLite outbox path if the test harness uses SQLite; else browser feed).
3. **Sync pull/apply**: `applySyncChanges([{ entity: "creditGroup", payload }])` inserts/updates the row.
4. **Snapshot roundtrip**: a snapshot containing credit groups survives `getSnapshot` → `importSnapshot` (mirror the books/invoices roundtrip test).
5. **Derive-on-read**: an account with `creditGroupId` reports the group's statementDay/paymentDueDay/creditLimit, not its own stale columns.
6. **Leave-group snapshot**: setting `creditGroupId` to null copies the group's current values into the account's own columns.
7. **Backfill**: two credit accounts sharing `creditLimitGroup="玉山"` with no `creditGroupId` → after init/backfill, a group exists and both link to it; running backfill twice creates no duplicate.

Use the dual-harness pattern if the repo's other repo tests run both browser + SQLite (`grep -rln "createSqlite\|BrowserRepository\|makeRepo" src/data/*.test.ts` to find the factory).

**Verify**: `npx vitest run creditGroup` → all pass.

### Step 11 — Full gate

**Verify**:
- `npm run build` → exit 0
- `npx vitest run push pull snapshot backup books creditGroup` → all pass
- `npm run lint` → exit 0 (warnings ok)
- `npm test` → all pass (no regression in the ~1462 existing tests)

## Done criteria

- [ ] `npm run build` exit 0
- [ ] `npm test` all pass; new `creditGroup` tests exist and pass
- [ ] `grep -c '"credit_groups"' src/data/repositories.ts` ≥ 4
- [ ] `grep -n '"creditGroup"' src/domain/sync.ts` → match (in SyncEntity)
- [ ] `grep -n "case \"creditGroup\"" src/data/repositories.ts` → match (apply switch)
- [ ] migration id:8 present; `credit_limit_group` column still read (non-destructive)
- [ ] Only in-scope files changed (`git status`)
- [ ] `plans/README.md` row updated

## STOP conditions

- A synced touchpoint has NO `client` equivalent to mirror (the map diverged) — report which.
- Backfill can't be made idempotent — report.
- Currency mismatch inside a would-be group — the backfill must SKIP + log, not force-merge; if the plan's approach can't, report.
- You find a synced touchpoint NOT in this plan's list (e.g. a fourth `tableByEntity`, or a relay/worker-side registry) — STOP, report, so 254's map is corrected. **Do not guess.**
- `npm test` regresses existing sync/snapshot tests and the cause isn't an obvious missed mirror — report.

## Maintenance notes

- **Checklist discipline**: run `grep -n "client\b\|clients\b" src/data/repositories.ts src/domain/sync.ts` and confirm `creditGroup`/`credit_groups` appears at every corresponding site. That grep IS the completeness test.
- Phase C (256) consumes this: AccountsRoute group-management UI, account-form "belongs to group" + inherited (read-only) statement/limit fields, and switches ReconcileRoute (253) grouping from field-match to `credit_group_id`, then retires the free-text `creditLimitGroup` from the UI.
- Reviewer should scrutinize: every synced touchpoint covered (use the grep checklist), backfill idempotency + non-destructiveness, derive-on-read parity between browser and SQLite repos (identical field overrides), and the leave-group snapshot (no silent data loss).
- The relay/worker forwards opaque envelopes and is entity-agnostic — confirmed no server change. If a future entity needs server awareness, this note is wrong; re-verify.
