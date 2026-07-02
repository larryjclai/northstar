# Plan 089: On-device monthly summary card (088 Feature B)

> **Executor instructions**: Follow step by step. Run every verification command. If a STOP
> condition occurs, stop and report. NEVER push, NEVER touch `main`. Base on the stacked
> branch via Step 0.
>
> **Verification model**: the Swift bridge IS compile-gated — `npm run check:tauri` runs
> `cargo check`, which runs `build.rs`, which invokes `swiftc` on `FoundationModels.swift`
> (macOS). So Swift compile errors ARE caught. What is NOT headlessly verifiable: the actual
> generated TEXT quality (needs a real macOS 26+/iOS 26+ device with Apple Intelligence) —
> mark that manual-verify-pending.

## Status
- **Priority**: P3  •  **Effort**: M  •  **Risk**: MED (touches the FM Swift bridge + Rust commands + a new dashboard card)
- **Depends on**: 080 (FM bridge groundwork)  •  **Category**: direction  •  **Planned at**: stacked tip, 2026-06-27
- **Implements**: [088](088-on-device-ai-features-spec.md) Feature B

## Why this matters
Generate a short zh-TW narrative of the month ("本月支出較上月增加 12%，儲蓄率 28%…") entirely
on-device from already-computed aggregates — no network, no data leaving the device. Shown as
a dashboard card. This is the cleaner of 088's two features (self-contained card; no edit-form
integration) and proves the on-device free-form-text generation pattern that Feature A's
follow-up reuses.

## Privacy invariant (NON-NEGOTIABLE)
The model receives **aggregate numbers ONLY** — total income, total expense, savings rate, net
worth change, and at most the top category NAMES + their amounts. **NEVER** raw transactions,
merchant names, account names, or tickers. A unit test enforces this. 100% on-device; NO cloud
model, ever.

## Current state (the bridge to mirror)
- `src-tauri/gen/apple/Sources/northstar/FoundationModels.swift` — existing `@_cdecl`
  functions use a `DispatchSemaphore` + `Task.detached` + `strdup` pattern (see
  `northstar_parse_on_device`, lines ~196–224) with a 5s timeout and `@available(iOS 26.0,
  macOS 26.0, *)` / `SystemLanguageModel.default.availability == .available` gates. Free-form
  text uses `LanguageModelSession(instructions:).respond(to:)` returning `.content` (a String) —
  NO `@Generable` needed for plain text.
- `src-tauri/src/lib.rs` — FM commands (`parse_quick_add_on_device`, etc.) are `#[tauri::command]
  async fn` calling the extern "C" Swift symbols, gated
  `#[cfg(any(target_os = "ios", target_os = "macos"))]` with a non-Apple `Err(...)` fallback;
  registered in `invoke_handler`. `build.rs` compiles the Swift for the macOS desktop build.
- `src/lib/foundationModels.ts` — TS wrappers `invoke()` the commands and return null/false on
  ANY error (silent no-op off-Apple). `isAvailable()` calls `foundation_models_available`.
- Aggregates already exist: `buildNetWorthBreakdown` (`src/domain/dashboardSummary.ts`,
  `.netWorth`), savings-rate / `trailingMonthlyNet` (`src/domain/northstarMetrics.ts`), and the
  dashboard already computes monthly income/expense. SOURCE the summary input from these — do NOT
  recompute finance math.

## Commands
| Install | `npm install` | exit 0 |
| Rust+Swift compile | `npm run check:tauri` | exit 0 (compiles the new Swift + Rust) |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | all pass |
| Lint | `npm run lint` | exit 0 (0 errors) |

## Scope
**In scope**:
- `src-tauri/gen/apple/Sources/northstar/FoundationModels.swift` — new `@_cdecl("northstar_monthly_summary")`
- `src-tauri/src/lib.rs` — `extern "C"` decl + `#[tauri::command] monthly_summary_on_device` + registration
- `src/lib/foundationModels.ts` — `generateMonthlySummary(input)` wrapper
- `src/domain/monthlySummary.ts` (new) — pure `buildMonthlySummaryInput(aggregates)` (privacy-safe assembler)
- `src/domain/monthlySummary.test.ts` (new) — privacy + shape tests
- `src/routes/DashboardRoute.tsx` — a "本月摘要" card (gated on availability + data)

**Out of scope**: any finance-calc change; raw transaction access; cloud anything; Feature A
(auto-categorization — separate plan); changing the existing FM parse path.

## Git workflow
- Branch: `feat/ai-monthly-summary` (off the stacked base via Step 0)
- Conventional commits, e.g. `feat(ai): on-device monthly summary card`
- Commit when done. Do NOT push.

## Steps

### Step 0: integrate the stacked base
```
git merge --no-ff feat/ai-mobile-dock-strip-fix -m "integrate: stacked 079-084"
npm install
grep -n "northstar_parse_on_device" src-tauri/gen/apple/Sources/northstar/FoundationModels.swift  # expect a match
git checkout -b feat/ai-monthly-summary
```
If the merge conflicts or the grep fails, STOP and report.

