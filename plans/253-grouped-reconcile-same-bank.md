# Plan 253: 同一家銀行/同組信用卡合併對帳（帳單在一起，交易一起核對）

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 8fed759d..HEAD -- src/routes/ReconcileRoute.tsx src/domain/creditCardStatements.ts src/routes/AccountsRoute.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2（使用者明確要求的功能；非阻斷性 bug，但顯著影響同組多卡使用者的
  對帳流程）
- **Effort**: L
- **Risk**: MED（跨多帳戶讀取＋繳款時多帳戶寫 watermark；不動 ledger 餘額。財務語意
  以既有 `buildStatementPeriods` 為準，額外測試護欄）
- **Depends on**: 建議在計劃 251 之後（251 改了 `markPaid`/`handlePay` 與 modal，本
  計劃在其之上加「對整組帳戶生效」；先做 251 可避免重工）
- **Category**: direction / feature
- **Planned at**: commit `8fed759d`, 2026-07-24

## Why this matters

使用者有玉山 UniCard 與玉山 UBear 兩張卡，**帳單是合在一起出**的，所以對帳時希望兩張
卡的交易一起核對，而不是分別開兩個對帳頁各對各的。目前對帳路由
（`/cash-flow/reconcile/$accountId`）是**單一帳戶**視圖：只列該帳戶的交易、只算該帳戶
的期別，無法把同組卡合看。

本計劃讓對帳頁在偵測到「目前帳戶屬於一個信用卡分組（`creditLimitGroup`）、且組內有
≥2 張卡共用相同結帳日/繳款日/幣別」時，自動切換成**合併對帳視圖**：把整組卡的交易匯進
共同的帳單週期、合併統計、可跨卡一次核對，繳款時把整組一起標記已繳款。每筆交易標示它
屬於哪張卡，避免混淆。

**範圍界定（重要）**：使用者要的是「一起**對帳**（核對交易）」。因此本計劃聚焦合併
**檢視 + 核對 + 繳款標記**。合併繳款的「一筆金額如何拆分到各卡餘額」屬更深的產品決策，
**明確延後**（見 Maintenance notes）——v1 的繳款轉帳仍打進使用者選定的單一卡，watermark
則對整組生效。

## Current state（已於 `8fed759d` 核對）

### 分組欄位：`creditLimitGroup`（既有、免 schema 變更）

`Account.creditLimitGroup: string`（`src/domain/types.ts:142`）——自由文字，已用於「共用
信用額度」分組：`AccountsRoute.tsx:1108-1113` 的 `calculateCreditGroup(name, accounts)`
以 `account.type === "credit" && account.creditLimitGroup === name` 聚合。使用者若把兩張
玉山卡設同一個 `creditLimitGroup`（例「玉山信用卡」），即構成一組。這是唯一現成的「同組
卡」訊號，本計劃**重用它**，不新增欄位。

帳戶編輯表單已有此欄位輸入：`AccountsRoute.tsx:974`
`<input … value={form.creditLimitGroup} … placeholder="玉山信用卡" />`。

### `src/domain/creditCardStatements.ts` — **無需改動**

`buildStatementPeriods<T extends StatementRow>(rows, options)` 對每筆 row 只讀
`date`/`postDate`/`amount`/`isReviewed`（`StatementRow`, `:13-21`），但**保留完整 T**
於輸出 `rows: T[]`。傳入的 row 若是 `LedgerTransaction`（已含 `accountId`），輸出每筆
period.rows[i] 仍帶 `accountId`——**合併視圖不需要改 domain 層**，只要餵進多帳戶的 rows。

`isPaid` 判定（`:154`）：`Boolean(dueDate && creditPaymentPaidUntil && creditPaymentPaidUntil >= dueDate)`。
`options.creditPaymentPaidUntil` 是**單一**字串。合併視圖要讓「整組都繳了才算已繳款」，
故傳入的合併 watermark 需為：組內每張卡都有 watermark 時取**最小值**，任一張為 null 則
傳 null（見 Step 3）。

