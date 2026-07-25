# Plan 252: 信用卡繳款建立的記帳紀錄可正確修改日期（date-only 值撐爆 datetime-local 輸入）

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 8fed759d..HEAD -- src/routes/ReconcileRoute.tsx src/routes/CashFlowRoute.tsx src/domain/datetime.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1（一般操作在編輯抽屜看到日期欄位是**空白**、改了也不對——資料可
  編輯性 bug，直接擋住使用者修正繳款日期）
- **Effort**: S
- **Risk**: LOW（一行寫入格式修正 + 一個純函式顯示層 coercion；不動餘額、不動 schema）
- **Depends on**: none（與計劃 251 都動 `ReconcileRoute.tsx` 但改的是不同行）
- **Category**: bug
- **Planned at**: commit `8fed759d`, 2026-07-24

## Why this matters

使用者回報：信用卡繳款後新增的記帳紀錄，「按了修改日期後沒有正確更新」。

根因是**日期字串格式不一致**：

- 繳款流程 `handlePay`（`ReconcileRoute.tsx`）建立兩筆紀錄——轉帳「信用卡繳款」和
  （選填）收入「帳單折抵 / 回饋」——兩者都用 `todayInTimezone(timezone)`，回傳的是
  **date-only** 字串 `YYYY-MM-DD`（10 字元，見 `datetime.ts:28-31`）。
- App 其它所有建立路徑用的是 `nowAsDatetimeLocal(timezone)`，回傳
  `YYYY-MM-DDTHH:mm`（datetime-local 格式，`datetime.ts:38-41`）。
- 編輯抽屜的日期輸入是 `<input type="datetime-local">`（`CashFlowRoute.tsx:3337`）。
  依 HTML 規範，`datetime-local` 的 value 若不符 `YYYY-MM-DDTHH:mm`，瀏覽器一律當成
  **空值**顯示。於是繳款產生的紀錄一打開編輯，日期欄位是空白的，使用者改了也覺得
  「沒正確更新」。

修法兩層，都要做：
1. **根因**：`handlePay` 改用 `nowAsDatetimeLocal`，讓新紀錄帶完整 datetime-local
   字串，與全 app 一致——治本，防止再產生壞資料。
2. **相容既有資料 + 防禦**：在 datetime-local 輸入的 value 綁定處，把 date-only 值
   補成 `${date}T00:00`。這讓**任何**歷史 date-only 紀錄（不只繳款）打開編輯時都能
   正確顯示，不需資料 migration。

## Current state（已於 `8fed759d` 核對）

### `src/domain/datetime.ts`

```ts
// :28-31
export function todayInTimezone(timezone: string, now: Date = new Date()): string {
  const parts = getParts(now, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;              // YYYY-MM-DD（10 字元）
}
// :38-41
export function nowAsDatetimeLocal(timezone: string, now: Date = new Date()): string {
  const parts = getParts(now, timezone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`; // datetime-local
}
```

### `src/routes/ReconcileRoute.tsx` — `handlePay`（`:134-173`）

```tsx
async function handlePay(payAccountId: string, payAmount: number, creditAmount: number) {
  if (!account || account.type !== "credit") return;
  const day = todayInTimezone(timezone);              // ← date-only，這是問題來源
  try {
    if (payAmount > 0) {
      await createTransfer.mutateAsync({
        date: day, /* … 信用卡繳款轉帳 … */ });
    }
    if (creditAmount > 0) {
      await createLedger.mutateAsync({
        accountId: account.id, /* … */ date: day, name: "帳單折抵 / 回饋", /* … */ });
    }
    await markPaid();
    // …
  }
}
```

`todayInTimezone` 由 `../domain` 匯入（`:10`）。

### `src/routes/CashFlowRoute.tsx` — 編輯抽屜的日期輸入（`:3335-3344`）

```tsx
<input
  className="ns-input"
  type="datetime-local"
  value={type === "transfer" ? transferForm.date : ledgerForm.date}
  onChange={(e) =>
    type === "transfer"
      ? setTransferForm({ ...transferForm, date: e.target.value })
      : setLedgerForm({ ...ledgerForm, date: e.target.value })
  }
