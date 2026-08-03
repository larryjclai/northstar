# Plan 286: 公司帳交易可填營業稅額（補上進項稅額）＋ 401 報表算出應納稅額

> **Executor instructions**: 在 git worktree 的分支 `feat/ai-company-vat-field` 上工作。
> **第一件事**：`pwd` 確認在 worktree；接著 `git checkout -b feat/ai-company-vat-field main`
> 然後 `git log --oneline -1`，第一行必須是 `d161afd3 Merge pull request #30 …`。
> 看不到就 STOP 回報（worktree 的預設基準 commit 可能比 `main` 舊）。
> 逐步執行，每步跑完 verify 才往下走。遇到 STOP condition 就停下來回報，**不要自行發揮**。
> **不要**動 `plans/` 其他檔案（advisor 維護；只准更新 README 你自己那一列）。
>
> **Drift check**（進 Step 1 之前跑）：
> ```bash
> git diff --stat d161afd3..HEAD -- src/data/migrations.ts src/data/repositories.ts src/domain/types.ts src/domain/invoiceReporting.ts src/domain/salesTax.ts src/routes/CashFlowRoute.tsx
> ```
> 空輸出才往下走；有輸出就把下面每一段 excerpt 與實際程式碼逐字比對，對不上即 STOP。

## Status

- **Priority**: P2 · **Effort**: M · **Risk**: MED（動到記帳寫入路徑 + 財務報表；但 schema 變更是單一 nullable 欄位，additive-only）
- **Depends on**: 無
- **Category**: feature / finance
- **Planned at**: commit `d161afd3`, 2026-08-03
- **Requested by**: operator, 2026-08-03

## What and why

Operator 的原話：

> 公司帳本是不是要有欄位可以填稅額，例如公司帳有開發票的話會有 5%，
> 但我現在沒有地方可以填收入或支出哪些是稅額。

現況盤點（**已逐檔查證，不要重新推測**）：