### Step 1: Swift — free-form summary function
In `FoundationModels.swift`, add (mirroring `northstar_parse_on_device`'s semaphore/strdup/timeout/availability pattern, but free-form text — no `@Generable`):
- An async helper `performMonthlySummary(inputJson: String) async -> String?` that builds an
  instructions prompt ("你是個人理財摘要助手，用繁體中文寫 2–3 句本月財務摘要…"), creates a
  `LanguageModelSession(instructions:)`, calls `try await session.respond(to: inputJson)`, and
  returns `response.content` (or nil on error / unavailable).
- `@_cdecl("northstar_monthly_summary")` taking a `UnsafePointer<CChar>?` (the input JSON),
  bridging the async call with the existing `DispatchSemaphore` pattern and a timeout (use a
  larger one, e.g. 12s — summary generation is slower than parsing), returning `strdup(text)` or
  nil. Gate with `#available(iOS 26.0, macOS 26.0, *)` and the availability check.

**Verify**: `npm run check:tauri` → exit 0 (swiftc compiles the new function). If swiftc reports
it cannot find `FoundationModels` or a symbol, STOP and report (toolchain/SDK issue, not your code).

### Step 2: Rust command
In `lib.rs`: add `fn northstar_monthly_summary(...) -> *mut c_char;` to the
`#[cfg(any(target_os = "ios", target_os = "macos"))] extern "C"` block; add
`#[tauri::command] async fn monthly_summary_on_device(input_json: String) -> Result<String, String>`
mirroring `parse_quick_add_on_device` (CString in, call, copy out, `northstar_free_string`, with
the non-Apple `Err(...)` fallback); register `monthly_summary_on_device` in `invoke_handler`.

**Verify**: `npm run check:tauri` → exit 0.

### Step 3: TS wrapper + privacy-safe assembler
- `src/domain/monthlySummary.ts`: `export interface MonthlySummaryInput { month: string; income: number; expense: number; savingsRatePct: number; netWorthChange: number; currency: string; topCategories: Array<{ name: string; amount: number }> }` and
  `export function buildMonthlySummaryInput(aggregates): MonthlySummaryInput` — assembles ONLY
  those numeric/name fields. It must NOT accept or pass raw transactions/merchants. `topCategories`
  is capped to 3 and carries category names + amounts only.
- `src/lib/foundationModels.ts`: `export async function generateMonthlySummary(input: MonthlySummaryInput): Promise<string | null>` —
  `JSON.stringify(input)` → `invoke<string>("monthly_summary_on_device", { inputJson })`, returning
  null on any error (mirror the existing wrappers' try/catch).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: Dashboard card
In `DashboardRoute.tsx`, add a "本月摘要" `Card` that:
- Renders only when on-device AI is available (`foundation_models_available` via the existing
  availability probe pattern) AND there's at least a month of data; otherwise renders nothing
  (no error, no empty card).
- On mount / on-demand button, calls `generateMonthlySummary(buildMonthlySummaryInput(...))` with
  aggregates sourced from the dashboard's existing computed values; shows the returned text, or a
  graceful "摘要暫時無法產生" if null. Cache the result in component state so it isn't regenerated
  on every render.
- Place it as a low-priority card (after the primary net-worth/KPI rows). Match the existing
  `Card` usage in the file.

If the dashboard does not already expose the needed aggregates (income, expense, savingsRate,
netWorthChange, top categories) in a way you can read without recomputing finance math, STOP and
report which aggregate is missing — do NOT re-derive finance calculations here.

**Verify**: `npx tsc --noEmit` → exit 0; `npm run lint` → exit 0.

### Step 5: Tests
`src/domain/monthlySummary.test.ts` (model on `src/domain/nlParser.test.ts`):
- **Privacy**: given aggregates, `buildMonthlySummaryInput` output contains ONLY the declared
  numeric/name fields — assert the serialized JSON has no transaction/merchant/account/ticker
  keys, and `topCategories` length ≤ 3.
- **Shape**: fields map through correctly (income/expense/savingsRatePct/netWorthChange/currency).

**Verify**: `npx vitest run src/domain/monthlySummary.test.ts` → all pass.

### Step 6: Full verification
`npm run check:tauri` exit 0; `npx tsc --noEmit` exit 0; `npm run lint` exit 0; `npm test` all pass.

## Done criteria (ALL)
- [ ] `npm run check:tauri` exits 0 (new Swift + Rust compile)
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0 (0 errors)
- [ ] `npx vitest run src/domain/monthlySummary.test.ts` passes (incl. the privacy test)
- [ ] `npm test` exits 0 (no new failures)
- [ ] `grep -n "monthly_summary_on_device" src-tauri/src/lib.rs` shows the command defined AND in invoke_handler
- [ ] `grep -n "northstar_monthly_summary" src-tauri/gen/apple/Sources/northstar/FoundationModels.swift` matches
- [ ] No raw transaction/merchant access in `monthlySummary.ts` (`grep -in "transaction\|merchant\|ticker" src/domain/monthlySummary.ts` returns nothing meaningful)
- [ ] No files outside the in-scope list modified
- [ ] Generated TEXT quality on a real device — **manual-verify-pending** (needs macOS 26+/iOS 26+)

## STOP conditions
- Base is not the stacked branch (Step 0 grep fails).
- `swiftc` (via `check:tauri`) can't find `FoundationModels`/a symbol — toolchain issue, report.
- The dashboard doesn't readily expose a needed aggregate — report which; do NOT recompute finance math.
- Implementing the prompt/text path appears to require `@Generable` or a cloud call — report (plain `respond(to:)` returning a String is the intended path; cloud is forbidden).

## Maintenance notes
- The summary input is the privacy boundary — any field added must re-pass the privacy test.
- Feature A (auto-categorization, 088) reuses this same `@_cdecl`/Rust/TS pattern — keep them consistent.
- Reviewer: confirm the card is absent (not broken) when AI is unavailable, and that the assembler carries no raw rows.
