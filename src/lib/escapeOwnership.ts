/**
 * Stacking contract for hand-rolled `window`-level Escape listeners (plan 305).
 *
 * ModalShell's own Escape handling is a native listener bound to its panel
 * node, not `window`/`document` — and it no longer calls `stopPropagation()`
 * synchronously (that would block React's own dispatch from ever reaching a
 * nested consumer, e.g. SuggestInput's "Esc closes my dropdown first"
 * handling; see ModalShell.tsx). That means an Escape press can now reach
 * `window` even while a ModalShell dialog is open and handling it.
 *
 * A hand-rolled overlay (QuickAdd, CashFlow's EntryDrawer — neither is
 * itself a ModalShell yet) that listens for Escape on `window` must not act
 * on a press that's actually meant for a ModalShell dialog stacked on top of
 * it (e.g. RecurringScopeModal opening over an in-progress EntryDrawer
 * edit). ModalShell's focus trap keeps focus inside the dialog while it's
 * open, so any such Escape's `event.target` is a descendant of that
 * dialog's `[role="dialog"]` panel — check that before closing.
 */
export function escapeTargetInsideDialog(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  return target.closest('[role="dialog"]') !== null;
}
