# Plan 282: 「名稱」與「商家」比照「分類」——設定裡可搜尋、可改名，改名連動所有交易

> **Executor instructions**: 在 git worktree 的分支 `feat/ai-label-master-list` 上工作。
> **第一件事**：`pwd` 確認在 worktree；接著 `git checkout -b feat/ai-label-master-list main`
> 然後 `git log --oneline -3`，第一行必須是 `3f69a867 Merge branch 'fix/ai-dependabot-highs'`。
> 看不到就 STOP 回報（worktree 的預設基準 commit 可能比 `main` 舊 —— 280/281 派工時踩過這個坑）。
> 逐步執行，每步跑完 verify 才往下走。遇到 STOP condition 就停下來回報，**不要自行發揮**。
> **不要**動 `plans/`（advisor 維護）。
>
> **Drift check**（進 Step 1 之前跑）：
> ```bash
> git diff --stat 3f69a867..HEAD -- src/data/repositories.ts src/routes/settings/MerchantsSection.tsx src/routes/SettingsRoute.tsx src/components/MerchantAutocomplete.tsx src/components/QuickAdd.tsx src/routes/CashFlowRoute.tsx
> ```
> 空輸出才往下走；有輸出就把下面每一段 excerpt 與實際程式碼逐字比對，對不上即 STOP。

## Status

- **Priority**: P2 · **Effort**: M · **Risk**: MEDIUM（會批次改寫使用者的交易資料列；rename 是不可逆的資料操作）
- **Depends on**: 無
- **Category**: feature / data management
- **Planned at**: commit `3f69a867`, 2026-07-31
- **Requested by**: operator, 2026-07-31

## What and why

Operator 的原話：

> 我記帳的「名稱」和「商家」欄位功能想要跟「分類」欄位一樣可以在設定中去做調整。
> 例如原本的記帳有一個商家名稱叫「小半天」，在設定中有一個完整的商家列表可以讓我搜尋到這個商家，
> 然後我改名成「小半天咖啡」的話，所有跟「小半天」有連動紀錄的記帳明細都會一起變成「小半天咖啡」。
> 名稱的部分以此類推，然後這樣名稱的話也就可以跟商家一樣有自動建議和 autocomplete。

現況盤點（**已逐檔查證，不要重新推測**）：

| 能力 | 分類 | 商家 | 名稱 |
|---|---|---|---|
| 設定裡有專屬分頁 | ✅ `settings/CategoriesSection.tsx` | ✅ `settings/MerchantsSection.tsx` | ❌ 沒有 |
| 改名連動所有交易 | ✅ `renameCategory` | ⚠️ `renameMerchant` 有，但**漏了週期規則** | ❌ 沒有 |
| 表單有 autocomplete | ✅ `CategoryFilter` | ✅ `MerchantAutocomplete` | ❌ 純 `<input>` |
| 設定的清單涵蓋「實際用過的值」 | ✅（分類本來就只能從清單選） | ❌ **只列 `settings.merchants`** | ❌ 沒有清單 |

所以這份計畫其實是**三個具體缺口**，不是「從零做一個功能」：

### 缺口 1 —— 設定裡的商家清單看不到「打字打出來的商家」

`src/routes/settings/MerchantsSection.tsx:128-130`：

```tsx
  const filtered = form.merchants.filter((m: string) =>
    m.toLowerCase().includes(search.toLowerCase()),
  );
```

清單只來自 `settings.merchants`（預設值就 6 個，`src/data/repositories.ts:583`：
`["全家", "7-ELEVEN", "Uber", "Costco", "公司", "房東"]`）。但記帳表單的商家欄位
**允許自由輸入**，而且 `CashFlowRoute.tsx:470-473` 的下拉來源本來就是聯集：

```tsx
  const merchants = appSettings?.merchants ?? [];
  const merchantPool = useMemo(
    () => uniqueClean([...merchants, ...ledgerRows.map((row) => row.merchant)]),
    [merchants, ledgerRows],
  );
```

也就是說：使用者手打「小半天」記了 20 筆之後，**表單下拉找得到它，設定裡卻搜尋不到**。
Operator 說的「在設定中有一個完整的商家列表可以讓我搜尋到這個商家」，缺的就是這個聯集。

### 缺口 2 —— `renameMerchant` 漏掉週期規則

`src/data/repositories.ts:5175-5194`（SQLite 版）只更新 `ledger_transactions`：

```ts
  override async renameMerchant(oldName: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed) throw new Error("新商家名稱不能為空。");
    await this.db.execute(
      `update ledger_transactions set merchant = $1, updated_at = $2, revision = revision + 1 where merchant = $3 and deleted_at is null`,
      [trimmed, nowIso(), oldName],
    );
```

但 `recurring_transactions` 也有 `merchant` 欄（`src/data/migrations.ts:108`），而且它是
**未來交易的模板**——`src/data/repositories.ts:4971-4976` 產生每期交易時：

```ts
          name: recurring.merchant || recurring.category,
          ...
          merchant: recurring.merchant,
```

後果很具體：把「小半天」改成「小半天咖啡」之後，過去 20 筆都改了，**下個月週期規則跑出來的
那筆又叫回「小半天」**。這正好違反 operator 說的「所有跟『小半天』有連動紀錄的記帳明細都會一起變」。
（`recurring_transactions` 沒有 `name` 欄，它的 UI 標籤是「名稱 / 商家」，
`src/routes/RecurringRulesTab.tsx:566-573` —— 所以只有 merchant 要跟著改。）