/>
```

- Hydration：`startEdit` 設 `ledgerForm.date = row.date`（`:839`）、`startTransferEdit`
  設 `transferForm.date = source.date`（`:793`）——都是把儲存值原封不動塞入。若儲存值
  是 date-only，datetime-local 就顯示空白。
- `nowAsDatetimeLocal` 已在此檔匯入並使用（`:604`, `:674`）。
- 這個 datetime-local 輸入是 expense/income/transfer 共用的主日期欄位；修在 value
  綁定處可一次涵蓋三種型別。

## Commands you will need

| Purpose   | Command                         | Expected on success |
|-----------|---------------------------------|---------------------|
| Typecheck / build | `npm run build`         | exit 0, no TS errors |
| Unit test | `npx vitest run datetime`       | all pass            |
| Lint      | `npm run lint`                  | exit 0（warnings 允許） |

## Scope

**In scope**（只能改這些）：
- `src/domain/datetime.ts`（新增一個純函式）
- `src/domain/datetime.test.ts`（若不存在則建立；新增該函式的測試）
- `src/routes/ReconcileRoute.tsx`（`handlePay` 一行：`todayInTimezone` → `nowAsDatetimeLocal`）
- `src/routes/CashFlowRoute.tsx`（日期輸入 value 綁定 coercion）

**Out of scope**（不要動）：
- 不要改 `datetime-local` → `date`（會丟掉時間、影響其它紀錄）。
- 不要對既有資料做 migration/批次改寫（顯示層 coercion 已足夠治相容）。
- 不要碰 `handlePay` 的其它行（尤其 `markPaid()` 呼叫——那是計劃 251 的範圍）。
- 不要動 `buildStatementPeriods`（它用 `.slice(0,10)`，date-only 與 datetime 皆正確）。

## Git workflow

- Branch: `fix/ai-payment-record-editable-date`
- Commit style：conventional commits，例
  `fix(reconcile): store full datetime on payment records so date is editable (plan 252)`
- 不要 push / 開 PR，除非操作者指示。

## Steps

### Step 1: 在 `datetime.ts` 新增 `toDatetimeLocalValue` 純函式

在 `nowAsDatetimeLocal`（`:41`）之後新增：

```ts
/**
 * Coerce a stored date string into a value the `<input type="datetime-local">`
 * element can render. A date-only string (`YYYY-MM-DD`, 10 chars) is invalid
 * for datetime-local and the browser renders it as blank, so we append a
 * midnight time. Full datetime-local strings and empty strings pass through.
 */
