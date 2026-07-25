# Plan 256: 信用卡群組 Phase C — UI（歸屬群組、繼承欄位、群組管理）+ 對帳改用 credit_group_id

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files in scope. If any STOP condition occurs, stop immediately and
> report — do not improvise. When done, update this plan's row in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat ba5ef85a..HEAD -- src/routes/AccountsRoute.tsx src/routes/ReconcileRoute.tsx src/data/hooks.ts`
> If any changed since ba5ef85a, re-locate the anchors below by grep before editing.

## Status

- **Priority**: P2
- **Effort**: M-L（UI，跨 AccountsRoute 表單 + 群組管理 + ReconcileRoute 分組切換）
- **Risk**: MED（純 UI + 讀寫既有 CRUD；不動同步/schema。財務語意由 255 的 derive-on-read
  保證，本計劃只是把「手動填欄位」換成「選群組、欄位繼承」）
- **Depends on**: 255（DONE，已 merge 進 main `ba5ef85a`）。253（DONE，ReconcileRoute 合併對帳）。
- **Category**: feature / UI
- **Planned at**: commit `ba5ef85a`, 2026-07-24

## Why this matters

255 建好了資料層：`credit_groups` 一等實體 + 帳戶 `creditGroupId` + **derive-on-read**
（歸屬群組的卡，其 statementDay/paymentDueDay/creditLimit 由群組供給）+ 離開群組快照 +
CRUD（`listCreditGroups`/`createCreditGroup`/`updateCreditGroup`/`deleteCreditGroup`）。

但 UI 還沒接上：帳戶表單仍是「共用額度群組」**自由文字**輸入，結帳日/繳款日/額度仍要每張
卡各填。本計劃把它換成 larry 要的模型：**帳戶選一個群組歸屬 → 結帳日/繳款日/額度自動繼承
（顯示為唯讀「來自群組」）→ 在群組一處編輯、所有卡跟隨**。並把 253 的合併對帳觸發從「欄位
手動一致」改為「同一個 `creditGroupId`」，更穩定。自由文字 `creditLimitGroup` 退出 UI（欄位
保留，255 backfill 仍讀它，非破壞）。

## 255 產出的 API（已在 main，本計劃直接用）

- `repository.listCreditGroups(): Promise<CreditGroup[]>`；`createCreditGroup(input: CreditGroupDraft)`；
  `updateCreditGroup(id, input: CreditGroupDraft)`；`deleteCreditGroup(id)`（soft-delete）。
- `CreditGroupDraft = Pick<CreditGroup, "name" | "currency" | "creditLimit" | "statementDay" | "paymentDueDay">`
  （型別在 `src/data/repositories.ts`；`CreditGroup` 在 `src/domain/types.ts`，欄位
  `id, name, currency, creditLimit, statementDay, paymentDueDay` + SyncFields）。
- `Account.creditGroupId: string | null`（`types.ts`）；`AccountDraft.creditGroupId?: string | null`（optional）。
- **derive-on-read**：`listAccounts()` 回傳的**歸屬群組帳戶**，其 `statementDay`/`paymentDueDay`/
  `creditLimit` **已是群組的值**（不是帳戶自身欄位）。所以 UI 直接顯示 `account.statementDay`
  即為繼承值。
- **leave-group**：`updateAccount(id, { …, creditGroupId: null })` 會把群組現值凍結回帳戶自身欄位。
  `creditGroupId: undefined`（不傳）= 保留現有連結；`string` = 設定/切換群組。

## Current state（於 `ba5ef85a` 核對）

### `src/data/hooks.ts`
`useFinanceData()`（:31）用一組 `useQuery` 聚合資料並回傳。`books` 是最近加入的一項（key
`books: ["books"]` :20；query :94-98；回傳 :123+）。**沒有 creditGroups query** —— Step 1 加。

