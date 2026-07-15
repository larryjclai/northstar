# Plan 209: Make the 總覽 top banners dismissable — hidden until the same situation *recurs*

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md` — unless a
> reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 087a9b2e..HEAD -- src/routes/DashboardRoute.tsx src/state/uiPreferences.ts`
> Plan 208 also edits `DashboardRoute.tsx` (badge region ~1154; this plan edits
> ~970–1031). If 208 landed first, expect that diff and proceed; find excerpts
> by content.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW–MED (new persisted preference state; wrong fingerprint design makes dismissal either useless or permanent)
- **Depends on**: none (coordinate with 208 — same file, different region)
- **Category**: dx / UX
- **Planned at**: commit `087a9b2e`, 2026-07-15
- **Source**: operator, 2026-07-15 — "總覽最上面的兩條 header…直接卡了 2 列。收起來或 dismiss 掉，等下次又發生同樣情形再出現。"

## Why this matters

The 總覽 opens with up to two full-width rows before any data: the 資料健康
status strip and the 預算超支 alert. Both are **stateless** — they render every
visit as long as the condition holds, with no way to acknowledge them. A budget
overspend in particular holds for the **rest of the month** once triggered, so
the user reads the same alert every day for weeks. The operator asked for
exactly the right semantics: **dismiss = "I've seen this occurrence", reappear =
"this is a new occurrence."**

The design core is the **fingerprint**: dismissal is stored *with the state it
dismissed*, and the banner returns only when the state's identity changes.
Getting the fingerprint granularity right is the whole plan:

- Too fine (include the overspend **amount**) → the amount drifts with every
  transaction, the banner returns daily, dismissal is useless.
- Too coarse (just "overspend happened") → a *new category* blowing its budget
  stays hidden behind an old dismissal — **a real alert suppressed, which in a
  finance app is worse than the noise we started with.**

## Current state

All three banner surfaces live at `src/routes/DashboardRoute.tsx:~970-1031`:

**1. Unhealthy 資料健康 banner** (`:~984-1013`) — expandable, already has
click-to-expand state `healthExpanded`:

```tsx
          <div
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, cursor: "pointer", userSelect: "none" }}
            onClick={() => setHealthExpanded((v) => !v)}
          >
            <span>
              <strong>資料健康：{dataHealthReport.issues.length} 項提醒</strong>
```

Issues have `id`, `kind`, `message`, `severity` (see `:998-1001`). Find the
type's source (imported into this file — likely `src/domain/` or a hook) and
confirm `id` is stable per issue occurrence before using it in fingerprints;
if `id` is regenerated per render, key on `kind`+`message` instead. **Check,
don't assume.**

**2. Healthy one-liner** (`:1014-1021`) — note the comment: this compact form is
itself a **recorded design decision**:

```tsx
      ) : hasAnyData ? (
        // All green → collapse to one quiet line so the feature stays
        // discoverable instead of vanishing entirely.
        <div className="text-xs" style={{ ... }}>
          <span style={{ width: 7, height: 7, borderRadius: 99, background: "var(--ns-pos)", flexShrink: 0 }} />
          資料健康：報價、匯率與帳戶餘額都正常。
        </div>
```

This plan **overrides that decision deliberately, with the operator's explicit
request as the authority** — and the mechanism preserves its intent: the banner
only vanishes after an explicit user dismissal, and *any* health-state change
brings it back. **Update the comment** to record the new tradeoff; do not leave
it contradicting the code.

**3. 預算超支 banner** (`:1022-1031`):

```tsx
      {overBudget.length > 0 ? (
        <div className="text-body" style={{ ... background: "var(--ns-neg-soft)", ... }}>
          <span>
            <strong>{overBudget.map((c) => c.name).join("、")}</strong> 本月已超支
            &nbsp;·&nbsp; 超出 {formatMoney(overBudget.reduce((s, c) => s + (c.spent - (c.budget ?? 0)), 0), primaryCurrency)}
          </span>
          <Button variant="ghost" size="xs" className="ml-auto" render={<Link to="/cash-flow/categories" />}>查看分類 →</Button>
```

### The persistence precedent — `src/state/uiPreferences.ts`