### 缺口 3 —— 名稱完全沒有主檔

`LedgerTransaction.name`（`src/domain/types.ts:177`）是每筆交易的顯示名，
`ledger_transactions.name` 是 additive 欄位（`src/data/migrations.ts:401`）。
表單兩處都是**裸 input**，沒有任何建議：

`src/components/QuickAdd.tsx:592-599`
```tsx
                    <Field label="名稱">
                      <input
                        className="ns-input"
                        value={confirm.name}
                        onChange={(e) => setConfirm({ ...confirm, name: e.target.value })}
                        placeholder="交易名稱"
                      />
                    </Field>
```

`src/routes/CashFlowRoute.tsx:4681-4688`
```tsx
                  <DrawerField label="名稱">
                    <input
                      className="ns-input"
                      value={ledgerForm.name}
                      onChange={(e) => setLedgerForm({ ...ledgerForm, name: e.target.value })}
                      placeholder={type === "expense" ? "計程車" : "月薪"}
                    />
                  </DrawerField>
```

## 兩個設計決定（照做，不要自己改）

### 決定 A：名稱**不**新增 `AppSettings.names` 儲存欄位，清單由帳目歷史推導

商家有 `settings.merchants` 是歷史包袱（它同時餵自動分類的 seed）。名稱不需要：

- **「新增一個名稱」沒有意義**——名稱是記帳當下打的，不是預先建的字典。
- 多一個持久化陣列就多一份要同步、要合併、會跟歷史值不一致的狀態
  （`AppSettings` 走 `app_settings` key/value 並參與 E2E 同步）。
- 使用者要的兩件事（改名連動 + autocomplete）**都只需要歷史值**。

所以：**名稱分頁是「衍生清單 + 改名」，沒有新增、沒有刪除。** 商家分頁維持既有的新增/刪除
（因為 `settings.merchants` 還在），但**顯示的清單改成聯集**。

若你在實作中發現這個決定會讓某個既有功能壞掉 → **STOP 回報**，不要自行加 `AppSettings.names`。

#### 決定 A 的效能帳（operator 2026-07-31 問：衍生清單會不會很慢？）

**計算不會慢，會慢的是 DOM。** 三件已查證的事實：

1. **不多一次資料庫讀取。** `SettingsRoute.tsx:35` 已經在呼叫 `useFinanceData()`，而
   `src/data/hooks.ts:40-44` 是**無條件**建立 `ledger` query 的 —— 你解構不解構它，
   那筆查詢都已經在跑、已經在 React Query 快取裡。設定頁多讀 `ledger.data` 的
   邊際 I/O 成本是**零**。
2. **推導是單趟 O(n)。** `buildLedgerLabelStats` 對一個**已經在記憶體裡**的陣列跑一次
   Map 累加，再對「相異值」排序。以重度使用者估算（10 年 × 每月 100 筆 = 12,000 列）：
   12,000 次 Map get/set + 約 1,000–2,000 個相異值的排序。這在 JIT 過的引擎是**個位數毫秒**，
   而且包在 `useMemo([ledgerRows])` 裡 —— **只在帳目資料變動時重算，不是每次按鍵**。
   對照組：`CashFlowRoute` 對同一個陣列已經跑了十幾趟同量級的 memo（`allCategorySpend`、
   `merchantPool`、`buildMerchantCategoryMap`、`groupByMonth`…），這次是多加一趟。
3. **真正的成本在渲染列數。** 相異「名稱」的成長速度遠高於相異「商家」——
   商家會重複（全家、7-11），名稱是每筆自由輸入的短語。12,000 筆交易很可能有 1,500+ 個相異名稱，
   一次把 1,500 個 DOM 列（每列還含一個可編輯 input 的分支）掛上去，**那才是會卡的地方**。

所以 Step 6 有一條硬性要求：**名稱清單預設只渲染前 200 列**，其餘靠搜尋。
repo 已有這個模式的先例——`CashFlowRoute.tsx:1717 / 1733 / 2522` 的
`visibleCount` + 「顯示更早的交易」按鈕。照抄那個形狀，不要引入虛擬捲動函式庫
（repo 目前沒有任何 virtualization 相依，為此加一個不划算）。

商家分頁不需要這個上限（相異商家是數百量級），但**如果實測超過 200，就一併套用同樣的上限**。

### 決定 B：改名到一個「已存在的值」＝合併，允許且不擋

商家分頁現在會擋（`MerchantsSection.tsx:169-172` `toast.error("商家已存在")`）。
但**合併正是清資料的主要用途**（「小半天」+「小半天咖啡」→ 統一成後者）。所以：

- **名稱分頁**：允許合併，toast 顯示 `已更新 N 筆`。
- **商家分頁**：把「商家已存在」的硬擋改成允許合併（改名情境；**新增**時仍然擋重複）。

`renameMerchant` / `renameLedgerName` 的 SQL 本來就是「把所有等於 old 的改成 new」，
合併是天然行為，不需要額外邏輯——只要 UI 別擋。

## Files in scope

**新增**
- `src/domain/ledgerLabels.ts` + `src/domain/ledgerLabels.test.ts`
- `src/components/SuggestInput.tsx`
- `src/routes/settings/NamesSection.tsx`
- `src/data/repositories.rename.test.ts`

