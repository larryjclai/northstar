# Plan 298: 投資輸入表單手機版 — 新增交易欄位不再擠壓、編輯持倉接 bottom-sheet

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5140008b..HEAD -- src/routes/InvestmentsAddSheet.tsx src/routes/HoldingEditModal.tsx src/styles/globals.css`
> On any in-scope change, compare "Current state" excerpts against live code;
> mismatch = STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW-MED
- **Depends on**: plan 294（同檔 HoldingEditModal 的 DatePicker 修先行，避免衝突；
  若 294 未 merge，本計畫不碰 date-picker.tsx 即無實際衝突，仍可並行開發）
- **Category**: bug
- **Planned at**: commit `5140008b`, 2026-08-03

## Why this matters

新增投資交易（`InvestmentsAddSheet`）在手機上：股數／每股價格／手續費三欄各只剩
~80px 內容寬，`text-lg` mono 靠右對齊——placeholder `1,042.00` 都放不下，**使用者打
8 位數看不到開頭的量級**；手續費欄還塞了「自動試算」與折扣提示，換 4+ 行。另外四個
`"1fr 1fr"` 列（日期+帳戶、DRIP、現金股利、減資）沒用 `minmax(0,1fr)`，`datetime-local`
在 WKWebView 的固有寬度 ~200px 撐爆軌道，表單內部橫向抖動。

編輯持倉（`HoldingEditModal`）是 center modal 沒接 bottom-sheet：手機上貼底只有 16px
間隙（< 34px home indicator），捲到底的「儲存持倉」下緣落在手勢帶；內部捲動用 `70vh`
（應為 `70dvh`）；快照刪除鈕是 24×24 raw button。

## Current state

- `src/routes/InvestmentsAddSheet.tsx` — 已是 `mobilePresentation="bottom-sheet"`
  （line 509–511，shell 本身正確）。表單 body：`overflow: auto; padding: "20px 24px"`
  （line 664–666）。
  - 三欄數字列（line 968–973）：

```tsx
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                        gap: 12,
                      }}
                    >
```

    內含 `NumberField className="ns-input mono text-lg"`（line 977–978 起，股數／每股
    價格／手續費）。
  - `"1fr 1fr"` 列（`grep -n '"1fr 1fr"'` 結果）：line 704（日期 `datetime-local` +
    帳戶）、832、884、910、1104。line 704 摘錄：

```tsx
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div>
                    <label className="text-xs ns-field-label block">日期</label>
                    <input
                      className="ns-input"
                      type="datetime-local"
```

- `src/routes/HoldingEditModal.tsx`：
  - Shell（line 178–184）：

```tsx
    <ModalShell
      variant="center"
      title="編輯持倉"
      onClose={onClose}
      panelClassName="w-full max-w-2xl rounded-lg border shadow-xl"
      panelStyle={{ background: "var(--ns-surface)", borderColor: "var(--ns-border)" }}
    >