Zustand store persisted to localStorage. Existing dismissal precedent:
`onboardingDismissed` (field `:52-53`, setter `:90`, default `:162`, legacy-key
migration `:144`). **Follow this pattern exactly** for the new field. Note the
repo gotcha (`AGENTS.md`): vitest jsdom has no `localStorage` — stub per-test
with `vi.stubGlobal` if you touch the store in tests.

### Conventions

- COSS `<Button>` for the dismiss control; icon-only buttons need **both**
  `aria-label` and `title` (session-established rule; most of the app has only
  one or the other — new code gets both).
- `Trash` is delete; the dismiss glyph here is `<X />`. Phosphor `size` prop is
  inert inside `<Button>` (component CSS governs) — don't fight it.
- **No `window.confirm`** (broken in Tauri) — not needed here anyway; dismissal
  is low-stakes and reversible by state change.
- Conventional commits.

## Fingerprint design (the decided spec — implement as written)

New pure module `src/domain/bannerFingerprint.ts`:

```ts
/** Identity of the current data-health state. Dismissing stores this string;
 *  the banner re-renders only when the live fingerprint differs. */
export function healthFingerprint(issues: Array<{ kind: string; message: string }>): string {
  if (issues.length === 0) return "ok";
  return issues.map((i) => i.kind).sort().join("|");
}

/** Identity of the current overspend occurrence: month + WHICH categories.
 *  Amount is deliberately excluded — it drifts with every transaction and
 *  would resurrect the banner daily, making dismissal useless. A NEW category
 *  overspending, or a new month, changes the fingerprint → banner returns. */
export function overBudgetFingerprint(monthKey: string, categoryNames: string[]): string {
  return `${monthKey}:${[...categoryNames].sort().join("|")}`;
}
```

(Exact key choice for health — `kind` vs `kind+id` — per your Step 1 finding on
id stability. The properties that must hold: same situation → same string;
issue fixed or new issue appears → different string; string is stable across
renders.)

Store shape in `uiPreferences`:
`dismissedBanners: { dataHealth?: string; overBudget?: string }` +
`setDismissedBanner(key, fingerprint)`. Render rule, identical for all three
surfaces: **render the banner iff `fingerprint !== dismissedBanners[key]`.**

Semantics this yields (all intended):
- Dismiss healthy line → hidden while healthy; **any** issue appearing → shows
  (fingerprint changed); issues fixed → healthy line returns? **No** — back to
  `"ok"` which equals the stored dismissal → stays hidden. Correct: the user
  said "don't show me 'all is well' again."
- Dismiss unhealthy banner (3 stale quotes) → hidden; a 4th issue or a
  different kind → returns. Same issues persisting → stays hidden.
