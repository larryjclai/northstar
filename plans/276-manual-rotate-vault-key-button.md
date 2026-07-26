# Plan 276: Manual「立即更換加密金鑰」button (vault-key rotation §7 Q4 follow-up)

> **Executor instructions**: Work in a git worktree on branch
> `feat/ai-manual-rotate-button`. **Never edit the main checkout.** First
> command in every session: `pwd` — confirm you are in the worktree, not
> `/Users/juicheng/Documents/GitHub/northstar`. On a STOP condition, stop and
> report; do not improvise past it. Do NOT update `plans/README.md` (the
> advisor does that on merge).

## Status

- **Priority**: P3 · **Effort**: S · **Risk**: LOW (UI-only; zero new crypto)
- **Depends on**: 239/240/241/242 (all DONE + merged), spike 238
- **Category**: security UX
- **Planned at**: commit `91a0fc21`, 2026-07-26

## Why this exists

`docs/vault-key-rotation-plan.md` §7 Q4 was decided **yes** on 2026-07-19:
a standalone "rotate now" action in Settings, for the case §1 names explicitly
— *credential leaked independent of any device compromise* — deliberately
scheduled as a thin follow-up **after** phases A–D rather than in v1. A–D have
now all shipped, so this is unblocked.

The spike's own framing (§7 Q4): *"exposing it as a standalone action in
`ConnectSection.tsx` is a small UI addition once the mechanism exists."*
That is exactly the scope. **This plan writes no cryptography, no protocol,
and no worker change.** `rotateVaultKey()` already does everything; it has
zero standing UI entry points today — it only auto-fires from `handleRevoke`
(`src/routes/settings/ConnectSection.tsx:618`) or appears transiently as a
「重新執行輪替」action inside a failure toast (`:560`, `:583`, `:631`).

## Ground truth (verify each before editing; cite if it has drifted)

- `src/features/connect/sync/rotation.ts:111` —
  `rotateVaultKey(account: SyncAccount, excludeDeviceId?: string): Promise<RotationResult>`.
  Call it with **no** `excludeDeviceId` for a manual rotation — there is no
  device being removed. `handleRetryRotation` (`ConnectSection.tsx:569-586`)
  already does exactly this and documents why it is safe.
- `RotationResult` (`rotation.ts:91-100`): `{ rotated, reason, newVersion?,
  targetCount, succeeded, failed }` where `reason` is
  `"no-remaining-devices" | "ok" | "partial-failure"`.
- **Idempotent / safe to re-run** (`rotation.ts:44-56`): every deposit UPSERTs,
  each attempt allocates a fresh server-side version, and Phase B's
  never-delete invariant makes an abandoned version harmless.
- **Solo-device accounts are a deliberate no-op** (`rotation.ts:121-131`,
  operator decision 3): zero remaining targets ⇒ no key generated, no version
  allocated, pointer untouched.
- **LAZY relay strategy** (`rotation.ts:36-42`): old sync envelopes keep their
  old key **forever**; only new pushes use the new key. The UI copy below must
  not contradict this.
- Existing helpers to REUSE, not reimplement:
  `showRotationPartialFailureToast(failed)` (`:554`), `describeDevice(id)`
  (`:547`), `handleRetryRotation()` (`:569`), `isRecoveryKitStale()` (used at
  `:626`), and the `confirmRevokeId` inline-confirm pattern (`:1502-1535`).
- `devices` (state) **includes this device**; `identity.deviceId` is self.
  Target count for copy = `devices.length - 1`.
- This file uses **inline zh-TW strings**, not `copy.csv` / `t()` — every
  shipped rotation string at `:557`, `:577`, `:601`, `:630` is inline. Follow
  that. Do **not** add these strings to `copy.csv`.

## What to build — one file: `src/routes/settings/ConnectSection.tsx`

### Step 1 — state

Two new pieces, named per the file's own conventions (`*Loading`,
`confirmRevokeId`):

```ts
const [confirmRotate, setConfirmRotate] = useState(false);
const [rotateLoading, setRotateLoading] = useState(false);
```

### Step 2 — handler