**修改**
- `src/domain/index.ts`（多一行 re-export）
- `src/data/repositories.ts`（interface + memory impl + sqlite impl）
- `src/routes/SettingsRoute.tsx`
- `src/routes/settings/MerchantsSection.tsx`
- `src/components/QuickAdd.tsx`
- `src/routes/CashFlowRoute.tsx`
- `src/components/ClientAutocomplete.tsx`（只改註解裡的元件名引用）
- `src/domain/types.ts`（只改註解裡的元件名引用）
- `src/locales/zh-TW/translation.json`、`src/locales/en/translation.json`、`src/locales/copy.csv`、`src/locales/_meta.json`

**刪除**
- `src/components/MerchantAutocomplete.tsx`（內容搬到 `SuggestInput.tsx`）

## Files explicitly OUT of scope — 看起來相關但不要碰

| 檔案 | 為什麼不碰 |
|---|---|
| `src/routes/MerchantsTab.tsx`、`src/routes/MerchantDetailRoute.tsx` | 那是「記帳 → 商家」的**分析**分頁（花費排行/圓餅），不是主檔管理。改名後它自然跟著變 |
| `src/domain/userLexicon.ts`、`src/domain/nlParser.ts`、`src/domain/quickAddCorrections.ts` | Quick Add 的 NLP 學習層。改名後 lexicon 下次 rebuild 自然反映；**不要**去改寫已存的 correction key |
| `src/data/migrations.ts` | 這份計畫**不需要任何 schema 變更**。若你覺得需要 → STOP 回報（additive-only 是對使用者的承諾） |
| `src/data/csv.ts`、`src/data/investmentImport.ts` | 匯入匯出不在範圍 |
| `src/components/GlobalSearch.tsx` | 全域搜尋的商家來源是既有 query，不需要動 |
| `src/routes/settings/CategoriesSection.tsx` | 分類是**參考範本**，只讀不改 |
| `src/routes/RecurringRulesTab.tsx` | 週期規則的 UI 不動；只有 repository 的 rename 要多更新它的資料列 |

## 專案慣例（照抄，不要自創）

1. **樣式優先序**（AGENTS.md）：(1) COSS 元件（`components/coss/*`）；(2) `ns-*` utility 與
   Tailwind；(3) inline `style={{}}` **僅限動態值**。`MerchantsSection.tsx` 現有的 inline style
   是既有債，**你新寫的 `NamesSection.tsx` 請盡量沿用 `MerchantsSection` 的視覺但把靜態樣式
   用既有 class 表達**；能整段照抄結構就照抄，不要重新設計版面。
2. **純邏輯抽到 `src/domain/*.ts` 並附 colocated `*.test.ts`**——這是全 repo 一致的慣例
   （`merchantCategory.ts` / `ledgerSuggestions.ts` 都是這個形狀）。
3. **Repository 方法一律「interface + memory + sqlite」三處都要寫**，並用
   `describeEachRepo` 同時跑兩種實作（見 `src/data/repositories.settings.test.ts`）。
4. **i18n**：`src/locales/<lng>/translation.json` 是 source of truth，`copy.csv` 是投影。
   新增 key 要**先改兩個 translation.json，再跑 `npm run copy:export`** 讓 CSV/_meta 同步。
   （AGENTS.md 說「不要手改 .tsx 裡的字串」指的是不要繞過 catalog；直接編 JSON 再 export 是正確流程。）
5. **繁中優先**，header 慣例是英文 eyebrow + 中文 h1（見 `MerchantsSection.tsx:191-209`）。

### 範本檔：`src/domain/merchantCategory.ts`（全文，照這個形狀寫新的 domain 模組）

```ts
import type { LedgerTransaction } from "./types";

const DELIM = " ";

/**
 * For each merchant, the (category, subcategory) pair it's most often tagged
 * with across expense history — used to auto-fill the category when a merchant
 * is selected. Income rows and merchant-less rows are ignored.
 */
export function buildMerchantCategoryMap(
  rows: LedgerTransaction[],
): Map<string, { category: string; subcategory: string }> {
  ...
}
```

---

## Step 1 — 新增 `src/domain/ledgerLabels.ts`（純函式 + 測試）

**做什麼**：一支從帳目歷史推導「名稱 / 商家」使用統計的純函式，供設定分頁與兩處 autocomplete 共用。

建立 `src/domain/ledgerLabels.ts`：

