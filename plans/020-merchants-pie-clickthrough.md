# Plan 020: Make the Merchants Top-5 pie + legend click through to merchant detail

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report. When done, update this
> plan's status row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat b0fda83d..HEAD -- src/routes/MerchantsTab.tsx`
> If the file changed since this plan was written, read it and compare against the
> "Current state" excerpt before proceeding; on a structural mismatch STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx (actionability / drill-down)
- **Planned at**: commit `b0fda83d`, 2026-06-16

## Why this matters

On the Merchants view the table rows already drill into a merchant
(`Link to="/cash-flow/merchants/$merchantName"`), but the prominent **Top-5
spend pie and its legend are dead ends** — you can see your biggest merchant in
the chart but can't click it to go there; you have to scroll and find the same
name in the table. Making the pie slices and legend rows navigate to the same
detail route closes a drill-down dead-end and matches the interaction the table
already offers. (The audit's broader "charts aren't clickable" theme is mostly
resolved elsewhere — the category donut in `CategoriesRoute` already supports
click-to-filter — so this plan targets the one remaining concrete gap.)

## Current state

`src/routes/MerchantsTab.tsx`:

- The pie data folds the remainder into a non-navigable 「其他」slice
  (`:43-47`): `top5Pie = [...top5, { name: "其他", value: rest, color: "var(--ns-border)" }]`.
- The pie and its legend rows have **no onClick / no Link** (`:75-105`):
```tsx
<Pie data={top5Pie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} stroke="none" paddingAngle={2}>
  {top5Pie.map((m) => <Cell key={m.name} fill={m.color} />)}
</Pie>
...
{top5Pie.map((m) => (
  <div key={m.name} className="text-body" style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--ns-border)", paddingBottom: 6 }}>
    <span style={{ width: 10, height: 10, borderRadius: 3, background: m.color, flexShrink: 0 }} />
    <span style={{ flex: 1, minWidth: 0, … }}>{m.name}</span>
    …
  </div>
))}
```
- The **working drill-down pattern to mirror** is the table row (`:119-134` mobile,
  `:154-159` desktop): a `Link` from `@tanstack/react-router` to
  `to="/cash-flow/merchants/$merchantName"` with `params={{ merchantName: r.name }}`.
- `Link` and `useNavigate` availability: `Link` is already imported in the table
  section. Confirm the import at the top of the file; if only `Link` is needed,
  no new import is required. The component receives the merchant rows as
  `allMerchantSpend` (each `{ name, amount, … }`).

**Convention notes**: zh-TW-first; `cursor: pointer` + a subtle hover is the
established affordance (see the desktop table row's `onMouseEnter` background
swap). The 「其他」slice/legend must **not** navigate (it is an aggregate, not one
merchant).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | 0 errors |
| Build | `npm run build` | exit 0 |
| Tests | `npm run test` | all pass |
| Visual | `npm run dev` + browser | Step 3 |

## Scope

**In scope**: `src/routes/MerchantsTab.tsx` only.

**Out of scope**:
- The pie data computation (`top5Pie`) — keep the Top-5 + 其他 fold as-is.
- The table rows (already navigate — do not touch).
- `CategoriesRoute` / `CategoriesTab` donuts (out of scope here; 019 covers them).
- The CashFlow top-merchant card and FIRE income→curve actionability items — see
  plan 023.

## Steps

### Step 1: Make legend rows navigate (skip 其他)
Wrap each non-「其他」legend row in a `Link` to the merchant detail route, mirroring
the table row's link. For the 「其他」row, render the existing non-clickable div.
Sketch:
```tsx
{top5Pie.map((m) => {
  const row = ( /* the existing legend row JSX for m */ );
  return m.name === "其他"
    ? <div key={m.name}>{/* existing row, non-clickable */}</div>
    : (
      <Link key={m.name} to="/cash-flow/merchants/$merchantName" params={{ merchantName: m.name }}
            style={{ textDecoration: "none", color: "inherit", cursor: "pointer" }}>
        {/* existing row markup */}
      </Link>
    );
})}
```
Preserve the existing row styling (color swatch, name, amount, percent).
**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Make pie slices navigate (skip 其他)
Add `onClick` to the `<Pie>` (recharts passes the clicked datum). Use the router
to navigate; do nothing for 「其他」:
```tsx
const navigate = useNavigate(); // add import if not present
...
<Pie
  data={top5Pie} dataKey="value" nameKey="name" cx="50%" cy="50%"
  innerRadius={50} outerRadius={80} stroke="none" paddingAngle={2}
  style={{ cursor: "pointer" }}
  onClick={(d: { name?: string }) => {
    if (d?.name && d.name !== "其他") {
      void navigate({ to: "/cash-flow/merchants/$merchantName", params: { merchantName: d.name } });
    }
  }}
>
```
If `useNavigate` is not already imported, add it to the existing
`@tanstack/react-router` import.
**Verify**: `npx tsc --noEmit` → exit 0; `npm run build` → exit 0.

### Step 3: Visual confirm
Run `npm run dev`, open Cash Flow → 商家 tab with demo data.
**Verify**:
- Clicking a colored pie slice navigates to that merchant's detail page.
- Clicking a legend row (other than 其他) navigates to the same page.
- The 「其他」slice and legend row do nothing (no navigation, no crash).
- Table rows still navigate as before.

## Test plan

- UI navigation wiring; no new unit test required. Existing suite stays green
  (`npm run test`).

## Done criteria

ALL must hold:
- [ ] `grep -n "merchants/\$merchantName" src/routes/MerchantsTab.tsx` → ≥ 3
      matches (table mobile, table desktop, and the new legend/pie wiring)
- [ ] `npx tsc --noEmit` exits 0; `npm run build` exits 0; `npm run lint` 0 errors; `npm run test` passes
- [ ] `top5Pie` computation unchanged (`git diff` shows only render/handler additions)
- [ ] No files outside `src/routes/MerchantsTab.tsx` modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report (do not improvise) if:
- The merchant detail route path or param name differs from
  `/cash-flow/merchants/$merchantName` + `merchantName` (check `router.tsx`).
- recharts' `onClick` datum shape doesn't expose `name` in this version — report
  the installed `recharts` version and the actual payload rather than guessing.
- `npm run build` fails twice after a reasonable fix attempt.

## Maintenance notes

- If `top5Pie` is ever expanded to top-N, the 「其他」skip-guard must stay keyed on
  the literal label 「其他」(or refactor to a `navigable: boolean` flag on the datum).
- Reviewer: confirm the 「其他」aggregate is not made navigable (it has no single
  merchant to route to).