### `src/routes/ReconcileRoute.tsx`

- 取單一帳戶：`const account = (accounts.data ?? []).find((a) => a.id === accountId);`（`:49`）。
- rows filter（`:50-55`）：`row.accountId === accountId && row.deletedAt === null && row.entryType !== "transfer"`。
- 期別（`:58-68`）：`buildStatementPeriods(rows, { statementDay: account.statementDay,
  paymentDueDay: account.paymentDueDay, creditPaymentPaidUntil: account.creditPaymentPaidUntil, today })`。
- 統計卡（`:255-274`）：本期消費 / 本期已對帳筆數 / 卡片未繳總額（`owed = Math.max(0, -account.balance)`, `:207`）。
- 逐筆列（`:329-372`）：點列 toggle `setLedgerReviewed`（核對狀態存在**該筆 leg** 上），
  「延後入帳」與「編輯交易」按鈕。核對是 per-row，**天生支援跨卡**（每筆各自 toggle）。
- `markAll(periodKey, reviewed)`（`:98-108`）：對該期所有 row 逐筆 `setReviewed`——已跨
  row，合併後自動涵蓋多卡。
- `markPaid`（`:110-132`）/ `handlePay`（`:134-173`）：見計劃 251；目前對**單一**帳戶
  設 watermark。
- 進入點：`AccountsRoute.tsx:496` 每張卡一顆「對帳」鈕 →
  `navigate({ to: "/cash-flow/reconcile/$accountId", params: { accountId: a.id } })`。

### 樣式慣例

逐筆列的次要資訊在 `<div className="muted text-caption">…</div>`（`:339-342`），內含日期、
分類、延後 badge。卡片來源標示**加在這一行**（小 badge），照既有 `Badge variant="outline"
className="rounded-full text-micro"` 樣式（見 `:341` 延後 badge）。不要新拉 class。

## Commands you will need

| Purpose   | Command                              | Expected on success |
|-----------|--------------------------------------|---------------------|
| Typecheck / build | `npm run build`              | exit 0, no TS errors |
| Unit test | `npx vitest run creditCardStatements`| all pass            |
| Lint      | `npm run lint`                       | exit 0（warnings 允許） |
| Dev（手動驗收） | `npm run dev`                  | Vite 起，開對帳頁      |

## Scope

**In scope**：
- `src/routes/ReconcileRoute.tsx`（合併視圖主體）
- `src/domain/creditCardStatements.test.ts`（合併 rows 的期別測試——證明多卡 rows
  正確落入同一期別、且 accountId 保留）

**Out of scope**（不要動）：
- `src/domain/creditCardStatements.ts` — 不需改（見 Current state）。若你覺得需要改它
  才能合併，代表理解有偏差 → STOP。
- `src/domain/types.ts` / `src/data/repositories.ts` — 不加欄位、不做 schema migration。
- 合併繳款的金額拆分邏輯 — 明確延後（v1 轉帳打進單一選定卡）。
- `AccountsRoute.tsx` 的分組 UI — 使用者已能設 `creditLimitGroup`，不在本計劃改。
  （若要在對帳鈕旁顯示「組」入口是加分項，但**非必要**，且可能超範圍——預設不做。）

## Git workflow

- Branch: `feat/ai-grouped-reconcile-same-bank`
- Commit style：conventional commits，例
  `feat(reconcile): combined statement reconciliation for same-group cards (plan 253)`
- 不要 push / 開 PR，除非操作者指示。

## Steps

### Step 1: 計算「對帳分組」——組內帳戶集合

在 `ReconcileRoute` 內，取得目前帳戶後，算出要一起對帳的帳戶集合。規則：目前帳戶有非空
`creditLimitGroup`，就把組內所有 **credit 型、未刪除、相同 `creditLimitGroup`、相同
`currency`、相同 `statementDay`、相同 `paymentDueDay`** 的帳戶納入；否則只有自己。

