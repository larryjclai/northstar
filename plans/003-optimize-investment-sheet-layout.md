# Plan 003: Reduce cognitive load in InvestmentAddSheet form

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 2be0fe43..HEAD -- src/routes/InvestmentsAddSheet.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: ux
- **Planned at**: commit `2be0fe43`, 2026-06-26

## Why this matters

The investment transaction drawer presents 5–8 input fields in a single uninterrupted column with a uniform `gap: 18`. Although the fields themselves are already partially grouped (e.g. Date + Account share a 2-column grid, Qty + Price + Fee share a 3-column grid), there is no visual separator **between** these groups. Users scanning the form have no landmarks to orient by — it reads as one continuous wall of inputs. Adding lightweight visual dividers between the logical groups reduces cognitive load by chunking the form into ≤4 items per group (the Working Memory Rule).

## Current state

The relevant file:
- `src/routes/InvestmentsAddSheet.tsx` — investment transaction entry form (line 460–845).

The transaction mode form has this structure (line 546–840):

```
┌─────────────────────────────────────────┐
│ Side tabs (buy/sell/dividend/split/…)   │  ← line 548-564, outside scroll area
├─────────────────────────────────────────┤
│ Scrollable content (flex col, gap:18)   │  ← line 566
│                                         │
│   [Group A: 標的識別]                    │
│   ├─ Ticker + quick chips               │  ← line 568-594
│   ├─ Date  |  Account (grid 1fr 1fr)   │  ← line 596-622
│   │                                     │  ← ⚠️ NO VISUAL BREAK HERE
│   [Group B: 金額明細 — side-dependent]   │
│   ├─ (buy/sell) Instrument toggle       │  ← line 722-741  (conditional)
│   ├─ (buy/sell) Qty | Price | Fee       │  ← line 742-800  (grid 3-col)
│   ├─ (dividend) Sub-toggle + fields     │  ← line 640-702  (conditional)
│   ├─ (split) Ratio field                │  ← line 625-639  (conditional)
│   ├─ (reduction) Qty | Cash fields      │  ← line 703-716  (conditional)
│   │                                     │  ← ⚠️ NO VISUAL BREAK HERE
│   [Group C: 附加資訊]                    │
│   ├─ Note                               │  ← line 804-808
│   ├─ FIFO impact preview (Card)         │  ← line 810-819
│   ├─ T+2 settlement warning             │  ← line 821-825
│   └─ Status message                     │  ← line 826
└─────────────────────────────────────────┘
│ Footer: Cancel | Submit                  │  ← line 829-839
└─────────────────────────────────────────┘
```

The scrollable container is on line 566:
```tsx
<div style={{ flex: 1, overflow: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
```

All children sit at the same hierarchy with uniform `gap: 18` — no borders, no padding changes, no background differences between groups.

Repo conventions:
- Visual dividers use `border-bottom: 1px solid var(--ns-border)` with `paddingBottom` + `marginBottom` for breathing room.
- The drawer header already uses `borderBottom: "1px solid var(--ns-border)"` (line 473).
- Design tokens: `--ns-border` for separator lines, `--ns-s-5` (20px) for section gaps.

## Commands you will need

| Purpose   | Command         | Expected on success |
|-----------|-----------------|---------------------|
| Typecheck | `npm run build` | exit 0, no errors   |
| Lint      | `npm run lint`  | exit 0              |

## Scope

**In scope**:
- `src/routes/InvestmentsAddSheet.tsx` — only the scrollable content area (lines 566–827)

**Out of scope**:
- The Side tabs section (lines 548-564) — already visually separated by its own padding.
- The Footer section (lines 829-839) — already separated by `borderTop`.
- The snapshot mode form (lines 508-544) — different flow, different issue.
- Any state logic, validation, or `useEffect` hooks — zero changes to behavior.

## Git workflow

- Branch: `fix/ai-ui-phase-3`
- Commit message: `refactor(ui): add visual group separators to InvestmentsAddSheet form`

## Steps

### Step 1: Add a divider after Group A (Ticker + Date/Account)

Insert a visual separator **after** the Date + Account grid (after line 622, before line 624).

The Date + Account grid ends at line 622 (`</div>`). The side-specific fields comment starts at line 624 (`{/* Side-specific numeric fields */}`).

Insert between them:
```tsx
{/* ── Group separator: 標的識別 → 金額明細 ── */}
<div style={{ borderBottom: "1px solid var(--ns-border)", margin: "2px 0" }} />
```

This creates a lightweight 1px line that visually separates "which asset, when, where" from "how much".

**Verify**: `npm run build` → exit 0

### Step 2: Add a divider after Group B (side-specific fields)

The side-specific block ends at line 802 (`)}`) — this is the closing brace of the outer ternary that chooses between split / dividend / reduction / buy-sell fields.

The Note field starts at line 804 (`{/* Note */}`).

Insert between lines 802 and 804:
```tsx
{/* ── Group separator: 金額明細 → 附加資訊 ── */}
<div style={{ borderBottom: "1px solid var(--ns-border)", margin: "2px 0" }} />
```

**Verify**: `npm run build` → exit 0

### Step 3: Verify visual result

After both dividers are in place, the scrollable form area should have 3 visually distinct zones:

1. **標的識別** (Ticker, Date, Account) — "What are you trading and where?"
2. **金額明細** (Qty, Price, Fee — varies by side) — "How much?"
3. **附加資訊** (Note, FIFO preview, warnings) — "Anything else?"

Each group has ≤4 fields, satisfying the Working Memory Rule.

**Verify**:
- `npm run build` → exit 0
- `npm run lint` → exit 0
- `grep -c "Group separator" src/routes/InvestmentsAddSheet.tsx` → returns `2`

## Test plan

- Manual verification: Open the "新增交易" drawer from the Investments page. Switch between all 5 side tabs (買進 / 賣出 / 股利 / 拆股 / 減資) and confirm:
  - Two thin horizontal lines divide the form into 3 zones in every mode.
  - No layout shift or misalignment occurs when switching tabs.
  - The FIFO preview card remains in the bottom group.
- `npm run build` → exit 0
- `npm run lint` → exit 0

## Done criteria

- [ ] `npm run build` exits 0
- [ ] `npm run lint` exits 0
- [ ] `grep -c "Group separator" src/routes/InvestmentsAddSheet.tsx` returns `2`
- [ ] No files outside the in-scope list are modified (`git diff --name-only`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The code at the locations in "Current state" doesn't match the excerpts (codebase drifted).
- Line 622 or line 802 are not where the groups end — the conditional rendering structure has changed. STOP and re-map the structure before inserting dividers.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- If new fields are added to the form, place them in the correct group (A/B/C) and ensure the dividers still sit between groups, not inside them.
- The dividers use `var(--ns-border)` to respect theme changes (light/dark mode).
- This plan is intentionally minimal (2 dividers, zero restructuring). A future plan could add subtle background tinting per group or progressive disclosure (collapsible sections), but that's a separate scope.