### `src/routes/AccountsRoute.tsx`
- `AccountFormState`（:30）= `Pick<Account, …>` + `customGroup` + `bookId`。**無 `creditGroupId`**。
- `emptyAccount`（:32）、`startEdit`（:193-209 hydrate form from account）、`submit`（:218-229，
  呼叫 `createAccount`/`updateAccount.mutateAsync(payload)`，payload = `{ ...form, currency }`）。
- 資料：`const { accounts, settings, books, … } = useFinanceData();`（:89）；`const rows = accounts.data ?? [];`（:122）。
- Mutations（:110-112）：`createAccount`/`updateAccount`/`deleteAccount` via `useRepositoryMutation`。
- **信用卡表單欄位**（`form.type === "credit"`，:967-）：
  - 信用額度 input（:971）；**共用額度群組**自由文字 input（:973-975）；
  - 結帳日 input（:979）；繳款日 input（:981）。
- **群組顯示**（:416）：`const groupCredit = a.type === "credit" && a.creditLimitGroup ? calculateCreditGroup(a.creditLimitGroup, rows) : null;`
  → 使用率條用 `groupCredit.limit`（:425）。`calculateCreditGroup`（:1108）以
  `account.creditLimitGroup === name` 聚合、`limit = max(creditLimit)`。

### `src/routes/ReconcileRoute.tsx`（253 合併對帳，現以欄位比對觸發）
`groupAccounts`（:47-）目前 filter：`creditLimitGroup` 相同 + `statementDay` + `paymentDueDay`
+ `currency` 相同、≥2 張。→ Step 5 改成「同一個非空 `creditGroupId`」。

### 樣式慣例
表單欄位用 `<DrawerField label="…">` 包 `<input className="ns-input" …>` 或 `<select>`。
唯讀欄位：`<input className="ns-input" … disabled>` + 一行 `<div className="muted text-xs">來自群組「X」</div>`。
群組下拉照既有 `<select>` 樣式（見帳本/幣別 select）。不要新拉框架。

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Build | `npm run build` | exit 0 |
| Lint | `npm run lint` | exit 0（warnings ok） |
| Full suite | `npm test` | all pass（1487 baseline，無回歸） |
| Preview（手動驗收） | dev server via 既有流程 | 見 STOP 前的驗收 |

## Scope

**In scope**：
- `src/data/hooks.ts`（creditGroups query）
- `src/routes/AccountsRoute.tsx`（表單歸屬群組 + 繼承欄位 + 群組建立/編輯/刪除 + calculateCreditGroup 切換）
- `src/routes/ReconcileRoute.tsx`（分組觸發改用 creditGroupId）

**Out of scope**：
- `src/data/repositories.ts` / 同步 / schema —— 255 已建好，本計劃只消費，不改。
- 不要刪 `creditLimitGroup` 欄位或其在 repo/型別的定義（255 backfill 仍讀；非破壞）。只是 UI 不再暴露自由文字輸入。
- QuickAdd / 其他路由。

## Git workflow

- Branch: `feat/ai-credit-group-ui`（自 main `ba5ef85a`）。
- Conventional commits，例：`feat(accounts): assign cards to a credit group with inherited billing fields (plan 256)`。
- 不要 push / 開 PR。

## Steps

### Step 1 — `useFinanceData` 暴露 creditGroups

`src/data/hooks.ts`：加 key `creditGroups: ["creditGroups"] as const,`（:20 附近，mirror `books`）；
加 query（mirror books :94-98）：
```ts
const creditGroups = useQuery({
  queryKey: keys.creditGroups,
  queryFn: () => repository.data!.listCreditGroups(),
  enabled,
});
```
把 `creditGroups` 加進 `all` 陣列（:100）與 return 物件（:123+）。

**Verify**: `npm run build` → exit 0。

### Step 2 — AccountFormState 加 creditGroupId；hydrate/submit 帶上