```tsx
const groupAccounts = useMemo(() => {
  const all = accounts.data ?? [];
  if (!account) return [];
  const g = account.creditLimitGroup?.trim();
  if (!g || account.type !== "credit") return [account];
  const siblings = all.filter(
    (a) =>
      a.deletedAt === null &&
      a.type === "credit" &&
      (a.creditLimitGroup?.trim() ?? "") === g &&
      a.currency === account.currency &&
      a.statementDay === account.statementDay &&
      a.paymentDueDay === account.paymentDueDay,
  );
  return siblings.length >= 2 ? siblings : [account];
}, [accounts.data, account]);

const isGrouped = groupAccounts.length >= 2;
const groupAccountIds = useMemo(() => new Set(groupAccounts.map((a) => a.id)), [groupAccounts]);
const accountNameById = useMemo(
  () => new Map(groupAccounts.map((a) => [a.id, a.name])),
  [groupAccounts],
);
```

**Verify**: `npm run build` → exit 0（尚未使用這些變數的話 lint 可能警告 unused，Step 2
起會用到；若 build 因 unused 而**錯誤**，先繼續到 Step 2 再驗）。

### Step 2: rows 改為涵蓋整組帳戶

把 rows filter（`:50-55`）由單帳戶改成整組：

```tsx
const rows = useMemo(
  () => (ledger.data ?? [])
    .filter((row) => groupAccountIds.has(row.accountId) && row.deletedAt === null && row.entryType !== "transfer")
    .sort((a, b) => b.date.localeCompare(a.date)),
  [ledger.data, groupAccountIds],
);
```

**Verify**: `npm run build` → exit 0。單卡情境（無分組）行為不變（`groupAccountIds`
只含自己）。

### Step 3: 合併 watermark——整組都繳才算已繳款

`buildStatementPeriods` 的 `creditPaymentPaidUntil` 傳入合併值：組內每張卡都有 watermark
時取最小值，任一張缺就傳 null。

```tsx
const groupPaidUntil = useMemo(() => {
  const vals = groupAccounts.map((a) => a.creditPaymentPaidUntil);
  if (vals.some((v) => !v)) return null;           // 任一張未繳 → 整組未繳
  return vals.reduce((min, v) => (v! < min! ? v : min), vals[0]);
}, [groupAccounts]);
```

期別計算（`:58-68`）改用 `groupPaidUntil` 與目前帳戶的 statement/due day（組內同值，
Step 1 已保證）：

```tsx
const periods = useMemo(
  () => account
    ? buildStatementPeriods(rows, {
        statementDay: account.statementDay,
        paymentDueDay: account.paymentDueDay,
        creditPaymentPaidUntil: groupPaidUntil,
        today,
      })
    : [],
  [rows, account, groupPaidUntil, today],
);
```

**Verify**: `npm run build` → exit 0。

### Step 4: 逐筆列標示卡片來源（僅合併視圖）

在逐筆列的次要資訊行（`:339-342`）加一個小 badge 顯示該筆屬哪張卡——**只在 `isGrouped`
時顯示**（單卡時多餘）：

```tsx
{isGrouped ? (
  <Badge variant="outline" className="rounded-full text-micro ml-1.5" style={{ padding: "1px 6px" }}>
    {accountNameById.get(row.accountId) ?? "—"}
  </Badge>
) : null}
```

放在延後 badge（`:341`）附近、同一 `.muted.text-caption` 行內。

**Verify**: `npm run build` → exit 0；`npm run lint` → exit 0。

### Step 5: 標題與統計卡改用「組」的口徑

- **標題/麵包屑**：`isGrouped` 時顯示組名而非單卡名。麵包屑（`:227`）與 h1（`:233`）
  的 `{account.name}` 改為 `{isGrouped ? (account.creditLimitGroup?.trim() || account.name) : account.name}`。
  可抽一個 `const title = isGrouped ? (account.creditLimitGroup?.trim() || account.name) : account.name;`
  重用。
