# Plan 254: 信用卡「群組一等公民」— 資料模型決策 + 分階段建置地圖（Phase A：架構 gate）

> **Executor instructions**: This is an ARCHITECTURE + DECISIONS plan, not a
> code-writing plan. Its deliverable is a committed decision record and two
> scoped follow-up build plans (255, 256) — it does NOT itself modify `src/`.
> The advisor writes 255/256 after the decisions here are confirmed. Do not
> dispatch a code executor on this plan.
>
> **Drift check**: 本計劃只記錄決策與整合點；若下列行號在建置前已漂移，於 255/256
> 撰寫時重新核對即可。

## Status

- **Priority**: P2（使用者選定的方向；非阻斷，但改善同組多卡的資料正確性與體驗）
- **Effort**: 決策/spike 本身 S；下游建置 Phase B（255）L、Phase C（256）M
- **Risk**: 建置階段 MED-HIGH —— **觸及 E2E 同步子系統**（新增 synced 實體），寫錯會靜默
  壞資料。本計劃的存在就是為了先把決策與整合點鎖定、降低建置風險（比照金鑰輪替 spike 238）
- **Depends on**: 253（DONE，合併對帳現以「欄位手動一致」為觸發；本方向把觸發改為群組歸屬）
- **Category**: direction / architecture
- **Planned at**: commit `8fed759d`, 2026-07-24

## Why this matters

253 的合併對帳目前要求「同組各卡的 `creditLimitGroup`、`statementDay`、`paymentDueDay`、
`currency` **手動設成完全一致**」才觸發。使用者（larry）要的是更乾淨的模型：**一個大群組
持有 {額度、結帳日、繳款日}，玉山的卡歸到群組底下就自動貼齊/繼承**，不必每張卡各填一次
還要人工對齊（見對話：「一個大群組是額度、結帳日，然後玉山信用卡的帳戶歸類在該群組下面
自動貼齊」）。

現況一半已成立：**額度**已是群組化的（`calculateCreditGroup` 取組內 max 額度 + 總用量，
`AccountsRoute.tsx:416/425-427`）；但**結帳日/繳款日純屬每張卡**、群組層無此概念。本方向把
群組升級成**一等公民實體**，成為 {額度、結帳日、繳款日、幣別} 的單一事實來源，卡片歸屬並
繼承。

## Decisions（本計劃鎖定；建置階段照此執行）

> 這些是需要 larry 確認的核心語意。已附我的建議答案；若他點頭即鎖定，255/256 依此寫。

1. **【已由 larry 確認 2026-07-24：derive-on-read】群組為單一事實來源，卡片 derive-on-read**。新增 `credit_groups` 實體持有
   `credit_limit`、`statement_day`、`payment_due_day`、`currency`。帳戶新增
   `credit_group_id`（nullable FK）。當帳戶 `credit_group_id` 有值時，讀取其
   statementDay/paymentDueDay/creditLimit **一律取自群組**（帳戶自身同名欄位被忽略）；
   無群組的帳戶維持用自身欄位（**向後相容**）。
   *理由*：符合「自動貼齊」心智模型 —— 一處編輯、卡片跟隨；且對帳/繳款週期本就必須同值。

2. **離開群組時，把群組現值快照回帳戶自身欄位**。卡片脫離群組（`credit_group_id` 設 null）
   時，將群組當下的 statement_day/payment_due_day/credit_limit 寫回帳戶自身欄位，避免資料
   遺失、避免退回群組前的舊值。
   *理由*：derive-on-read 不保留帳戶自身值，故離開時需顯式快照。

3. **幣別一致為硬約束**。加入群組要求帳戶 `currency` 等於群組 `currency`；不符則拒絕並提示。
   （沿用 253 的同幣別前提。）

