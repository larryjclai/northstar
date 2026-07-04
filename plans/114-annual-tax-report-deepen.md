# Plan 114: 深化年度報稅工具 — 逐檔明細、境內/海外分列、CSV 匯出

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b7dd5ba5..HEAD -- src/domain/annualReport.ts src/domain/annualReport.test.ts src/routes/AnnualReportRoute.tsx src/data/csv.ts`

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED（動到已鎖定的財務彙總 domain；既有 7 個測試須保持綠）
- **Depends on**: none
- **Category**: direction (feature)
- **Planned at**: commit `b7dd5ba5`, 2026-07-03

## Why this matters

年度報表目前是一張精簡的報稅摘要表：每年一列「已實現損益／股利所得／交易成本／
合計」。操作者決定往**報稅工具深化**（非年度回顧）。台灣個人報稅需要更細的口徑：
(1) **逐檔明細**——每年由哪幾檔證券貢獻已實現損益與股利，供填報與核對；
(2) **境內 / 海外分列**——台灣稅制對境內證券與海外所得課稅方式不同（海外所得
計入基本稅額），需要能一眼分開；(3) **CSV 匯出**——把年度報稅明細帶出去給
會計師或自行報稅。三者的資料都已存在，只是沒被呈現。

## Current state

### Domain：`src/domain/annualReport.ts`

現有回傳型別（34–45 行）與彙總函式（126–172 行）：

```ts
export interface AnnualReportYear {
  year: string;
  realizedGain: number;   // 移動平均、淨費用、處分日年度
  dividends: number;      // 來自 dividendAnalysis.byYear（淨額）
  tradingCost: number;    // Σ fee（揭露用，已淨入 realizedGain）
  total: number;          // realizedGain + dividends
}
```

`buildAnnualReport(input)` 逐檔跑 `realizedByYearForAsset(records, currency, toPrimary)`
（回傳 `Map<year, amount>`，**已是逐檔逐年**的已實現損益），加總進 `realizedMap`。
`realizedByYearForAsset`（55–108 行）依移動平均、opening-lot、settle 走帳，與
`buildPositionMetrics` 同口徑——**不要改它的計算**。

`BuildAnnualReportInput`（110–119 行）：`assets`、`recordsByAsset(assetId)`、
`dividendByYear`、`toPrimary`。

### 股利逐檔逐年可算：`src/domain/dividendAnalysis.ts`

`buildDividendAnalysis`（58–73 行）逐筆掃 `action === "cashDividend"` 的紀錄：
`amount = toPrimary(dividendNative(r), currency, rd)`，用 `rd.slice(0,4)` 分年、
用 `r.assetId` 分檔。**逐檔逐年股利**照這個模式、額外用 `(assetId, year)` 當 key
即可算出（本計劃的 domain 新函式要做這件事，別依賴現有只給總額的 `byYear`）。

### 境內/海外可判：`src/domain/assetCountry.ts`

`resolveHoldingCountry(ticker, currency?)`（90 行）→ ISO alpha-2（`"TW"`/`"US"`/…）
或 `null`（無法判定）。判準：`"TW"` = 境內；其餘（含 `null`）= 海外。
`resolveCountryLabel(code, locale)`（131 行）給在地化名稱。

### Route：`src/routes/AnnualReportRoute.tsx`（191 行）

目前是一張表格（104–135 行），每年一列，欄位 年度／已實現損益／股利所得／
交易成本／合計。header 是「Annual tax summary / 年度報表」，已有 FX 口徑 caveat
（137–152 行）。`report` memo（47–62 行）呼叫 `buildAnnualReport`。

### CSV 匯出範式：`src/data/csv.ts`

`ExportSection` 用 `downloadCsv`、`exportInvestmentCsv`、`exportLedgerCsv`、
`exportFxRatesCsv`（`from "../data/csv"`）。新的年度報稅 CSV 匯出函式照這些的
既有結構加在同檔（先讀 `src/data/csv.ts` 看它們怎麼組 header/row/呼叫
`downloadCsv`）。

### 慣例

- **財務語意鎖定**（AGENTS.md invariant 1）：不改任何既有計算；新增的都是彙總/
  呈現，且要與既有 `realizedGain`/`dividends` 對得起來（逐檔加總 = 該年總額）。
- 金額顯示走 `formatMoney`/`formatSignedMoney`（`domain/currency`）；表格金額欄
  右對齊 + tabular-nums。
- domain 測試範本：`src/domain/annualReport.test.ts`（現有 7 個 it）。

## Commands you will need

| Purpose   | Command                                        | Expected on success |
|-----------|------------------------------------------------|---------------------|
| Install   | `npm ci`                                       | exit 0              |
| Typecheck | `npx tsc`                                       | exit 0              |
| 單檔測試  | `npx vitest run src/domain/annualReport.test.ts` | all pass          |
| Tests     | `npm test`                                       | all pass            |
| Lint      | `npm run lint`                                   | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `src/domain/annualReport.ts`（擴充回傳型別 + 彙總，不改 `realizedByYearForAsset` 計算）
- `src/domain/annualReport.test.ts`（新增逐檔/境內海外測試）
- `src/routes/AnnualReportRoute.tsx`（展開列 + 境內/海外小計 + 匯出鈕）
- `src/data/csv.ts`（新增 `exportAnnualTaxCsv`）

**Out of scope** (do NOT touch):
- `realizedByYearForAsset` 的走帳計算、`buildDividendAnalysis`、`resolveHoldingCountry`
  的內部邏輯 — 只呼叫，不改。
- **手續費 / 證交稅分開顯示** — `InvestmentRecord.fee` 是**單一合併欄位**
  （`types.ts:209`），拆分需要 schema 變更 + 每筆重新歸類，屬獨立的資料模型決定。
  本計劃**明確不做**；維持現有「交易成本」單欄 + 既有 caveat 文案。（見 Maintenance。）
- 現金流/淨值等非報稅資料（操作者選的是報稅深化，不是年度回顧）。

## Git workflow

- Branch: `fix/ai-annual-tax-deepen`
- Commit style: conventional commits，可分 domain / route / csv 三個 commit。
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: domain 型別擴充

在 `annualReport.ts` 加逐檔明細型別，並擴充 `AnnualReportYear`（**保留**既有四個
欄位，既有測試才不破）：

```ts
export interface AnnualHoldingTaxDetail {
  assetId: string;
  ticker: string;
  country: string | null;   // resolveHoldingCountry 的結果；null = 無法判定（歸海外）
  realizedGain: number;     // 該檔該年已實現損益（primary）
  dividends: number;        // 該檔該年股利（primary，淨額）
}

