# Plan 002: Replace ns-eyebrow with proper typographic hierarchy

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 2be0fe43..HEAD -- src/routes/ src/components/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `2be0fe43`, 2026-06-26

## Why this matters

The `.ns-eyebrow` class (`font-family: mono; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: muted`) is used **133 times across 34 files**. Placing a small, uppercase, tracked-out monospace kicker above every section is an "AI grammar" anti-pattern: it creates a uniform, monotonous rhythm that makes every page feel scaffolded from the same template. Real design uses varied typography, weight, and whitespace to create hierarchy.

However, **not all 133 usages are the same thing**. There are 3 distinct usage patterns, and each needs a different replacement:

### Pattern A: Form labels (≈50 instances)
```tsx
<label className="ns-eyebrow" style={{ display: "block", marginBottom: 6 }}>股數</label>
```
Used in `InvestmentsAddSheet.tsx` (18×), `ReconcileRoute.tsx`, `FIRECalculatorRoute.tsx`, `AccountsRoute.tsx` (wizard steps), `ManualPriceImportWizard.tsx`, `InvestmentImportWizard.tsx`, settings sections, and `Field.tsx` component.

### Pattern B: Section/card headers (≈60 instances)
```tsx
<div className="ns-eyebrow" style={{ marginBottom: 4 }}>Upcoming</div>
```
Used in `DashboardRoute.tsx` (16×), `CashFlowRoute.tsx` (7×), `InvestmentsAnalyticsTab.tsx` (16×), `CategoriesTab.tsx`, `CategoryDetailRoute.tsx`, `GoalsRoute.tsx`, `HoldingDetailRoute.tsx`, `InvestmentsRoute.tsx`, `MerchantsTab.tsx`.

### Pattern C: Step/sequence indicators (≈8 instances)
```tsx
<div className="ns-eyebrow" style={{ marginBottom: 6 }}>步驟 1 / 4</div>
```
Used in `AccountsRoute.tsx` (wizard), `InvestmentImportWizard.tsx` (wizard steps like `1 · 選擇投資帳戶`).

## Current state

The CSS definition in `src/styles/globals.css:510-516`:
```css
.ns-eyebrow {
  font-family: var(--ns-font-mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ns-fg-muted);
}
```

The project uses these utility classes (defined in `globals.css`, NOT Tailwind):
- `.muted` → `color: var(--ns-fg-muted)`
- `.dim` → `color: var(--ns-fg-dim)`
- `.mono` → `font-family: var(--ns-font-mono); font-variant-numeric: tabular-nums`
- `.num` → `font-family: var(--ns-font-mono); font-variant-numeric: tabular-nums lining-nums`
- `text-xs` → `font-size: 11px`
- `text-sm` → `font-size: 13px`
- `text-caption` → `font-size: 10.5px`

The `Field.tsx` component (used in Settings forms) wraps its label with `ns-eyebrow`:
```tsx
// src/components/Field.tsx:6-12
export function Field({ label, children }: PropsWithChildren<{ label: string }>) {
  return (
    <label className="grid gap-1.5">
      <span className="ns-eyebrow">{label}</span>
      {children}
    </label>
  );
}
```

## Commands you will need

| Purpose   | Command                        | Expected on success |
|-----------|--------------------------------|---------------------|
| Typecheck | `npm run build`                | exit 0, no errors   |
| Lint      | `npm run lint`                 | exit 0              |
| Count     | `grep -rn "ns-eyebrow" src/ \| grep -v globals.css \| wc -l` | decreasing toward 0 |

## Scope

**In scope** (34 files):
- `src/components/Field.tsx` — shared form label component
- `src/components/AppShell.tsx`
- `src/components/IconPicker.tsx`
- `src/components/Metric.tsx`
- `src/components/NetWorthProjectionCard.tsx`
- `src/components/OnboardingOverlay.tsx`
- `src/components/QuickAdd.tsx`
- All `.tsx` files in `src/routes/` and `src/routes/settings/`

**Out of scope**:
- `src/styles/globals.css` — keep the `.ns-eyebrow` class definition intact (removing it can be a separate cleanup once all usages are gone).

## Git workflow

- Branch: `fix/ai-ui-phase-3`
- One commit per batch (step). Message format: `refactor(ui): replace ns-eyebrow with typed labels in <batch>`

## Replacement rules

### For Pattern A (form labels):

Replace `className="ns-eyebrow"` with inline style for consistency with the project's form label convention.

Before:
```tsx
<label className="ns-eyebrow" style={{ display: "block", marginBottom: 6 }}>股數</label>
```

After:
```tsx
<label className="text-xs" style={{ display: "block", marginBottom: 6, color: "var(--ns-fg-muted)", fontWeight: 500 }}>股數</label>
```

Key differences: no `text-transform: uppercase`, no `letter-spacing: 0.12em`, no mono font. Just a small, slightly weighted, muted label.

For `Field.tsx` specifically, change line 9:
```tsx
// Before
<span className="ns-eyebrow">{label}</span>
// After
<span className="text-xs" style={{ color: "var(--ns-fg-muted)", fontWeight: 500 }}>{label}</span>
```

### For Pattern B (section/card headers):

Replace `className="ns-eyebrow"` with a quieter section header style.

Before:
```tsx
<div className="ns-eyebrow" style={{ marginBottom: 4 }}>Upcoming</div>
```

After:
```tsx
<div className="text-xs" style={{ marginBottom: 4, color: "var(--ns-fg-muted)", fontWeight: 500 }}>Upcoming</div>
```