4. **Migration：自由文字 `credit_limit_group` → 群組實體（非破壞性）**。對每個「非空且有
   ≥2 張 credit 帳戶」的 `credit_limit_group` 值建立一個 `credit_groups` 列，其
   statement_day/payment_due_day/credit_limit/currency 由成員推導（取眾數；分歧則取最新
   `updated_at` 的成員值並記 log），並設成員的 `credit_group_id`。**保留舊
   `credit_limit_group` 欄位一個版本**當 fallback、停止寫入（比照 070 derive-on-read 的
   非破壞策略，repositories.ts:3546/6135）。單張卡的群組不自動建立（無合併需求）。
   *開放問題（需 larry 定）*：成員 statement_day 分歧時，除了「取最新」，是否要在 UI 跳出
   讓使用者選？建議 v1 先「取最新 + 事後可在群組設定改」，不阻斷 migration。

5. **同步：`creditGroup` 為新的一等 synced 實體**（見下方整合點）。群組與帳戶的
   `credit_group_id` 都必須 E2E 同步，否則多裝置會看到不一致的群組。

## 整合點地圖（建置階段必須全部覆蓋 —— 這是 synced 實體的清單）

於 `8fed759d` 核對；每項是新增 synced 實體 `creditGroup` + `credit_groups` 表所需觸點：

| # | 觸點 | 位置 | 要做什麼 |
|---|---|---|---|
| A | SyncEntity union | `src/domain/sync.ts:18-29` | 加 `\| "creditGroup"` |
| B | 新表 migration | `src/data/migrations.ts`（新增 `id: 8`） | `create table if not exists credit_groups (id, space_id, revision, created_at, updated_at, deleted_at, name, currency, credit_limit real, statement_day integer, payment_due_day integer)` |
| C | 帳戶新欄位 | `repositories.ts:2687-2700` 附近（ensureSqliteColumn 區） | `ensureSqliteColumn("accounts", "credit_group_id", "text")` —— **不用 ALTER migration**，比照 book_id/statement_day 的 ensure-column 慣例（migrations.ts:297-303 註解） |
| D | outbox triggers | `repositories.ts:5498-5512`（動態產生 `sync_outbox_${entity}_insert/update` 的迴圈與其 entity/table 清單） | 把 creditGroup→credit_groups 納入該迴圈來源 |
| E | tableByEntity ×3 | `repositories.ts:4725` / `:4757` / `:4790` | 三處 `Record<Exclude<SyncEntity,"settings">,string>` 都加 `creditGroup: "credit_groups"` |
| F | getSyncPayload 序列化 | 瀏覽器 `repositories.ts:2173`＋SQLite `:4749` | 加 creditGroup 的 row→payload 對應 |
| G | pull 端 apply/衝突 | `repositories.ts:2246+`（`change.entity === …` 分支）＋衝突合併 `:4695+` | 加 creditGroup 的套用與 revision 衝突處理 |
| H | 快照 roundtrip | `RepositorySnapshot`（`:449`）＋ getSnapshot（`:4570` 的 Promise.all）＋ importSnapshot（`:2209`/`:4892` 的逐表插入） | 加 `creditGroups` 進快照形狀、匯出、匯入（比照 books/clients） |
| I | list/insert row 方法 | 比照 `listBooks`（`:960`）/`insertBookRow`（`:4892` 附近） | `listCreditGroups` / `insertCreditGroupRow` + 型別 |
| J | CRUD | 比照 createAccount/updateAccount | `createCreditGroup`/`updateCreditGroup`/`deleteCreditGroup`；帳戶 read 在 `credit_group_id` 有值時 derive statementDay/paymentDueDay/creditLimit |
| K | 型別 | `src/domain/types.ts` | 新增 `CreditGroup` 型別；`Account` 加 `creditGroupId: string \| null` |
| L | AccountDraft | `repositories.ts:87` | 加 `creditGroupId`；updateAccount 的離開群組快照（Decision 2） |

