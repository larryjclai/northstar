# Plan 155: Fix the broken body scroll-lock so the sidebar never scrolls away behind drawers

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat da946482..HEAD -- src/components/ModalShell.tsx src/components/ModalShell.test.tsx src/routes/CashFlowRoute.tsx src/lib/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED (touches every ModalShell overlay's scroll behavior)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `da946482`, 2026-07-11

## Why this matters

Operator report: 「Sidebar 是不是要 always on top？因為在準備記帳的時候可以捲動
視窗，然後就會如圖一樣左邊變空白。」 — with the 新增交易 drawer open, the page
behind it can still scroll, and when it does the sidebar scrolls away leaving
the left side blank.

The advisor reproduced this in the dev preview and diagnosed it live:

1. The EntryDrawer (and `ModalShell`) lock scrolling with
   `document.body.style.overflow = "hidden"`.
2. But `src/styles/globals.css:361` sets `html, body { overflow-x: clip; }`.
   Because the root element's overflow is not `visible`, the browser does
   **not** propagate body's `overflow: hidden` to the viewport — so the page
   **still scrolls** (observed: `scrollY` reached 1000+ with the lock "on").
3. Worse, `overflow: hidden` makes `<body>` a clip container, which **defeats
   `position: sticky` on the sidebar** (sticky anchors to body's never-moving
   scrollport instead of the viewport). Observed: sidebar rect `top: -1000`
   while "sticky". This is exactly the blank-left-side screenshot.

Verified fix (tested live in the preview): put the lock on
`document.documentElement` instead. With `html { overflow: hidden }`, wheel
scrolling is actually locked AND the sidebar sticky stays intact (asideTop
stayed 0). The sidebar does not need any z-index/"always on top" change — the
existing scroll-lock *intent* was right; only its target element was wrong.

## Current state

- `src/routes/CashFlowRoute.tsx:1855-1867` — the EntryDrawer's own lock:
  ```ts
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);
  ```

- `src/components/ModalShell.tsx:88-89` and `:123` — the shared overlay shell
  (plan 138) has the same pattern:
  ```ts
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  // ... cleanup:
  document.body.style.overflow = previousOverflow;
  ```

- `src/components/ModalShell.test.tsx:126-140` (approx.) — tests assert the
  body lock:
  ```ts
  document.body.style.overflow = "auto";
  // ... mount ...
  expect(document.body.style.overflow).toBe("hidden");
  // ... unmount ...
  expect(document.body.style.overflow).toBe("auto");
  ```
  plus a leak guard at the top of the file (`document.body.style.overflow = ""`).

- `src/styles/globals.css:361`: `html, body { max-width: 100%; overflow-x: clip; }`
  and `:385`: `html, body { overscroll-behavior: none; }` — do NOT remove
  these; they fix mobile-width overflow and rubber-banding. The lock must work
  *with* them.

- Grep confirms these are the only two lock sites:
  `grep -rn 'body.style.overflow' src --include='*.ts*'` → ModalShell.tsx,
  ModalShell.test.tsx, CashFlowRoute.tsx (plus the test guard).

- Repo conventions: small shared helpers live in `src/lib/` (e.g.
  `src/lib/icons.tsx`); comments state constraints (see the excerpts above for
  tone). vitest + jsdom; `document.documentElement` exists in jsdom.

## Commands you will need

| Purpose   | Command                                            | Expected on success |
|-----------|----------------------------------------------------|---------------------|
| Typecheck | `npx tsc`                                          | exit 0              |
| Shell tests | `npx vitest run src/components/ModalShell.test.tsx` | all pass          |
| Full tests| `npm test`                                         | all pass            |
| Lint      | `npm run lint`                                     | exit 0              |
| Dev server| Browser-pane `preview_start` name `northstar-dev`  | app loads           |

## Scope

**In scope** (the only files you should modify):
- `src/lib/scrollLock.ts` (create)
- `src/lib/scrollLock.test.ts` (create)
- `src/components/ModalShell.tsx`
- `src/components/ModalShell.test.tsx` (update the overflow assertions only)
- `src/routes/CashFlowRoute.tsx` (the `useEffect` above only)

**Out of scope** (do NOT touch, even though they look related):
- `src/styles/globals.css` — `overflow-x: clip` and `overscroll-behavior` stay.
- `src/components/AppShell.tsx` — the sidebar is fine once the lock works; no
  "always on top" change.
- `src/components/QuickAdd.tsx` — it intentionally has no scroll lock today;
  adding one is a product decision, not this bug (noted in plan 153 too).
- Every ModalShell *consumer* — they inherit the fix.

## Git workflow

- Branch: `fix/ai-scroll-lock-documentelement`
- Commit style: conventional commits, e.g.
  `fix(overlays): lock viewport scroll on documentElement — body lock is inert under overflow-x: clip`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the shared helper

`src/lib/scrollLock.ts`:

```ts
/**
 * Lock viewport scrolling while an overlay is open.
 *
 * The lock goes on <html>, NOT <body>: globals.css sets
 * `html { overflow-x: clip }`, and per the CSS overflow spec a body
 * `overflow: hidden` only propagates to the viewport when the ROOT element's
 * overflow is fully `visible`. A body-level lock therefore (a) fails to stop
 * the page from scrolling and (b) turns <body> into a clip container, which
 * silently disables every `position: sticky` descendant — the app sidebar
 * scrolled away behind open drawers (plan 155).
 *
 * Re-entrant: nested overlays each get a release() that restores the value
 * saved at their own acquire time (same semantics the previous inline code
 * had). Returns the release function.
 */
export function lockViewportScroll(): () => void {
  const root = document.documentElement;
  const previous = root.style.overflow;
  root.style.overflow = "hidden";
  return () => {
    root.style.overflow = previous;
  };
}
```

`src/lib/scrollLock.test.ts` (vitest, jsdom):
- acquiring sets `document.documentElement.style.overflow` to `"hidden"`;
- release restores the prior inline value (test with `""` and with `"auto"`);
- nested acquire/release in LIFO order restores the original value;
- releasing the OUTER lock first (out-of-order) leaves `hidden` until the
  inner one releases — assert the actual behavior so it's documented.

**Verify**: `npx vitest run src/lib/scrollLock.test.ts` → all pass.

### Step 2: Switch ModalShell to the helper

In `ModalShell.tsx`, replace the two body lines (88-89) and the cleanup line
(123) with:

```ts
const releaseScrollLock = lockViewportScroll();
// ... cleanup:
releaseScrollLock();
```

(Keep the surrounding effect structure — focus trap, keydown, restore — completely unchanged.)

Update `ModalShell.test.tsx`: the scroll-lock test asserts
`document.documentElement.style.overflow` instead of body, and the top-of-file
leak guard resets `document.documentElement.style.overflow = ""` (keep the
body reset too if other tests rely on it — check before deleting).

**Verify**: `npx vitest run src/components/ModalShell.test.tsx` → all pass
(11+ existing a11y tests must stay green).

### Step 3: Switch the EntryDrawer

In `CashFlowRoute.tsx` (the `useEffect` at 1855-1867), replace the body-lock
lines with the helper (import from `../lib/scrollLock`):

```ts
const releaseScrollLock = lockViewportScroll();
window.addEventListener("keydown", onKeyDown);
return () => {
  releaseScrollLock();
  window.removeEventListener("keydown", onKeyDown);
};
```

**Verify**: `npx tsc` → exit 0;
`grep -rn "body.style.overflow" src --include="*.tsx" --include="*.ts" | grep -v test` → 0 matches.

### Step 4: Live verification

Dev server, viewport ~1040×650, demo data:
1. 記帳 → 記一筆 (EntryDrawer opens). Wheel-scroll over the left/content area:
   **the page must not scroll** and the sidebar must stay fully visible.
2. Close the drawer → page scrolls normally again.
3. Open a ModalShell overlay (e.g. a holding's edit modal on 投資, or 帳戶
   adjust) → same: no background scroll, sidebar intact, closes clean.
4. Regression: with the drawer open, the drawer's own internal content still
   scrolls (its panel has its own overflow).

## Test plan

- New: `src/lib/scrollLock.test.ts` (Step 1 cases).
- Updated: `ModalShell.test.tsx` scroll-lock assertions (Step 2).
- Pattern: existing `ModalShell.test.tsx` (renderHook-free, direct render +
  assertions).

## Done criteria

Machine-checkable / observable. ALL must hold:

- [ ] `npx tsc` exits 0; `npm run lint` exits 0; `npm test` exits 0
- [ ] `grep -rn "body.style.overflow" src --include="*.ts" --include="*.tsx" | grep -v ".test." ` → 0 matches
- [ ] `src/lib/scrollLock.ts` + its test exist and pass
- [ ] Live check 1 observed: drawer open ⇒ background does not scroll, sidebar
      visible (screenshot)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts at ModalShell.tsx:88/123 or CashFlowRoute.tsx:1855 don't match.
- Locking `documentElement` visibly shifts layout when overlays open (a
  scrollbar-width jump on non-overlay macOS scrollbars): report before adding
  scrollbar-gutter compensation — do not improvise padding hacks.
- Any ModalShell a11y test beyond the overflow assertions starts failing.
- You find additional `overflow` lock sites the grep in "Current state"
  missed.

## Maintenance notes

- Any future overlay must use `lockViewportScroll()` — a raw body lock will
  *look* right in jsdom tests and silently fail in the real app (this exact
  trap). Reviewer: consider a lint-level grep in CI later if it recurs.
- If `html { overflow-x: clip }` is ever removed from globals.css, the body
  lock would start working again but this helper stays correct either way.
- Related open question (not this plan): should QuickAdd also lock scroll
  while open? Today it does not, and with sticky working the sidebar stays put
  regardless, so it is cosmetic.
- iOS/touch: `overflow: hidden` on the root is generally honored by modern
  WebKit for touch scrolling, but the operator should sanity-check the drawer
  on the iOS build when convenient (`docs/ios-mobile-plan.md` SOP).