Add `handleManualRotate()` next to `handleRetryRotation`. It must handle
**all three** `reason` values plus a throw — unlike `handleRetryRotation`,
which silently does nothing on `no-remaining-devices` (acceptable there,
because it only ever runs as a retry of a rotation that already had targets;
**not** acceptable for a user-initiated button, where silence reads as "the
button is broken"). Behaviour:

| outcome | UI |
|---|---|
| `reason === "partial-failure"` | `console.error` + reuse `showRotationPartialFailureToast(result.failed)` verbatim |
| `result.rotated` (`reason === "ok"`) | `toast.success("加密金鑰已更換。", { description: "其他裝置下次同步時會自動取得新金鑰。" })` **and** `setKitStale(await isRecoveryKitStale())` — rotation stales the Recovery Kit (plan 242 step 3), same as the revoke path at `:626` |
| `reason === "no-remaining-devices"` | `toast.info("目前只有這台裝置，沒有其他裝置需要更換金鑰。")` — the decision-3 no-op, stated plainly rather than swallowed. (`toast` here is the repo's own `useToast()` from `src/components/Toast.tsx:203`, **not** sonner; its `info(title, options?)` exists — verified at `Toast.tsx:48`.) |
| throws | `console.error` + `toast.error("加密金鑰更換失敗，請稍後再試。", { action: { label: "重新執行輪替", onClick: () => void handleRetryRotation() } })` |

Wrap in `try/finally` so `setRotateLoading(false)` and `setConfirmRotate(false)`
always run. Guard `if (!account) return;` first, as every sibling handler does.

### Step 3 — UI block

Insert **between** the trusted-devices list (`</div>` closing the
`flex flex-col gap-1.5` map at `:1538`) and the Recovery Kit block
(`{/* Recovery Kit */}` at `:1540`). Rotation stales the kit, so it reads
naturally directly above it.

Use the Recovery Kit block's own container treatment for visual consistency:
`className="mt-5"` with `style={{ paddingTop: 18, borderTop: "1px solid var(--ns-border)" }}`.

Contents:

1. Title row: `<div className="text-body font-semibold">加密金鑰</div>`
2. Explanatory copy — **honest, per §1; must not overpromise**:
   > 懷疑金鑰可能外洩時，可以立即更換。更換後的新資料會用新金鑰加密；**先前已同步出去的舊資料仍維持原本的金鑰**，更換金鑰不會把它們收回。

   Style the caption like the file's other explanatory lines (e.g. `:1285`,
   `:1370`) — match whatever class/token those use rather than inventing one.
3. **When `devices.length <= 1`**: render no button. Render instead:
   > 目前只有這台裝置。要更換金鑰需要至少一台其他已信任裝置來接收新金鑰。

   (This is decision 3 made visible, so the disabled state explains itself.)
4. **Otherwise**, mirror the `confirmRevokeId` two-step pattern:
   - default: `<Button variant="outline">` labelled **立即更換加密金鑰**, with
     the already-imported `Key` icon (see the import block at `:1-30`; `Key`
     and `ArrowsClockwise` are both already imported — **do not add an import**),
     `onClick={() => setConfirmRotate(true)}`.
   - confirming: a short warning line naming the cost, then 取消 / 確認更換:
     > 其他 {devices.length - 1} 台裝置各自連上一次後才會拿到新金鑰，在那之前它們讀不到新資料。備援碼也需要重新產生。

     取消 = `variant="ghost"`, 確認更換 = `variant="outline"`.
   - while `rotateLoading`: disable the confirm button and label it **更換中…**.
     If the file has a spinner idiom for this (`Spinner` is imported), match it;
     otherwise text-only is fine.

Follow AGENTS.md's style order: COSS components first, then `ns-*`/Tailwind
utilities, `style={{}}` **only** for dynamic values. The static inline styles
copied from the sibling Recovery Kit block are acceptable *because they are
the local convention in this file* — do not refactor the neighbours.

## Explicitly OUT of scope

- Any file other than `src/routes/settings/ConnectSection.tsx`.
- `rotation.ts`, anything under `src/features/connect/crypto/`, `worker/`,
  any migration. If you believe one needs to change: **STOP and report**.
- Refactoring `handleRevoke` / `handleRetryRotation` / the existing toasts.
  They are shipped security paths; converging the three call sites onto a
  shared summarizer is a tempting cleanup and is **not** this plan.
- `copy.csv` / i18n extraction.

## On tests

`ConnectSection.tsx` has **no test file today** (`find src -iname
"*ConnectSection*"` → the `.tsx` only), and standing up a first harness for a
2200-line component is disproportionate to a button. Do **not** add one.

The risk this leaves is acceptable and bounded: the rotation *mechanism* has
12 tests in `src/features/connect/sync/rotation.test.ts` (including the
solo-device no-op, partial-failure-does-not-flip-the-pointer, and the
never-touches-relay-history assertion), and this plan adds **no branching
crypto decision** — only which toast to show for a `reason` the tested module
already returns. If you find yourself writing logic that *decides* something
about keys, you have left the plan's scope: **STOP**.

## Verify (assert the property, not a proxy)

Record the baseline **before** editing: `npm test 2>&1 | tail -5` → note the
passing count. Then, after the change, all of:

1. `git diff --stat main` lists **exactly one** file:
   `src/routes/settings/ConnectSection.tsx`. Any second file ⇒ STOP.
2. `git diff main -- src/routes/settings/ConnectSection.tsx | grep '^-' | grep -E "裝置已移除|已更新金鑰,但有|重新執行輪替"`
   prints **empty** — no shipped rotation/revoke copy was deleted or reflowed.
3. `npx tsc --noEmit` → 0 errors.
4. `npm run lint` → 0 errors (warnings are the repo's normal state).
5. `npm run format:check` → passes.
6. `npm test` → **the same passing count as the baseline you recorded**, 0 failures.
7. `grep -c "rotateVaultKey" src/routes/settings/ConnectSection.tsx` → **was 5**
   (advisor measured at `91a0fc21`: 1 import + 2 comment mentions + 2 call
   sites); must now be **6** — the new handler's single call site. A different
   number means you added or lost a call site; explain it or STOP.
8. `npm run build` → succeeds.

## STOP conditions

- `rotateVaultKey`'s signature or `RotationResult`'s shape differs from the
  citations above (the plan floats on fiction — report what IS there).
- A standing manual-rotation entry point **already exists** somewhere in the
  UI (then this plan is already done — report where).
- Making the button work appears to require changing `rotation.ts`. It does
  not; `handleRetryRotation` already proves the exact call works from this file.
- `devices` turns out **not** to include this device (the `devices.length - 1`
  target count and the `<= 1` guard would both be off by one).

## Commit

`feat(connect): manual vault-key rotation button (plan 276)` + standard trailer.
Push the branch. Do **not** merge — the advisor reviews, the operator decides.

## Maintenance notes

- The three rotation call sites in `ConnectSection.tsx` (revoke auto-fire,
  failure-toast retry, and now the manual button) each hand-roll their
  outcome messaging. A future cleanup could converge them on one pure
  `summarizeRotation(result)` helper with real unit tests — deliberately not
  done here to keep a shipped HIGH-risk security path untouched by a P3 UI
  addition.
- This closes `docs/vault-key-rotation-plan.md` §7 Q4. After merge, the whole
  vault-key rotation track (238 → 239/240/241/242 → 276) is complete.
