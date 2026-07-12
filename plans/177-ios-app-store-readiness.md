# Plan 177: iOS App Store readiness — everything an executor can prepare before the operator buys the developer account

> **Executor instructions**: This plan has a hard split: **Phase A steps are
> yours**; **Phase B is operator-only** (listed so the handoff is complete —
> do NOT attempt any Phase B step, including anything requiring an Apple ID,
> signing identity, or App Store Connect). If anything in "STOP conditions"
> occurs, stop and report. When done, update the status row in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4ac63576..HEAD -- src-tauri/ docs/ios-mobile-plan.md package.json`
> On drift, compare "Current state" claims against live config before
> proceeding.

## Status

- **Priority**: P3
- **Effort**: M (Phase A)
- **Risk**: LOW (Phase A is config/docs; no app-logic changes)
- **Depends on**: none (but see Maintenance notes: the per-route mobile RWD
  pass in `docs/ios-mobile-plan.md` Phase 3 is a parallel workstream)
- **Category**: direction (roadmap 規劃中: iOS App Store 上架 + Apple 公證)
- **Planned at**: commit `4ac63576`, 2026-07-12

## Why this matters

ROADMAP.md lists iOS 上架 as planned with prerequisites done:「前置（同步、
免費佈建測試）已就緒；待短期項穩定後申請開發者帳號、Touch-first 介面調整、
ASO」. The app already runs on iPhone via free provisioning
(`docs/ios-mobile-plan.md` is the working SOP; Xcode project generated at
`src-tauri/gen/apple/`, bundle id `app.northstar.finance`, updater correctly
`#[cfg(desktop)]`-gated). What blocks submission is a mix of a **$99/year
operator decision** and a pile of **preparable-now artifacts** (metadata,
privacy answers, export-compliance declaration, icons, review-note copy).
Preparing those now means the day the operator enrolls, the path to TestFlight
is hours, not weeks — and the same account unblocks Apple 公證 for the macOS
build (roadmap couples them).

## Current state

- `docs/ios-mobile-plan.md` — free-provisioning SOP (7-day re-sign), toolchain
  done (rustup, iOS targets, CocoaPods), simulator + device deploy commands.
  Its「更新策略（待定）」section already notes: real distribution → TestFlight/
  paid account decision.
- `src-tauri/gen/apple/` — generated Xcode project. NOTE: Tauri can regenerate
  this; treat manual edits inside it as fragile (prefer Tauri config where
  possible; where an Info.plist edit is unavoidable, document it in the SOP
  doc as a "re-apply after regeneration" item — the repo memory records an
  open question about Tauri regeneration overwriting Xcode-side settings).
- `src-tauri/tauri.conf.json` + `src-tauri/capabilities/default.json` —
  updater capability is desktop-gated (verify — this is an App Store
  requirement: no self-update on iOS).
- Sync uses AES-GCM-256 E2E encryption (`src/features/connect/crypto/`) —
  relevant to the export-compliance declaration (Phase A Step 4).
