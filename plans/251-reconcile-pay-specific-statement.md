# Plan 251: 信用卡繳款可選擇「繳哪一期」，且繳一期不再把後續各期都標記已繳款

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 8fed759d..HEAD -- src/routes/ReconcileRoute.tsx src/domain/creditCardStatements.ts`
> If either in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1 (財務正確性 bug — 使用者繳一期，畫面卻把未來的、尚未結帳的
  當期都標成「已繳款」，違反 §1 correctness-first invariant)
- **Effort**: M
- **Risk**: MED（改動繳款寫入路徑，會設定 `creditPaymentPaidUntil` watermark；
  但不動 ledger / 餘額，且 `buildStatementPeriods` 有既有測試護欄）
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `8fed759d`, 2026-07-24

## Why this matters

使用者回報：繳了「6/16 – 7/15」這一期（繳款日 08-03），結果「7/16 – 8/15」這一期
（**尚未結帳的當期**，繳款日 09-03）也被標成「已繳款」，甚至更早的 05/16–06/15 也是。

根因在 `markPaid()`：它把 watermark 設成 **`currentPeriod?.dueDate`**——也就是那個
**還沒結帳的開放週期**的繳款日（09-03）。而 `isPaid` 判定是
`creditPaymentPaidUntil >= dueDate`，於是所有繳款日 ≤ 09-03 的期別（07-03、08-03、
09-03）全部翻成已繳款。使用者根本沒繳當期，卻看到當期已繳款——這是錯的：你不可能
繳一張還沒結出來的帳單。

修法有兩個目標，缺一不可：
1. **正確性**：繳款只能對「已結帳、尚未繳」的期別；watermark 必須設成**使用者選定
   那一期**的繳款日，永遠不是開放當期的繳款日。
2. **可選擇（使用者明確要求）**：繳款 modal 要能選「繳哪一期」，預設選最舊的一筆
   未繳已結帳帳單（也就是最接近逾期、最該先繳的那期）。

保留現有的 watermark 模型（`paidUntil >= dueDate`）是刻意的：繳了較晚一期，隱含較早
各期也繳了，符合現實，也與 `dashboardSummary.ts:172` 的提醒邏輯一致。這個計劃**不改
watermark 語意**，只修「選錯期別」這件事並把選擇權交給使用者。

## Current state（已於 `8fed759d` 核對）

### `src/domain/creditCardStatements.ts`

`StatementPeriod<T>` 每期帶有這些欄位（`:23-44`）：`key`（結帳日 `YYYY-MM-DD`）、
`label`、`start`、`end`、`dueDate`（該期繳款日，可能為 null）、`total`（帶號淨額）、
`spend`、`reconciledCount`、`isCurrent`（尚未結帳的開放當期）、`isPaid`
（`Boolean(dueDate && creditPaymentPaidUntil && creditPaymentPaidUntil >= dueDate)`，`:154`）。

期別由新到舊排序（`:137-138` `b[0].localeCompare(a[0])`）。

### `src/routes/ReconcileRoute.tsx`

**`markPaid()`（`:110-132`）— 這是 bug 所在：**

```tsx
async function markPaid() {
  if (!account?.paymentDueDay) return;
  // Mark the most recently closed unpaid statement's due date as paid so the
  // reminder for that cycle is suppressed.
  const dueDate = currentPeriod?.dueDate
    ?? periods.find((p) => p.dueDate && !p.isPaid)?.dueDate;
  if (!dueDate) return;
  try {
    await updateAccount.mutateAsync({
      id: account.id,
      name: account.name, currency: account.currency, openingBalance: account.openingBalance,
      type: account.type, creditLimit: account.creditLimit, creditLimitGroup: account.creditLimitGroup,
      statementDay: account.statementDay, paymentDueDay: account.paymentDueDay,
      creditPaymentPaidUntil: dueDate,
      isSharedToHousehold: account.isSharedToHousehold,
      loanStartDate: account.loanStartDate, annualInterestRate: account.annualInterestRate, loanTerm: account.loanTerm,
      iconName: account.iconName, color: account.color,
    });
    toast.success(`已標記繳款，提醒將在 ${dueDate} 後再次顯示`);
  } catch {
    toast.error("更新失敗");
  }
}
```

`currentPeriod`（`:70`）= `periods.find((p) => p.isCurrent) ?? periods[0]` —— **開放當期**。
所以 `currentPeriod?.dueDate` 就是那個未結帳當期的繳款日。這一行就是把後續各期都翻成
已繳款的元兇。

**`handlePay()`（`:134-173`）** 建立轉帳 + 選填折抵後，尾端呼叫 `await markPaid();`
（`:167`），沒有傳任何期別。

**`PayCardModal`（`:404-493`）** 目前欄位：付款帳戶（select）、繳款金額（number，
預設 `String(owed)`，`:420`）、帳單折抵/回饋（number）。`onConfirm(payAccountId, pay, credit)`
（`:417`, `:486`）。**沒有期別選擇。**

**Header 繳款按鈕（`:241-251`）** 用 `isPaid = account.creditPaymentPaidUntil != null`
（`:208`）決定顯示「已繳款」還是「繳款 / 標記已繳」。

`owed = Math.max(0, -account.balance)`（`:207`）是整張卡的未繳總額（跨所有期別）。

### 排版/樣式慣例（照抄，勿引入新框架）

Modal 內欄位標題用 `<div className="text-xs font-medium mb-1.5">…</div>`，
`<select>` / `<input>` 用 inline style `{ borderRadius: "var(--ns-r-md)", border:
"1px solid var(--ns-border)", background: "var(--ns-bg)", color: "var(--ns-fg)" }`
（見 `:447-457` 付款帳戶 select）。新增的期別 select **照這個模板**，不要新拉 class。

## Commands you will need

| Purpose   | Command                              | Expected on success |
|-----------|--------------------------------------|---------------------|
| Typecheck / build | `npm run build`              | exit 0, no TS errors |
| Unit test | `npx vitest run creditCardStatements`| all pass            |
| Lint      | `npm run lint`                       | exit 0（warnings 不算 fail） |

## Scope

**In scope**（只能改這些）：
- `src/routes/ReconcileRoute.tsx`
- `src/domain/creditCardStatements.test.ts`（新增 regression 測試）

**Out of scope**（看似相關但不要動）：
- `src/domain/creditCardStatements.ts` — `isPaid`/watermark 語意刻意保留；**不要**
  在這裡改判定邏輯。本計劃修的是「選錯期別」，不是 watermark 本身。
- `src/domain/dashboardSummary.ts` — 提醒用同一個 watermark，與本修法一致，不要碰。
- `src/data/repositories.ts` — 帳戶欄位與 `updateAccount` 已足夠，不需要 schema 變更。
- 不要引入「每期一個已繳款布林」的資料模型（那是 schema migration，屬另一個計劃）。

## Git workflow

- Branch: `fix/ai-reconcile-pay-specific-statement`
- Commit style（match repo，見 `git log --oneline -5`）：conventional commits，
  例：`fix(reconcile): pay a chosen statement, not the open cycle (plan 251)`
- 不要 push 或開 PR，除非操作者指示。

## Steps

### Step 1: `markPaid` 改為接受明確的繳款日，不再抓開放當期

把 `markPaid()` 改成 `markPaid(dueDate: string)`，刪掉內部那段
`currentPeriod?.dueDate ?? periods.find(...)` 的推導；直接用傳入的 `dueDate` 設
`creditPaymentPaidUntil`。其餘 `updateAccount.mutateAsync({...})` 內容不變。

```tsx
async function markPaid(dueDate: string) {
  if (!account?.paymentDueDay || !dueDate) return;
  try {
    await updateAccount.mutateAsync({
      id: account.id,
      name: account.name, currency: account.currency, openingBalance: account.openingBalance,
      type: account.type, creditLimit: account.creditLimit, creditLimitGroup: account.creditLimitGroup,
      statementDay: account.statementDay, paymentDueDay: account.paymentDueDay,
      creditPaymentPaidUntil: dueDate,
      isSharedToHousehold: account.isSharedToHousehold,
      loanStartDate: account.loanStartDate, annualInterestRate: account.annualInterestRate, loanTerm: account.loanTerm,
      iconName: account.iconName, color: account.color,
    });
    toast.success(`已標記繳款，提醒將在 ${dueDate} 後再次顯示`);
  } catch {
    toast.error("更新失敗");
  }
}
```

**Verify**: `npm run build` → 此步會因為 `handlePay` 仍以無參呼叫 `markPaid()` 而
出現 1 個 TS 錯誤，屬預期；Step 2 修正後應歸零。若出現其他錯誤 → STOP。

### Step 2: `handlePay` 接受並轉傳選定期別的繳款日

把 `handlePay` 的簽名改成多收一個 `dueDate: string`，並在尾端呼叫 `markPaid(dueDate)`：

```tsx
async function handlePay(payAccountId: string, payAmount: number, creditAmount: number, dueDate: string) {
  if (!account || account.type !== "credit") return;
  const day = todayInTimezone(timezone);
  try {
    if (payAmount > 0) { /* createTransfer 不變 */ }
    if (creditAmount > 0) { /* createLedger 不變 */ }
    await markPaid(dueDate);
    setPayOpen(false);
    toast.success("已記錄繳款");
  } catch {
    toast.error("繳款失敗");
  }
}
```

> 注意：`day` 用於 ledger/transfer 日期。計劃 253 會把 `todayInTimezone` 換成
> `nowAsDatetimeLocal` 以修日期可編輯性——**本計劃不要動這一行**，避免與 253 衝突。

**Verify**: `npm run build` → Step 1 的 TS 錯誤消失、無新錯誤。（此時 modal 尚未傳
第 4 參數，會再冒一個 `onConfirm` 型別錯誤，Step 3 修正——先繼續。）

### Step 3: `PayCardModal` 加「繳款期別」選擇，預設最舊未繳已結帳帳單

在 `ReconcileRoute` 內計算可繳期別清單並傳入 modal：

```tsx
// 只可繳「已結帳、尚未繳、且有繳款日」的期別；由舊到新（最該先繳的在最前）。
const payablePeriods = useMemo(
  () => periods
    .filter((p) => !p.isCurrent && !p.isPaid && p.dueDate)
    .sort((a, b) => a.end.localeCompare(b.end)),
  [periods],
);
```

改 `PayCardModal` 的 props 與內部：
- 新增 prop `payablePeriods: StatementPeriod<LedgerTransaction>[]`（型別從
  `../domain` import `StatementPeriod`；`LedgerTransaction` 已 import）。
- `onConfirm` 簽名改為 `(payAccountId, payAmount, creditAmount, dueDate) => void`。
- modal 內部新增 state `const [periodKey, setPeriodKey] = useState(payablePeriods[0]?.key ?? "")`。
- 選定期別 `const selected = payablePeriods.find((p) => p.key === periodKey) ?? payablePeriods[0]`。
- 繳款金額**預設改為選定期別的淨額**：`useState(String(selected ? Math.max(0, -selected.total) : owed))`。
  （`-total` = 該期應繳淨額；`owed` 是跨期總額，只在無可繳期別時 fallback。）
- 在「付款帳戶」欄位**上方**加一個期別 select（照 `:447-457` 的樣式模板）：

```tsx
<div className="mb-3.5">
  <div className="text-xs font-medium mb-1.5">繳款期別</div>
  {payablePeriods.length === 0 ? (
    <div className="text-xs" style={{ color: "var(--ns-fg-muted)" }}>目前沒有已結帳、待繳的帳單。</div>
  ) : (
    <select
      value={periodKey}
      onChange={(e) => setPeriodKey(e.target.value)}
      className="w-full px-2.5 py-2"
      style={{ borderRadius: "var(--ns-r-md)", border: "1px solid var(--ns-border)", background: "var(--ns-bg)", color: "var(--ns-fg)" }}
    >
      {payablePeriods.map((p) => (
        <option key={p.key} value={p.key}>{p.label}（繳款日 {p.dueDate?.slice(5)}）</option>
      ))}
    </select>
  )}
