# Plan 274: Fix the 6 Rules-of-React violations that are actual bugs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> **These are six findings of four different kinds with four different fixes.**
> One of them may correctly turn out to be unfixable-and-suppressed; that is a
> valid outcome, not a failure. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 6969dc4e..HEAD -- src/components/AnimatedNumber.tsx src/components/ModalShell.tsx src/components/AppShell.tsx src/routes/HoldingDetailRoute.tsx`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (`ModalShell`/`AppShell` are on every screen; the purity fix touches a displayed financial figure)
- **Depends on**: `plans/266-react-compiler.md` — DONE, merged. It enabled these rules at `warn`.
- **Category**: bug
- **Planned at**: commit `6969dc4e`, 2026-07-26

## Why this matters

Plan 266 enabled `eslint-plugin-react-hooks` v7's React Compiler diagnostics and
found 40 violations. **This plan deliberately takes only 6 of them** — the
`react-hooks/refs` and `react-hooks/purity` findings — because those are genuine
Rules-of-React violations that can misbehave under React's concurrent rendering,
independent of whether the compiler is ever switched on.

The other 34 (mostly `set-state-in-effect`) are largely benign derived-state
synchronisation. They stay as warnings. **Do not touch them.**

Plan 266's own recommendation was *not* to adopt whole-app compilation — the
measured evidence was build-time cost with no demonstrated render-time benefit.
So this plan is not compiler groundwork. It fixes bugs that happen to have been
found by a compiler's linter.

One of the six is worth more than lint hygiene: the `purity` finding computes a
displayed figure from `Date.now()` **during render**, in **UTC**, on a route that
shows 持倉天數 and 配息 YTD. This repo has already had one timezone-window bug
(plan 042, `networth-window-timezone-fix`), and there is an established
house convention — `todayInTimezone(timezone)` — that this site does not use.

## Current state — the six findings, in four groups

Verified at `6969dc4e` by running
`npx eslint src --format json` and filtering to these two rules. **Line numbers
are post-Prettier-reformat (plan 270) — the numbers in plan 266's report are
stale, do not use them.**

### Group A — "latest value" ref written during render (3 sites)

`src/components/AnimatedNumber.tsx:38-39`:

```ts
  const formatRef = useRef(format);
  formatRef.current = format;
```

`src/components/ModalShell.tsx:130-134`:

```ts
  // Keep the latest close/flags reachable from the mount-only listener without re-binding.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const disableEscapeRef = useRef(disableEscape);
  disableEscapeRef.current = disableEscape;
```

All three are the same deliberate pattern, and the ModalShell comment states the
intent plainly: keep the newest prop reachable from a mount-only listener without
re-binding it. **The intent is right; the mechanism is not.** Writing a ref during
render is unsafe because React may render and then discard the result (StrictMode
double-render, a suspended or interrupted concurrent render) — the ref mutation
still happened.

**Fix**: move the assignment into an effect with no dependency array, so it runs
after every committed render:

```ts
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
```

This is safe for all three because each ref is only *read* later, from a user
event or an animation frame — never during the same render pass. Confirm that per
site before changing it (see Step 1).

### Group B — ref read during render, deciding rendered output (1 site)

`src/components/AppShell.tsx:464`, with the ref declared at `:111` and set at `:114`:

```ts
  const hasToggledPrivacyRef = useRef(false);
  …
    hasToggledPrivacyRef.current = true;
  …
        data-privacy-anim={hasToggledPrivacyRef.current ? "" : undefined}
```

This is the **opposite** problem from Group A: the ref is *read* during render and
its value decides an attribute in the output. React cannot know the output depends
on it, so a re-render triggered by anything else may paint a stale attribute.

The intent is to suppress the privacy animation on first paint and only animate
after the user has toggled. Since the toggle already drives `privacyMode` (real
state, used on the very next line as `key={privacyMode ? … : …}`), **this wants to
be state, not a ref.**

**Fix**: convert to `useState`, set it in the same place the ref was set. Verify
the first paint still does *not* animate — that is the whole point of the flag.

### Group C — render-prop, likely inherent (1 site)

`src/components/ModalShell.tsx:379`:

```tsx
        {typeof children === "function" ? children(requestClose) : children}
```

`requestClose` is a `useCallback` (`:156`) that reads `closingRef.current`,
`panelRef.current` and `closeRef.current`. The rule flags the render-prop
invocation because it cannot prove the callback is not called during render.

**Investigate before changing anything.** If this is inherent to the render-prop
API — i.e. the only fix is changing `ModalShell`'s public shape — then the
correct outcome is to **suppress it with a justification comment**, matching how
this repo already handles documented exemptions (see the 金額顯示 exemptions in
`CashFlowRoute.tsx` / `ExportSection.tsx`, and note they use **line-range**
`/* eslint-disable */ … /* eslint-enable */` because
`eslint-disable-next-line` does not survive Prettier reflow — plan 270 Step A1.5).

**Changing `ModalShell`'s public API is out of scope.** It is used across the app;
that is a separate design change.

### Group D — impure render (1 site)

`src/routes/HoldingDetailRoute.tsx:332-335`:

```ts
  const holdingSince = earliestBuyDate ?? asset.acquisitionDate ?? null;
  const holdingDays = holdingSince
    ? Math.max(0, Math.floor((Date.now() - new Date(holdingSince).getTime()) / 86_400_000))
    : null;
