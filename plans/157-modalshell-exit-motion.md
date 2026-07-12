# Plan 157: Give every ModalShell overlay a symmetric enter/exit animation (one motion system, owned by ModalShell)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 37ccb332..HEAD -- src/components/ModalShell.tsx src/components/ModalShell.test.tsx src/styles/globals.css`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. (If plan 156 landed first, its
> globals.css/keyframe edits are expected drift — read the live file and
> continue.)

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED — touches the shared dialog wrapper used by every overlay in
  the app; a bug here can make modals unclosable
- **Depends on**: none (156 recommended first; if 156 has NOT landed, also
  remove the inline `slideInRight` keyframes it describes when you migrate
  those call sites)
- **Category**: tech-debt (motion system / native feel)
- **Planned at**: commit `37ccb332`, 2026-07-12

## Why this matters

Every overlay in the app (drawers, sheets, centered modals) animates **in**
but disappears **instantly** on close. That breaks spatial consistency — a
panel that slides in from the right should slide back out the same way — and
reads as "broken" rather than "fast". Worse, the enter animations are
scattered: three different mechanisms (`ns-drawer-in` utility class at 6 call
sites, inline `slideInRight` keyframes at 2 sites, and centered modals with no
animation at all) with hardcoded easing/durations that ignore the DS motion
tokens. This plan centralizes enter+exit motion in ModalShell so all ~15 call
sites get symmetric, interruptible, token-driven motion — and so plan 159
(mobile bottom sheets + drag-to-dismiss) has one place to build on.

## Current state

All excerpts verified at commit `37ccb332`.

- `src/components/ModalShell.tsx` (151 lines) — the accessible dialog wrapper
  (focus trap, Escape/scrim close, scroll lock). **No animation anywhere.**
  Close paths today:

  ```tsx
  // :92-99 — Escape handler calls closeRef.current() directly
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      if (!disableEscapeRef.current) {
        event.stopPropagation();
        closeRef.current();
      }
      return;
    }
  // :129-134 — scrim click calls onClose directly
  <div
    className={[VARIANT_SCRIM_CLASS[variant], className].filter(Boolean).join(" ")}
    style={{ background: "var(--ns-scrim)", ...style }}
    onClick={disableScrimClose ? undefined : onClose}
  >
  ```

  Variants (`:31-35`): `center` (flex-centered scrim), `sheet`, `drawer`
  (both `fixed inset-0`, panel positions itself via `panelStyle`).