export interface AnnualReportYear {
  year: string;
  realizedGain: number;
  dividends: number;
  tradingCost: number;
  total: number;
  // ── 新增 ──
  byHolding: AnnualHoldingTaxDetail[];              // 依 |realizedGain|+dividends 降冪
  domestic: { realizedGain: number; dividends: number };  // country === "TW"
  overseas: { realizedGain: number; dividends: number };  // country !== "TW"（含 null）
}
```

**Verify**: `npx tsc` → 會在 `buildAnnualReport` 的 return 處報缺欄位錯（預期，下一步補）。

### Step 2: 彙總逐檔明細 + 境內/海外

擴充 `buildAnnualReport`：在既有逐檔迴圈中，除了加總 `realizedMap`，也把
**每檔每年**的 realized 存進一個 `Map<year, Map<assetId, {ticker, country, realizedGain, dividends}>>`。
股利：照 `buildDividendAnalysis` 的掃法（`action === "cashDividend"`、`dividendNative(r)`、
`toPrimary(..., rd)`、`rd.slice(0,4)` 分年），額外按 `assetId` 累加進同一個結構。
`country = resolveHoldingCountry(asset.ticker, asset.currency)`。

組每年的回傳時：
- `byHolding` = 該年 assetId map 的值，濾掉 `realizedGain===0 && dividends===0`，
  依 `Math.abs(realizedGain) + dividends` 降冪。
- `domestic` / `overseas` = 依 `country === "TW"` 把 byHolding 的 realized/dividends
  分別加總。
- 既有 `realizedGain`/`dividends`/`tradingCost`/`total` 維持原樣。

**不變量**：`Σ byHolding.realizedGain === realizedGain`（該年）、
`domestic.realizedGain + overseas.realizedGain === realizedGain`。股利同理。
（測試會驗這兩條。）

**Verify**: `npx tsc` → exit 0。

### Step 3: domain 測試

在 `annualReport.test.ts` 加測試（照既有 it 結構、沿用其 fixture 建構方式）：

- **逐檔加總守恆**：造 2 檔、跨 2 年的買賣，斷言每年 `Σ byHolding.realizedGain`
  === 該年 `realizedGain`，股利同理。
- **境內/海外分列**：造一檔 `.TW`（境內）+ 一檔 US ticker（海外），斷言
  `domestic`/`overseas` 各歸對邊，且兩者相加 === 年度總額。
- **null country 歸海外**：造一檔無法判定國別的 ticker，斷言計入 `overseas`。
- **既有 7 個測試不動且全綠**（既有欄位語意未變）。

**Verify**: `npx vitest run src/domain/annualReport.test.ts` → 全 pass（含新測試）。

### Step 4: Route 展開列 + 境內/海外小計

`AnnualReportRoute.tsx`：每個年度列改為可展開（點年度列 → 展開該年
`byHolding` 明細子表：代號／國別（`resolveCountryLabel`）／已實現損益／股利），
並在子表頂或底顯示「境內小計 / 海外小計」兩列。用元件既有的 `Th`/`Td`/`SignedTd`
與 inline 展開 state（`useState<string | null>` 記展開的 year，參照 app 內既有
展開列模式，如 `CategoriesSection` 的 `expandId`）。維持 header、caveat 不變。

**Verify**: `npx tsc` → exit 0。（互動視覺驗證 deferred to reviewer/operator。）

### Step 5: CSV 匯出

先讀 `src/data/csv.ts` 既有匯出函式的結構。加 `exportAnnualTaxCsv(rows: AnnualReportYear[], currency: string)`：
輸出逐檔明細（欄位：年度、代號、國別、境內/海外、已實現損益、股利），呼叫既有
`downloadCsv`。在 `AnnualReportRoute` header 區加一顆「匯出 CSV」`Button`（rows 為空時
disabled），onClick 呼叫它。

**Verify**: `npx tsc` → exit 0；`grep -n "exportAnnualTaxCsv" src/data/csv.ts src/routes/AnnualReportRoute.tsx` → 各 1 處。

### Step 6: 全量驗證

**Verify**: `npm test` → all pass；`npm run lint` → exit 0。

## Test plan

- Step 3 的四組 domain 測試（守恆 / 境內海外 / null 歸海外 / 既有不破）。
- 回歸：`npm test` 全綠；既有 7 個 annualReport 測試保持通過。
- 互動（展開列、CSV 下載）由 reviewer/operator 目視。

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc`、`npm test`、`npm run lint` 全 exit 0
- [ ] `annualReport.test.ts` 既有 7 測試 + 新增 ≥4 測試全 pass
- [ ] `grep -c "byHolding\|domestic\|overseas" src/domain/annualReport.ts` ≥ 3
- [ ] `grep -n "exportAnnualTaxCsv" src/data/csv.ts` → 1 處
- [ ] `git status` 只含 4 個 in-scope 檔案
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- 加了 `byHolding` 後守恆測試（`Σ byHolding === 年度總額`）不成立——代表逐檔口徑
  與既有加總不一致，**不要**調整 `realizedByYearForAsset` 去湊，回報數字差異。
- 既有 7 個測試因欄位擴充翻紅（型別破壞了 fixture）——回報，別刪既有斷言。
- 你發現自己想拆 `fee` 成手續費/證交稅——越界（schema 決定），收手。
- `src/data/csv.ts` 的匯出範式與描述差異大到無法照抄——回報實際結構。

## Maintenance notes

- **手續費/證交稅分拆**是本計劃刻意留的後續：需要在 `InvestmentRecord` 增欄位
  （或把 `fee` 拆成 `commission` + `tax`）並回填既有紀錄，屬資料模型變更 +
  遷移，值得獨立計劃與操作者決定。現有 caveat 文案已說明「單一合併欄位」。
- 境內/海外的稅務口徑是**顯示層分類**，非稅額試算——若日後要算實際應稅額
  （海外所得基本稅額、境內股利可抵減稅額等），那是更大的稅務引擎，需專門設計。
- Reviewer 檢查重點：逐檔加總 === 年度總額（守恆）、`.TW` 歸境內、null 歸海外、
  既有摘要列數字未變、CSV 欄位齊全。