```

`Date.now()` during render makes the render impure — the same inputs produce
different output on different renders.

**And there is a second-order issue worth fixing at the same time.** The same file
derives "today" from UTC in three more places:

```
 73:  const todayStr = new Date().toISOString().slice(0, 10);
108:  const today = new Date().toISOString().slice(0, 10);
339:  const thisYear = new Date().toISOString().slice(0, 4);
```

`toISOString()` is **UTC**, not the user's timezone. For a user in UTC+8 (this app
is zh-TW first), between 00:00 and 08:00 local time these yield *yesterday* —
which shifts 持倉天數 by a day and can put a dividend in the wrong year for
配息 YTD near a year boundary.

The repo already has the right helper and uses it elsewhere:

```
src/routes/DashboardRoute.tsx:342   const todayIso = todayInTimezone(timezone);
src/routes/InvestmentsRoute.tsx:1486 const todayIso = todayInTimezone(timezone);
src/routes/CashFlowRoute.tsx:1807   const todayIso = useMemo(() => todayInTimezone(timezone), [timezone]);
```

**Fix**: adopt that convention here. Only line 334 is *flagged*, but fixing it
alone while leaving three UTC-derived siblings would be worse than useless — it
would look fixed. Read how `timezone` is obtained in `InvestmentsRoute.tsx:1486`
and follow it.

**This changes a displayed financial figure** (持倉天數, and possibly 配息 YTD near
year boundaries) for users west of UTC. That is a *correction*, but it must be
called out in your report as a behaviour change, not slipped in as a lint fix.

### Conventions to match

- Comments explain *why* and cite the plan number.
- Documented lint exemptions use **line-range** disables with a justification
  comment (plan 270 Step A1.5 — `eslint-disable-next-line` is not
  reflow-safe under Prettier).
- `npm run format:check` is now enforced in CI. Run `npm run format` before
  committing.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm install` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Format | `npm run format` then `npm run format:check` | exit 0 |
| Tests | `npm test` | 129 files / **1508** pass |
| Component suites | `npx vitest run src/components/ModalShell.test.tsx src/components/AnimatedNumber.test.tsx` | pass |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**:
- `src/components/AnimatedNumber.tsx`, `src/components/ModalShell.tsx`,
  `src/components/AppShell.tsx`, `src/routes/HoldingDetailRoute.tsx`
- New/updated tests for the behaviours you change

**Out of scope**:
- **The 34 other React Compiler findings**, especially the 31
  `set-state-in-effect`. Not one of them.
- `ModalShell`'s public API (the render-prop shape).
- Turning the compiler on for more components, or changing `compilationMode`.
- Raising any of these rules from `warn` to `error` — leave severities alone.
- Any unrelated `Date.now()` / `new Date()` outside `HoldingDetailRoute.tsx`.

## Git workflow

- Branch: `fix/ai-rules-of-react`
- Commits, one per group so each is independently reviewable/revertable:
  1. `fix(react): write latest-value refs in an effect, not during render`
  2. `fix(react): drive the privacy-animation flag from state, not a ref`
  3. `fix(holdings): derive today from the user's timezone, not UTC`
  4. `chore(lint): document the ModalShell render-prop exemption` *(only if Group C is inherent)*
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Baseline and re-derive the findings

```bash
npm test 2>&1 | tail -3      # expect 129 files / 1508
npm run lint 2>&1 | tail -3  # expect exit 0
npx eslint src --format json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);for(const f of r)for(const m of f.messages)if(m.ruleId==='react-hooks/refs'||m.ruleId==='react-hooks/purity')console.log(m.ruleId, f.filePath.replace(process.cwd()+'/','')+':'+m.line)})"
```

**Verify**: exactly 6 findings, matching the four groups above. If the count or
locations differ, the code has drifted — compare against Current state before
proceeding.

### Step 1: Group A — move the three ref writes into effects

For each of the three sites, **first confirm the ref is never read during the same
render** (search each `*Ref.current` read and check it is inside an event handler,
an effect, or a rAF callback). Record what you found per site.

Then convert each to an effect with no dependency array. Keep the existing
explanatory comments.

**Verify**:
- `npx tsc --noEmit` → exit 0
- `npm test` → 1508 passing
- `npx vitest run src/components/ModalShell.test.tsx` → pass. This suite matters:
  `requestClose` has a jsdom-specific synchronous path (`ModalShell.tsx:160-166`)
  that the tests depend on.
- `npx eslint src/components/AnimatedNumber.tsx src/components/ModalShell.tsx` →
  the three `refs` findings for these writes are gone

Commit as commit 1.

### Step 2: Group B — AppShell privacy flag to state

Convert `hasToggledPrivacyRef` to state. Set it wherever the ref was set (`:114`).

