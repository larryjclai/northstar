# Plan 295: 記帳月份收合列手機版 — 金額不再被裁掉

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5140008b..HEAD -- src/routes/CashFlowRoute.tsx src/styles/globals.css`
> On any in-scope change, compare "Current state" excerpts against live code;
> mismatch = STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5140008b`, 2026-08-03

## Why this matters

記帳頁長區間（YTD／近12個月／全部）預設用「月份收合」檢視。每列月份標頭是不換行
flex row，右側一次放三組完整金額（收入 +TWD …／支出 −TWD …／淨 +TWD …），全部
`whitespace-nowrap`。真實金額下右叢集 ~420px，而 390px 手機的內容寬只有 ~358px——
整列超寬，被 AppShell 的 `overflowX: clip` 靜默裁切，**「淨」那組（最重要的數字）
直接看不到、也捲不到**。

## Current state

- `src/routes/CashFlowRoute.tsx` — 月份標頭（line 2527–2549）：

```tsx
                        <button
                          type="button"
                          className="ns-cf-month-header w-full flex items-center justify-between gap-3 text-left cursor-pointer"
                          onClick={() => toggleMonth(m.month)}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            {expanded ? <CaretDown size={14} /> : <CaretRight size={14} />}
                            <span className="text-sm font-medium whitespace-nowrap">
                              {formatMonthLabel(m.month)}
                            </span>
                            <span className="muted text-xs whitespace-nowrap">{m.count} 筆</span>
                          </span>
                          <span className="flex items-center gap-3 text-caption mono whitespace-nowrap">
                            <span style={{ color: "var(--ns-pos)" }}>
                              收入 +{primaryCurrency} {formatNumber(m.income)}
                            </span>
                            <span style={{ color: "var(--ns-neg)" }}>
                              支出 −{primaryCurrency} {formatNumber(m.expense)}
                            </span>
                            <span className={m.net >= 0 ? "pos" : "neg"}>
                              淨 {m.net >= 0 ? "+" : "−"}
                              {primaryCurrency} {formatNumber(Math.abs(m.net))}
                            </span>
                          </span>
                        </button>
```

- `.ns-cf-month-header`（globals.css:2157–2168）：`padding: 14px 22px`、sticky top、
  **無任何 mobile override**。
- Operator 已決策的圖表偏好與此無關；此處是列標頭。
- 手機判斷紅線：`max-width: 1023px`；靜態樣式進 CSS class，不寫 inline。

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Typecheck + build | `npm run build` | exit 0        |
| Tests     | `npm test`           | all pass            |
| Lint      | `npm run lint`       | 0 errors            |
| Format    | `npm run format:check` | 通過              |

## Scope

**In scope**:
- `src/routes/CashFlowRoute.tsx`（月份標頭 JSX 的 class 調整）
- `src/styles/globals.css`（`.ns-cf-month-header` 的 mobile 規則）

**Out of scope**:
- 月份分組邏輯（`groupByDay`、`toggleMonth`）與金額計算。
- 日標頭 `.ns-cf-day-header`（先確認手機沒問題再說——它不含三組金額）。
- 記帳其他手機問題（drawer footer → 293；datetime 欄位 → 298）。

## Git workflow

- Branch: `fix/ai-cf-month-header-mobile`
- 先 `git status` 確認乾淨；有未提交變更就 STOP。
- Conventional commits；推分支開 PR，不 push main。

## Steps

### Step 1: 手機改兩行堆疊

方案：手機（<1024px）讓 button 換行成兩行——第一行「▸ 2026年7月 · 12 筆」，第二行
三組金額靠左、允許自身在極窄時再換行。

globals.css 追加：

```css
@media (max-width: 1023px) {
  .ns-cf-month-header { flex-wrap: wrap; row-gap: 4px; padding: 12px 16px; }
  .ns-cf-month-amounts { flex-wrap: wrap; row-gap: 2px; }
}
```

CashFlowRoute.tsx：右叢集 span（line 2537）加 class `ns-cf-month-amounts`（保留既有
utilities；`whitespace-nowrap` 移到**每個金額 span 各自**身上——三組各自不斷行、但組
與組之間可換行）：

```tsx
                          <span className="ns-cf-month-amounts flex items-center gap-3 text-caption mono">
                            <span className="whitespace-nowrap" style={{ color: "var(--ns-pos)" }}>…</span>
                            <span className="whitespace-nowrap" style={{ color: "var(--ns-neg)" }}>…</span>
                            <span className={"whitespace-nowrap " + (m.net >= 0 ? "pos" : "neg")}>…</span>
                          </span>
```

**Verify**: `npm run build` exit 0；390px 視口切到「近12個月」：每列月份標頭兩行、
三組金額完整可見（`scrollWidth <= innerWidth`）；1280px：單行、與改前視覺一致
（flex-wrap 在寬度足夠時不觸發換行）。

### Step 2: sticky 行為驗證

`.ns-cf-month-header` 是 sticky top:0——兩行高度變高後，捲動時展開月份的列標頭釘住
高度 = 靜止高度（no-morph 不變量）。390px 實測捲動：標頭釘住、無跳動。

## Test plan

- e2e（併入本批 mobile spec）：390×844 開記帳 → 切「全部」區間 → 斷言首個
  `.ns-cf-month-header` 的 `scrollWidth <= clientWidth + 1` 且「淨」span 的
  bounding box `right <= innerWidth`。
- Verification: `npm test`、`npm run test:e2e` 全綠。

## Done criteria

- [ ] `npm run build` exit 0；`npm test` exit 0；`npm run test:e2e` exit 0
- [ ] `npm run lint` 0 errors；`npm run format:check` 通過
- [ ] 390px：三組金額完整可見；1280px：與改前一致
- [ ] `git status` 只有 in-scope 檔案（+ 測試檔、plans/README.md）
- [ ] `plans/README.md` 狀態列更新

## STOP conditions

- 摘錄與 live code 不符。
- 兩行標頭 + sticky 在真實資料下遮住太多列（標頭 >72px）——回報，可能要改 compact
  金額（`formatCompactNumber`）方案，那是文案/格式決策，需 operator 確認。

## Maintenance notes

- 若未來 operator 要求手機只顯示「淨」一組（更精簡），在 `.ns-cf-month-amounts` 上以
  CSS 隱藏前兩組即可，不動 JSX 結構。
- Reviewer 盯：`justify-between` 在換行後第二行的對齊（金額組靠左是預期）。
