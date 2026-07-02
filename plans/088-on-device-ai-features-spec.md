# Plan 088: On-device AI — transaction auto-categorization + monthly summary (077 Phase 7.2, spec)

> **This is a design + implementation spec with a split verification model.** Both
> features reuse the existing Apple Foundation Models bridge. The **TypeScript
> orchestration is headless-testable** (the executable part); the **Swift `@Generable`
> additions are an Xcode hand-off** (compile/run only in Xcode — no headless gate, same
> limitation as the widget in [085](085-swiftui-widget-design-spec.md)). The spec marks
> which is which so the verifiable half can be executed and reviewed normally, and the
> Swift half is handed to you for Xcode.

## Status
- **Priority**: P3 (enhancement)  •  **Effort**: TS half = M; Swift half = M  •  **Risk**: MED (touches the FM bridge + categorization UX)
- **Depends on**: 080 (the category list now flows through `QuickAddContext.categories`)
- **Category**: direction  •  **Planned at**: stacked tip, 2026-06-27
- **Supersedes**: 077 Phase 7.2 (the vague "candidate features" menu)

## Why this matters
Apple Foundation Models already runs on-device (macOS 26+/iOS 26+) for Quick Add NL
parsing — a working `@Generable` + FFI bridge. Two adjacent features extend it, **all
on-device, no network, no data leaving the device** (preserving the local-first invariant):
- **A. Auto-categorization assist** — for transactions NOT created via Quick Add NL
  (manually entered, imported, or already-saved-but-uncategorized), suggest a category from
  the user's own category list when the rules engine + UserLexicon are unsure.
- **B. Monthly summary** — a short zh-TW narrative of the month, generated on-device from
  already-computed aggregates, shown as a dashboard card.

## The existing bridge (what both features mirror)

- `src-tauri/gen/apple/Sources/northstar/FoundationModels.swift` — `@Generable ParsedDraft`
  (33), `performParse` using `LanguageModelSession`, and `@_cdecl` exports:
  `northstar_foundation_models_available` (184), `northstar_parse_on_device` (196),
  `northstar_foundation_models_prewarm` (227), `northstar_free_string` (239). The
  semaphore-bridged blocking pattern + `strdup`/free memory contract is established.
- `src-tauri/src/lib.rs` — `#[tauri::command]` async wrappers `foundation_models_available`,
  `parse_quick_add_on_device(text, context_json)`, `foundation_models_prewarm`, each calling
  the extern "C" Swift symbols, gated `#[cfg(any(target_os="ios", target_os="macos"))]` with
  a non-Apple fallback.
- `src/lib/foundationModels.ts` — TS wrappers via `invoke()`, returning null/false on any
  error (silent no-op off-Apple). `createOnDeviceParser()` exposes `{available, parse, prewarm}`.

**Each new feature = one new `@Generable` struct + one new `@_cdecl` Swift function + one new
Rust command + one new TS wrapper**, mirroring the above exactly.

## Feature A — Auto-categorization assist

### Behavior
Given a transaction's `{ merchant, name, amount }` and the user's category list, suggest the
best-matching **existing** category (+ optional subcategory) or null. Only invoked when the
existing rules path is low-confidence (don't bother the model when rules already know).

### Surface (UX)
`src/components/TransactionDetailPanel.tsx` is where a transaction's category is set. When the
category field is empty/low-confidence and on-device AI is available, show a **one-tap "建議分類"
chip** with the model's suggestion; tapping it fills the category (and records a correction into
the existing UserLexicon, so the model is only needed once per pattern). Never auto-apply — always
a suggestion the user accepts.

### TS half (HEADLESS-TESTABLE — the executable part)
- New `suggestCategory(input, ctx)` in `src/lib/foundationModels.ts` (or a sibling), calling a
  new `invoke("suggest_category_on_device", ...)`. Returns `{ category, subcategory, confidence } | null`.