**Verify**:
- `npx tsc --noEmit`, `npm test` → 1508
- **Behavioural check, and it is the point of the flag**: run `npm run dev`, load
  the app, and confirm the main content does **not** play the privacy animation on
  first paint. Then toggle privacy mode and confirm it *does* animate. If first
  paint animates, the fix is wrong — that flag exists to suppress exactly that.

Commit as commit 2.

### Step 3: Group D — timezone-correct "today" in HoldingDetailRoute

Replace the four UTC-derived values (lines 73, 108, 334, 339 at `6969dc4e`) with
the `todayInTimezone(timezone)` convention. Read `InvestmentsRoute.tsx:1486` first
to see how `timezone` is obtained in this codebase and follow it exactly.

Line 269 (`new Date().toISOString()` inside an event handler) is **not** a render
purity problem — check whether it should also be timezone-correct for consistency,
and say what you decided either way.

**Verify**:
- `npx tsc --noEmit`, `npm run lint`, `npm test` → 1508
- `npx eslint src/routes/HoldingDetailRoute.tsx` → the `purity` finding is gone
- **Write a test** for the timezone behaviour: 持倉天數 for a known
  `holdingSince` must be computed against the user's timezone, not UTC. Model it
  on whichever existing suite covers `todayInTimezone` — find it first
  (`grep -rn "todayInTimezone" src/ --include=*.test.ts*`).

Commit as commit 3.

### Step 4: Group C — investigate, then decide

Determine whether `ModalShell.tsx:379` can be fixed without changing the
component's public API.

- **If it can** (e.g. the callback can be made ref-free), do it and verify
  `ModalShell.test.tsx` still passes.
- **If it cannot**, suppress it with a **line-range** disable and a comment
  explaining that the render-prop invocation is the component's public contract
  and the callback is only ever invoked from user events. Do **not** use
  `eslint-disable-next-line` — Prettier reflow can orphan it (plan 270 Step A1.5).

Either outcome is acceptable. Say which you chose and why.

Commit as commit 4 (only if you changed anything).

### Step 5: Full verification

```bash
npm run format && npm run format:check   # CI enforces this now
```

Then, each exiting 0: `npx tsc --noEmit`, `npm run lint`, `npm test` (1508 + any
tests you added), `npm run build`.

Re-run Step 0's finding query: **expect 0 `refs` and 0 `purity` findings**, or
exactly the ones you deliberately suppressed in Step 4 (which will not appear at
all if suppressed correctly).

## Test plan

- **Group A**: no new tests. The existing `ModalShell.test.tsx` and
  `AnimatedNumber.test.tsx` are the net — they cover the close/escape and
  animation paths that read these refs. They must pass unedited.
- **Group B**: the manual first-paint check in Step 2. If you can express it as a
  test (asserting `data-privacy-anim` is absent on first render), do — that is
  better than a manual check.
- **Group D**: **a real new test is required.** This changes a displayed figure.
  Assert 持倉天數 is derived in the user's timezone — pick a `holdingSince` and a
  timezone where UTC and local disagree on the date, and assert the local answer.
- **Group C**: none if suppressed.

## Done criteria

- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run format:check`, `npm run build` all exit 0
- [ ] `npm test` → at least 1508 passing, plus your new Group D test
- [ ] Step 0's query returns 0 `react-hooks/refs` and 0 `react-hooks/purity` findings
- [ ] `grep -c "set-state-in-effect" eslint.config.js` returns 1 and its severity is still `"warn"` — you did not touch the other 34
- [ ] `git diff --name-only 6969dc4e..HEAD` lists only the four in-scope source files plus test files
- [ ] The Group B first-paint behaviour is confirmed (no animation on load, animation after toggle)
- [ ] Your report states the Group D behaviour change explicitly
- [ ] `plans/README.md` status row updated

## STOP conditions

- Step 0 finds a different number or set of findings than the six described.
- `ModalShell.test.tsx` fails after Group A. That suite guards a jsdom-specific
  synchronous close path; a failure means the effect timing changed something real.
- The Group B fix causes the privacy animation to play on first paint.
- Fixing Group C would require changing `ModalShell`'s public API — suppress
  instead, do not redesign the component.
- You find yourself editing any of the 31 `set-state-in-effect` sites.
- The Group D change alters 配息 YTD by more than a boundary-date shift — that
  would mean the dividend filter logic changed, not just the date source. Report it.

## Maintenance notes

- **Group A's pattern is worth knowing**: `ref.current = value` during render is
  the idiomatic-looking "latest ref" trick and it is wrong under concurrent
  rendering. The effect form is the fix. If this pattern reappears, the
  `react-hooks/refs` rule now catches it — it is enabled at `warn`.
- **Group D is the one with user-visible consequences.** After it lands, 持倉天數
  changes by a day for users west of UTC during their morning. That is a
  correction, and `docs/` has prior art for this class of bug (plan 042's
  net-worth window timezone fix).
- The 34 remaining React Compiler findings stay as warnings. If someone later
  wants whole-app compilation, those are the backlog — plan 266's report lists
  them by rule and file, and notes that the financial routes carrying most of the
  `set-state-in-effect` findings have no component tests.
