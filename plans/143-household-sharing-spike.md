# Plan 143: Household sharing (Connect Duo) — design spike

> **Executor instructions**: This is a DESIGN/SPIKE plan — the deliverable is
> a design document with open questions, NOT code. Do not modify any source
> file. Write the deliverable to `docs/household-sharing-spike.md`. On a STOP
> condition, stop and report. Update this plan's status row in
> `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 65fe04c1..HEAD -- src/features/connect worker/ docs/architecture.md`
> Also check plans/README.md rows for 130–132: this spike must design on top
> of their END states (per-device credentials, ECDH pairing) — read those
> plan files first.

## Status

- **Priority**: P3 (biggest bet — design before any build)
- **Effort**: M (investigation + writing; the build would be L/XL)
- **Risk**: — (paper only; the FEATURE risk is HIGH: crypto/privacy boundary)
- **Depends on**: read plans/130–132 (design against their target state)
- **Category**: direction
- **Planned at**: commit `65fe04c1`, 2026-07-09

## Why this matters

Households are the largest stated-but-undelivered surface: PRODUCT.md names
households as first-class users; `docs/product-spec.md:17` lists "Connect
Duo: household sharing with selected shared accounts";
`docs/architecture.md:77-80` sketches shared encrypted projections; the data
model reserves `isSharedToHousehold` on accounts (`src/domain/types.ts` — and
it's already in the SQLite schema + sync payloads: grep
`is_shared_to_household` in repositories.ts). Zero feature code exists. A
locked constraint applies: **household sharing must not collapse personal
privacy** (AGENTS.md invariant; architecture.md's shared-projection-only
model). Before anyone builds, the key model, the projection content, and the
revocation story need decisions — this spike produces them as concrete
options.

## Investigation inputs (read all)

- `docs/architecture.md` Household Sharing section (post-plan-139 it should
  describe the Worker backend — if 139 hasn't run, mentally substitute
  Worker for Supabase).
- `docs/product-spec.md` Connect Duo scope.
- `src/domain/types.ts` `isSharedToHousehold` + every consumer
  (grep — likely only schema plumbing today; confirm and list).
- The sync stack as plans 130–132 leave it: SecretStore-held vault key +
  device keypairs (130), ECDH pairing + `/keys/:device` wrapped-key mailbox
  (131), per-device credentials + real revocation (132). The household key
  should REUSE these mechanisms, not invent new ones.
- Worker schema (`worker/migrations/`) — what a `households` /
  `household_members` / shared-envelope namespace would sit next to.

## The deliverable — `docs/household-sharing-spike.md` containing:

1. **Product slice definition**: what Duo v1 shares. Grounded default from
   the docs: selected accounts' *projections* (balance + name + type, and the
   transactions of shared accounts?) — propose exactly what fields cross the
   boundary, and what NEVER does (private notes per architecture.md; personal
   accounts; goals?). One page.
2. **Key model options** (the heart — 2–3 options, each ≤1 page):
   e.g. (a) Household Space Key: a second symmetric key, wrapped to each
   member's device public keys via the existing `/keys` mailbox; shared
   envelopes encrypted under it in a separate namespace; (b) per-pair
   wrapping without a shared key (sender wraps to each recipient device);
   (c) others you identify. For each: how invite works (reuse the 131 pairing
   UX?), how MEMBER revocation works (leaves the household — can they read
   past data? future data?), key-rotation cost, and what the relay learns
   (metadata analysis: it must not learn balances; can it learn the household
   graph? — state it honestly).
3. **Sync-protocol delta**: new worker tables/endpoints, envelope namespace,
   cursor model for shared streams; how `isSharedToHousehold` toggling
   publishes/unpublishes an account (and what "unshare" means for data
   already synced to the partner — deletion request? tombstone honor
   system? state the honest answer).
4. **Client UX sketch** (text, not pixels): where sharing lives in Settings /
   Accounts; the invite flow; how shared accounts render for the partner
   (read-only? merged into their net worth? — product-spec may say; cite it).
5. **Risks & rejected ideas**: including why NOT to reuse the personal vault
   key for shared data (spell it out), and any option you rejected.
6. **Open questions for the operator** (numbered, each with a recommended
   answer) + a coarse phased build estimate (worker / crypto / client / UX).

## Commands

Read-only exploration (`grep`, `git log`). No build/test runs required.

## Scope

**In scope**: `docs/household-sharing-spike.md` (new). Nothing else besides
the plans/README.md status row.
**Out of scope**: ANY code; any worker schema change; committing to a build.

## Done criteria

- [ ] Spike doc exists with all six sections; every code claim cites
      file:line; every product claim cites the doc it came from
- [ ] ≥2 key-model options with honest revocation + metadata analysis each
- [ ] The privacy invariant (no collapse of personal privacy; relay never
      readable) is explicitly checked against each option
- [ ] `plans/README.md` updated: "awaiting operator decision on key model +
      slice"

## STOP conditions

- Plans 130–132 are unexecuted AND their designs look likely to change
  (e.g. 132's report flagged a redesign) — a household key model built on
  shifting device-credential ground is wasted; report and pause.

## Maintenance notes

- If the operator picks an option, the build should be planned as its own
  `/improve plan` pass per phase (worker, crypto, client, UX) — do not turn
  this spike into a mega-plan.
- The spike doc becomes the ADR for the household trust model; keep it
  updated as decisions land.
