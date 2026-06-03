# COSS UI Migration Plan

Phased plan to migrate Northstar's UI to [COSS UI](https://coss.com/ui) (Cal.com's
design system) **without a big-bang rewrite**. Code is unchanged by this document —
it exists so the work can be scheduled and executed in safe increments.

> TL;DR — We are already on COSS UI's exact stack (React 19 + Base UI + Tailwind v4 +
> shadcn copy-paste model). The migration is therefore **not a dependency swap**; it is
> retiring our bespoke `ns-*` token/utility system and ~1,447 inline-style blocks in
> favour of COSS components + semantic Tailwind tokens, screen by screen.

---

## 1. Starting point (facts as of 2026-06-03)

| Aspect | Current state | COSS UI target |
| --- | --- | --- |
| Framework | React 19 | React ✅ same |
| Primitives | `@base-ui-components/react`, `@base-ui/react` | Base UI ✅ same |
| Styling | Tailwind v4 (`@tailwindcss/vite`) + custom `ns-*` CSS vars | Tailwind v4 + semantic tokens |
| Distribution | `shadcn` CLI, `components.json` (`style: base-nova`), `components/ui/` | shadcn-style copy-paste ✅ same |
| Aliases | `@/*` → `src/*` (tsconfig + vite both wired) | `@/` ✅ same |
| Icons | Phosphor + lucide (`iconLibrary: lucide`) | lucide ✅ compatible |

**Scale of the work:**

- ~15,600 lines of route/component TSX.
- **~1,447 inline `style={{}}` blocks.** Concentration:
  `SettingsRoute` 213 · `CashFlowRoute` 155 · `DashboardRoute` 138 ·
  `AccountsRoute` 111 · `FIRECalculatorRoute` 102 · then a long tail.
- **~600 `ns-*` utility-class usages:** `ns-btn` 164 · `ns-accent` 139 ·
  `ns-input` 96 · `ns-card` 87 · `ns-eyebrow` 76 · `ns-pill` 33 · `ns-seg` 5 · `ns-num` 3.
- Existing `components/ui/`: button, calendar, command, date-picker, dialog,
  input-group, input, label, month-picker, popover, select, sheet, sonner, textarea.
- Design tokens live in `src/styles/globals.css` (`--ns-font-*`, `--ns-s-*` spacing,
  `--ns-r-*` radii, `--ns-accent*`, `--ns-bg-*`, chart colors, dark/light/system theme).

**Why migrate at all (the actual problems):** visual inconsistency and a class of bugs
(e.g. invisible segmented-control selection, the decimal-entry bug, the cash-flow nav
mis-wrap) come from hand-rolled inline styles, not from a missing component library.
COSS gives us a consistent, accessible, AI-legible component layer to converge on.

**Why it's low-risk at the dependency level:** COSS is copy-paste — components land in
our repo, we own them, no new runtime lock-in beyond Base UI (already a dependency).

---

## 2. Guiding principles

1. **No big-bang.** Migrate one route at a time; `main` stays shippable throughout.
2. **Tokens before components.** Establish a single token bridge so old `ns-*` screens
   and new COSS screens look identical during the transition.
3. **Behaviour-preserving.** This is a styling migration. Finance logic
   (`src/domain/*`, `src/data/*`) must not change. Each migrated screen is verified
   pixel-and-behaviour against the old one.
4. **Delete as you go.** A route is "done" only when its inline styles and `ns-*`
   classes are gone. Track the two counters (1,447 / ~600) down to zero.
5. **i18n intact.** zh-TW-first; the English-eyebrow/Chinese-h1 header convention and
   all existing strings survive the swap (see `project_i18n_bundle`).

---

## 3. Phase 0 — Foundations ✅ DONE (2026-06-03)

**Goal:** make it possible to drop a COSS component into any file and have it match.

- [x] COSS components install via the **shadcn CLI** with the built-in `@coss`
      registry (`https://coss.com/ui/r/{name}.json`). Example used:
      `npx shadcn@latest add @coss/button @coss/toggle-group @coss/card …`.
      (The `npx skills add cosscom/coss` agent skill is optional extra knowledge.)
- [x] `components.json` confirmed COSS-compatible (`style: base-nova`, `cssVariables: true`).
- [x] **Token bridge** in `globals.css`: the semantic tokens (`--background`,
      `--primary`, `--border`, `--card`, `--muted`, `--radius`, `--success/--warning/--info`,
      and `--font-sans/-mono/-heading` via `@theme inline`) now alias the themed `ns-*`
      tokens. Because `ns-*` already theme via `[data-theme]` / `prefers-color-scheme`,
      the aliases follow light/dark automatically — verified `--primary` resolves to
      `#5fb83a` (light) / `#9fe870` (dark). No per-component `dark:` variants needed.