`AccountsRoute.tsx`：
- `AccountFormState`（:30）：在 `Pick<Account, …>` 加 `"creditGroupId"`（Account 已有此欄位）。
- `emptyAccount`（:32）：加 `creditGroupId: null,`。
- `startEdit`（:196-206）：加 `creditGroupId: account.creditGroupId ?? null,`。
- `submit` 已 spread `...form`，故 creditGroupId 自動帶入 payload → repo。無需改 submit。
- `mutateAsync` 型別是 `AccountFormState`，repo 的 `createAccount`/`updateAccount` 收
  `AccountDraft`（creditGroupId optional）→ 相容。

**Verify**: `npm run build` → exit 0。

### Step 3 — 表單：以「歸屬群組」下拉取代自由文字，額度/結帳日/繳款日改為繼承唯讀

在 render 前取同幣別群組：
```ts
const creditGroupOptions = (creditGroups.data ?? []).filter((g) => g.currency === selectedCurrency);
const selectedGroup = form.creditGroupId ? (creditGroups.data ?? []).find((g) => g.id === form.creditGroupId) ?? null : null;
```
（`selectedCurrency` 已存在於 submit；若只在 submit 作用域，改用 `form.currency` 或把
`selectedCurrency` 提到 render 作用域 —— 用既有可取得的值，勿新增 state 來源。）

改信用卡欄位區（:967-982）：
- **移除**「共用額度群組」自由文字 input（:973-975），換成群組下拉：
```tsx
<DrawerField label="信用卡群組">
  <select
    className="ns-input"
    value={form.creditGroupId ?? ""}
    onChange={(e) => setForm({ ...form, creditGroupId: e.target.value || null })}
  >
    <option value="">無（獨立卡）</option>
    {creditGroupOptions.map((g) => (
      <option key={g.id} value={g.id}>{g.name}</option>
    ))}
  </select>
</DrawerField>
```
- **信用額度**（:971）：當 `selectedGroup` 存在時 `disabled` 並顯示群組值，附繼承提示：
```tsx
<DrawerField label="信用額度">
  <input className="ns-input" type="number"
    value={selectedGroup ? (selectedGroup.creditLimit ?? "") : (form.creditLimit ?? "")}
    disabled={!!selectedGroup}
    onChange={(e) => setForm({ ...form, creditLimit: e.target.value ? Number(e.target.value) : null })}
    placeholder="120000" />
  {selectedGroup ? <div className="muted text-xs">來自群組「{selectedGroup.name}」</div> : null}
</DrawerField>
```
- **結帳日**（:979）、**繳款日**（:981）：同樣 `disabled={!!selectedGroup}`、value 在有群組時顯示
  `selectedGroup.statementDay`/`paymentDueDay`，並各附 `來自群組` 提示。

> 語意：`creditGroupId` 一旦選定，額度/結帳日/繳款日由群組供給（255 derive-on-read）。表單
> 顯示群組值只是為了「所見即所得」；實際儲存時這些欄位仍可送舊值，repo 讀取時會 derive。
> 選「無」時清空 creditGroupId（→ repo 觸發 leave-group 快照，把群組現值凍回帳戶欄位）。

**Verify**: `npm run build` → exit 0；`grep -n "信用卡群組" src/routes/AccountsRoute.tsx` → 有匹配；
`grep -n "共用額度群組" src/routes/AccountsRoute.tsx` → **無匹配**（自由文字已移除）。

### Step 4 — 群組管理：建立 / 編輯 / 刪除

加 mutation hooks（mirror :110-112 與 book 的 create/update/delete :118-120）：
```ts
const createCreditGroup = useRepositoryMutation((repository, input: CreditGroupDraft) => repository.createCreditGroup(input), ["creditGroups"]);
const updateCreditGroup = useRepositoryMutation((repository, input: CreditGroupDraft & { id: string }) => repository.updateCreditGroup(input.id, input), ["creditGroups"]);
const deleteCreditGroup = useRepositoryMutation((repository, id: string) => repository.deleteCreditGroup(id), ["creditGroups", "accounts"]);
```
（`CreditGroupDraft` 從 `../data/repositories` import。）