- Privacy posture (for the App Privacy label): local-first, no analytics, no
  data collection by the developer; market data fetched from Yahoo/SITCA
  (server sees ticker requests); optional sync relays **encrypted** blobs
  (server cannot read finance data — PRODUCT.md: "the server must never
  become a readable finance database").
- Marketing copy sources: README.md (zh-TW product overview), PRODUCT.md,
  DESIGN.md — raw material for ASO text.
- App icon source: `src-tauri/icons/` (the SOP's Phase-4 note: iOS AppIcon set
  via `npm run tauri icon src-tauri/icons/source.png`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Tauri checks | `npm run check:tauri` | exit 0 |
| iOS sim build (no signing needed) | `npm run tauri ios build -- --target aarch64-sim --debug` | build completes |
| Icon gen | `npm run tauri icon src-tauri/icons/source.png` | iOS AppIcon set generated |
| Typecheck/tests (if any TS touched) | `npx tsc --noEmit` / `npm test` | 0 / all pass |

## Scope

**In scope (Phase A)**:
- `docs/app-store-submission.md` (create — the submission dossier)
- `docs/ios-mobile-plan.md` (append a「上架」section pointing at the dossier)
- `src-tauri/` config changes ONLY as specified in Steps 3–4 (icons,
  version/build alignment, export-compliance key)

**Out of scope**:
- Anything requiring an Apple ID, certificate, signing, App Store Connect, or
  payment — Phase B, operator-only. **Prohibited for the executor.**
- Touch-first per-route RWD fixes (ios-mobile-plan Phase 3 — separate work).
- Screenshots (need a signed device build and final UI).
- The macOS notarization pipeline itself (same account, different plan later).

## Git workflow

- Branch: `feat/ai-appstore-readiness`
- Conventional commits, e.g. `docs(ios): App Store submission dossier`
- Do NOT push or merge.

## Steps — Phase A (executor)

### Step 1: Submission dossier — metadata + ASO draft

Create `docs/app-store-submission.md` with ready-to-paste zh-TW (primary) +
en (secondary) blocks: app name candidates (≤ 30 chars), subtitle (≤ 30),
promotional text (≤ 170), description (from README.md's feature list, rewritten
for store tone), keywords (100-char comma list — derive from the product's
actual nouns: 記帳/資產/淨值/股票/FIRE/隱私…), support URL + privacy-policy URL
placeholders (mark as OPERATOR-PROVIDE), category (Finance), age rating
answers (finance app, no objectionable content → likely 4+; list the
questionnaire answers).

**Verify**: doc section exists; every OPERATOR-PROVIDE item is grep-able:
`grep -c "OPERATOR-PROVIDE" docs/app-store-submission.md` ≥ 2.

### Step 2: App Privacy ("nutrition label") answers

In the dossier, a table mapping Apple's data-collection questionnaire to
Northstar's reality with code evidence: no analytics/tracking SDKs (verify:
`grep -rn "analytics\|sentry\|firebase\|posthog" package.json src/` → expect
no runtime hits — record the result), finance data stored on-device only,
optional sync = E2E-encrypted content the developer cannot read, market-data
requests expose tickers+IP to Yahoo/SITCA (this belongs under "data not linked
to you / not collected by developer" reasoning — write the justification, flag
the final legal reading as OPERATOR-CONFIRM).

**Verify**: the greps' outputs are pasted into the doc as evidence.

### Step 3: Icons + version alignment

Generate the iOS AppIcon set (`npm run tauri icon …` — confirm the source PNG
is 1024²; if `source.png` doesn't exist, find the actual master in
`src-tauri/icons/` and use it). Confirm `tauri.conf.json` version and the
Xcode project's marketing version stay in sync via Tauri's config (document
how the build number will be bumped per TestFlight upload — config evidence,
not guesswork).

**Verify**: `npm run tauri ios build -- --target aarch64-sim --debug`
completes; icon assets present under `src-tauri/gen/apple/`.

### Step 4: Export compliance + capability audit

- Determine where `ITSAppUsesNonExemptEncryption` (or Tauri's equivalent
  config surface) must be set. Northstar uses standard encryption (AES-GCM,
  PBKDF2 — exempt category, but the annual self-classification report duty is
  the operator's): set the key to the value the exemption implies, and write
  the one-paragraph justification + OPERATOR-CONFIRM flag in the dossier.
- Audit `src-tauri/capabilities/` for desktop-only permissions leaking into
  the iOS build (updater especially — expected already gated; record
  evidence). List every plugin the iOS build compiles and its store-review
  implication (fs → user backups on-device: fine; haptics: fine; etc.).

**Verify**: `npm run check:tauri` → exit 0; dossier lists each capability with
a verdict.

### Step 5: Review-notes draft + Phase B runbook

- Draft "Notes for App Review": what the app does, that it needs no account,
  how a reviewer can try it instantly (示範模式 — demo mode), why local
  network permission is NOT requested in release builds (that's dev-mode
  only — verify and cite).
- Write the Phase B runbook as a numbered operator checklist: enroll ($99) →
  agreements/tax/banking → create app record (bundle id
  `app.northstar.finance`) → signing switch from Personal Team → TestFlight
  internal build → screenshots (list required device sizes) → submit. Each
  step one line + official-doc pointer. Include the roadmap's coupling: same
  account also unblocks macOS notarization (Apple 公證).

**Verify**: dossier complete; `docs/ios-mobile-plan.md` links to it.

## Phase B (operator-only — do not execute)

Enumerated in the Step 5 runbook. Nothing for the executor here.

## Test plan

No app-logic tests. Gates: `npm run check:tauri` exit 0, sim build completes,
`npm test` untouched-and-green if any TS file was touched (none expected).

## Done criteria

- [ ] `docs/app-store-submission.md` exists with: metadata/ASO, privacy table
      with pasted grep evidence, export-compliance section, capability audit,
      review notes, Phase B runbook
- [ ] iOS AppIcon set generated; sim debug build completes
- [ ] `npm run check:tauri` exit 0
- [ ] No signing/account/App Store Connect action was taken
- [ ] `plans/README.md` status row updated

## STOP conditions

- The sim build fails for reasons unrelated to this plan's changes — report
  the build log; do not fix unrelated iOS build breakage here.
- Setting the export-compliance key requires editing generated files under
  `src-tauri/gen/apple/` with no Tauri-config alternative — do it, but flag
  it prominently in the dossier's "re-apply after regeneration" list AND the
  report (known regeneration-overwrite risk).
- You find analytics/tracking code in Step 2's grep — that contradicts the
  privacy posture; report immediately (it changes the privacy label AND the
  product claim).

## Maintenance notes

- The dossier goes stale with every feature that adds a permission or data
  flow; re-audit Step 2/4 before actual submission.
- Screenshots + final ASO polish need the RWD pass (ios-mobile-plan Phase 3)
  done first — sequencing note for the operator.
- 7-day free-provisioning friction disappears the day Phase B starts; until
  then the SOP in ios-mobile-plan.md remains the deploy path.