- Orchestration: a pure function `shouldSuggestCategory(rulesResult)` deciding when to ask the
  model (low-confidence/empty). Unit-test it like `src/domain/nlParser.test.ts` — mock the
  suggester, assert it's called only when rules are unsure, and that a returned suggestion maps
  to the confirm UI shape. This half gets `tsc`/`npm test`/lint gates.

### Swift half (XCODE HAND-OFF — not headless-verifiable)
- New `@Generable CategorySuggestion { @Guide category: String?; @Guide subcategory: String? }`
  constrained to the provided category names.
- New `@_cdecl("northstar_suggest_category")` mirroring `northstar_parse_on_device` (same
  semaphore/`strdup` pattern, same availability gate).
- New Rust `#[tauri::command] suggest_category_on_device(input_json: String) -> Result<String,String>`
  + registration in `invoke_handler`, gated `#[cfg(any(target_os="ios", target_os="macos"))]`.
- **Verification**: build in Xcode on macOS 26+/iOS 26+ sim, confirm a suggestion returns; on
  older OS / non-Apple it must no-op (the TS wrapper already converts errors to null).

## Feature B — Monthly summary

### Behavior
Given monthly aggregates (income, expense, savings rate, top 3 categories, net-worth change —
**numbers only, no transaction list, no merchant names**), generate a 2–3 sentence zh-TW summary.

### Surface (UX)
A dashboard card ("本月摘要") shown when on-device AI is available and there's a full month of
data; gracefully absent otherwise. On-demand refresh; cache the last summary so it's not
regenerated on every render.

### TS half (HEADLESS-TESTABLE)
- A pure `buildMonthlySummaryInput(aggregates)` that assembles ONLY the safe numeric fields
  (unit-test that it never includes raw transactions/merchants — a privacy regression test).
- `generateMonthlySummary(input)` calling `invoke("monthly_summary_on_device", ...)`, returning
  `string | null`. Test the assembler + the null-on-unavailable path.

### Swift half (XCODE HAND-OFF)
- A free-form text generation (no `@Generable` needed — plain `session.respond(to:)` returning a
  string) via `@_cdecl("northstar_monthly_summary")` + Rust command, same gating.
- **Verification**: Xcode build; confirm a zh-TW sentence returns on a supported device.

## Privacy invariant (NON-NEGOTIABLE)
- 100% on-device. NO cloud model, ever (the opt-in cloud NLP tier is a separate roadmap item —
  do NOT conflate). Feature B sends **aggregates only**; the privacy regression test enforces it.
- Every entry point keeps the existing availability gate so Windows/Linux/older-Apple silently
  fall back (no feature, no error).

## Recommended implementation phasing (when you proceed)
1. **Swift bridge once** (hand-off): add both `@Generable`/text functions + Rust commands; you
   build/verify in Xcode. This is the gated-by-Xcode part.
2. **Plan 08x-A (TS, headless)**: Feature A orchestration + the TransactionDetailPanel chip +
   tests. Executable + reviewable normally.
3. **Plan 08x-B (TS, headless)**: Feature B input assembler + dashboard card + privacy test.
4. Each TS plan STOPs gracefully if the Swift command isn't registered yet (the TS wrapper
   returns null), so the TS half can land and be tested before the Swift half is built.

## Why no single headless "execute" here
Unlike 079–087 (fully gated by `tsc`/`cargo check`/`npm test`), the on-device *behavior* can
only be confirmed by an Xcode build on a Foundation-Models-capable OS. So this track is: the TS
halves are executable/reviewable headlessly (and worth doing — they're the orchestration + UX +
privacy guarantees), while the Swift `@Generable`/text functions are a documented Xcode hand-off.
That honest split is the whole point of this spec.

## Maintenance notes
- Reuse the UserLexicon: Feature A's accepted suggestions should feed the existing
  correction/lexicon path so the model is consulted less over time.
- If a new `@Generable` field is added, keep the availability gate and the non-Apple fallback.
- Feature B's aggregates shape is the privacy boundary — any change to it must re-pass the
  "no raw transactions/merchants" test.