- `src/components/ModalShell.test.tsx` — existing tests assert `onClose` fires
  on Escape and scrim click. They must keep passing (see Step 2's jsdom note).

- Enter animations currently live at the call sites. Enumerate them all with:
  `grep -rn "ns-drawer-in\|ns-slide-in-right\|slideInRight" src/` and
  `grep -rln "<ModalShell" src/`. Representative excerpts:

  ```tsx
  // src/routes/InvestmentsAddSheet.tsx:459-464
  <ModalShell
    variant="drawer"
    ...
    panelClassName="animate-[ns-drawer-in_220ms_cubic-bezier(0.22,1,0.36,1)]"

  // src/components/TransactionDetailPanel.tsx:98-108 (variant="sheet")
    panelStyle={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 460, ...,
      animation: "slideInRight 0.2s ease" }}
  ```

  Known `ns-drawer-in` consumers: QuickAdd.tsx:237 (NOT a ModalShell — leave
  alone), CategoryManagementDrawer.tsx:120, InvestmentsAddSheet.tsx:464,
  AccountsRoute.tsx:592, CashFlowRoute.tsx:1922 (entry drawer panel inside its
  ModalShell). `slideInRight` consumers: TransactionDetailPanel.tsx:107,
  RecurringRulesTab.tsx:366.

- `src/styles/globals.css` motion tokens (`:46-49`):
  `--ns-ease: cubic-bezier(.2,.7,.2,1)`, `--ns-dur-fast: 120ms`, `--ns-dur: 200ms`.
  Global reduced-motion rule (`:491-498`) forces all animation/transition
  durations to `0.001ms !important` — your exit transition still fires
  `transitionend`, just instantly. Do not add a separate reduced-motion path.

- Repo conventions: styles go in `ns-*` classes, not inline (AGENTS.md:
  「靜態樣式不要寫 inline」). UI copy in these files is hardcoded zh-TW strings —
  match that; do not touch `copy.csv`/`translation.json`.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck + build | `npm run build` | exit 0 |
| Tests     | `npm test`         | all pass |
| Focused tests | `npx vitest run src/components/ModalShell.test.tsx` | all pass |
| Lint      | `npm run lint`     | exit 0 |

## Scope

**In scope**:
- `src/components/ModalShell.tsx` (motion + dismiss context)
- `src/components/ModalShell.test.tsx` (extend)
- `src/styles/globals.css` (overlay motion classes + `--ns-ease-out-strong` token)
- ModalShell call sites, enter-animation removal + dismiss migration:
  `TransactionDetailPanel.tsx`, `RecurringRulesTab.tsx`,
  `InvestmentsAddSheet.tsx`, `AccountsRoute.tsx`,
  `CategoryManagementDrawer.tsx`, `RecurringInvestmentsTab.tsx`,
  `CashFlowRoute.tsx`, plus any other file `grep -rln "<ModalShell" src/`
  returns.

**Out of scope** (do NOT touch):
- `QuickAdd.tsx` — not a ModalShell; its own overlay (plan 160 handles it).
- `src/components/ui/dialog.tsx` / `popover.tsx` / `command.tsx` — Base UI
  components with their own tw-animate-css motion; leave them.
- Mobile bottom-sheet presentation and drag gestures — plan 159.
- Focus-trap/scroll-lock logic in ModalShell — behaviourally frozen (plan 155
  just landed `lockViewportScroll`; don't disturb it).

## Git workflow

- Branch: `feat/ai-overlay-exit-motion`. Conventional commits (e.g.
  `feat(ui): modal exit animations via ModalShell`). Do NOT push or open a PR
  unless the operator instructed it. Check `git status` for human WIP first.

## Steps

### Step 1: Add the motion CSS to globals.css

Add a token next to the existing motion tokens, and an overlay-motion block in
the utilities section:

```css
/* next to --ns-ease (:46) */
--ns-ease-out-strong: cubic-bezier(0.22, 1, 0.36, 1);
```

```css
/* ── Overlay motion (plan 157): owned by ModalShell ──
   Enter uses @starting-style (Safari 17.5+/modern WKWebView; older engines
   simply skip the enter animation). Exit is driven by [data-closing], which
   ModalShell sets, then waits for transitionend before unmounting. */
.ns-overlay-scrim {
  transition: opacity 160ms var(--ns-ease);
  @starting-style { opacity: 0; }
}
.ns-overlay-scrim[data-closing] { opacity: 0; pointer-events: none; }

.ns-overlay-panel[data-motion="drawer"] {
  transition: transform 220ms var(--ns-ease-out-strong), opacity 220ms var(--ns-ease-out-strong);
  @starting-style { transform: translateX(28px); opacity: 0; }
}
.ns-overlay-panel[data-motion="drawer"][data-closing] {
  transform: translateX(28px); opacity: 0;
  transition-duration: 160ms; /* exits faster than enters */
}

.ns-overlay-panel[data-motion="center"] {
  transition: transform 180ms var(--ns-ease-out-strong), opacity 180ms var(--ns-ease-out-strong);
  @starting-style { transform: scale(0.97); opacity: 0; }
}
.ns-overlay-panel[data-motion="center"][data-closing] {
  transform: scale(0.97); opacity: 0;
  transition-duration: 140ms;
}
```

Only `transform`/`opacity` are animated (compositor-safe).

**Verify**: `npm run build` → exit 0.

### Step 2: Teach ModalShell to close with an exit animation

In `ModalShell.tsx`:

1. Add state + a dismiss entry point:

   ```tsx
   const [closing, setClosing] = useState(false);
   const closingRef = useRef(false);
   const requestClose = useCallback(() => {
     if (closingRef.current) return;           // double-dismiss guard
     const panel = panelRef.current;
     // jsdom / legacy engines: computed transition-duration is empty or 0s →
     // close synchronously (this is what keeps ModalShell.test.tsx passing).
     const dur = panel ? parseFloat(getComputedStyle(panel).transitionDuration || "0") : 0;
     if (!panel || !dur) { closeRef.current(); return; }
     closingRef.current = true;
     setClosing(true);
   }, []);
   ```

2. When `closing` flips true, wait for the panel's own `transitionend`
   (filter `event.target === panel`), with a 320 ms `setTimeout` fallback,
   then call `closeRef.current()`. Clean both up on unmount.
3. Route Escape (`:94-97`) and scrim click (`:133`) through `requestClose`
   instead of `closeRef.current()` / `onClose`.
4. Add a `motion` prop: `motion?: "drawer" | "center" | "none"`, defaulting by
   variant (`center` → `"center"`, `sheet`/`drawer` → `"drawer"`).
5. Render: scrim div gains `ns-overlay-scrim` class and
   `data-closing={closing || undefined}`; panel div gains `ns-overlay-panel`,
   `data-motion={motion === "none" ? undefined : motion}`, and the same
   `data-closing`. While `closing`, also set `pointer-events: none` on the
   scrim wrapper so nothing is clickable mid-exit.
6. Export a dismiss context so children can trigger the animated close:

   ```tsx
   const ModalDismissContext = createContext<(() => void) | null>(null);
   export function useModalDismiss(fallback: () => void): () => void {
     return useContext(ModalDismissContext) ?? fallback;
   }
   ```

   Wrap `{children}` in `<ModalDismissContext.Provider value={requestClose}>`.

**Verify**: `npx vitest run src/components/ModalShell.test.tsx` → all existing
tests still pass unmodified (jsdom takes the synchronous path).

### Step 3: Extend ModalShell tests

Add to `ModalShell.test.tsx` (follow its existing render/act patterns):

- `useModalDismiss` consumer: a child button wired to `useModalDismiss(onClose)`
  triggers `onClose` on click (jsdom sync path).
- Double-dismiss guard: two rapid Escape presses call `onClose` exactly once.
- `motion="none"` renders no `data-motion` attribute.

**Verify**: `npx vitest run src/components/ModalShell.test.tsx` → all pass,
≥3 new tests.

### Step 4: Migrate the call sites

For every file from `grep -rln "<ModalShell" src/`:

1. **Remove per-site enter animations**: delete
   `animate-[ns-drawer-in_…]` from `panelClassName` and
   `animation: "ns-slide-in-right …"` / `"slideInRight …"` from `panelStyle`
   (and, if plan 156 hasn't landed, the inline `<style>@keyframes slideInRight</style>` blocks).
2. **Keep** positional `panelStyle` (position/width/background/borders) as-is.
3. **Migrate explicit close buttons** (the header × and footer 取消 buttons
   that call `onClose` / `onClose()` directly) to the animated path:

   ```tsx
   const dismiss = useModalDismiss(onClose);
   // <Button onClick={dismiss}>…
   ```

   Only migrate buttons whose sole job is closing. Leave "save then close"
   flows calling their existing handlers (they run async logic then call
   `onClose()`; converting them is optional — if trivial, pass `dismiss` in
   place of the final `onClose()` call).
4. `CashFlowRoute.tsx:1922` — the entry drawer's inner panel div carries
   `animate-[ns-drawer-in_…]`; remove that class. The ModalShell wrapping it
   supplies motion now; if the inner div (not the ModalShell panel) was the
   animated element, move the positional styles so the ModalShell panel itself
   is the sliding element, or set `motion="none"` on that ModalShell and leave
   the inner class — choose whichever keeps the visual identical, and note
   which you chose.

**Verify** after each file: `npm run build` → exit 0. After all:
`grep -rn "ns-drawer-in\|ns-slide-in-right\|slideInRight" src/ --include="*.tsx" | grep -v QuickAdd` → 0 matches.

### Step 5: Full gates + manual sweep

**Verify**: `npm test` → all pass. `npm run lint` → exit 0. `npm run dev` and
open each migrated overlay (transaction detail, add investment, add account,
category management, recurring rule editor, cash-flow entry drawer, a centered
confirm modal): each enters AND exits with motion; Escape, scrim click, × and
取消 all animate; nothing can be double-closed.

## Test plan

Covered in Step 3 (unit) and Step 5 (manual sweep). The pre-existing
ModalShell tests are the regression net for focus trap/scroll-lock/Escape —
they must pass **unmodified**.

## Done criteria

- [ ] `npm run build`, `npm test`, `npm run lint` all exit 0
- [ ] `ModalShell.test.tsx`: all pre-existing tests pass unmodified; ≥3 new tests
- [ ] `grep -rn "ns-drawer-in" src/ --include="*.tsx" | grep -v QuickAdd` → 0 matches
- [ ] `grep -rn "slideInRight" src/` → 0 matches
- [ ] Scrim + panel carry `ns-overlay-scrim` / `ns-overlay-panel` classes with `data-motion`
- [ ] `git status` shows no files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- ModalShell.test.tsx fails after Step 2 and the fix would require changing an
  existing assertion — the sync-close path is load-bearing; report instead.
- Any call site closes its overlay by unmounting a parent (not via `onClose`)
  — that site can't animate; skip it, note it, continue.
- `@starting-style` fails the build's CSS pipeline (Tailwind v4 should nest it
  fine) — STOP; do not substitute a JS enter-animation without approval.
- CashFlowRoute's entry-drawer structure doesn't match Step 4.4's description.

## Maintenance notes

- Plan 159 builds directly on this: bottom-sheet presentation adds a
  `data-motion="sheet-bottom"` case and a drag gesture that sets the exit in
  motion. Keep `requestClose` the single exit path.
- New overlays must NOT add their own enter animations — motion is
  ModalShell's job now. Reviewer should check no `animate-[…]` classes crept
  back into panelClassName.
- Deliberately deferred: velocity-aware/spring exits (CSS transitions retarget
  adequately at these durations).
