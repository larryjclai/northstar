# Plan 230: DCA post-time reference-price staleness — surface latest quote before posting

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. On
> any STOP condition, stop and report — do not improvise. Do NOT update
> `plans/README.md` — the reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat fd4af91f..HEAD -- src/routes/RecurringInvestmentsTab.tsx`
> Mismatch with the excerpts below = STOP.

## Status

- **Priority**: P3 (the one real semantic gap from Option A; not a blocker)
- **Effort**: S–M
- **Risk**: LOW-MED (UI-only confirm step; the posting math is unchanged)
- **Depends on**: **plan 228** (the tab must be re-enabled to reach the post button)
- **Category**: bug / UX (correctness of recorded cost basis)
- **Planned at**: commit `fd4af91f`, 2026-07-18

## Why this matters

A DCA rule stores a static `price` (參考價格) the user typed once at
creation/edit (`RecurringInvestmentsTab.tsx:282`). Posting a period uses THAT
price to derive cost basis — `recurringInvestmentToDraft`
(`repositories.ts:6479-6499`) only throws if price is 0/unset, never if it is
weeks stale. A user who set up a rule in January and posts it in July silently
records January's price as July's buy — corrupting cost basis, XIRR, and every
downstream metric. `docs/dca-decision.md` §3(3) flags this as **the one open
question the current implementation genuinely doesn't answer**.

This plan makes the staleness visible at the post decision: posting goes through
a confirm step showing the rule's stored 參考價 alongside the latest live quote,
and offers to post with either. No threshold heuristic — the user sees both
numbers and chooses. Cheapest honest fix; the posting math stays untouched.

## Current state

- `src/routes/RecurringInvestmentsTab.tsx`:
  - `:47` — `const { recurringInvestments, accounts } = useFinanceData();`
    (does NOT currently pull `quotes`).
  - `:114-121` — the post action, fires the mutation immediately, no confirm:
    ```tsx
    async function post(rule: RecurringInvestment) {
      try {
        await postRule.mutateAsync(rule.id);
        toast.success(`已記錄 ${rule.ticker} 本期投入`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "記錄失敗");
      }
    }
    ```
  - `:188` — the post button: `<Button variant="ghost" size="icon-sm" title="記錄本期投入" onClick={() => post(rule)} disabled={postRule.isPending}><Check size={14} /></Button>`
  - `:71-74` — `postRule` mutation invalidates `["recurringInvestments","investments","assets","accounts","ledger"]`.
  - Edit flow already exists: `openEdit(rule)` (`:84`) → `updateRule` mutation
    → `RecurringInvestmentSheet`. Updating a rule's `price` before posting is
    already possible; this plan just surfaces WHEN to.

- Quote data + lookup (the pieces to reuse):
  - `useFinanceData()` exposes `quotes` (`src/data/hooks.ts:108`); rows are
    `StoredMarketQuote extends MarketQuote` = `{ symbol, price, currency }`
    (`portfolioCalculator.ts:5-9`, `repositories.ts:53`).
  - `src/domain/marketSymbols.ts`: `buildQuoteLookup(quotes)` → Map, and
    `findQuoteForTicker(lookup, ticker)` → the quote or `undefined` (handles
    TW `.TW`/`.TWO` suffix variants). Exemplar use: `InvestmentsRoute.tsx:98`
    (`quoteRows = quotes.data ?? []`) and its lookup calls.

- `postRecurringInvestment(id)` (`repositories.ts:1915`) reads the rule from
  storage and posts at the rule's STORED price — it takes no price override.
  So "post with latest quote" = update the rule's `price` first (existing
  `updateRecurringInvestment`), then post. The confirm dialog orchestrates that.

- ModalShell confirm pattern: this file already uses `ModalShell`
  (`RecurringInvestmentSheet`, `:220`) — model the confirm on a small
  `variant="center"` ModalShell (exemplar: `src/components/ClientManager.tsx`
  or any centered ModalShell user).

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0              |
| Lint      | `npm run lint`     | 0 errors / 761 warnings |
| Tests     | `npm test`         | prior + new pass    |

## Scope

**In scope**: `src/routes/RecurringInvestmentsTab.tsx`. Optionally a tiny pure
helper + test in `src/domain/` IF you extract the stale-decision logic (see
step 1) — allowed, but keep it minimal.
**Out of scope**:
- `postRecurringInvestment` / `recurringInvestmentToDraft` / the posting math —
  unchanged. This plan only changes WHICH price is stored before posting.
- Auto-refreshing quotes from the network at post time (that's `useRefreshQuotes`
  territory; the confirm uses ALREADY-LOADED `quotes` data — a manual refresh
  affordance can be a follow-up).
- Adding a `price` argument to the repository post method.

## Git workflow

- Branch: `feat/ai-dca-stale-price` off `main` (after 228). Conventional commit.
  No push/merge.

## Steps

### Step 1: Access quotes + a latest-price lookup

In `RecurringInvestmentsTab.tsx`:
1. Add `quotes` to the `useFinanceData()` destructure (`:47`).
2. Build a lookup near the other derived state:
   ```tsx
   const quoteLookup = useMemo(() => buildQuoteLookup(quotes.data ?? []), [quotes.data]);
   ```
   (import `buildQuoteLookup`, `findQuoteForTicker` from `../domain/marketSymbols`).
3. Optional pure helper (if you want a unit test): a function
   `latestQuotePriceFor(lookup, ticker): number | null` wrapping
   `findQuoteForTicker` and returning `quote?.price ?? null`. Keep it in the
   domain module or inline — reviewer's call.

### Step 2: Confirm-before-post state + dialog

1. Add state: `const [postConfirm, setPostConfirm] = useState<RecurringInvestment | null>(null);`
2. Change the post button (`:188`) to open the confirm instead of posting
   directly: `onClick={() => setPostConfirm(rule)}`.
3. Render a `PostConfirmDialog` when `postConfirm` is set. It shows:
   - the rule's stored `參考價 NT$<rule.price>`,
   - the latest quote `最新報價 NT$<latest>` (or 「無報價資料」 when the lookup
     returns null),
   - the derived per-period cash for both prices (reuse `perPeriodCash` at `:24`;
     for fixedAmount mode price doesn't change cash, for fixedShares it does —
     the dialog should make clear which number moves),
   - two actions when a latest quote exists AND it differs from stored:
     「用參考價記錄（NT$X）」 and 「更新為最新報價並記錄（NT$Y）」;
   - one action 「記錄本期投入」 when there's no quote or they match.

### Step 3: Wire the two post paths

```tsx
async function postWithStoredPrice(rule: RecurringInvestment) {
  setPostConfirm(null);
  await postRule.mutateAsync(rule.id); // existing behavior
  toast.success(`已記錄 ${rule.ticker} 本期投入`);
}
async function postWithLatestPrice(rule: RecurringInvestment, latest: number) {
  setPostConfirm(null);
  await updateRule.mutateAsync({ ...ruleToDraft(rule), id: rule.id, price: latest });
  await postRule.mutateAsync(rule.id);
  toast.success(`已更新報價並記錄 ${rule.ticker} 本期投入`);
}
```
`ruleToDraft(rule)` = the same field-copy `openEdit` already does (`:85-90`) —
extract it to a small local helper to avoid duplication, or inline. Keep the
existing try/catch error toasts around both paths. Await ordering matters:
update must resolve before post (post reads stored price).

**Verify**: `npx tsc --noEmit` → 0.

### Step 4: Tests

If you extracted `latestQuotePriceFor`, unit-test it (found quote returns
price; missing returns null; TW suffix variant resolves). The dialog itself is
jsdom-hostile UI — reviewer feel-check. Do NOT add a repo test (posting math
unchanged; existing `recurring-investments` suite still covers it).

**Verify**: `npm run lint` → 0 errors / 761 warnings; `npm test` → all pass.

## Test plan

Reviewer feel-check (dev server, plan-228 demo seed + a quote for its ticker):
click 記錄本期投入 → confirm shows stored vs latest → choosing 更新為最新報價
updates the rule and posts (the created investment record uses the latest
price); choosing 用參考價 posts at the stored price (unchanged behavior); a
ticker with no quote shows 無報價資料 and a single post action.

## Done criteria

- [ ] `npx tsc --noEmit` 0 · `npm run lint` 0 errors / 761 warnings · `npm test` all pass
- [ ] `grep -n "postConfirm\|buildQuoteLookup" src/routes/RecurringInvestmentsTab.tsx` shows the confirm flow
- [ ] Posting still works for a no-quote ticker (single action path)
- [ ] The stored-price path is byte-identical to today's `post()` behavior
- [ ] No files outside scope modified

## STOP conditions

- `post()` at `:114` or the post button at `:188` doesn't match the excerpt (drift).
- `updateRecurringInvestment`'s draft shape can't accept a `price` override the
  way `openEdit`'s field-copy implies — read the mutation signature and report.
- `findQuoteForTicker`/`buildQuoteLookup` aren't exported from
  `domain/marketSymbols` as described.

## Maintenance notes

- This surfaces staleness but does not auto-fetch fresh quotes — a follow-up
  could add a 「重新整理報價」 button using `useRefreshQuotes` (already in the
  app; see `features/market-data/useMarketRefresh`) so the "latest quote" is
  truly latest, not just last-loaded. Deferred deliberately.
- If the fractional-share operator decision (index) later changes how `quantity`
  derives from `amount/price`, the fixedAmount-mode "price doesn't move cash"
  note in the dialog copy must be revisited.
- Reviewer: confirm the update-then-post await order — a race here would post at
  the stale price despite the user choosing latest.