```ts
import type { LedgerTransaction } from "./types";

/** Which free-text label column of a ledger row is being catalogued. */
export type LedgerLabelField = "name" | "merchant";

export interface LedgerLabelStat {
  /** The label value exactly as stored on the rows (already trimmed). */
  value: string;
  /** How many active rows carry it. */
  count: number;
  /** Most recent `date` among those rows (ISO string, as stored). */
  lastUsed: string;
}

/**
 * Distinct non-empty values of one label column across active ledger history,
 * ranked by usage (count desc, then most-recent, then locale order).
 *
 * Powers three surfaces that must agree on "what labels exist":
 *   - 設定 → 名稱 / 商家 的主檔清單（含使用次數）
 *   - 記帳抽屜 + 快速記帳的 autocomplete
 *   - 改名前的「這會影響幾筆」預估
 *
 * Soft-deleted rows are excluded — a tombstoned row must not resurrect a label
 * the user already cleaned up. Values are compared *after* trim, so " 全家 "
 * and "全家" collapse into one entry (the trimmed form wins).
 */
export function buildLedgerLabelStats(
  rows: LedgerTransaction[],
  field: LedgerLabelField,
): LedgerLabelStat[] {
  const stats = new Map<string, { count: number; lastUsed: string }>();
  for (const row of rows) {
    if (row.deletedAt !== null) continue;
    const value = (row[field] ?? "").trim();
    if (!value) continue;
    const existing = stats.get(value);
    if (existing) {
      existing.count += 1;
      if (row.date > existing.lastUsed) existing.lastUsed = row.date;
    } else {
      stats.set(value, { count: 1, lastUsed: row.date });
    }
  }
  return [...stats.entries()]
    .map(([value, s]) => ({ value, count: s.count, lastUsed: s.lastUsed }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        (a.lastUsed < b.lastUsed ? 1 : a.lastUsed > b.lastUsed ? -1 : 0) ||
        a.value.localeCompare(b.value),
    );
}

/**
 * The merchant master list shown in 設定: every merchant the user has actually
 * used, unioned with the curated `settings.merchants` seeds (which may have zero
 * usage). Seed-only entries get `count: 0` and sort last.
 *
 * Mirrors `merchantPool` in CashFlowRoute — the settings list and the form's
 * dropdown must not disagree about which merchants exist.
 */
export function buildMerchantMasterList(
  rows: LedgerTransaction[],
  settingsMerchants: string[],
): LedgerLabelStat[] {
  const used = buildLedgerLabelStats(rows, "merchant");
  const seen = new Set(used.map((s) => s.value));
  const seedOnly = settingsMerchants
    .map((m) => m.trim())
    .filter((m) => m && !seen.has(m))
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, count: 0, lastUsed: "" }));
  return [...used, ...seedOnly];
}
```

在 `src/domain/index.ts` 加一行 re-export，**放在 `export * from "./merchantCategory";`
（現在的第 25 行）正下方**，讓相關模組排在一起：

```ts
export * from "./ledgerLabels";
```

建立 `src/domain/ledgerLabels.test.ts`。以 `src/domain/ledgerSuggestions.test.ts` 為
fixture 風格範本（先看它怎麼造 `LedgerTransaction`，照抄那個 helper，不要自己發明）。
至少要有這些案例：

1. 依 count 由多到少排序
2. count 相同時，`lastUsed` 較新的排前面
3. `deletedAt !== null` 的列被排除
4. 空字串 / 全空白的值不進清單
5. 前後空白被 trim 後視為同一個值（`" 全家 "` 與 `"全家"` → 一筆 count 2）
6. `field: "name"` 與 `field: "merchant"` 各自獨立統計
7. `buildMerchantMasterList`：settings 有、歷史沒有的商家 count 為 0 且排在最後
8. `buildMerchantMasterList`：settings 與歷史都有的商家**只出現一次**

**Verify**：
```bash
npx vitest run src/domain/ledgerLabels.test.ts
```
預期：全綠，8 個以上測試通過。

---

## Step 2 — Repository：`renameLedgerName` + `renameMerchant` 補上週期規則

**做什麼**：新增名稱改名方法；修掉缺口 2；兩支都回傳更新筆數（UI 要顯示「已更新 N 筆」）。

### 2a. Interface（`src/data/repositories.ts`，第 510 行附近）

現況：
```ts
  renameMerchant(oldName: string, newName: string): Promise<void>;
```

改成（並在正下方加新方法）：
```ts
  /**
   * Rename a merchant everywhere it is referenced: every active ledger row AND
   * every recurring rule (rules are templates for future rows — leaving them
   * stale makes the old name reappear next cycle). Renaming onto an existing
   * merchant merges the two. Returns how many ledger rows changed.
   */
  renameMerchant(oldName: string, newName: string): Promise<number>;
  /**
   * Rename a transaction display name (`LedgerTransaction.name`) across every
   * active ledger row. Renaming onto an existing name merges them. Recurring
   * rules have no `name` column — their generated rows derive the name from the
   * rule's merchant/category — so nothing to cascade there. Returns how many
   * ledger rows changed.
   */
  renameLedgerName(oldName: string, newName: string): Promise<number>;
```

### 2b. Memory 實作（`src/data/repositories.ts:2526` 起）

現況：
```ts
  async renameMerchant(oldName: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed) throw new Error("新商家名稱不能為空。");
    this.data.ledgerTransactions = this.data.ledgerTransactions.map((row) =>
      row.merchant === oldName ? bump({ ...row, merchant: trimmed }) : row,
    );
    const current = this.data.settings;
    if (current.merchants.includes(oldName)) {
      this.data.settings = {
        ...current,
        merchants: current.merchants.map((m) => (m === oldName ? trimmed : m)),
      };
    }
    await this.persist();
  }
```

要改成：
- 只改 `deletedAt === null` 的列（**與 SQLite 版一致**；目前 memory 版連 tombstone 都改，
  這是兩實作的不一致，順手對齊）
- 統計並回傳更新筆數
- 同步更新 `this.data.recurringTransactions` 裡 `merchant === oldName` 的規則（一樣要 `bump`）
- `settings.merchants` 的部分：改名後若 `trimmed` 已在陣列裡，要**去重**（合併情境），
  用 `[...new Set(...)]`