```

  - 捲動 body（line 194）：`className="max-h-[70vh] overflow-y-auto px-5 pb-5 pt-4"`。
  - 快照刪除鈕（line 335–343）：raw `<button … className="ml-3 grid size-6 …">`（24px）。
- `DateTimeField`（`src/components/DateTimeField.tsx`）——repo 已寫好的 datetime-local
  替代品、docstring 說明原生控件的 locale 問題，但**全 repo 零使用**。本計畫**不**引入
  它（風險自成一案），只收合欄位。
- COSS Button 有 `size="icon-sm"` 變體（AppShell、QuickAdd 都在用）。
- 手機判斷紅線：`max-width: 1023px`。

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Typecheck + build | `npm run build` | exit 0        |
| Tests     | `npm test`           | all pass            |
| Lint      | `npm run lint`       | 0 errors            |
| Format    | `npm run format:check` | 通過              |

## Scope

**In scope**:
- `src/routes/InvestmentsAddSheet.tsx`
- `src/routes/HoldingEditModal.tsx`
- `src/styles/globals.css`（`.ns-form-row` 類 helper）

**Out of scope**:
- `DateTimeField` 的啟用（另案；docstring 的 locale 問題值得處理但需獨立驗證）。
- `HoldingForm.tsx` 內部欄位（已是 `grid-cols-1 sm:grid-cols-*`，正確）。
- 交易計算邏輯（手續費試算、股利、減資語意——финanс紅線，零行為改動）。
- `date-picker.tsx`（plan 294）。

## Git workflow

- Branch: `fix/ai-invest-forms-mobile`
- 先 `git status` 確認乾淨；有未提交變更就 STOP。
- Conventional commits；推分支開 PR，不 push main。

## Steps

### Step 1: 共用 form-row helper

globals.css 新增：

```css
/* 表單欄位列：桌機並排、手機自動收欄。minmax 下限 = 一個可讀的數字輸入寬。 */
.ns-form-row-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.ns-form-row-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 1023px) {
  .ns-form-row-2 { grid-template-columns: minmax(0, 1fr); }
  .ns-form-row-3 { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
}
```

（三欄列在 390px 會收成 2+1 或 1 欄——140px 下限保證每個數字輸入 ≥ ~116px 內容寬。）

### Step 2: InvestmentsAddSheet 套用

- line 968–973 → `className="ns-form-row-3"`（移除 inline display/gridTemplateColumns/gap）。
- line 704、832、884、910、1104 五處 `"1fr 1fr"` → `className="ns-form-row-2"`。
  每處先讀上下文確認語意是「兩個表單欄位並排」；不是的（如按鈕列）就跳過並記錄。
- 手機上 `text-lg` 維持（單欄後寬度夠）；若 auto-fit 收成兩欄後手續費欄提示仍換 3+ 行，
  給提示文字 `gridColumn: "1 / -1"` 讓它獨占整行。

**Verify**: `npm run build` exit 0；390px 開新增交易（買進）：股數／價格／手續費每欄
內容寬 ≥116px、placeholder 完整可見、表單內部無橫向捲動（body `scrollLeft` 恆 0 且
`scrollWidth <= clientWidth`）；1280px：三欄並排與改前一致。

### Step 3: HoldingEditModal 接 bottom-sheet + dvh + 刪除鈕

- line 179 加 `mobilePresentation="bottom-sheet"`（center variant + bottom-sheet 的
  組合已有前例：plan 287 的配對 dialog；sheet 模式自動剝 positional keys，此處
  panelStyle 無 positional keys，安全）。
- line 194 `max-h-[70vh]` → `max-h-[70dvh]`。
- line 335–343 的 raw button 換 COSS：

```tsx
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="ml-3"
                              aria-label="刪除快照"
                              disabled={deleteSnapshot.isPending}
                              onClick={() => void deleteSnapshot.mutateAsync(snap.id)}
                            >
                              <X size={14} />
                            </Button>
```

  （import 該檔既有的 Button；若未 import 先加。）

**Verify**: 390px：編輯持倉以 bottom-sheet 呈現、儲存鈕在 home indicator 上方
（`env(safe-area-inset-bottom)` 由 `.ns-sheet-bottom` 提供）；1280px：center modal
`max-w-2xl` 與改前一致。

## Test plan

- e2e：390×844 開「新增交易」，斷言三個數字輸入的 `clientWidth >= 116`；開「編輯持倉」，
  斷言 panel 有 `ns-sheet-bottom` class。
- Verification: `npm test`、`npm run test:e2e` 全綠。

## Done criteria

- [ ] `npm run build` exit 0；`npm test` exit 0；`npm run test:e2e` exit 0
- [ ] `npm run lint` 0 errors；`npm run format:check` 通過
- [ ] `grep -n '"1fr 1fr"' src/routes/InvestmentsAddSheet.tsx` → 無結果（或僅剩已記錄的
      非表單列）
- [ ] `grep -n "70vh" src/routes/HoldingEditModal.tsx` → 無結果
- [ ] `grep -n "size-6" src/routes/HoldingEditModal.tsx` → 無結果（刪除鈕）
- [ ] 390px：數字欄可讀、無表單內橫捲、編輯持倉為 bottom-sheet
- [ ] 桌機兩表單與改前一致
- [ ] `git status` 只有 in-scope 檔案（+ 測試檔、plans/README.md）
- [ ] `plans/README.md` 狀態列更新

## STOP conditions

- 摘錄與 live code 不符。
- 任一 `"1fr 1fr"` 位置的語意不是表單欄位並排且不確定如何處理。
- HoldingEditModal 接 bottom-sheet 後內部 `max-h-[70dvh]` 與 `.ns-sheet-bottom` 的
  `max-height: min(92dvh, 100%)` 疊出雙捲動條或高度塌陷——回報，不要疊 hack。
- 三欄收合後「自動試算」行為（手續費 onChange 邏輯）出現任何行為差異——版面計畫不許
  碰計算，立即 STOP。

## Maintenance notes

- `.ns-form-row-2/3` 是之後所有表單的標準欄位列 helper——CashFlow drawer 的
  `grid-cols-2`（plan 299 的 datetime 部分）也應逐步收斂到它。
- Reviewer 盯：`NumberField` 在單欄全寬下的 `text-lg` 是否過大（純觀感，可留給 operator）。