- **卡片未繳總額**（`owed`, `:207`）：合併時 = 組內各卡 owed 相加：
  ```tsx
  const owed = groupAccounts.reduce((s, a) => s + Math.max(0, -a.balance), 0);
  ```
  （單卡時 `groupAccounts = [account]`，結果與原本相同。）
- 「本期消費 / 本期已對帳」統計卡（`:255-274`）**已由 `currentPeriod` 推導**，
  `currentPeriod` 來自合併後的 `periods`，故自動涵蓋多卡——不需另改。

**Verify**: `npm run build` → exit 0。

### Step 6: 繳款對整組生效（markPaid 迴圈；付款帳戶預設本卡）

> 若計劃 251 已合併：`markPaid` 已改為 `markPaid(dueDate: string)`。在其基礎上，把「設
> watermark」由單帳戶改為**對 `groupAccounts` 每張卡各呼叫一次 `updateAccount`**，`dueDate`
> 相同。若 251 尚未執行，先套 251 再做本步（見 Depends on）。

`markPaid(dueDate)` 內把單一 `updateAccount.mutateAsync({ id: account.id, … })` 換成：

```tsx
for (const a of groupAccounts) {
  await updateAccount.mutateAsync({
    id: a.id,
    name: a.name, currency: a.currency, openingBalance: a.openingBalance,
    type: a.type, creditLimit: a.creditLimit, creditLimitGroup: a.creditLimitGroup,
    statementDay: a.statementDay, paymentDueDay: a.paymentDueDay,
    creditPaymentPaidUntil: dueDate,
    isSharedToHousehold: a.isSharedToHousehold,
    loanStartDate: a.loanStartDate, annualInterestRate: a.annualInterestRate, loanTerm: a.loanTerm,
    iconName: a.iconName, color: a.color,
  });
}
```

繳款轉帳（`handlePay` 內 `createTransfer` 的 `destinationAccountId: account.id`）**維持打進
目前帳戶**（v1 不拆分）。在 `PayCardModal` 的說明文案補一行（合併時）提示：「此組共
{groupAccounts.length} 張卡，繳款標記將套用整組；轉帳金額入本卡。」——文案性質，放在
modal 現有說明 `:438-440` 區塊，用 `isGrouped` 條件顯示。

**Verify**: `npm run build` → exit 0；`npm run lint` → exit 0。

### Step 7: 合併 rows 的 domain 測試

在 `creditCardStatements.test.ts` 新增：證明來自不同帳戶的 rows 落入同一帳單週期、且輸出
保留 `accountId`。用一個帶 `accountId` 的 row 工廠：

```tsx
it("buckets rows from multiple accounts into shared cycles, preserving accountId (plan 253)", () => {
  type MultiRow = StatementRow & { accountId: string };
  const rows: MultiRow[] = [
    { date: "2026-07-10T10:00", amount: -100, isReviewed: false, accountId: "unicard" },
    { date: "2026-07-12T10:00", amount: -200, isReviewed: false, accountId: "ubear" },
  ];
  const periods = buildStatementPeriods(rows, {
    statementDay: 15, paymentDueDay: 3, creditPaymentPaidUntil: null, today: "2026-07-24",
  });
  const cycle = periods.find((p) => p.end === "2026-07-15")!;
  expect(cycle.rows).toHaveLength(2);
  expect(cycle.spend).toBe(300);
  expect(new Set(cycle.rows.map((r) => r.accountId))).toEqual(new Set(["unicard", "ubear"]));
});
```

**Verify**: `npx vitest run creditCardStatements` → all pass，含新測試。

## Test plan

- **新測試**（`creditCardStatements.test.ts`）：Step 7——多帳戶 rows 合併落入同期別、
  accountId 保留、spend 加總。這是本計劃唯一可純函式驗證的核心（合併是「多餵 rows」，
  domain 行為以此鎖定）。