再依樣新增 `renameLedgerName`（改 `row.name`，**不動 settings、不動 recurring**）。

`bump` 是這個檔案裡既有的 helper（會遞增 `revision` 並更新 `updatedAt`）——照用，不要自己寫。

### 2c. SQLite 實作（`src/data/repositories.ts:5175` 起）

`renameMerchant` 現有的 ledger UPDATE 保留，並在其後加上 recurring 的 UPDATE：

```ts
    await this.db.execute(
      `update recurring_transactions set merchant = $1, updated_at = $2, revision = revision + 1 where merchant = $3 and deleted_at is null`,
      [trimmed, nowIso(), oldName],
    );
```

回傳筆數取自 ledger UPDATE 的 `rowsAffected`（`db.execute` 回傳 `{ rowsAffected, lastInsertId }`）。

`settings.merchants` 那段（5182-5193 行）合併情境要去重：`JSON.stringify([...new Set(updated)])`。

`renameLedgerName` 照 `renameMerchant` 的形狀寫，但**只有一條 UPDATE**：

```ts
    await this.db.execute(
      `update ledger_transactions set name = $1, updated_at = $2, revision = revision + 1 where name = $3 and deleted_at is null`,
      [trimmed, nowIso(), oldName],
    );
```

錯誤訊息用「新名稱不能為空。」。

> **為什麼不用擔心同步**：`ledger_transactions` / `recurring_transactions` 都在
> `SYNC_TRIGGER_ENTITIES`（`src/data/migrations.ts:494-508`），`after update ... when
> new.revision <> old.revision` 的 trigger 會自動寫 sync_outbox。批次改名會產生
> N 筆 outbox —— 這是既有 `renameCategory` / `renameMerchant` 已有的行為，**不是這次引入的**，
> 不要為此加特殊處理。

### 2d. 測試（新檔 `src/data/repositories.rename.test.ts`）

用 `describeEachRepo`（見 `src/data/repositories.settings.test.ts:1-18` 的 import 與用法），
memory + sqlite 兩種實作都要跑。案例：

1. `renameMerchant`：所有該商家的 ledger 列都變成新名，回傳筆數正確
2. `renameMerchant`：**`recurring_transactions` 的同名規則也一起改**（缺口 2 的守門測試）
3. `renameMerchant`：`settings.merchants` 裡的舊名被換成新名
4. `renameMerchant`：改成一個已存在的商家 → 兩群列合併，且 `settings.merchants` **沒有重複值**
5. `renameMerchant`：不同商家的列**完全沒被動到**（含 `revision` 沒被 bump）
6. `renameMerchant`：soft-deleted 的列不被改
7. `renameMerchant`：空字串 / 全空白的新名 → throw
8. `renameLedgerName`：1、5、6、7 的對應版本
9. `renameLedgerName`：**不會動到 `merchant` 欄，也不會動到 `settings.merchants`**
10. `renameLedgerName`：改成已存在的名稱 → 合併，回傳筆數 = 兩群相加

**Verify**：
```bash
npx vitest run src/data/repositories.rename.test.ts src/domain/ledgerLabels.test.ts
npx tsc --noEmit
```
預期：測試全綠；tsc exit 0。

**STOP condition**：若 sqlite shim 的 `rowsAffected` 回傳 0 或 undefined 而測試對不上，
**先讀 `src/data/repositories.testHarness.ts:29-36` 確認 shim 的行為**，仍然對不上就 STOP 回報
——不要把測試改成不驗筆數。

---

## Step 3 — 把 `MerchantAutocomplete` 一般化成 `SuggestInput`

**做什麼**：名稱欄位要用同一個下拉元件，所以把它從「商家專用」改成通用。

1. 建立 `src/components/SuggestInput.tsx`：**把 `src/components/MerchantAutocomplete.tsx`
   的內容整份搬過去**，只做這些改動：
   - 元件名 `MerchantAutocomplete` → `SuggestInput`
   - prop `merchants: string[]` → `options: string[]`，內部所有 `merchants` 變數改 `options`
   - 新增 prop `ariaLabel?: string`，預設 `"建議"`；下拉容器的 `aria-label="商家建議"`
     改成 `aria-label={ariaLabel}`
   - 檔頭註解改寫成通用說明，但**保留**現有的兩段關鍵註解（它們記錄了踩過的坑，不要刪）：
     - 為什麼不用 Popover+Command combobox（第 5-6 行）
     - 為什麼用 `onMouseDown` 而不是 `onClick`（第 103-104 行）
     - Escape 要 `stopPropagation` 以免關掉 QuickAdd overlay（第 69-70 行）
2. 刪除 `src/components/MerchantAutocomplete.tsx`。
3. 更新兩處 import + 用法：
   - `src/components/QuickAdd.tsx:31` 的 import、`:605-609` 的用法
     （`merchants={merchantOptions}` → `options={merchantOptions}`，加 `ariaLabel="商家建議"`）
   - `src/routes/CashFlowRoute.tsx:36` 的 import、`:4690-4707` 的用法（同上）
4. 更新兩處**註解裡**的元件名引用（純文字，不影響行為）：
   - `src/components/ClientAutocomplete.tsx:6`
   - `src/domain/types.ts:70`

**Verify**：
```bash
grep -rn "MerchantAutocomplete" src/ ; echo "exit=$?"
npx tsc --noEmit
npm run lint
```
預期：`grep` 零命中（`exit=1`）；tsc exit 0；lint 的 error 數為 0
（**warning 有 799 個既有的，不要試圖清掉**）。