（新增 synced 實體的參考範本：**client**（clients 表）—— 它是最近一個走完整套 A–I 流程的
實體，plan 190。建置時整條對照 `grep -rn "client\|clients\|Client" ` 在上述檔案的出現處。）

## 分階段建置（本計劃定義範圍；full executor plan 由 advisor 後續補）

- **Phase B = 計劃 255（L，資料層）**：整合點 A–L 全部。credit_groups 表 + 同步註冊 +
  帳戶 credit_group_id + derive-on-read + 離開快照 + migration/backfill + 快照 roundtrip +
  CRUD + 型別。**不含任何 UI 改動**，253 對帳頁暫時仍用舊的欄位比對觸發（過渡期兩者並存
  無害：有 group_id 的卡其 statementDay 已 derive 成一致，舊比對照樣觸發）。
  測試：sync push/pull（比照 `push.test.ts`/`pull.test.ts`）、快照 roundtrip（比照
  `snapshot-roundtrip-books-invoices` 精神）、migration backfill、derive-on-read domain。
- **Phase C = 計劃 256（M，UI + 收斂）**：AccountsRoute 群組管理（建立/編輯群組的額度、
  結帳日、繳款日）＋帳戶表單「歸屬群組」下拉、群組成員的結帳日/額度欄位顯示為「來自群組」
  （唯讀/自動）；ReconcileRoute（253）分組觸發改為 `credit_group_id`（取代欄位比對），
  `calculateCreditGroup` 改讀群組實體。舊自由文字 `creditLimitGroup` 於此階段標記淘汰
  （UI 不再暴露，欄位保留一版）。

## Scope（本計劃）

**In scope**：本計劃檔本身；後續由 advisor 新增 `plans/255-*.md`、`plans/256-*.md`。
**Out of scope**：任何 `src/` 改動（此為決策 gate）；不在此階段動同步程式碼。

## Done criteria（本計劃）

- [ ] larry 確認 Decisions 1–5（尤其 #4 的 statement_day 分歧處理）
- [ ] `plans/255-*.md`（Phase B 資料層）由 advisor 依整合點地圖 A–L 展開為 executor-ready
      計劃，含各觸點的 Current-state 程式碼 excerpt（撰寫前對 repositories.ts / sync 檔做
      聚焦閱讀）
- [ ] `plans/256-*.md`（Phase C UI）同上
- [ ] README 索引記錄 254/255/256 的順序與依賴

## STOP conditions

- 若 larry 對 Decision 1（derive-on-read vs 帳戶保留自身值+snap）有不同取捨 → 先改本計劃，
  再展開 255/256。derive-on-read 與 snapshot-on-assign 會產生不同的 migration 與 CRUD 形狀。
- 若建置階段發現同步子系統另有「新實體註冊」的隱藏觸點（除 A–L 外），回報並補進本地圖，
  不要略過 —— 漏一處 = 該實體不同步或 pull 崩潰。

## Maintenance notes

- **為何先 spike**：新增 synced 實體橫跨 migration/outbox/tableByEntity/getSyncPayload/
  pull-apply/snapshot 六個子系統，任一漏接都會靜默壞資料或讓 pull 崩潰。本 repo 對同級風險
  （金鑰輪替）就是先 spike（238）再分階段（239–242）。整合點地圖 A–L 就是那份「不可漏」
  清單。
- **過渡期並存**：Phase B 完成後、Phase C 前，有 group 的卡其 derive 出的 statementDay 已
  與群組一致，故 253 的舊欄位比對照樣觸發合併 —— 兩種觸發並存不衝突，可安全分兩次發版。
- **參考實體**：client（plan 190）是最近一個完整走過 A–I 的 synced 實體，建置時逐檔對照它。
- Reviewer 該盯（建置階段）：migration 的非破壞性（舊 `credit_limit_group` 保留）、
  derive-on-read 不污染帳戶自身欄位、離開群組的 snapshot、以及**每一個 synced 觸點都覆蓋**
  （用 client 做 checklist）。
