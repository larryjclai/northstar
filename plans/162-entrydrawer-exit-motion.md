# Plan 162: Give the CashFlow EntryDrawer a symmetric enter/exit animation (reuse ModalShell's motion classes, keep its custom scrim)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report — do not improvise. When done, update
> the status row for this plan in `plans/README.md` unless a reviewer told you
> they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 37ccb332..HEAD -- src/routes/CashFlowRoute.tsx src/styles/globals.css`
> This plan is intended to run STACKED on the 156–159 chain (branch
> `feat/ai-bottom-sheet-gestures`). Expected drift from that chain: CashFlowRoute's
> three `variant="center"` confirm ModalShells are render-prop-wrapped (157), and a
> `transition:"all"` in EntryDrawer's type tabs is now explicit (156). Those are
> expected. Locate code by the grep markers below, NOT raw line numbers.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED — EntryDrawer is the high-traffic cash-flow entry form; a close-flow bug blocks recording transactions
- **Depends on**: plan 157 (its `.ns-overlay-panel[data-motion="drawer"]` and `.ns-overlay-scrim` CSS classes must exist in globals.css — this plan reuses them)
- **Category**: tech-debt (motion consistency)
- **Planned at**: commit `37ccb332`, 2026-07-12

## Why this matters

Every other overlay in the app now enters AND exits with motion (plan 157
centralized this in ModalShell). The CashFlow `EntryDrawer` — the form for
adding/editing an expense, income, transfer, or receivable/payable — is the one
holdout: it is a hand-rolled overlay (its own scrim, Escape listener, and
scroll-lock, NOT a ModalShell), so it slides in via a one-shot
`animate-[ns-drawer-in_…]` keyframe but **vanishes instantly on close**. That
inconsistency is exactly what the motion batch set out to remove. We fix it
WITHOUT migrating to ModalShell, because EntryDrawer has a deliberately
sidebar-offset scrim (`ns-entry-scrim` leaves the macOS vibrancy sidebar
uncovered) that a full ModalShell migration would regress. Instead we reuse the
CSS motion classes plan 157 already ships.

## Current state

`src/routes/CashFlowRoute.tsx` — the `EntryDrawer` component (find it with
`grep -n "function EntryDrawer" src/routes/CashFlowRoute.tsx`). Its relevant
current structure (verified at commit `37ccb332`; line numbers shift ~+6 on the
stacked chain — use the grep markers):

- Controlled by an `open` prop; `if (!open) return null;` just before the return.
- A mount effect (gated on `open`) that binds an Escape listener and
  `lockViewportScroll()`:
  ```tsx
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    const releaseScrollLock = lockViewportScroll();
    window.addEventListener("keydown", onKeyDown);
    return () => {
      releaseScrollLock();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);
  ```
- The overlay markup (grep `ns-entry-scrim` and `animate-[ns-drawer-in`):
  ```tsx
  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <style>{`@media (max-width:1023.98px){.ns-entry-scrim{left:0 !important;}}`}</style>
      <div
        className="ns-entry-scrim absolute top-0 right-0 bottom-0"
        style={{ left: scrimLeft, background: "var(--ns-scrim)" }}
      />
      <div
        onClick={(event) => event.stopPropagation()}
        className="animate-[ns-drawer-in_220ms_cubic-bezier(0.22,1,0.36,1)] absolute right-0 top-0 bottom-0 flex flex-col"
        style={{ width: "min(500px, 100%)", background: "var(--ns-bg-elev)", borderLeft: "1px solid var(--ns-border)", boxShadow: "var(--ns-shadow-2)" }}
      >
  ```
- Close affordances that call `onClose` directly (grep `onClick={onClose}` and `>取消<`):
  - the outer scrim div `onClick={onClose}`,
  - the header × button: `<Button variant="ghost" size="icon" onClick={onClose} aria-label="關閉">`,
  - a footer 取消 button: `<Button variant="outline" … onClick={onClose}>取消</Button>`,
  - a "匯入 CSV" button doing `onClick={() => { onClose(); onOpenImport(); }}` — this one navigates to another surface; LEAVE IT calling `onClose()` directly (do NOT animate it).

- The motion classes to reuse already exist in `src/styles/globals.css` (added by plan 157 — confirm with `grep -n "ns-overlay-panel\[data-motion=\"drawer\"\]\|ns-overlay-scrim" src/styles/globals.css`):
  ```css
  .ns-overlay-scrim { transition: opacity 160ms var(--ns-ease); @starting-style { opacity: 0; } }
  .ns-overlay-scrim[data-closing] { opacity: 0; pointer-events: none; }
  .ns-overlay-panel[data-motion="drawer"] { transition: transform 220ms var(--ns-ease-out-strong), opacity 220ms var(--ns-ease-out-strong); @starting-style { transform: translateX(28px); opacity: 0; } }
  .ns-overlay-panel[data-motion="drawer"][data-closing] { transform: translateX(28px); opacity: 0; transition-duration: 160ms; }
  ```
  The reference implementation of the two-phase close (mirror it) is `requestClose` in `src/components/ModalShell.tsx` — read it.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck + build | `npm run build` | exit 0 |
| Tests | `npm test` | all pass |
| Lint | `npm run lint` | exit 0 |

## Scope

**In scope**: `src/routes/CashFlowRoute.tsx` (the `EntryDrawer` component ONLY).

**Out of scope** (do NOT touch):
- The three `variant="center"` confirm ModalShells in the same file
  (SettleModal / RecurringScopeModal / InstallmentDeleteModal) — already done by 157.
- `src/styles/globals.css` — reuse the existing classes; add NO new CSS (if you
  think you need new CSS, STOP and report).
- The sidebar-offset scrim behavior (`ns-entry-scrim` `left: scrimLeft`) — keep it exactly.
- Migrating EntryDrawer to ModalShell — explicitly NOT this plan.

## Git workflow

- Branch: `feat/ai-entrydrawer-exit-motion` (stacked on `feat/ai-bottom-sheet-gestures`; the executor dispatch will handle basing).
- Conventional commits, e.g. `feat(ui): symmetric enter/exit motion for CashFlow EntryDrawer`.
- Do NOT push or open a PR.

## Steps

### Step 1: Add a two-phase close to EntryDrawer

Inside `EntryDrawer`, add a `closing` state and a `requestClose` callback that
mirrors ModalShell's pattern. Because EntryDrawer early-returns `null` when
`!open`, use a ref to the panel for the transition measurement:

```tsx
const panelRef = useRef<HTMLDivElement>(null);
const [closing, setClosing] = useState(false);
const closingRef = useRef(false);
const requestClose = useCallback(() => {
  if (closingRef.current) return;
  const panel = panelRef.current;
  const dur = panel ? parseFloat(getComputedStyle(panel).transitionDuration || "0") : 0;
  if (!panel || !dur) { closingRef.current = true; onClose(); return; }
  closingRef.current = true;
  setClosing(true);
}, [onClose]);
```

Add an effect that, once `closing` is true, waits for the panel's `transitionend`
(filter `event.target === panel`) with a ~300ms fallback, then calls `onClose()`.
Reset `closing`/`closingRef` when the drawer re-opens (guard: when `open` flips
true, set both back to false) so a reopened drawer isn't stuck closing.

**Verify**: `npm run build` → exit 0.

### Step 2: Switch the panel + scrim to the transition-based motion classes

- Panel div: remove `animate-[ns-drawer-in_220ms_cubic-bezier(0.22,1,0.36,1)]`
  from its className and instead add `ns-overlay-panel`; add `ref={panelRef}`,
  `data-motion="drawer"`, and `data-closing={closing || undefined}`. Keep every
  existing positional style.
- Inner scrim div (`ns-entry-scrim`): add `ns-overlay-scrim` to its className and
  `data-closing={closing || undefined}`. Keep its `left: scrimLeft` / `background`
  inline style.

**Verify**: `npm run build` → exit 0; `grep -n "ns-drawer-in" src/routes/CashFlowRoute.tsx` → 0 matches.

### Step 3: Route the pure-close affordances through `requestClose`

Change these `onClose` references to `requestClose`:
- the outer overlay div `onClick={onClose}` (scrim click),
- the Escape handler in the mount effect (`if (event.key === "Escape") requestClose();`),
- the header × button,
- the footer 取消 button.

Leave `onClose` as-is for: the "匯入 CSV" button (`onClose(); onOpenImport();`)
and any success-path close that fires after a save mutation (those should close
immediately, not animate). If unsure whether a given `onClose` is a pure-close
affordance, LEAVE it and note it.

**Verify**: `npm run build` → exit 0; `npm test` → all pass; `npm run lint` → exit 0.

## Test plan

No new unit test is required (jsdom takes the synchronous close path — no
transition to observe, same as the ModalShell tests). The regression net is the
full existing suite plus the build. If you want a cheap guard, a test that
renders `EntryDrawer` with `open` and asserts the panel carries
`data-motion="drawer"` is welcome but optional.

- **Verify**: `npm test` → all pass (count not lower than before).

## Done criteria

- [ ] `npm run build`, `npm test`, `npm run lint` all exit 0
- [ ] `grep -n "ns-drawer-in" src/routes/CashFlowRoute.tsx` → 0 matches
- [ ] EntryDrawer panel carries `ns-overlay-panel` + `data-motion="drawer"` + `data-closing`
- [ ] `ns-entry-scrim` still sets `left: scrimLeft` (sidebar-offset preserved) and now also fades via `ns-overlay-scrim`
- [ ] No new CSS added to globals.css; no file outside `CashFlowRoute.tsx` modified (`git status`)
- [ ] `plans/README.md` status row updated (unless the reviewer maintains it)

## STOP conditions

- The `.ns-overlay-panel[data-motion="drawer"]` / `.ns-overlay-scrim` classes are
  NOT present in globals.css (plan 157 not in your base) — STOP.
- You find you need to add new CSS to make the exit animate — STOP and report
  (means the reuse assumption is wrong).
- Removing `animate-[ns-drawer-in]` breaks the ENTER animation (the drawer no
  longer slides in) — the `@starting-style` on `.ns-overlay-panel[data-motion="drawer"]`
  should provide it; if it doesn't, STOP and report rather than re-adding the keyframe.
- A save/submit mutation's close path turns out to depend on synchronous unmount —
  leave it on `onClose`, note it.

## Maintenance notes

- If EntryDrawer is later migrated to ModalShell wholesale, this inline
  two-phase-close becomes redundant and should be removed in favor of ModalShell's
  `requestClose` — but that migration must first solve the sidebar-offset scrim
  (`ns-entry-scrim`), which is why it was deferred.
- Reviewer: confirm the sidebar-offset scrim still leaves the vibrancy sidebar
  uncovered on desktop (the `left: scrimLeft` inline style must survive), and that
  the enter animation still plays (via `@starting-style`, not the deleted keyframe).
