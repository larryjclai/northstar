# Plan 129: Test the sync orchestration layer (client + worker), then batch the pull's N+1 lookups

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 65fe04c1..HEAD -- src/features/connect/sync worker/`
> Re-locate excerpts by grep; STOP on shape mismatch.

## Status

- **Priority**: P2
- **Effort**: M–L
- **Risk**: LOW (tests) / MED (step 5's pull change — gated on the new tests)
- **Depends on**: none (worker CI wiring lands via plan 128's `worker` job)
- **Category**: tests
- **Planned at**: commit `65fe04c1`, 2026-07-09

## Why this matters

Sync moves financial data between devices, yet the orchestration layer is
untested: on the client, `sync-manager.ts`, `push.ts`, `account.ts`,
`conflictSummary.ts`, `pairing-flow.ts` have no tests (only `pull`, `reset`,
`resync-cursor`, `manualHoldingSync` do); the Cloudflare Worker
(`worker/src/index.ts`, 385 lines — auth, device CRUD, envelope push/pull
with cursors, key envelopes, pairing) has **zero** tests and no test script.
This layer already produced a production crash (commit `b809449d`, UNIQUE
constraint on synced recurring occurrences). Finally, `pull.ts` issues one
`getSyncPayload` SELECT per incoming envelope — thousands of serialized
round-trips on initial sync — which is only safe to fix once tests exist.

## Current state

- Client sync dir: `src/features/connect/sync/` — read `sync-manager.ts`
  (coordinator + mutex), `push.ts` (`getSyncPayload` per pending change,
  ~line 41), `pull.ts` (loop with `const existing = await
  repo.getSyncPayload(entity, envelope.entityId)` ~line 93, then
  `shouldApply` revision/updatedAt merge), `conflictSummary.ts`.
  Existing test exemplars: `pull.test.ts`, `reset.test.ts` (read for the
  fake-client / memory-repo patterns they already use).
- Worker: `worker/src/index.ts`; endpoints: `POST /users` (unauth),
  `GET /pairing/:code` (unauth), then Bearer-auth `POST/GET /devices`,
  `DELETE /devices/:id`, `POST/GET /envelopes` (cursor pull), `POST/GET
  /keys/:device`, `POST /pairing`. D1 schema in `worker/migrations/*.sql`.
  `worker/package.json` has wrangler `dev/deploy/migrate:*/types` scripts, no
  test script.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| App tests | `npm test` | all pass |
| Worker tests (new) | `cd worker && npm test` | all pass |
| Typecheck | `npx tsc` and `cd worker && npx tsc --noEmit` | exit 0 |

## Scope

**In scope**:
- New client tests: `sync-manager.test.ts`, `push.test.ts`,
  `conflictSummary.test.ts` under `src/features/connect/sync/`
- Worker test harness: `@cloudflare/vitest-pool-workers` (+ vitest) as
  worker devDependencies, `worker/vitest.config.ts`,
  `worker/src/index.test.ts`, `"test"` script in `worker/package.json`
- Step 5 only: `src/features/connect/sync/pull.ts` (batch lookup) and the
  repository method it needs (`src/data/repositories.ts` — additive method)

**Out of scope**:
- Any worker endpoint behavior change (hardening is plan 133).
- `pairing-flow.ts` tests (crypto flows change under plans 131/132 — testing
  the current flow would be churn).
- `src/domain/sync.ts` (already tested).

## Git workflow

- Branch: `feat/ai-sync-orchestration-tests`
- Conventional commits per layer; e.g. `test(sync): sync-manager round-trip
  coverage`, `test(worker): endpoint suite under workers pool`,
  `perf(sync): batch pull payload lookups`.
- Do NOT push or merge to `main`.

## Steps

### Step 1: Client — sync-manager + push + conflictSummary tests

Model on `pull.test.ts`'s fakes. Cover at minimum:
- sync-manager: a push→pull round trip against the memory repo and a fake
  client; the mutex (second `runSync` while one is in flight → no double
  run); error propagation (client failure → status reflects it, no cursor
  advance).
- push: pending changes → envelopes (payload encryption boundary can be faked
  the way pull.test.ts fakes it); revision stamping; empty-queue no-op.
- conflictSummary: build a summary from a synthetic conflict list; empty list.

**Verify**: `npm test -- connect/sync` → new tests pass, existing pass.

### Step 2: Worker test harness

In `worker/`: add vitest + `@cloudflare/vitest-pool-workers` devDeps,
`vitest.config.ts` per that package's docs (it runs tests inside workerd with
D1 bindings; wire the D1 migration SQL from `worker/migrations/` in setup),
and `"test": "vitest run"`.

**Verify**: `cd worker && npm test` → a trivial first test passes.

### Step 3: Worker endpoint tests

Cover: register → auth'd device list; wrong/missing Bearer → 401; push
envelopes → pull with cursor returns them in order and honors the cursor;
duplicate envelope push (same user/entity/entityId/revision/deviceId) → no
duplicate row (ON CONFLICT DO NOTHING); pairing create → claim happy path,
second claim → 410, expiry → 410; key envelope store/fetch round trip.

**Verify**: `cd worker && npm test` → all pass.

### Step 4: (with plan 128) extend the CI worker job

If plan 128's `worker` CI job exists, append `npm test`; otherwise note the
follow-up in your report. (Editing ci.yml here is allowed ONLY for that one
line.)

### Step 5: Batch the pull N+1 (only after Steps 1–3 are green)

Add an additive repository method `getSyncPayloads(entity, entityIds[])`
(both implementations; SQLite via one `select ... where entity_id in (...)`
per entity — mind SQLite's ~999 variable limit, chunk by 500). In `pull.ts`,
prefetch the page's payloads into a `Map` before the merge loop and look up
from it; the merge logic (`shouldApply`, conflict recording) stays
byte-identical. `pull.test.ts` and Step 1's tests must pass unchanged — they
are the behavior lock.

**Verify**: `npm test` → all pass (especially `pull.test.ts` untouched and
green).

## Test plan

Steps 1–3 above; Step 5 relies on them.

## Done criteria

- [ ] sync-manager/push/conflictSummary tests exist and pass
- [ ] `cd worker && npm test` runs a real endpoint suite green
- [ ] pull prefetches payloads (no `getSyncPayload` call inside the loop) and
      all sync tests pass unchanged
- [ ] `npm test`, both `tsc`s green
- [ ] `plans/README.md` updated

## STOP conditions

- `@cloudflare/vitest-pool-workers` can't run against this worker (version
  mismatch with wrangler 4.x) — report versions tried; do not downgrade
  wrangler.
- sync-manager proves untestable without refactoring its imports (hard-wired
  singletons) — report the exact coupling; refactoring it is its own plan.
- Step 5: `getSyncPayloads` needs >1 non-additive repository change.

## Maintenance notes

- Plans 131/132 (pairing/device-credential changes) MUST extend the worker
  suite — that's half the reason it exists.
- Reviewer on Step 5: confirm ordering guarantees didn't change (the map is
  keyed lookup; the loop order still drives apply order).