UI（保持精簡，照 DrawerField/Button/ModalShell 既有樣式）：
- 群組下拉旁加「＋ 新增群組」與「編輯」入口（selectedGroup 存在時顯示編輯）。開一個小 modal
  （mirror 既有 ModalShell 用法，見 ReconcileRoute 的 PayCardModal 或 AccountsRoute 內既有 modal）
  欄位：名稱、信用額度、結帳日、繳款日；幣別 = 目前帳戶幣別（唯讀）。
  - 新增：`createCreditGroup.mutateAsync({ name, currency: selectedCurrency, creditLimit, statementDay, paymentDueDay })`，
    成功後把新群組設為 `form.creditGroupId`（需重新讀 listCreditGroups 找到新 id —— 用 mutation
    的 invalidate + 之後從 `creditGroups.data` 依 name 找；或讓 createCreditGroup 回傳 id 若 255 API
    如此。**若 createCreditGroup 回傳 void（255 現況）**，建立後以 name 匹配最新清單取得 id）。
  - 編輯：`updateCreditGroup.mutateAsync({ id, … })` —— 這就是「一處編輯、所有卡跟隨」。
  - 刪除：`deleteCreditGroup.mutateAsync(id)`。**刪除前先把該群組所有成員帳戶的 creditGroupId 設為
    null**（逐一 `updateAccount.mutateAsync({ …account fields…, id, creditGroupId: null })` → 觸發
    leave-group 快照，成員保留最後的結帳日/額度），再刪群組。若嫌逐帳戶重建 payload 複雜，STOP 回報
    —— 不要留下指向已刪群組的孤兒 creditGroupId。

**Verify**: `npm run build` → exit 0；`grep -n "createCreditGroup\|updateCreditGroup\|deleteCreditGroup" src/routes/AccountsRoute.tsx` → 皆有匹配。

### Step 5 — ReconcileRoute：分組觸發改用 creditGroupId

`ReconcileRoute.tsx` 的 `groupAccounts`（:47-）：把「欄位比對」改成「同一個非空 creditGroupId」：
```ts
const groupAccounts = useMemo(() => {
  const all = accounts.data ?? [];
  if (!account) return [];
  if (account.type !== "credit" || !account.creditGroupId) return [account];
  const siblings = all.filter(
    (a) => a.deletedAt === null && a.type === "credit" && a.creditGroupId === account.creditGroupId,
  );
  return siblings.length >= 2 ? siblings : [account];
}, [accounts.data, account]);
```
其餘（`groupPaidUntil`、markPaid 迴圈、逐筆卡片來源 badge、標題、owed 加總）**不變** —— 它們
只依賴 `groupAccounts`。derive-on-read 保證同群組卡的 statementDay/paymentDueDay 已一致，
`buildStatementPeriods` 照常。

**Verify**: `npm run build` → exit 0；`grep -n "a.creditGroupId === account.creditGroupId" src/routes/ReconcileRoute.tsx` → 匹配；
`grep -n "a.statementDay === account.statementDay" src/routes/ReconcileRoute.tsx` → **無匹配**（舊欄位比對已移除）。

### Step 6 — calculateCreditGroup 改用 creditGroupId + 群組實體額度

`AccountsRoute.tsx`：
- `:416`：`const groupCredit = a.type === "credit" && a.creditGroupId ? calculateCreditGroup(a.creditGroupId, rows, creditGroups.data ?? []) : null;`
- `calculateCreditGroup`（:1108）改簽名，以 creditGroupId 聚合、額度取自群組實體：
```ts
function calculateCreditGroup(groupId: string, accounts: Account[], groups: CreditGroup[]) {
  const groupRows = accounts.filter((a) => a.type === "credit" && a.creditGroupId === groupId);
  const used = groupRows.reduce((sum, a) => sum + Math.max(0, -a.balance), 0);
  const group = groups.find((g) => g.id === groupId);
  const limit = group?.creditLimit ?? Math.max(...groupRows.map((a) => a.creditLimit ?? 0), 0);
  const name = group?.name ?? "";
  return { name, used, limit };
}
```
（`CreditGroup` import 到 AccountsRoute。）