| 能力 | 現況 |
|---|---|
| 銷項稅額（開發票的收入） | ✅ plan 190/191 已做：`invoices` 表有 `tax_exclusive_amount`/`tax_amount`，`buildInvoiceDrafts` 用 `computeSalesTax` 拆 | 
| 進項稅額（支出裡的 5%） | ❌ **docs/ledger-books-plan.md:420 明文 deferred**：「進項稅額 (expenses' input VAT)」— 本計畫就是解除這個 deferral |
| 非開發票流程的收入稅額 | ❌ 一般收入列沒有任何稅額欄位 |
| `ledger_transactions` schema | ❌ 完全沒有稅額欄位（`invoices` 才有） |
| 401 報表 | ⚠️ 只有銷項：`bimonthly401Summary` 只讀 `invoices`，算不出 應納稅額 = 銷項 − 進項 |

所以缺口是：**交易列本身**（尤其支出）要能記「這筆裡有多少是營業稅」，
且 401 報表要能把 進項稅額 扣掉，得出 應納(退)稅額。

## 設計決定（已定案，不要重開）

- **D1 — 單一 nullable 欄位**：`ledger_transactions.tax_amount real`（null = 未填）。
  存**正數絕對值**、幣別同該列 `currency`（`amount` 是帶號的：支出為負；`tax_amount` 比照
  `feeAmount` 慣例存正數）。未稅額 = `|amount| − taxAmount`，**derive-on-read，不另存欄位**
  （`invoices` 存兩個欄位是因為發票要顯示；ledger 端存一個就夠，少一個 drift 源）。
  TypeScript 端宣告為 **optional**（`taxAmount?: number | null`）—— 這是 repo 對 additive
  欄位的既定慣例（`legKind?`／`installmentGroupId?`／`refundOfLedgerId?`／
  `recurringOccurrenceKey?`／`postDate?` 全部如此，見 `types.ts:201-228`），必填會炸掉
  `transferBuilder.ts` 與 16 個測試 fixture（executor 第一輪實測）。讀取端一律 `?? null`／`?? 0`。
- **D2 — 開發票流程不 dual-write**：`buildInvoiceDrafts` **不動**。報表端用
  `invoice.linkedLedgerTransactionId` 排除已連結發票的收入列，銷項 = invoices ∪（未連結發票
  且有填稅額的收入列），不會重複計算，也不需要 backfill 舊資料。
- **D3 — UI gating 只管「能不能改」，不管「要不要送」**：欄位只在公司帳顯示，但 submit payload
  **永遠帶上** `ledgerForm.taxAmount` —— 否則從總帳檢視編輯一筆公司帳交易（`isActiveCompanyBook`
  為 false、欄位隱藏）會把已填的稅額默默洗掉。這是本計畫最重要的資料流陷阱。
- **D4 — 報表計算規則**（domain 純函式）：
  - 排除 `deletedAt !== null`、`entryType === "transfer"`、代墊列（`counterAccountId != null`，
    pass-through 淨零，不是公司自己的損益）。
  - 進項稅額 = 支出列（`entryType === "expense"`）的 `taxAmount` 加總。
  - 銷項稅額 = 發票（`invoice.taxAmount`，依 `issueDate` 分期）＋ **未連結發票**的收入列 `taxAmount`（依 `date` 分期）。
  - 期別依既有 `periodOf()`（雙月 401 期），日期基準一律用 `date`（發票/交易日），不用 `postDate`。
  - 應納(退)稅額 = 銷項 − 進項（可為負 = 留抵/退稅）。

## Current state（已驗證 excerpts）

### 1. Additive migration 機制 — `src/data/migrations.ts:397-400`

新欄位**只能**加進 `ADDITIVE_COLUMNS`（宣告式清單，兼作 startup DDL gate 的 fingerprint —
註解明令**不准**直接呼叫 `ensureSqliteColumn`）：

```ts
export const ADDITIVE_COLUMNS: ReadonlyArray<
  readonly [table: string, column: string, definition: string]
> = [
  ["ledger_transactions", "merchant", "text not null default ''"],
```

清單結尾在 `:477`（`["sync_outbox", "deleted_at", "text"],` 之後）。sync outbox trigger
（`repositories.ts:6909-6928`）只記 id/revision，**不 enumerate 欄位** — 新欄位不用動 trigger。

### 2. Ledger 欄位的 4 個 enumerate 點 — `src/data/repositories.ts`

以 `refund_of_ledger_id` 為 exemplar，一個 ledger 欄位要接的位置就這四個（＋update SQL）：

- `:108` `LedgerDraft` interface（`refundOfLedgerId?: string | null;`；interface 本體在 `:85-111`，
  含 `feeAmount?: number;` — 注意 `feeAmount` 是表單專用、**沒有**對應欄位，`taxAmount` 不同，要進 DB）
- `:4098` SQLite select 的欄位別名清單（`refund_of_ledger_id as refundOfLedgerId,`）—
  sync push 與快照匯出都吃這個 select 的結果，別名加了就自動流進 sync payload 與備份
- `:6589-6621` `insertLedgerRow` 的 insert 欄位清單 + values（sync pull 與快照匯入也走它）
- `:8005` `createLedgerRow`（draft → row，`refundOfLedgerId: input.refundOfLedgerId ?? null,`）

Update SQL `:4169`（**注意 `$16` 是 where 的 id，positional 參數不連號** — 新參數要接在
現有最大號 `$18` 之後）：

```ts
`update ledger_transactions set revision = revision + 1, updated_at = $1, account_id = $2, date = $3, name = $4, amount = $5, currency = $6, original_amount = $7, original_currency = $8, category = $9, subcategory = $10, merchant = $11, entry_type = $12, settlement_status = $13, note = $14, group_id = $15, counter_account_id = $17, post_date = $18 where id = $16`,
```

Browser（IDB）repo 的 update 是 `{ ...row, ...input }` spread（`:1671-1676`），draft 有欄位就自動帶。

### 3. Domain types — `src/domain/types.ts:160-192`

`LedgerTransaction` 目前欄位到 `groupId: string | null;` 為止附近；比照
`originalAmount: number | null;` 加 `taxAmount: number | null;`。

### 4. 稅額數學已存在 — `src/domain/salesTax.ts`（**不要動這個檔**）

```ts
export function computeSalesTax(taxInclusiveTotal: number, rate = 0.05): SalesTaxSplit {
  const tax = Math.round((taxInclusiveTotal * rate) / (1 + rate));
```

內含稅公式（105,000 → 稅 5,000）。UI 的自動帶入直接 import 用它。

### 5. 報表 domain — `src/domain/invoiceReporting.ts`

- `:62` `function periodOf(iso)` — 雙月期別（**private**，本計畫的新函式寫在同一檔就能直接用，不用 export）
- `:169` `bimonthly401Summary(invoices, year): Bimonthly401Row[]`（`{period, taxableSales, salesTax}`）
- `:152` `outstandingSalesTax(invoices, todayIso)` — 本期應繳（invoices-only）

### 6. UI（`src/routes/CashFlowRoute.tsx`，5550 行）

- `:205-218` `makeEmptyLedger()` — 表單預設值（`feeAmount: 0,` 在 `:216`）
- `:388-394` `isActiveCompanyBook`（`activeBookRecord?.kind === "company"`）
- 表單 hydration 有 **4 個點**要鏡射 `feeAmount:` 的寫法：`:949`、`:1001`、`:1050`、`:1068`
  （編輯、複製等路徑；grep `feeAmount:` 找齊）
- `:1246-1266` submit payload（`feeAmount:` 條件式在 `:1264-1265`）
- `:3845-3847` `expenseFeeField = useNumericField(...)` — 數字欄位 hook 的 exemplar
- `:4850-4868` 「更多選項」區塊裡手續費欄位的 JSX（`DrawerField` + `ns-input` + caption），
  gating 條件 `(type === "expense" || type === "income") && !activeInstallment && !splitMode`
- `:334-337` 開發票 toggle（`invoiceMode` 概念）— 稅額欄位在 invoice 模式要隱藏（發票流程自己拆稅）
- `:1501-1510` `scopedRows` 由 `bookLedgerRows`（**book-scoped、未套日期篩選**）過濾而來 —
  報表要用 `bookLedgerRows`，**不要用** `scopedRows`（會被 UI 日期範圍污染）
- `:1835-1837` `invoice401Summary` memo；`:2643-2653` 本期應繳營業稅卡片；`:2677-2719` 401 雙月彙總卡片
  （三張卡都 gated `isActiveCompanyBook && bookInvoices.length > 0`）

### 7. Repo 慣例

- UI 字串在 `CashFlowRoute.tsx` 內是 inline 中文（同檔 `:4855` `外加手續費（選填）`）— 照做，
  **不要**動 `copy.csv`（該 route 未遷入 catalog）。
- 樣式：優先 COSS 元件與 `ns-*` class；inline `style={{}}` 僅限動態值（AGENTS.md 樣式優先序）。
- 財務語彙照 `docs/ledger-books-plan.md` §3：進項稅額／銷項稅額／未稅額／應納稅額。

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| 全部測試 | `npm test` | 全過（baseline ~1564+；新測試另加） |
| 單檔測試 | `npx vitest run src/domain/invoiceReporting.test.ts` | 全過 |
| Lint | `npm run lint` | 0 errors（既有 ~800 warnings 不算失敗） |
| Typecheck+build | `npm run build` | exit 0 |

## Scope

**In scope**（只准改這些檔）：
- `src/data/migrations.ts`（ADDITIVE_COLUMNS 加一列）
- `src/data/repositories.ts`（LedgerDraft、select/insert/update/createLedgerRow 五個點）
- `src/domain/types.ts`（LedgerTransaction 加 `taxAmount`）
- `src/domain/invoiceReporting.ts` + `src/domain/invoiceReporting.test.ts`（新函式＋測試）
- `src/routes/CashFlowRoute.tsx`（表單欄位＋報表卡片）
- `plans/README.md`（只更新本計畫狀態列）

**Out of scope**（看起來相關但**不准碰**）：
- `src/domain/salesTax.ts`、`src/domain/invoiceEntry.ts` — 數學與開發票流程不變（D2 不 dual-write）
- `recurring_transactions`（週期規則不帶稅額，v1 手動）
- CSV 匯入/匯出、QuickAdd/NLP、demo 資料 — 都不加稅額
- `copy.csv` / i18n catalog
- `worker/`、`src-tauri/`、sync server — 欄位走既有 payload 自動同步，伺服器端是 opaque blob
- 任何 migration 的 drop/rewrite —— **additive-only 是 shipped promise，違反即 STOP**
- 歷史資料 backfill（D2 已讓報表不需要它）

## Git workflow

- Branch：`feat/ai-company-vat-field`（基於 `main` @ `d161afd3`）
- Commit style 照 `git log`：`feat(ledger): …`／`feat(reports): …`，逐步 commit
- **不要** push、不要開 PR、不要 merge — 完成後回報，operator 決定

## Steps

### Step 1 — Schema + types（additive column）

1. `src/data/migrations.ts` `ADDITIVE_COLUMNS` 結尾（`["sync_outbox", "deleted_at", "text"],` 之後）加：
   ```ts
   // 營業稅額 (plan 286): 公司帳交易列內含的營業稅，正數、幣別同 currency。
   // null = 未填。未稅額 derive-on-read（|amount| − tax_amount），不另存欄位。
   ["ledger_transactions", "tax_amount", "real"],
   ```
2. `src/domain/types.ts` `LedgerTransaction`（optional 欄位群 `:201-228` 附近）加：
   ```ts
   /** 營業稅額 (plan 286) — 內含於 |amount| 的稅額，正數。Optional（比照
    *  recurringOccurrenceKey 等 additive 欄位慣例）；undefined/null = 未填。 */
   taxAmount?: number | null;
   ```
3. `src/data/repositories.ts` `LedgerDraft`（`:85-111`）加 `taxAmount?: number | null;`。

**Verify**: `npm run build` → exit 0（type errors 會指出所有還沒接的建構點，這一步結束時
`createLedgerRow` 可能報缺欄位 — 那就是 Step 2 的工作清單；若 build 因此紅，先完成 Step 2 再一起驗）。
若 `repositories.migration.test.ts` 之類的測試斷言 ADDITIVE_COLUMNS 清單/fingerprint 而失敗，
**更新該測試的期望值是預期行為**，不是 STOP。

### Step 2 — Persistence 五點接線（`src/data/repositories.ts`）

1. `createLedgerRow`（`:8005` 附近）加 `taxAmount: input.taxAmount ?? null,`。
2. select 別名清單（`:4098` 附近）加 `tax_amount as taxAmount,`。
3. `insertLedgerRow` insert（`:6589`）：欄位清單加 `tax_amount`，values 對應處加
   `row.taxAmount ?? null,`（**位置要對齊**，數一遍 `?` 佔位與欄位數一致）。
4. update SQL（`:4169`）：set 清單加 `tax_amount = $19`，參數陣列**尾端**（`$18` post_date 之後）
   push `input.taxAmount ?? null`。⚠️ `$16` 是 where 的 id — 只准**新增 $19**，不准重排既有編號。
5. `createInvestmentLedgerRow`（`:8025` 附近）若 TypeScript 要求，补 `taxAmount: null`。

**Verify**: `npm run build` → exit 0；`npx vitest run src/data` → 全過。

### Step 3 — 報表 domain 函式（`src/domain/invoiceReporting.ts`）

同檔新增（直接用 private `periodOf`）：

```ts
/** 報表端需要的最小 ledger 列形狀 (plan 286)。taxAmount 為 optional，
 *  讓 `LedgerTransaction` 可直接以結構相容傳入。 */
export interface VatLedgerRowLike {
  id: string;
  date: string;
  entryType: "income" | "expense" | "transfer";
  amount: number;
  taxAmount?: number | null;
  counterAccountId: string | null;
  deletedAt: string | null;
}

export interface BimonthlyVatRow {
  period: string;
  taxableSales: number; // 未稅銷售額
  outputTax: number;    // 銷項稅額
  inputTax: number;     // 進項稅額
  netTax: number;       // 應納(退)稅額 = output − input（負值 = 留抵/退稅）
}

export function bimonthlyVatSummary(
  invoices: Invoice[],
  ledgerRows: VatLedgerRowLike[],
  year: number,
): BimonthlyVatRow[]

export function currentPeriodVat(
  invoices: Invoice[],
  ledgerRows: VatLedgerRowLike[],
  todayIso: string,
): { outputTax: number; inputTax: number; netTax: number }
```

計算規則照「設計決定 D4」逐條實作。發票的期別/未稅額沿用 `bimonthly401Summary` 的既有邏輯
（deleted 發票排除方式照抄該函式）；ledger 列先過濾
`deletedAt === null && entryType !== "transfer" && counterAccountId === null && taxAmount != null && taxAmount > 0`，
再用 `new Set(invoices.map((i) => i.linkedLedgerTransactionId))` 排除已連結發票的收入列。
收入列的 `taxableSales` 貢獻 = `Math.abs(amount) − taxAmount`。
（taxAmount 是 optional — 過濾條件寫成 `(row.taxAmount ?? 0) > 0`，之後即可安全視為 number。）

**Verify**: `npx vitest run src/domain/invoiceReporting.test.ts` → 全過（新測試見 Test plan）。

### Step 4 — 記帳抽屜的稅額欄位（`src/routes/CashFlowRoute.tsx`）

1. `makeEmptyLedger()`（`:205-218`）加 `taxAmount: null,`（型別走 LedgerDraft）。
2. Hydration：grep `feeAmount:` 的 4 個點（`:949`、`:1001`、`:1050`、`:1068`），每處鏡射加
   `taxAmount:`。編輯點用 `row.taxAmount ?? null`；「複製新增」點（若語意是開新表單）用 `null`；
   逐點看上下文對齊 `feeAmount` 的處理。
3. 欄位 UI：在「更多選項」區塊、手續費欄位（`:4850-4868`）**之後**加一個 `DrawerField`：
   - 顯示條件：手續費的條件 **再 AND** `isActiveCompanyBook && !invoiceMode`
     （invoiceMode 的實際變數名在 `:334-337` 附近確認；ar/ap 面板若獨立於此區塊，v1 先只做
     expense/income —— 這與 operator 的「收入或支出」原話一致，ar/ap 留 maintenance note）。
   - 內容：checkbox/toggle「內含營業稅」＋數字輸入（比照 `expenseFeeField` 用 `useNumericField`）。
     勾起時預設值 = `computeSalesTax(Math.abs(表單目前金額)).tax`（import 自 `../domain/salesTax`），
     使用者可改（發票尾差）；取消勾選 → `taxAmount: null`。
   - caption：`統一發票 5% 內含稅，稅額可手動修正。未稅額 = 總額 − 稅額。`
   - label：`內含營業稅（選填） · ${ledgerForm.currency}`
4. Submit payload（`:1246-1266`）：加
   ```ts
   taxAmount:
     entryType === "expense" || entryType === "income" ? (ledgerForm.taxAmount ?? null) : null,
   ```
   ⚠️ **D3**：不要用 `isActiveCompanyBook` gate 這一行 — 欄位隱藏時 form state 仍持有既有值，
   必須原樣送回，否則總帳檢視下編輯會清掉稅額。
5. 驗證：submit 前若 `taxAmount != null && taxAmount > Math.abs(signedAmount)` →
   `throw new Error("稅額不可大於總額。")`（放在 `:1270` 既有 throw 群旁）。

**Verify**: `npm run build` → exit 0；`npm test` → 全過。

### Step 5 — 報表卡片（`src/routes/CashFlowRoute.tsx`）

1. Memo 區（`:1835` 附近）：
   ```ts
   const vatSummary = useMemo(
     () => bimonthlyVatSummary(bookInvoices, bookLedgerRows, currentFilingYear),
     [bookInvoices, bookLedgerRows, currentFilingYear],
   );
   const periodVat = useMemo(
     () => currentPeriodVat(bookInvoices, bookLedgerRows, todayIso), // todayIso 的既有來源照 :1817 附近的用法
     [bookInvoices, bookLedgerRows, todayIso],
   );
   const bookHasVat = useMemo(
     () => bookLedgerRows.some((r) => (r.taxAmount ?? 0) > 0 && r.deletedAt === null),
     [bookLedgerRows],
   );
   ```
   （`bimonthly401Summary`/`outstandingSalesTax` 的舊 memo 若因此不再被引用，一併移除。）
2. 401 卡片（`:2677-2719`）：表格欄位改為
   `期間｜未稅銷售額｜銷項稅額｜進項稅額｜應納(退)稅額`，資料源換 `vatSummary`，
   tfoot 合計同步補兩欄。caption 改：`供 401 申報參考；進項稅額以已填稅額的支出為準。`
3. 本期應繳營業稅卡片（`:2643-2653`）：主數字換 `periodVat.netTax`（負值顯示為留抵，
   色彩沿用現有 `var(--ns-neg)` 於應納、`var(--ns-pos)` 於留抵），下方加兩行小字
   `銷項稅額 X · 進項稅額 Y`（`muted text-caption`，數字 `num` class）。
4. 三張發票卡片的顯示條件：本期應繳與 401 兩張改成
   `isActiveCompanyBook && (bookInvoices.length > 0 || bookHasVat)`；帳齡卡維持只看發票。

**Verify**: `npm run build` → exit 0；`npm test` → 全過；`npm run lint` → 0 errors。

### Step 6 — 收尾

全套閘門重跑（Commands 表全部）；`git status` 確認只動了 in-scope 檔案；
更新 `plans/README.md` 本計畫那一列的 Status。

## Test plan

新測試寫在 `src/domain/invoiceReporting.test.ts`（結構仿同檔既有 `bimonthly401Summary` 的 describe）：

1. **進項彙總**：兩筆支出（1月、3月，各 taxAmount 500）→ 期別 `1-2月`/`3-4月` 各 inputTax 500。
2. **銷項去重（本計畫的核心不變量）**：一張發票（taxAmount 5000，linkedLedgerTransactionId = "L1"）
   ＋ 收入列 L1（taxAmount 5000）→ outputTax = **5000**（不是 10000）。
3. **未連結收入計入銷項**：收入列（無發票連結，amount 10500、taxAmount 500）→
   outputTax 500、taxableSales 10000。
4. **排除規則**：transfer 列、`counterAccountId` 非 null 的代墊列、`deletedAt` 非 null 列、
   `taxAmount: null` 列 → 全部不計。
5. **應納為負（留抵）**：進項 > 銷項 → `netTax < 0`。
6. **currentPeriodVat 期別邊界**：todayIso 在 3月 → 只計 3-4月 的發票與交易。

**Verify**: `npx vitest run src/domain/invoiceReporting.test.ts` → 全過含 ≥6 個新測試；
`npm test` → 全過。

## Done criteria（全部成立才算完成）

- [ ] `npm run build` exit 0
- [ ] `npm test` 全過，`invoiceReporting.test.ts` 含 ≥6 個新測試
- [ ] `npm run lint` 0 errors
- [ ] `grep -n 'tax_amount' src/data/migrations.ts` 恰一列（ADDITIVE_COLUMNS）
- [ ] `git diff main -- src/data/migrations.ts` **只有新增行**（無 drop/rewrite）
- [ ] `grep -c 'taxAmount' src/data/repositories.ts` ≥ 5（draft、select、insert、update、createLedgerRow）
- [ ] `git status` 無 in-scope 清單以外的改動
- [ ] `plans/README.md` 狀態列已更新

## STOP conditions

- Drift check 不為空且 excerpt 對不上（尤其 `:4169` update SQL 的 positional 參數樣貌）。
- 發現 ledger 有第二條 insert/select 路徑 enumerate 欄位而本計畫沒列到
  （`grep -n "insert into ledger_transactions" src/data/repositories.ts` 出現非 `:6589` 的命中）。
- 發現 `taxAmount` 已存在於 `LedgerTransaction`／ledger 相關程式（表示有人先做了，需要 reconcile）。
- 任何一步需要動 out-of-scope 檔案才能過閘門。
- 同一步的 verify 修了一次還是紅。

## Maintenance notes

- **ar/ap（應收/應付）面板的手動稅額欄位**：v1 只做 expense/income 抽屜（開發票流程已覆蓋
  最重要的 ar 情境）。若之後補上，submit 的 D3 原則（永遠帶值）已經讓資料層就緒。
- **本期應繳營業稅卡片語意變了**：從「銷項」變「銷項 − 進項」。Review 時要盯 Step 5.3
  的正負號與紅綠色軸（財務語意：應納為負擔 → `--ns-neg`）。
- **Model B（代收營業稅 pass-through leg）**是 docs/ledger-books-plan.md §3 的 v2 升級路徑；
  本計畫的單欄位設計不擋它（屆時 taxAmount 可轉為 leg 金額來源）。
- 週期規則、QuickAdd/NLP、CSV 匯入若日後要帶稅額，走同一個 `LedgerDraft.taxAmount` 即可。
- 匯率交易（`originalCurrency` 非 null）的稅額以**換算後** `currency` 計 — 台灣發票幾乎必為
  TWD，此簡化已足；若未來公司帳出現外幣發票，需再議原幣稅額欄位。
