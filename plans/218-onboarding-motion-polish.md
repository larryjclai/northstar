# 218 — Onboarding overlay: entrance + step-transition motion

- **Status**: TODO
- **Commit**: `ae708c1b`
- **Severity**: LOW (rare surface — but it is the first thing a new user ever sees)
- **Category**: Missed opportunity (first-run delight budget)
- **Estimated scope**: 2 files (`src/components/OnboardingOverlay.tsx`, `src/styles/globals.css`), ~30 lines

## Problem

The onboarding overlay — the product's first impression — has zero motion. The full-screen scrim + card appear in one frame, and advancing between the four steps (`start → accounts → import → done`) hard-swaps the panel content:

```tsx
// src/components/OnboardingOverlay.tsx:132-135 — current: no entrance
<div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" ...>
  <div className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--ns-bg) 68%, transparent)", backdropFilter: "blur(10px)" }} onClick={dismiss} />
```

```tsx
// src/components/OnboardingOverlay.tsx:42 — step state; content at :154-158 swaps instantly on setStep
const [step, setStep] = useState(0);
```

Per the frequency table this is exactly where a delight budget is *allowed*: rare, first-time, emotionally loaded. It's currently spent nowhere.

## Target

Three additions, all enter-only, all within existing token vocabulary:

**1. Overlay entrance** — scrim fades, card scales up from 0.97 (never from 0):

```css
/* src/styles/globals.css — target */

/* ── Onboarding entrance (plan 218) ── */
.ns-onboarding-scrim {
  transition: opacity 200ms var(--ns-ease);
  @starting-style { opacity: 0; }
}
.ns-onboarding-card {
  transition: transform 240ms var(--ns-ease-out-strong), opacity 240ms var(--ns-ease-out-strong);
  @starting-style { transform: scale(0.97) translateY(8px); opacity: 0; }
}
/* Step content enter (remounted via key={step}) */
.ns-onboarding-step {
  transition: opacity 180ms var(--ns-ease-out-strong), transform 180ms var(--ns-ease-out-strong);
  @starting-style { opacity: 0; transform: translateY(6px); }
}
```

**2. Step content transition** — key the step-content container on `step` so React remounts it and `@starting-style` replays the enter on every step change (fade + 6px rise; old content cuts out — asymmetric on purpose, the *new* state is what deserves the motion).

**3. Step-rail progression** — the numbered step circles (`OnboardingOverlay.tsx:164-167`) flip colors instantly; give them `transition: background 150ms var(--ns-ease), color 150ms var(--ns-ease)` so completing a step visibly "lights up" the rail.

## Repo conventions to follow

- Tokens at `src/styles/globals.css:47-50`; `@starting-style` enter pattern at `globals.css:358-366`.
- Static styles → `ns-*` classes; only dynamic values inline (AGENTS.md 樣式撰寫優先序).
- Modal-like surfaces scale from center — `transform-origin: center` is correct here, do not anchor it.

## Steps

1. **`src/styles/globals.css`**: add the three classes above with the section comment, after the other overlay-motion blocks.
2. **`src/components/OnboardingOverlay.tsx:133`**: add `className` `ns-onboarding-scrim` to the scrim div (merge with existing `absolute inset-0` classes).
3. **`OnboardingOverlay.tsx:134-135`**: add `ns-onboarding-card` to the card container (the `relative grid w-full ...` element).
4. Locate the element that renders the per-step content (right column; the container whose children switch on `stepKeys[step]` / `step`). Add `key={step}` and `className` `ns-onboarding-step` to it. If left-panel title/description (`panelTitle.${stepKeys[step]}` at :156) lives in a separate container, key that container too — both sides should enter together.
5. **`OnboardingOverlay.tsx:166`**: on the step-circle div (the `width: 24, height: 24, borderRadius: 99 ...` style object), append `transition: "background 150ms var(--ns-ease), color 150ms var(--ns-ease)"`.

## Boundaries

- Do NOT add exit animations, confetti, springs, or any new dependency — enter-only, tokens-only.
- Do NOT change step logic, dismiss behavior, focus handling, or copy.
- Do NOT animate the backdrop-filter blur value (compositing cost on WKWebView); the scrim fades opacity only.
- If the component structure at the cited lines has drifted, STOP and report.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npm run lint`, `npm test`.
- **Feel check** (trigger onboarding: fresh profile or however `OnboardingOverlay`'s visibility flag is reset — check its `useEffect` around line 75):
  - First open: scrim fades in, card rises + settles in ~240ms. At 10% playback: the card never starts from nothing (scale floor 0.97) and never overshoots.
  - Click through all four steps: each step's content fades/rises in; the rail circle for the completed step transitions color rather than flipping. Old content must cut, not linger — if two steps are ever visible at once, the keying is wrong.
  - `key={step}` remount must not reset any in-progress form state *within* a step — verify the accounts step (step 1) keeps its inputs while you type (state lives above the keyed container; if it doesn't, move the key down to the presentational wrapper and report).
  - `prefers-reduced-motion: reduce`: everything appears instantly, flow unaffected.
- **Done when**: first-run feels composed (entrance → step → step → done reads as one guided sequence), and no step state is lost to remounting.