**Verify**: `npm run build` → exit 0。

### Step 7 — 全套 gate

**Verify**: `npm run build` exit 0；`npm run lint` exit 0；`npm test` all pass（1487 baseline，無回歸）。

## Test plan

- 本專案慣例：AccountsRoute / ReconcileRoute **無 route 元件測試**（既有慣例，見前計劃）。故
  本計劃的驗證 = build + lint + 全套無回歸 + 下方操作者手動驗收。255 的資料層行為（derive/leave-group/
  backfill）已有 `repositories.creditGroup.test.ts` 覆蓋，本計劃不重複。
- **若你發現某段邏輯可純函式化並值得測**（例如群組下拉的 option 過濾），可加 domain 級測試，
  但非必需。

## Done criteria

- [ ] `npm run build` exit 0
- [ ] `npm test` all pass（1487，無回歸）
- [ ] `npm run lint` exit 0
- [ ] `grep -n "信用卡群組" src/routes/AccountsRoute.tsx` → 有匹配（群組下拉已加）
- [ ] `grep -n "共用額度群組" src/routes/AccountsRoute.tsx` → **無匹配**（自由文字已移除）
- [ ] `grep -n "a.creditGroupId === account.creditGroupId" src/routes/ReconcileRoute.tsx` → 匹配
- [ ] 只動 in-scope 三檔（+ 若加 domain 測試則該測試檔）
- [ ] `plans/README.md` 列已更新

## STOP conditions

- `createCreditGroup` 回傳非 void 且與 255 計劃記載不符（無法取得新群組 id）→ 回報，別硬猜。
- 刪除群組要清成員 creditGroupId 但重建 account payload 過於複雜/易錯 → 回報（不要留孤兒連結）。
- 你發現 derive-on-read 沒有讓歸屬群組的帳戶顯示群組值（`account.statementDay` 不是群組值）→
  代表 255 資料層與預期不符，STOP 回報（不要在 UI 層補救 derive）。
- 任一 verify 修兩次仍失敗。
- 需要改 out-of-scope（repositories.ts / 同步）→ 回報。

## Maintenance notes

- **操作者手動驗收（需 `npm run dev`）**：
  1. 建一個信用卡群組（玉山，額度/結帳日/繳款日），把兩張玉山卡都選進該群組 → 兩張卡的
     額度/結帳日/繳款日欄位變唯讀且顯示群組值。
  2. 編輯群組的結帳日 → 兩張卡跟著變（derive-on-read）。
  3. 開任一張卡的對帳頁 → 合併視圖出現（現在靠 creditGroupId 觸發，不再需要手動對齊欄位）。
  4. 把一張卡改選「無」→ 它保留最後的結帳日/額度（leave-group 快照），且不再出現在合併視圖。
- 自由文字 `creditLimitGroup` 已退出 UI 但欄位保留（255 backfill 讀它）。未來若要完全移除，需
  先確認沒有既有資料仰賴它、且 backfill 已對所有裝置跑過 —— 另開計劃。
- Reviewer 該盯：繼承欄位的唯讀/顯示正確（不要把群組值寫死回帳戶自身欄位造成混淆）、刪除群組
  不留孤兒 creditGroupId、ReconcileRoute 單卡（無 creditGroupId）不回歸、新增群組後正確選中。
- 跨裝置離線各自 backfill 造成重複群組（255 已知 follow-up）尚未處理 —— 若使用者回報重複群組，
  那是 `mergeAndHealBooksInMemory` 式的收斂工作，另開計劃。