- Dismiss overspend (購物, July) → hidden; 餐飲 also overspends → returns
  (with both names); August 購物 overspends → returns. Amount grows → stays
  hidden.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm install` | exit 0 (revert `package-lock.json` churn; do not commit it) |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | 121 files / 1252 tests pass (before yours) |
| One file | `npm test -- bannerFingerprint` | your new tests pass |
| Lint | `npm run lint` | 0 errors |
| Dev | `npm run dev` | Vite dev server |

## Scope

**In scope**:
- `src/domain/bannerFingerprint.ts` (create) + `src/domain/bannerFingerprint.test.ts` (create)
- `src/state/uiPreferences.ts` — new field + setter, following `onboardingDismissed`
- `src/routes/DashboardRoute.tsx` — the three banner surfaces (~970–1031) only

**Out of scope** (do NOT touch):
- The banners' **content, math, or trigger conditions** (`dataHealthReport`,
  `overBudget` computation). Dismissal wraps rendering; it never changes what
  counts as unhealthy/overspent.
- The net-worth badge region (~1154) — plan 208's territory.
- Sync — `uiPreferences` is per-device local state; dismissals do **not** sync,
  and that is correct (acknowledgment is per-screen, per-device). Do not add it
  to any sync payload.
- Every other route's banners/toasts.

## Git workflow

- Branch: `feat/ai-dashboard-banner-dismissal` off `main`.
- `git status` first; uncommitted work you did not create → **STOP**, never
  stash. `plans/` files are expected and not yours.
- Commit: `feat(dashboard): 總覽 banner 可關閉，狀態改變時自動重現`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Verify the issue type's stability
Find where `dataHealthReport` comes from and read the issue type. Decide the
health fingerprint key (`kind` list vs `kind+id`) per the stability rule above.
**Verify**: state the type's source file and your key choice in the report.

### Step 2: Create `bannerFingerprint.ts` + tests
Tests (model after any `src/domain/*.test.ts`): same input → same string;
order-insensitive (sorted); `[]` → `"ok"`; new category changes overspend fp;
amount is absent from the signature by construction (type-level — it only takes
names). **Verify**: `npm test -- bannerFingerprint` → all pass.

### Step 3: Extend `uiPreferences`
Field + setter + default, exactly mirroring `onboardingDismissed`'s pattern
(including persistence). No legacy-key migration needed (new field).
**Verify**: `npx tsc --noEmit` → 0.

### Step 4: Wire the three surfaces
For each: compute the live fingerprint, render iff it differs from the stored
dismissal, and add the dismiss control:

- Healthy one-liner and overspend banner: an icon-only
  `<Button variant="ghost" size="icon-xs" aria-label="關閉提示" title="關閉提示"><X /></Button>`
  at the row's end (`ml-auto` for the healthy line; the overspend banner already
  has a `ml-auto` button — place the X after it).
- Unhealthy banner: the header row is already a click-to-expand target — put the
  X **inside** the right side next to the 收合/展開 affordance, and
  `e.stopPropagation()` so dismissing doesn't toggle expansion.
- Update the stale "stays discoverable" comment (`:1015-1016`) to describe the
  new contract: hidden only after explicit dismissal, returns on any
  state-identity change.

**Verify**: `npx tsc --noEmit` → 0; `npm run lint` → 0 errors.

### Step 5: Gates + live check
`npm test` (1252 + yours), then `npm run dev`:
1. Dismiss the healthy line → gone; reload → still gone (persistence).
2. Dismiss the overspend banner → gone; add an expense to the *already-over*
   category (amount grows) → **stays gone**.
3. Push a *second* category over budget → banner **returns** naming both.
4. X on the unhealthy banner doesn't toggle expansion (if you can produce an
   unhealthy state; if not, say so).

Report which you verified.

## Test plan

Covered in Step 2 — the fingerprint module is the testable core and gets real
unit tests. The wiring (render-iff-different) is a one-line comparison per
surface; jsdom tests for it would need the full dashboard mounted (DB-backed
hooks) for negligible marginal proof. Gate: suite at 1252 + new fingerprint
tests, all green.

## Done criteria

- [ ] `src/domain/bannerFingerprint.ts` + test exist; ≥5 tests pass
- [ ] `grep -n "dismissedBanners" src/state/uiPreferences.ts` → field + setter + default
- [ ] All three surfaces render-iff-fingerprint-differs; each has a dismiss control with **both** `aria-label` and `title`
- [ ] The `:1015` "stays discoverable" comment updated
- [ ] `grep -n "stopPropagation" src/routes/DashboardRoute.tsx` → present on the unhealthy banner's X
- [ ] Banner trigger math untouched: `git diff -- src/routes/DashboardRoute.tsx` shows no change to `overBudget`/`dataHealthReport` computation
- [ ] `npx tsc --noEmit` 0; `npm run lint` 0 errors; `npm test` all green (1252 + new)
- [ ] Only the 4 in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

- The banner block (~970–1031) doesn't match the excerpts (beyond plan-208
  drift).
- `dataHealthReport` issues lack any stable identity (no `kind`) — fingerprint
  design needs rethinking; report.
- `uiPreferences` turns out to sync across devices (it should not — verify) —
  dismissal syncing is a product decision, STOP and ask.
- You're tempted to auto-dismiss, add TTLs, or dismiss-forever options. The
  fingerprint contract is the decided spec.

## Maintenance notes

- **The fingerprint contract is the load-bearing piece**: identity, not
  severity or amount. Anyone adding a field to the fingerprint must ask "does
  this drift without the situation actually changing?" — if yes, it doesn't
  belong.
- New dashboard banners should reuse `dismissedBanners` with a new key and a
  fingerprint function in the same module — not invent a parallel mechanism.
- Dismissals are deliberately **per-device** (uiPreferences is local). If users
  someday expect cross-device acknowledgment, that is a sync-payload decision
  for the operator, not a quick add.
- Reviewer: check the overspend fingerprint takes **names only** (no amounts),
  and that the unhealthy banner's X stops propagation.