</div>
```

- `canConfirm` 追加條件：必須有選定期別 → `... && selected != null && selected.dueDate != null`。
- 確認按鈕：`onConfirm(payAccountId, pay, credit, selected!.dueDate!)`。
- 在 `ReconcileRoute` render `PayCardModal` 處（`:390-399`）補傳 `payablePeriods={payablePeriods}`。

**設計備註**：不允許「繳」開放當期（`isCurrent`）——尚未結帳的帳單不能繳，這正是原
bug。若 `payablePeriods` 為空（全部已繳或只有當期），期別 select 顯示提示、金額退回
`owed`、且因 `selected == null` 而無法確認——這是正確行為（沒有可繳帳單）。

**Verify**: `npm run build` → exit 0、無 TS 錯誤。

### Step 4: Header 按鈕「已繳款」只在沒有待繳已結帳帳單時顯示

把 `:208` 的 `isPaid` 改為反映「是否還有未繳的已結帳帳單」：

```tsx
const hasUnpaidClosed = payablePeriods.length > 0;
const isPaid = account.creditPaymentPaidUntil != null && !hasUnpaidClosed;
```

（其餘用到 `isPaid` 的地方 `:243/246/248` 不變——只是語意更正確：繳一期後若還有更舊
未繳期別，按鈕仍顯示「繳款 / 標記已繳」而非誤報「已繳款」。）

> `payablePeriods` 在 Step 3 已定義於 component 內、`isPaid` 之前需可取用——確認宣告
> 順序（`payablePeriods` 的 `useMemo` 放在 `periods`/`currentPeriod` 之後、`owed`/`isPaid`
> 之前）。若順序造成 TS「used before declaration」→ 調整宣告位置即可。

**Verify**: `npm run build` → exit 0；`npm run lint` → exit 0（warnings 允許）。

### Step 5: 新增 regression 測試（純 domain 層，證明 watermark 語意）

`buildStatementPeriods` 已有測試（`src/domain/creditCardStatements.test.ts`）。新增一
測試，重現使用者情境：繳「已結帳的舊期」後，開放當期**不應**被標為已繳款。

在 `describe("buildStatementPeriods", …)` 內加：

```tsx
it("paying a closed statement's due date does NOT mark the open cycle paid (plan 251)", () => {
  // 結帳日 15、繳款日次月 3 號。今天 2026-07-24 → 開放當期 close 2026-08-15、due 2026-09-03。
  // 已結帳待繳期別：06/16–07/15（close 07-15，due 08-03）。
  const rows = [
    row("2026-07-10T10:00", -1000), // bills to 07-15 statement
    row("2026-07-20T10:00", -1749), // bills to 08-15 (open) statement
  ];
  const opts = { statementDay: 15, paymentDueDay: 3, today: "2026-07-24" } as const;

  // 繳掉 07-15 這期（把 watermark 設成它的繳款日 2026-08-03）
  const periods = buildStatementPeriods(rows, { ...opts, creditPaymentPaidUntil: "2026-08-03" });
  const closed = periods.find((p) => p.end === "2026-07-15")!;
  const open = periods.find((p) => p.isCurrent)!;
  expect(closed.isPaid).toBe(true);   // 選定並繳的那期 → 已繳款
  expect(open.isPaid).toBe(false);    // 尚未結帳的當期 → 不可能已繳款
  expect(open.dueDate).toBe("2026-09-03");
});
```

**Verify**: `npx vitest run creditCardStatements` → all pass，含這筆新測試。

## Test plan

- **新測試**（`creditCardStatements.test.ts`）：Step 5 的 regression——證明把 watermark
  設成「已結帳期別的繳款日」時，開放當期 `isPaid` 為 false。這鎖死了原 bug 的反面：
  只要有人再把 watermark 設成當期繳款日，此測試不會抓到（那是 UI 層），但它保證 domain
  判定對「選對期別」的輸入給出正確結果。
- **結構範本**：照同檔既有的 `it("marks a prior statement paid when creditPaymentPaidUntil covers its due date", …)`（`:44-56`）。
- ReconcileRoute 無元件測試（既有慣例：此路由未測），故 UI 改動以 `npm run build` +
  手動驗收為準（見 STOP 前的操作者驗收）。

## Done criteria

全部必須成立：

- [ ] `npm run build` exit 0（無 TS 錯誤）
- [ ] `npx vitest run creditCardStatements` 全過，含 1 筆新增測試
- [ ] `npm run lint` exit 0
- [ ] `grep -n "currentPeriod?.dueDate" src/routes/ReconcileRoute.tsx` → **無匹配**
      （已不再用開放當期繳款日當 watermark）
- [ ] `grep -n "繳款期別" src/routes/ReconcileRoute.tsx` → 有匹配（期別選擇已加入）
- [ ] `git status` 只動到 in-scope 兩個檔案
- [ ] `plans/README.md` 狀態列已更新

## STOP conditions

出現以下情況，停止並回報（不要臨場發揮）：

- Drift check 顯示 `ReconcileRoute.tsx` 或 `creditCardStatements.ts` 已與上方 excerpt
  不符（代碼已漂移）。
- 你發現 `StatementPeriod` 沒有從 `../domain` 匯出（無法在 modal props 標型別）——
  先確認 `src/domain/index.ts` 是否 re-export `creditCardStatements`；若沒有，用
  `import type { StatementPeriod } from "../domain/creditCardStatements"` 直接引入，
  不要為此改 `index.ts` 的匯出面。
- 任一 verify 指令修兩次仍失敗。
- 你認為修法需要動到 out-of-scope 檔案（尤其是 `creditCardStatements.ts` 的 `isPaid`
  或 `repositories.ts`）——那代表理解有偏差，回報而非擴大範圍。

## Maintenance notes

- **操作者驗收（需真 app）**：繳一期已結帳帳單後，確認 (1) 只有該期＋更早各期顯示
  「已繳款」、(2) 開放當期不顯示已繳款、(3) header 按鈕在仍有待繳期別時維持「繳款 /
  標記已繳」。瀏覽器 dev（`npm run dev`）即可測，不需 Tauri。
- 若未來把 watermark 改成「每期獨立已繳布林」（schema migration），本計劃的 modal 期別
  選擇正好是那個 UI 的前置，但 `markPaid` 的 watermark 寫入要換成 per-period 寫入。
- 與計劃 253 都動 `ReconcileRoute.tsx`：253 只改 `handlePay` 裡的 `todayInTimezone`
  那一行（日期格式）；本計劃不碰該行。合併順序無關，衝突機率低。
- Reviewer 該盯：期別清單的 filter（`!isCurrent && !isPaid && dueDate`）與排序（由舊到
  新）是否正確；以及 `markPaid` 是否真的只用傳入 `dueDate`、不再有任何 `currentPeriod`
  的殘留引用。