export function toDatetimeLocalValue(value: string): string {
  return value.length === 10 ? `${value}T00:00` : value;
}
```

**Verify**: `npm run build` → exit 0（此步只是新增匯出，不會有錯）。

### Step 2: `datetime.ts` 的測試

若 `src/domain/datetime.test.ts` 不存在，建立它（`import { describe, expect, it } from "vitest";`
＋ `import { toDatetimeLocalValue } from "./datetime";`）。若已存在，於檔內新增一個
`describe` 區塊：

```ts
describe("toDatetimeLocalValue", () => {
  it("appends midnight to a date-only string", () => {
    expect(toDatetimeLocalValue("2026-07-24")).toBe("2026-07-24T00:00");
  });
  it("passes a full datetime-local string through", () => {
    expect(toDatetimeLocalValue("2026-07-24T14:30")).toBe("2026-07-24T14:30");
  });
  it("passes an empty string through", () => {
    expect(toDatetimeLocalValue("")).toBe("");
  });
});
```

**Verify**: `npx vitest run datetime` → all pass，含 3 筆新測試。

### Step 3: `handlePay` 改用完整 datetime-local（治本）

在 `ReconcileRoute.tsx` 把 `handlePay` 內
`const day = todayInTimezone(timezone);` 改為
`const day = nowAsDatetimeLocal(timezone);`。

同時更新 import：`ReconcileRoute.tsx:10` 目前
`import { buildStatementPeriods, formatNumber, todayInTimezone } from "../domain";`。
`todayInTimezone` 在此檔還有另一處使用（`:57` `const today = todayInTimezone(timezone);`
——那是給 `buildStatementPeriods` 的**日曆日**，必須保持 date-only，**不要改**）。所以
import 需**同時保留** `todayInTimezone` 並**新增** `nowAsDatetimeLocal`：

```tsx
import { buildStatementPeriods, formatNumber, nowAsDatetimeLocal, todayInTimezone } from "../domain";
```

> 確認 `nowAsDatetimeLocal` 有從 `../domain`（`src/domain/index.ts`）re-export。若沒有，
> 改成 `import { nowAsDatetimeLocal } from "../domain/datetime";`（`CashFlowRoute.tsx`
> 已這樣或透過 `../domain` 取用——照它的 import 來源）。

**Verify**: `npm run build` → exit 0；
`grep -n "const day = nowAsDatetimeLocal" src/routes/ReconcileRoute.tsx` → 有匹配；
`grep -n "const today = todayInTimezone" src/routes/ReconcileRoute.tsx` → 仍有匹配（`:57` 未動）。

### Step 4: 編輯抽屜日期輸入包一層 coercion（相容既有資料）

在 `CashFlowRoute.tsx` 的日期輸入（`:3338`）把 value 包起來：

```tsx
value={toDatetimeLocalValue(type === "transfer" ? transferForm.date : ledgerForm.date)}
```

並在 `CashFlowRoute.tsx` 的 import 加入 `toDatetimeLocalValue`（來源與 `nowAsDatetimeLocal`
相同——找到現有匯入 `nowAsDatetimeLocal` 的那行，把 `toDatetimeLocalValue` 併進去）。

> 這只改**顯示** value：使用者不動日期就儲存時，表單 state 仍是原 date-only 值，
> `updateTransfer`/`updateLedgerTransaction` 照寫（domain 用 `.slice(0,10)`，無害），
> 下次打開會被 coercion 補成可顯示——正確且不破壞既有語意。使用者一旦動了日期，
> `onChange` 產生的就是合法 datetime-local。

**Verify**: `npm run build` → exit 0；
`grep -n "toDatetimeLocalValue" src/routes/CashFlowRoute.tsx` → 有匹配（import + 使用）。

### Step 5: 全套建置 + lint

**Verify**:
- `npm run build` → exit 0
- `npm run lint` → exit 0（warnings 允許）
- `npx vitest run datetime` → all pass

## Test plan

- **新測試**（`datetime.test.ts`）：Step 2 的三筆——date-only 補時間、完整值 passthrough、
  空字串 passthrough。這是唯一需要單元測試的邏輯（純函式）。
- **結構範本**：照 `src/domain` 內任一既有 `*.test.ts` 的 vitest 寫法（例
  `creditCardStatements.test.ts` 的 `describe`/`it`/`expect`）。
- ReconcileRoute / CashFlowRoute 無元件測試（既有慣例），故 UI 行為以下方操作者驗收
  為準。

## Done criteria

全部必須成立：

- [ ] `npm run build` exit 0
- [ ] `npx vitest run datetime` 全過，含 3 筆新測試
- [ ] `npm run lint` exit 0
- [ ] `grep -n "todayInTimezone(timezone)" src/routes/ReconcileRoute.tsx` → 只剩 `:57`
      的日曆日用法（**`handlePay` 內那筆已改成 `nowAsDatetimeLocal`**）
- [ ] `grep -n "toDatetimeLocalValue" src/routes/CashFlowRoute.tsx` → 有匹配
- [ ] `git status` 只動到 in-scope 檔案
- [ ] `plans/README.md` 狀態列已更新

## STOP conditions

停止並回報（不要臨場發揮）：

- Drift check 顯示上述任一檔已漂移、與 excerpt 不符。
- `datetime-local` 輸入行的 value 綁定已不是 `type === "transfer" ? transferForm.date
  : ledgerForm.date`（代表結構已改，需重新確認注入點）。
- `nowAsDatetimeLocal` / `toDatetimeLocalValue` 無法從你選的 import 來源取得，且解法
  需要改 `src/domain/index.ts` 的匯出面——先回報，別擅自擴大 index 匯出。
- 你發現除了 `handlePay` 外，還有其它路徑寫 date-only 進 ledger 且會被此輸入編輯——
  記錄下來回報（顯示層 coercion 已能相容，但值得知道）。

## Maintenance notes

- **操作者驗收（需真 app / `npm run dev`）**：走一次信用卡繳款（含填折抵金額），到記帳
  列表點該筆「信用卡繳款」與「帳單折抵 / 回饋」→ 編輯 → 確認日期欄位**有顯示**繳款當
  天日期（非空白）、可改、儲存後正確更新。
- 治本（Step 3）保證**新**紀錄不再是 date-only；coercion（Step 4）保證**既有**紀錄也
  能編輯。兩者都留著才完整——reviewer 別為了「精簡」把 Step 4 拿掉，否則歷史資料仍壞。
- 未來若引入更多「快捷建立」入口（如自動繳款、匯入），一律用 `nowAsDatetimeLocal`
  寫日期，別再用 `todayInTimezone` 寫進 ledger `date` 欄位。
- 與計劃 251 同動 `ReconcileRoute.tsx`：251 動 `markPaid`/`handlePay` 的期別與 modal；
  本計劃只動 `handlePay` 的 `const day = …` 一行與 import。若兩計劃先後執行，注意
  `handlePay` 簽名可能被 251 改過（多一個 `dueDate` 參數）——**本計劃不改簽名**，只改
  `const day` 那行，衝突可手動合。