- **結構範本**：照同檔 `it("splits transactions into billing cycles by statement day", …)`（`:13-42`）。
- ReconcileRoute 無元件測試（既有慣例），UI 以下方操作者驗收為準。

## Done criteria

全部必須成立：

- [ ] `npm run build` exit 0
- [ ] `npx vitest run creditCardStatements` 全過，含 1 筆新測試
- [ ] `npm run lint` exit 0
- [ ] `grep -n "groupAccountIds.has" src/routes/ReconcileRoute.tsx` → 有匹配（rows 已跨組）
- [ ] `grep -n "for (const a of groupAccounts)" src/routes/ReconcileRoute.tsx` → 有匹配
      （markPaid 對整組生效）
- [ ] 單卡情境不回歸：`groupAccounts` 在無分組時等於 `[account]`（審視 Step 1 邏輯）
- [ ] `git status` 只動到 in-scope 檔案
- [ ] `plans/README.md` 狀態列已更新

## STOP conditions

停止並回報（不要臨場發揮）：

- Drift check 顯示 `ReconcileRoute.tsx` 已被計劃 251 以外的改動大幅改寫，excerpt 對不上。
- 你發現需要改 `creditCardStatements.ts` 才能合併——代表方向錯了（domain 已保留 T），回報。
- 組內帳戶的 `statementDay` / `paymentDueDay` 不一致：本計劃刻意只合併「同結帳日/繳款日」
  的卡（Step 1 filter）。若使用者的兩張玉山卡結帳日不同，它們**不會**被合併，會退回單卡
  視圖——這是安全的預設。**不要**擅自放寬成「不同結帳日也硬合」，那會產生錯誤的帳單週期。
  若操作者要支援「同銀行、不同結帳日仍合併」，那是另一個設計，回報後再談。
- 合併繳款要求「一筆金額拆到多卡餘額」——超出 v1 範圍，回報，不要臨場實作拆分。
- 任一 verify 指令修兩次仍失敗。

## Maintenance notes

- **操作者驗收（需 `npm run dev`）**：把玉山 UniCard 與 UBear 設成相同 `creditLimitGroup`
  （帳戶編輯 → 信用額度分組欄位）、相同結帳日/繳款日/幣別 → 開任一張的對帳頁 → 應看到
  兩張卡交易合在同一帳單週期、每筆有卡片來源 badge、標題顯示組名、未繳總額為兩卡相加、
  「全部對帳」跨兩卡、繳款後兩卡都標記已繳款。未設同組或結帳日不同 → 維持單卡視圖。
- **分組鍵的選擇**：本計劃重用 `creditLimitGroup`（唯一現成同組訊號）。若日後要把「合併
  對帳」與「共用信用額度」拆成兩個概念，需新增獨立欄位（schema migration）；屆時把 Step 1
  的 filter 換成新欄位即可，其餘結構不變。
- **延後項（明確不做）**：合併繳款的金額拆分（一筆繳款按各卡 owed 比例分攤、或逐卡各建
  轉帳）。v1 轉帳打進單一選定卡、watermark 對整組生效已滿足「一起對帳＋一起標記已繳」的
  訴求；拆分是獨立的財務語意決策。
- Reviewer 該盯：(1) 單卡無回歸（`groupAccounts=[account]` 時所有口徑等同舊行為）；
  (2) `groupPaidUntil` 的「任一未繳 → 整組未繳」是否正確；(3) markPaid 迴圈是否對每張卡
  都寫、失敗處理（迴圈中途失敗會部分寫入——可接受，watermark 冪等，重繳即補齊，但值得在
  PR 註記）。
- 與計劃 251／252 皆動 `ReconcileRoute.tsx`：**執行順序建議 251 → 252 → 253**。253 的
  Step 6 直接疊在 251 的 `markPaid(dueDate)` 簽名上；252 只改 `handlePay` 的日期那行，與本
  計劃不衝突。