---

## Step 4 — 兩處「名稱」欄位接上 autocomplete

**做什麼**：缺口 3 的前半。

### 4a. `src/routes/CashFlowRoute.tsx`

在 `merchantPool` 的 memo（第 470-473 行）**正下方**加一個名稱池：

```tsx
  // 名稱 autocomplete 的來源：純粹來自帳目歷史（沒有對應的 settings 陣列 —— 計畫 282 決定 A）。
  const namePool = useMemo(
    () => buildLedgerLabelStats(ledgerRows, "name").map((s) => s.value),
    [ledgerRows],
  );
```

`buildLedgerLabelStats` 從 `"../domain"` 匯入（這個檔案已經從 `../domain` 匯入一票東西，
加進既有的 import 清單，**不要**新開一行 `from "../domain/ledgerLabels"`）。

把 `namePool` 沿著既有的 `merchantPool` 傳遞路徑往下傳到抽屜元件
（`merchantPool` 出現在第 470、2749、3679 行三處——`namePool` 要在同樣三個位置各加一處）。

第 4681-4688 行的 `<input>` 換成：

```tsx
                  <DrawerField label="名稱">
                    <SuggestInput
                      value={ledgerForm.name}
                      options={namePool}
                      onChange={(next) => setLedgerForm({ ...ledgerForm, name: next })}
                      placeholder={type === "expense" ? "計程車" : "月薪"}
                      ariaLabel="名稱建議"
                    />
                  </DrawerField>
```

### 4b. `src/components/QuickAdd.tsx`

在 `merchantOptions` 的 memo（第 252-258 行）下方加：

```tsx
  // 名稱 autocomplete（計畫 282）：只從帳目歷史推導，與商家的 lexicon 來源刻意不同 ——
  // lexicon.merchants 混了 settings.merchants 的 seed，名稱沒有那層 seed。
  const nameOptions = useMemo(
    () => buildLedgerLabelStats(ledgerRows, "name").map((s) => s.value),
    [ledgerRows],
  );
```

第 592-599 行的 `<input>` 換成 `SuggestInput`，`ariaLabel="名稱建議"`，
placeholder 保持 `"交易名稱"`。

> **不要**在名稱被選取時做任何自動帶入（商家有 `chooseMerchant` 會帶分類，名稱沒有這層學習，
> 硬加會讓 §6.5 的 correction 記錄失真）。單純 `setConfirm({ ...confirm, name })` 即可。

**Verify**：
```bash
npx tsc --noEmit && npm run lint && npm test
```
預期：tsc 0、lint 0 errors、vitest 全綠（既有 1527 + Step 1/2 新增的）。

---

## Step 5 — 設定：商家分頁改用聯集清單 + 顯示使用次數 + 允許合併

**做什麼**：缺口 1 與決定 B 的商家側。

`src/routes/SettingsRoute.tsx`：
- 從 `useFinanceData()` 多解構 `ledger`（第 35 行那個 destructure；`ledger` 確實由
  `src/data/hooks.ts:40-44` 提供）
- 把 `ledgerRows={ledger.data ?? []}` 傳給 `<SettingsMerchants>`

`src/routes/settings/MerchantsSection.tsx`：
- props 增加 `ledgerRows: LedgerTransaction[]`
- 第 128-130 行的 `filtered` 改成基於 `buildMerchantMasterList(ledgerRows, form.merchants)`
  再套搜尋字串過濾：

```tsx
  const master = useMemo(
    () => buildMerchantMasterList(ledgerRows, form.merchants),
    [ledgerRows, form.merchants],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? master.filter((m) => m.value.toLowerCase().includes(q)) : master;
  }, [master, search]);
```
- 第 284-340 行的 `filtered.map((m: string, ...))` 要改成 `filtered.map((m, i) =>` 且內部
  改用 `m.value` / `m.count`。在名稱右側加一欄使用次數
  （`m.count > 0 ? \`${m.count} 筆\` : "未使用"`，用 `className="text-xs muted"`）。
  grid 從 `"1fr 80px"` 改成 `"1fr 72px 80px"`，表頭（第 247 行）同步加一格「使用次數」。
- **刪除 `saveEdit` 裡的「商家已存在」硬擋**（第 169-172 行）——決定 B。改名成功後的 toast
  改成顯示筆數：`toast.success(\`已更新 ${n} 筆\`)`，`n` 來自 `renameMerchant` 的回傳值。
  （`addMerchant` 的重複檢查**保留**，第 137-140 行不要動。）
- `deleteMerchant`（第 146-149 行）只從 `settings.merchants` 移除，**不動交易資料**——
  維持現狀。但因為清單現在含歷史值，要在該列**只有在 `form.merchants.includes(m.value)`
  時才顯示刪除鈕**（否則使用者會按下一個什麼都不會發生的按鈕）。
- header eyebrow（第 195 行）`Auto-categorisation · {form.merchants.length} merchants`
  改成 `Auto-categorisation · {master.length} merchants`。
- `setForm` 的 rename 鏡射（第 176 行）保留，但合併情境要去重：
  `merchants: [...new Set(form.merchants.map((m) => (m === oldName ? next : m)))]`

**Verify**：
```bash
npx tsc --noEmit && npm run lint
```
手動驗（Step 8 一起做）。