If the eyebrow has a custom `fontSize` override (e.g. `fontSize: 10`), keep that override and just remove the class:
```tsx
// Before
<div className="ns-eyebrow" style={{ fontSize: 10, marginBottom: 4 }}>本月現金流</div>
// After
<div style={{ fontSize: 10, marginBottom: 4, color: "var(--ns-fg-muted)", fontWeight: 500 }}>本月現金流</div>
```

### For Pattern C (step/sequence indicators):

**Keep `ns-eyebrow`**. Numbered sequences (`步驟 1 / 4`, `1 · 選擇投資帳戶`) are a legitimate use of the monospaced, tracked style — the numbering carries real ordering information and the mono font helps alignment. This is "one deliberate numbered sequence" (valid) not "numbered eyebrows on every section" (anti-pattern).

## Steps

### Step 1: Fix the shared `Field.tsx` component

This is the highest-leverage change — every Settings form that uses `<Field>` will automatically update.

In `src/components/Field.tsx:9`, change:
```tsx
<span className="ns-eyebrow">{label}</span>
```
to:
```tsx
<span className="text-xs" style={{ color: "var(--ns-fg-muted)", fontWeight: 500 }}>{label}</span>
```

**Verify**: `npm run build` → exit 0

### Step 2: Fix top-usage routes (DashboardRoute, InvestmentsAddSheet, InvestmentsAnalyticsTab)

These 3 files account for 50 of 133 instances. Apply Pattern A or B replacement rules as appropriate per usage context:
- `src/routes/DashboardRoute.tsx` (16 instances — all Pattern B)
- `src/routes/InvestmentsAddSheet.tsx` (18 instances — all Pattern A form labels)
- `src/routes/InvestmentsAnalyticsTab.tsx` (16 instances — all Pattern B)

**Verify**: `npm run build` → exit 0

### Step 3: Fix medium-usage routes

- `src/routes/AccountsRoute.tsx` (8 instances — Pattern A for labels, **keep Pattern C for wizard steps like `步驟 1 / 4`**)
- `src/routes/CashFlowRoute.tsx` (7 instances — Pattern B)
- `src/routes/InvestmentImportWizard.tsx` (7 instances — **keep Pattern C for `1 · 選擇投資帳戶` etc**, fix the rest as Pattern A)
- `src/routes/settings/TradingFeesSection.tsx` (5 instances — Pattern A)
- `src/routes/settings/ExportSection.tsx` (5 instances — Pattern A/B)

**Verify**: `npm run build` → exit 0

### Step 4: Fix remaining routes (4 or fewer instances each)

Apply the same A/B/C rules to all remaining files:
- `src/routes/ReconcileRoute.tsx` (4)
- `src/routes/MerchantsTab.tsx` (4)
- `src/routes/CategoryDetailRoute.tsx` (4)
- `src/routes/CategoriesTab.tsx` (4)
- `src/routes/MerchantDetailRoute.tsx` (3)
- `src/routes/ManualPriceImportWizard.tsx` (3)
- `src/routes/InvestmentsRoute.tsx` (3)
- `src/routes/FIRECalculatorRoute.tsx` (3)
- `src/routes/settings/FxSection.tsx` (2)
- `src/routes/TransactionsRoute.tsx` (1)
- `src/routes/SettingsRoute.tsx` (1)
- `src/routes/RecurringInvestmentsTab.tsx` (1)
- `src/routes/HoldingDetailRoute.tsx` (1)
- `src/routes/GoalsRoute.tsx` (1)
- `src/routes/AnnualReportRoute.tsx` (1)
- `src/routes/settings/MerchantsSection.tsx` (1)
- `src/routes/settings/GeneralSection.tsx` (1)
- `src/routes/settings/ConnectSection.tsx` (1)
- `src/routes/settings/CategoriesSection.tsx` (1)

**Verify**: `npm run build` → exit 0

### Step 5: Fix remaining component files

- `src/components/AppShell.tsx` (2)
- `src/components/IconPicker.tsx` (1)
- `src/components/Metric.tsx` (1)
- `src/components/NetWorthProjectionCard.tsx` (2)
- `src/components/OnboardingOverlay.tsx` (2)
- `src/components/QuickAdd.tsx` (2)

**Verify**: `npm run build` → exit 0

## Test plan

- Manual verification: Check Dashboard, CashFlow, Investments, Accounts, and Settings pages — section headers should look clean, slightly weighted, non-monospace, non-uppercase. Wizard steps (`步驟 1 / 4`) should still look monospaced.
- `npm run build` → exit 0
- `npm run lint` → exit 0

## Done criteria

- [ ] `npm run build` exits 0
- [ ] `npm run lint` exits 0
- [ ] `grep -rn "ns-eyebrow" src/ | grep -v globals.css | grep -v "步驟\|· " | wc -l` returns 0 (all non-sequence instances removed)
- [ ] `grep -rn "ns-eyebrow" src/ | grep -v globals.css | wc -l` returns ≤10 (only legitimate Pattern C step indicators remain)
- [ ] No files outside the in-scope list are modified (`git diff --name-only`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The code at the locations in "Current state" doesn't match the excerpts.
- After completing Step 2, the DashboardRoute visually looks worse (headers vanish or become unreadable) — the replacement rule may need adjustment; STOP and report.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Do **not** use `ns-eyebrow` for new section headers or form labels. Use `text-xs` with `color: var(--ns-fg-muted)` and `fontWeight: 500`.
- The **only** legitimate remaining use of `ns-eyebrow` is for numbered step/sequence indicators where the mono font and tracking aid alignment (Pattern C).
- Once all Pattern C usages are eventually migrated to a dedicated `StepIndicator` component, the `.ns-eyebrow` class in `globals.css` can be deleted.
