# 年度稅務 / 年度財務摘要報表（Plan 046）— 設計決策

> Phase 1 範圍：正確、可測試的「依年度」彙總 + 唯讀報表頁。PDF 匯出延後。

台灣投資人報稅需要一個年度視角：證券交易所得（已實現損益）與股利所得。輸入資料已存在
（`dividendAnalysis.byYear`、`buildPositionMetrics` 的 `realizedGain`），但沒有「依年度」
的彙總面。本報表 **重新衍生**（re-derive）每年的數字，**不修改** 既有的 `buildPositionMetrics`
或 `dividendAnalysis.ts`。

## Decision A — 已實現損益的年度歸屬：處分日年度、移動平均

每一筆 `sell` / `capitalReduction` 的已實現金額（proceeds − avg×soldQty，使用與
`buildPositionMetrics` **完全相同** 的移動平均會計）歸屬到 **該筆紀錄日期** 的年度
（`r.date.slice(0,4)`）。

- 不使用 FIFO —— 那會改變已鎖定的成本模型（移動平均）。成本基礎數學保持不變。
- 載入保證（regression guard）：把某一個部位跨年度的 `realizedGain` 全部加總，必須
  等於 `buildPositionMetrics(records).realizedGain`（在 EPS 內）。此等式由測試證明。

## Decision B — 每年三個元素（擴充）

1. **已實現損益**（realized gain，已淨額化手續費/稅）
2. **股利所得**（取自 `dividendAnalysis.byYear`，已淨額化扣繳）
3. **交易成本（手續費 / 證交稅）** = 該年度所有投資紀錄 `record.fee` 的加總

⚠️ **避免重複計算**：`buildPositionMetrics` 已經把 `fee` 併入已實現損益
（買進：outlay = price×qty + fee；賣出：proceeds = price×qty − fee）。因此「交易成本」
那一列僅供 **資訊揭露**：它顯示該年度支付的手續費/稅金，**不可** 從年度合計再扣一次。

- 每年合計 `total = realizedGain（淨） + dividends（淨）`。
- 「交易成本」與合計並列，作為透明化欄位，不參與合計的運算。

註記：`InvestmentRecord.fee` 是 **單一合併欄位**，未區分券商手續費與證交稅。所以報表只能
顯示該年度的「交易成本總額」。要拆分券商費 vs 證交稅，需要逐元件儲存（範圍外，列為後續）。

## Decision C — 外幣處分的匯率：處分日匯率，否則今日

外幣部位的處分，使用 `dailyFxRates` 中 **處分日（含以前最近一筆）** 的匯率換算；若無，
回退到設定中的當前匯率（等同今日）。此口徑透過注入的 `toPrimary(value, currency, asOfDate)`
函式縫合（seam），方便測試。`createFxConverter` 既有的 `toPrimary` 已實作此語意
（`pickDailyRate` 取 ≤ asOf 的最近日匯率，否則回退 settings.exchangeRates）。

UI 以 **註記** 揭露此口徑（比照 plan 015 的 caveat 模式）。

## 範圍外 / 後續追蹤（follow-ups）

- **PDF 匯出** —— 延後。v1 僅螢幕顯示。
- **拆分券商手續費 vs 證交稅**（`record.fee` 為合併欄位）—— 需逐元件儲存，後續處理。
- 月度/年度現金流摘要、年度內逐部位下鑽（per-holding drill-down）—— 後續。
