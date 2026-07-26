# Plan 275: Give vitest the `@` alias so route components can be tested at all

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> **Step 1 settles a factual question that decides whether Step 4 happens at
> all — do not skip it or assume the answer.** When done, update the status row
> for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 881c29f5..HEAD -- vitest.config.ts src/test/setup.ts src/routes/HoldingDetailRoute.test.ts`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW–MED (config change affecting all 130 test files; the failure mode is loud)
- **Depends on**: `plans/274-rules-of-react-refs-purity.md` — DONE, merged in `7947825f`. It
  surfaced this gap.
- **Category**: dx / tests
- **Planned at**: commit `881c29f5`, 2026-07-26

## Why this matters

`vite.config.ts` defines an `@` → `./src` alias. **`vitest.config.ts` does not.**
They are separate configs — vitest does not inherit from vite when both exist.

25 source files import through that alias, and they are exactly the shared UI
layer everything else builds on:

```
src/components/coss/*   (badge, button, card, checkbox, field, input, label,
                         select, separator, skeleton, spinner, toggle, toggle-group)
src/components/ui/*     (button, calendar, command, date-picker, dialog, input,
                         input-group, popover, textarea)
src/components/RouteError.tsx
```

So **any test that transitively imports a COSS/shadcn component fails to
resolve**. That is most route components.

This is not theoretical. While executing plan 274, the executor wanted a test for
`HoldingDetailRoute` and hit exactly this. It worked around it — correctly, since
widening the config was outside that plan's scope — by mocking nine unrelated
components:

```ts
vi.mock("../components/coss/badge", () => ({ Badge: () => null }));
vi.mock("../components/coss/button", () => ({ Button: () => null }));
vi.mock("../components/coss/card", () => ({ Card: () => null }));
vi.mock("../components/coss/skeleton", () => ({ Skeleton: () => null }));
vi.mock("../components/coss/toggle-group", () => ({ ToggleGroup: () => null, ToggleGroupItem: () => null }));
vi.mock("../components/Field", () => ({ Field: () => null, TextInput: () => null }));
vi.mock("./InvestmentsAddSheet", () => ({ InvestmentEntryDrawer: () => null }));
vi.mock("./HoldingEditModal", () => ({ HoldingEditModal: () => null }));
vi.mock("./ManualPriceImportWizard", () => ({ ManualPriceImportWizard: () => null }));
```

None of that is about what the test asserts. It is nine mocks of scaffolding to
get past a missing config line — and **the next person who wants to test a route
component will write the same nine mocks again**. That is the cost this plan
removes.

Worth noting how invisible the gap has been: `grep -rl '@/' src/` finds
`src/domain/nlParser.test.ts`, but that hit is inside a **comment**
(`// @/known-merchant hits`). **No test has ever successfully imported through
the alias**, which is why nobody noticed it was missing.

## Current state

### `vitest.config.ts` (full file, at `881c29f5`)

```ts
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Must mirror vite.config.ts's compiler setup — otherwise tests validate
  // uncompiled components while the app ships compiled ones (plan 266).
  plugins: [react(), babel({ presets: [reactCompilerPreset({ compilationMode: "annotation" })] })],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    exclude: ["**/node_modules/**", "**/dist/**", "**/src/test/e2e/**", "**/.claude/**", "**/worker/**"],
  },
});
```

No `resolve` block. Note the existing comment already establishes the principle
that this file must mirror `vite.config.ts` where it matters.

### `vite.config.ts`'s alias (lines 12-17)

```ts
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
```

`dedupe` is about the single-React-instance problem for `@base-ui/react` in the
browser build. **It is not obviously needed for the test runner — do not copy it
blindly.** If you find a reason it is needed, say so; otherwise copy only the
alias.

### `src/test/setup.ts` (full file)

```ts
import "@testing-library/jest-dom/vitest";
```

### The localStorage question — UNRESOLVED, settle it in Step 1

The 274 executor reported that `state/uiPreferences` "reads `window.localStorage`
eagerly at module scope — jsdom here has no `localStorage`". The first half is
true: `uiPreferences.ts:306` runs `const initial = loadPersisted();` at module
scope, and `loadPersisted()` reads `window.localStorage` at `:197`.

**The second half is unverified and probably wrong.** Evidence:

- jsdom **does** provide `localStorage` when the document has a real origin. The
  advisor checked directly: `new JSDOM("", { url: "http://localhost:3000" })` →
  `typeof window.localStorage === "object"`. Only an opaque origin (no `url`)
  throws `SecurityError`. Vitest's jsdom environment sets a URL by default.
- Plan 265 upgraded jsdom **26 → 29**. Any lore about jsdom lacking
  `localStorage` may predate that.
- The 18 existing test files that touch `localStorage` do **not** appear to be
  polyfilling a missing API. The representative case,
  `src/state/deviceIdentity.test.ts:38-43`, installs a **Map-backed controllable
  fake** so the test can seed and inspect stored values:

  ```ts
      vi.stubGlobal("localStorage", {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        ...
      });
  ```

  That is a legitimate isolation pattern regardless of whether the real API
  exists, and it tells us nothing about availability.

So: **do not add a localStorage polyfill until Step 1 proves one is needed.**
Adding one to `setup.ts` changes the environment for all 130 test files, and
doing that to fix a problem that does not exist would be the worst outcome here.

### Conventions to match

- `vitest.config.ts` comments explain *why* and cite plan numbers — see the
  existing compiler-parity comment.
- `npm run format:check` is enforced in CI (plan 270). Run `npm run format`
  before committing.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm install` | exit 0 |
| Tests | `npm test` | 130 files / **1512** pass |
| Target suite | `npx vitest run src/routes/HoldingDetailRoute.test.ts` | pass |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Format | `npm run format && npm run format:check` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**:
- `vitest.config.ts` — add the alias
- `src/routes/HoldingDetailRoute.test.ts` — remove the workarounds the alias makes unnecessary
- `src/test/setup.ts` — **only if Step 1 proves localStorage is genuinely absent**

**Out of scope**:
- `vite.config.ts` — it is already correct.
- The other 129 test files. If one breaks, that is a STOP, not a thing to fix here.
- `tsconfig.json`'s `paths` — already correct and unrelated to the runtime resolver.
- Converting any `../` import to `@/`. This plan makes the alias *work*; it does
  not migrate anything to use it.
- Adding `dedupe` to vitest unless you can state a concrete reason.

## Git workflow

- Branch: `fix/ai-vitest-alias`
- Commits:
  1. `test(config): give vitest the same @ alias as vite`
  2. `test(holdings): drop the mocks that only existed to dodge the missing alias`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Settle the localStorage question empirically

Create a temporary probe test, e.g. `src/test/__probe.test.ts`:

```ts
import { describe, it } from "vitest";

describe("environment probe (plan 275, temporary)", () => {
  it("reports what the jsdom env actually provides", () => {
    // eslint-disable-next-line no-console
    console.log("PROBE typeof window.localStorage =", typeof window.localStorage);
    // eslint-disable-next-line no-console
    console.log("PROBE document.URL =", document.URL);
  });
});
```

Run `npx vitest run src/test/__probe.test.ts` and record both values.

- **If `typeof window.localStorage === "object"`** — the API exists, the 274
  executor's diagnosis was wrong, and **Step 4 is skipped entirely.** The only
  real problem is the alias.
- **If it is `"undefined"` or the access throws** — Step 4 applies.

**Delete the probe file** before moving on. Report both values either way.

### Step 2: Add the alias

In `vitest.config.ts`, add a `resolve` block mirroring `vite.config.ts`:

```ts
import path from "node:path";

export default defineConfig({
  // …
  resolve: {
    // Mirrors vite.config.ts. Without it, any test that transitively imports a
    // COSS/shadcn component (they import `@/lib/utils`) fails to resolve — which
    // is most route components. Plan 274 had to mock nine unrelated components
    // to get around it; plan 275 fixed it properly.
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
```

**Verify**:
- `npm test` → 130 files / **1512** passing, unchanged. The alias is additive:
  nothing resolved through it before, so nothing can break by adding it. **If the
  count changes, STOP** — something else was depending on the resolution failing.
- `npx tsc --noEmit` → exit 0

Commit as commit 1.

### Step 3: Prove it works by deleting the workarounds

This is the real verification — a config line that nothing exercises proves
nothing.

In `src/routes/HoldingDetailRoute.test.ts`, remove the mocks that existed only to
dodge the missing alias (the nine `vi.mock` calls listed in "Why this matters"),
and simplify the deferred `await import()` back to a normal static import **if**
Step 1 showed localStorage exists.

Remove them **one at a time**, re-running the suite after each, so that if one is
still genuinely required you know exactly which. Keep any mock that turns out to
be load-bearing, and say which and why.

Update the file's explanatory comment: it currently documents the workaround, and
should instead record that the alias now resolves and the mocks were removed
(cite plan 275).

**Verify**:
- `npx vitest run src/routes/HoldingDetailRoute.test.ts` → all 4 tests pass
- `npm test` → 130 files / 1512 passing
- Report how many of the nine mocks you were able to remove. **If it is fewer
  than seven, say so prominently** — that would mean the alias was not the main
  obstacle and this plan's premise is weaker than stated.

Commit as commit 2.

### Step 4: localStorage — ONLY if Step 1 proved it absent

Skip entirely if Step 1 showed `localStorage` exists.

If it is genuinely missing, add a minimal Map-backed implementation to
`src/test/setup.ts`, guarded so it never overwrites a real or stubbed one:

```ts
// jsdom only exposes localStorage for a document with a real origin. Provide a
// minimal fallback so module-scope reads (e.g. state/uiPreferences) don't throw
// on import. Tests that need to seed or inspect storage still stub their own via
// vi.stubGlobal — that takes precedence over this (plan 275).
```

**Verify**: `npm test` → 130 files / 1512 passing, unchanged. The 18 files that
stub their own `localStorage` must be unaffected — `vi.stubGlobal` overrides a
global, so they should be. **If any of them changes behaviour, STOP.**

### Step 5: Full verification

```bash
npm run format && npm run format:check
```

Then each exiting 0: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.

## Test plan

No new tests. This plan's subject is the test infrastructure, and its proof is
that **an existing test gets simpler while still passing**:

- `HoldingDetailRoute.test.ts` keeps its 4 tests and loses most of its scaffolding.
- The full suite stays at 130 files / 1512 tests — in both directions. A drop
  means something silently stopped running.

## Done criteria

- [ ] `npm test` → 130 files / 1512 passing
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run format:check`, `npm run build` all exit 0
- [ ] `grep -c '"@"' vitest.config.ts` returns 1
- [ ] `grep -c "vi.mock" src/routes/HoldingDetailRoute.test.ts` is at most 2
      (down from 9), or the shortfall is explained
- [ ] No probe file remains: `ls src/test/__probe.test.ts` → not found
- [ ] Step 1's two probe values are recorded in the report
- [ ] `git diff --name-only 881c29f5..HEAD` lists only `vitest.config.ts`,
      `src/routes/HoldingDetailRoute.test.ts`, and `src/test/setup.ts` if Step 4 applied
- [ ] `plans/README.md` status row updated

## STOP conditions

- `npm test`'s count changes at any step, in either direction.
- Any of the other 129 test files starts failing. The alias is additive; if
  adding it breaks something, that something was depending on a resolution
  failure and needs understanding, not patching.
- Fewer than seven of the nine mocks can be removed in Step 3.
- Step 4 changes behaviour in any of the 18 files that stub `localStorage`.
- You are tempted to add `dedupe: ["react", "react-dom"]` without a concrete
  reason, or to migrate imports to `@/`.

## Maintenance notes

- **`vitest.config.ts` and `vite.config.ts` are separate and must be kept in sync
  by hand.** They now share two things: the React Compiler setup (plan 266) and
  the `@` alias (this plan). Nothing enforces the parity — if a third shared
  concern appears, it needs adding in both places, and the comments in each file
  should keep saying so.
- The reason this gap survived so long is that no test ever imported through the
  alias, so it failed silently by simply never being exercised. Now that route
  components are testable, expect more of them to get tests — which is the point.
- If a future test still needs to mock COSS components, that should be for
  isolation or speed, not resolution. If someone writes "mock these to fix an
  import error" again, the parity has drifted.