- [x] COSS primitives installed **into `src/components/coss/`** (NOT `components/ui/`)
      by temporarily pointing the `ui` alias there during install, so existing
      `components/ui/*` consumers are untouched. Added: button, toggle-group (+toggle,
      separator), card, badge, checkbox, input, field, label, select, spinner.
- [x] **Vite `resolve.dedupe: ["react","react-dom"]`** — COSS pulls `@base-ui/react`,
      which Vite pre-bundles separately; without dedupe a second React instance caused
      "Invalid hook call". Fixed and verified (console clean, prod build passes).
- [x] Component mapping cheat-sheet — section 5.
- [x] Verification harness: `preview_start` (vite + IndexedDB `BrowserFinanceRepository`
      fallback) renders all routes; created a test investment account so the
      transaction drawer renders for before/after diffing.

**Exit criteria met:** COSS components render with Northstar's identity in light + dark,
no console errors, `tsc` + production build clean.

### Phase 0 notes / decisions

- **Two Base UI packages coexist:** existing `components/ui/*` use the older
  `@base-ui-components/react` (1.0.0-beta); COSS uses the newer `@base-ui/react` (1.5.0).
  Both work side-by-side (single React via dedupe). Consolidating onto one Base UI is a
  later cleanup, not required for the migration.
- **`dark:` variant left as-is** (`@custom-variant dark (&:is(.dark *))`, keyed off a
  `.dark` class the app never sets — it themes via `data-theme`). COSS components rely on
  token-carried colors, which theme correctly. ~79 inert `dark:` utilities already exist
  in un-migrated code; making `dark:` work off `data-theme` would activate them untested,
  so it is a **separate, QA-gated task**, deliberately out of scope here.
- **The generic `.dark { … }` token block in `globals.css` is dead code** (never matches).
  Left untouched to minimise churn; the `:root` bridge is the single source of truth.

---

## 4. Phase 1..N — Per-screen migration (ordered)

Order = highest user value / highest inline-style debt first, while starting with a
**medium-complexity reference screen** to set patterns before the giant files.

| Phase | Screen(s) | Inline styles | Why this order |
| --- | --- | --- | --- |
| 1 (pilot) ✅ | `InvestmentsAddSheet` | 60 | **DONE (first pass).** Self-contained drawer; exercises forms + segmented control + `NumberField`. Reference for the rest. See "Pilot results" below. |
| 2 | `DashboardRoute` | 138 | Highest-traffic screen; sets card/stat/chart-shell patterns. |
| 3 | `CashFlowRoute` | 155 | Most-used feature; tabs, tables, drawers, filters. |
| 4 | `InvestmentsRoute` + `HoldingDetailRoute` | 60 + 61 | Tables + detail patterns; reuse Dashboard cards. |
| 5 | `AccountsRoute` + account wizard | 111 | Multi-step wizard = good COSS dialog/section test. |
| 6 | `FIRECalculatorRoute` + `GoalsRoute` | 102 + 56 | Forms + viz. |
| 7 | `SettingsRoute` | 213 | Largest; do last once every pattern exists. |
| 8 | Remaining tabs/panels | tail | `Categories*`, `Merchants*`, `Recurring*`, `Reconcile`, `Transactions`, shared panels. |
| 9 | `AppShell` + nav chrome | 31 | Shell last so screens are stable underneath. |
| 10 | Teardown | — | Delete `ns-*` utility classes and old `components/ui/*` duplicates; remove the token bridge aliases if fully cut over. |

**Per-screen checklist (repeat each phase):**

1. Screenshot the current screen (light + dark) as the baseline.
2. Replace inline-style blocks with COSS components + Tailwind utilities.
3. Swap `ns-btn`/`ns-input`/`ns-card`/`ns-seg`/`ns-pill` → COSS equivalents (section 5).
4. Keep all `data-*`/handlers/i18n keys identical.
5. `npx tsc --noEmit` clean; run affected unit tests.
6. Verify in `preview`: console error-free, snapshot structure intact, interactions
     work (`preview_click`/`preview_fill`), responsive + dark mode (`preview_resize`).
7. Before/after screenshot diff; finance numbers unchanged.
8. Decrement the inline-style / `ns-*` counters in this doc. Commit per screen.

---

### Pilot results — `InvestmentsAddSheet` (2026-06-03)

**Migrated to COSS** (verified light + dark, interactions, no console errors, `tsc` +
prod build clean):