---

## Step 6 — 設定：新增「名稱」分頁

**做什麼**：缺口 3 的後半。

建立 `src/routes/settings/NamesSection.tsx`。**以 `MerchantsSection.tsx` 為藍本**，
但拿掉「新增」與「刪除」（決定 A），保留搜尋 + 就地編輯 + rename：

- props：`{ ledgerRows: LedgerTransaction[]; t: TFunction; renameName: (oldName: string, newName: string) => Promise<number> }`
  （**不需要** `form` / `setForm` / `submit` —— 名稱不進 `AppSettings`）
- 清單來源：`buildLedgerLabelStats(ledgerRows, "name")`
- 欄位：名稱 / 使用次數 / 最後使用（`lastUsed` 取日期部分即可）/ 編輯鈕
- 就地編輯的鍵盤與 blur 行為 **整段照抄** `MerchantsSection.tsx:120-178` 的
  `skipBlurRef` 機制（第 124-126 行的註解解釋了為什麼需要它——**照抄註解**，
  否則下一個人會把它當成多餘的 ref 刪掉）
- 改名成功 toast：`已更新 N 筆`
- 空清單時顯示 `無交易名稱紀錄`（沿用 `MerchantsTab.tsx:268` 的空狀態文案風格）
- **渲染上限（必做，見決定 A 的效能帳）**：搜尋過濾後的結果**只渲染前 200 列**，
  底下接一顆「顯示更多」按鈕每次多載 200，並在清單頂端顯示
  `共 N 個名稱（顯示 M）`。照抄 `CashFlowRoute.tsx:1717 / 1733 / 2522` 的
  `visibleCount` + `setVisibleCount((c) => c + 30)` 形狀（常數改 200）。
  **搜尋字串改變時要把 `visibleCount` 重置回 200**，否則使用者搜完窄結果再清空
  會一次掛回上千列。**不要**引入虛擬捲動函式庫。

`src/routes/SettingsRoute.tsx`：
- `TAB_IDS` 加 `"names"`，位置放在 `"merchants"` 之後
- `tabs` 陣列加 `{ id: "names", label: t("settings.names"), icon: <PencilSimple size={14} /> }`
  （`PencilSimple` 從 `@phosphor-icons/react` 匯入；**不要**傳 `weight`——
  Button/Badge 內的 size prop 是 inert，但這裡是獨立 icon，`size={14}` 與其他分頁一致即可）
- 加 `renameLedgerNameMutation`，照 `renameMerchantMutation`（第 47-51 行）的形狀，
  invalidate key 只需要 `["ledger"]`（名稱不影響 settings）
- 渲染 `{tab === "names" && <SettingsNames ... />}`

**i18n**：在 `src/locales/zh-TW/translation.json` 與 `src/locales/en/translation.json`
的 `settings` 物件裡新增（位置緊接在現有的 `merchantName` 之後，維持相鄰）：

| key | zh-TW | en |
|---|---|---|
| `settings.names` | `名稱` | `Names` |
| `settings.namesDesc` | `這裡列出你記過的所有交易名稱。改名會同步更新所有使用該名稱的交易。` | `Every transaction name you have used. Renaming updates every transaction that uses it.` |
| `settings.nameLabel` | `名稱` | `Name` |
| `settings.usageCount` | `使用次數` | `Uses` |
| `settings.lastUsed` | `最後使用` | `Last used` |

然後跑 `npm run copy:export` 讓 `copy.csv` / `_meta.json` 同步。

**Verify**：
```bash
npm run copy:export
git diff --stat src/locales/
npx tsc --noEmit && npm run lint && npm test
```
預期：`git diff --stat src/locales/` 顯示 4 個檔案有變動
（`zh-TW/translation.json`、`en/translation.json`、`copy.csv`、`_meta.json`）；
tsc 0、lint 0 errors、測試全綠。

**STOP condition**：若 `npm run copy:export` 改動了**其他既有 key 的內容**（不只是新增列），
STOP 回報——那代表 catalog 與 JSON 早就不同步，不該被這份計畫順手覆蓋。

---

## Step 7 — 格式與全套閘門

```bash
npm run format
npx tsc --noEmit
npm run lint
npm test
npm run build
npm run test:e2e
```

預期：
- `tsc` exit 0
- `lint` **0 errors**（799 個既有 warning 不動）
- `vitest` 全綠，檔案數 = baseline + 3（`ledgerLabels.test.ts`、`repositories.rename.test.ts`
  ＝ 2 新檔；若你另開了測試檔就對應增加）
- `build` exit 0
- `playwright` 6/6

**先記錄 baseline**：切分支後、動任何程式碼前跑一次 `npm test 2>&1 | tail -5` 把測試數記下來，
最後比對「新增的測試數 = 你寫的數量，既有測試 0 個轉紅」。**有任何既有測試轉紅 → STOP 回報**。

---

## Step 8 — 瀏覽器實測（必做，不可只靠測試）

用 preview 工具起 dev server（**不要用 Bash 跑 `npm run dev`**）。用示範模式的資料
（設定 → 一般 → 進入示範模式）確保有足夠的交易列。逐項驗證並回報你實際看到的值：

1. **設定 → 商家**：清單筆數 > 6（示範資料的商家 > 預設 seed 數量），每列有使用次數。
   搜尋一個**只在交易裡出現過、不在預設 seed 裡**的商家 → 搜得到。