- Side selector (Buy/Sell/股利/拆股/減資) and dividend sub-toggle → COSS `ToggleGroup`
  + `ToggleGroupItem`, with a shared `SEG_ITEM_CLASS` overriding `data-pressed` to an
  **accent fill** (COSS's default pressed state is a faint gray — same low-contrast
  problem as the original bug #1).
- All buttons (header, ticker chips, footer confirm/cancel, empty-state link via the
  `render` prop) → COSS `Button` (variants: ghost / outline / default; `loading` prop).
- FIFO impact preview panel → COSS `Card` (accent-soft override).
- Batch-account checkboxes + "批次多帳戶" → COSS `Checkbox`.

**Deliberately deferred** (kept on bridged `ns-*`, no behaviour change) to keep the pilot
low-risk; these are the refinement backlog for this screen:

- Account `<select>` → COSS `Select` (Base UI; changes interaction model — needs care).
- `datetime-local` + note `<input>` → COSS `Input`.
- `NumberField` keeps `.ns-input` styling (it's already a tested, self-contained
  component; COSS also ships a `number-field` we could adopt later).
- Drawer shell (overlay/panel/animation) and `ns-eyebrow` labels — intentionally kept.

So inline-style/`ns-*` count on this screen is **reduced, not yet zero** — full teardown
happens in a later pass once the input/select patterns are settled.

## 5. Component & token mapping (cheat-sheet)

| Northstar today | COSS UI replacement | Notes |
| --- | --- | --- |
| `.ns-btn` / `.ns-btn.primary` / `.ns-btn.ghost` / `.ns-btn.icon` | COSS Button variants | map primary→default, ghost→ghost, icon→icon size |
| `.ns-input` / `.ns-input mono` | COSS Input | mono via `font-mono`; see `NumberField` |
| `.ns-card` | COSS Card / section surface | preserve `--ns-pad-card` spacing |
| `.ns-seg` (segmented control) | COSS Tabs / ToggleGroup | already fixed visually; replace markup |
| `.ns-pill` | COSS Badge | |
| `.ns-eyebrow` | small uppercased label util | keep English-eyebrow convention |
| `.ns-num` / `.num` | `font-mono tabular-nums` | |
| custom drawer in `InvestmentsAddSheet` | COSS Sheet/Dialog | we have `ui/sheet.tsx` already |
| inline color `var(--ns-accent)` | `text-primary` / `bg-primary` (bridged token) | |

**Token bridge (Phase 0 sketch — values keep current look):**

```css
:root {
  --primary: var(--ns-accent);
  --primary-foreground: var(--ns-accent-fg);
  --background: var(--ns-bg);
  --card: var(--ns-bg-card);
  --border: var(--ns-border);
  --muted-foreground: var(--ns-fg-muted);
  --radius: var(--ns-r-sm);
  /* …extend for the full COSS token set, mirrored under the dark variant… */
}
```

---

## 6. Effort & sequencing

- **Phase 0:** ~0.5–1 day (token bridge is the bulk).
- **Pilot (Phase 1):** ~0.5–1 day; establishes reusable patterns.
- **Phases 2–9:** roughly proportional to inline-style counts above; the four big
  screens (Settings, CashFlow, Dashboard, Accounts ≈ 617 of 1,447 inline styles)
  dominate. Plan them as separate, individually-reviewed PRs.
- **Teardown (Phase 10):** ~0.5 day once counters hit zero.

Total is a **multi-week effort across many small PRs**, not one change. Each PR is
independently shippable and revertible.

---

## 7. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Visual drift between migrated/un-migrated screens | Token bridge first (Phase 0); both inherit identical values. |
| UI regression hiding a finance bug | Behaviour-preserving rule; before/after screenshots; domain/data tests untouched and must stay green. |
| Tauri-only APIs not exercised in browser preview | Preview uses the IndexedDB `BrowserFinanceRepository` fallback; still smoke-test critical flows in the real Tauri build before release. |
| Bundle size / code-split regressions | Keep `manualChunks` + `lazyRouteComponent` strategy (see `project_i18n_bundle`); re-check bundle after big screens. |
| Two component sets coexisting causes confusion | Keep old `components/ui/*` until a screen stops importing it; delete in Phase 10. |
| Scope creep into redesign | This is a 1:1 styling migration. Visual/UX redesign is a separate, later track. |

---

## 8. Open decisions (resolve before Phase 1)

1. **Full cut-over vs. permanent bridge?** Do we eventually delete `ns-*` entirely
   (Phase 10) or keep the bridge long-term? Recommendation: delete, to avoid two systems.
2. **Icons:** standardize on lucide (COSS default) or keep Phosphor where already used?
   Recommendation: leave Phosphor in place; don't bundle a migration into this one.
3. **PR cadence:** one PR per phase (recommended) vs. grouped.

---

_Status: Phase 0 (foundations) + Phase 1 (pilot, first pass) complete as of 2026-06-03.
Phases 2–10 not yet started._