2. **改名連動**：把該商家改成一個新名字 → toast 顯示「已更新 N 筆」；
   切到 記帳 → 商家 分頁，舊名消失、新名出現且筆數相同。
3. **合併**：把商家 A 改成已存在的商家 B → 兩者合併成一列，count 為兩者相加，且
   設定清單裡 B **只出現一次**。
4. **設定 → 名稱**：分頁存在、清單有內容、有使用次數與最後使用日期、搜尋可用。
   **回報實際數字**：相異名稱總數、實際渲染列數（應 ≤ 200）、以及用 DevTools
   Performance 量一次切到該分頁的 scripting 時間（把數字寫進回報，不要只說「很快」）。
5. **名稱改名連動**：改一個名稱 → 記帳列表裡該名稱的所有交易都變了；
   **該筆交易的「商家」欄位沒有跟著變**（這是 renameLedgerName 不該碰的欄位）。
6. **autocomplete**：記帳 → 記一筆 → 名稱欄位打兩個字 → 出現下拉；
   ↑↓ 可移動、Enter 可選、Escape 只關下拉**不關抽屜**。
7. **快速記帳**同樣驗名稱下拉的 Escape 行為（QuickAdd overlay 有 window 層的 Escape 監聽，
   這是 `SuggestInput` 裡 `stopPropagation` 存在的原因）。

截圖 1、4、6 三項。

---

## Done criteria（機器可驗）

```bash
# 1. 新的 domain 模組與測試存在且通過
npx vitest run src/domain/ledgerLabels.test.ts

# 2. rename 的三實作測試通過（memory + sqlite 各一輪）
npx vitest run src/data/repositories.rename.test.ts

# 3. renameLedgerName 三處都有（interface + memory + sqlite）
grep -c "renameLedgerName" src/data/repositories.ts   # 期望 >= 3

# 4. renameMerchant 確實更新 recurring_transactions
grep -n "update recurring_transactions set merchant" src/data/repositories.ts   # 期望 1 命中

# 5. 舊元件已完全退場
grep -rn "MerchantAutocomplete" src/   # 期望 0 命中

# 6. 名稱分頁已接上
grep -n "SettingsNames" src/routes/SettingsRoute.tsx   # 期望 >= 2 命中（import + 使用）

# 6b. 名稱清單有渲染上限，且沒有偷偷引入虛擬捲動
grep -n "visibleCount" src/routes/settings/NamesSection.tsx   # 期望 >= 3 命中
grep -rn "react-window\|react-virtual\|virtuoso" package.json # 期望 0 命中

# 7. 沒有動 schema
git diff --stat 3f69a867..HEAD -- src/data/migrations.ts   # 期望空輸出

# 8. 全套閘門
npx tsc --noEmit && npm run lint && npm test && npm run build && npm run test:e2e
```

## Test plan

| 新測試 | 檔案 | 跟隨的既有範本 |
|---|---|---|
| `buildLedgerLabelStats` / `buildMerchantMasterList` 的 8 個案例 | `src/domain/ledgerLabels.test.ts` | `src/domain/ledgerSuggestions.test.ts`（fixture 造法） |
| rename 的 10 個案例 × memory/sqlite | `src/data/repositories.rename.test.ts` | `src/data/repositories.settings.test.ts`（`describeEachRepo` 用法） |

不需要新增 e2e——既有 `src/test/e2e/smoke.spec.ts` + `page-width.spec.ts` 是回歸網，
這份計畫的互動由 Step 8 的瀏覽器實測覆蓋。

## STOP conditions（遇到就停下來回報，不要自行決定）

1. **需要改 `src/data/migrations.ts`** —— additive-only 是對使用者的承諾。這份計畫的設計
   刻意不需要 schema 變更；若你推導出需要，代表設計有誤，回報讓 advisor 重新判斷。
2. **既有測試轉紅** —— 尤其是 `repositories.sync.test.ts` / `repositories.recurring.test.ts`。
3. **`renameMerchant` 的回傳型別改動導致某個 call site 壞掉** —— 應該不會（現有兩處都忽略回傳值），
   若真的壞了回報。
4. **你發現 `AppSettings` 需要新增 `names` 欄位** —— 見決定 A，回報而不是自己加。
5. **`npm run copy:export` 想改動既有 key** —— 見 Step 6。

## Maintenance note

- **未來加第三個 label 欄位（例如「專案」）時**，`ledgerLabels.ts` 的 `LedgerLabelField`
  union 加一個值就好，統計與 UI 都不用重寫。這是把它做成 `field` 參數而不是兩支函式的原因。
- **`renameMerchant` 現在有兩個 cascade 目標（ledger + recurring）**。日後若再新增任何
  帶 `merchant` 欄位的資料表，記得同步 —— code review 時的檢查點是
  `grep -n "merchant text" src/data/migrations.ts` 的命中數要等於 rename 的 UPDATE 數。
- **`SuggestInput` 的三段註解**（Popover 不適用、`onMouseDown` 不用 `onClick`、
  Escape 要 `stopPropagation`）各自對應一個踩過的坑。review 時若看到有人刪掉，擋下來。
- **名稱清單是衍生的**，所以「刪除一個名稱」在 UI 上不存在。若日後 operator 要求這個功能，
  正確的語意是「把這些交易的名稱清空」而不是「從某個清單移除」——那是另一份計畫。
