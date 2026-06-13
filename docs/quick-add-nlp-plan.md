# 快速新增（Quick Add）自然語言改善規格

> 狀態：草案 · 2026-06-13
> 目標：讓「快速新增」更準確地理解使用者的自然語言輸入（繁體中文與英文並重），
> 同時維持離線優先、隱私優先、跨平台（macOS / Windows / iOS）的產品原則。

---

## 1. 背景與現況

現行解析器 [`src/domain/quickAdd.ts`](../src/domain/quickAdd.ts) 是純規則式（regex）：

- 抓「第一個數字」當金額。
- 帳戶靠 `text.includes(account.name)` 全名子字串比對。
- 商家＝整句扣掉金額與帳戶名後的剩餘字串。
- 分類僅靠歷史 `merchant → category` 記憶（[`merchantCategory.ts`](../src/domain/merchantCategory.ts)），第一次出現的商家無法自動分類。
- 解析是「全有或全無」：失敗就回 `kind: "unknown"`，整個欄位都空。
- 投資 / 記帳要靠使用者手動切 toggle（auto 模式只在開頭有 `買/賣/buy/sell` 時觸發）。

### 現況破口（baseline 失敗案例）

| 輸入 | 現在 | 期望 |
|---|---|---|
| `7-11 50` | `7` 被當金額 | 商家 7-11、金額 50 |
| `富邦 買 2330 5股` | `富邦` 無法 match `富邦證券` | 帳戶＝富邦證券 |
| `昨天 拿鐵 120` | 日期＝今天 | 日期＝昨天 |
| `計程車 250`（首次） | 無分類 | 自動猜「交通」 |
| `咖啡 一百二` / `5萬` / `1.2k` | 數字解析失敗 | 120 / 50000 / 1200 |
| `coffee $4.50 cash` | `$` 殘留、`cash` 沒 match | 金額 4.5、帳戶 cash |
| `lunch 90 at amex` | `at` 混進商家 | 商家 lunch、帳戶 amex |

目標：把可解析率從 ~60% 提升到 ~90%，且全部由單元測試覆蓋。

---

## 2. 設計原則

1. **離線優先、零依賴是預設路徑。** 規則解析器（Tier 0）解決絕大多數情境，純本地、即時、免費、可測試。
2. **模型是可插拔的增強層，不是必需依賴。** 裝置端模型（Tier 1）在支援的平台「可用即自動啟用」補長尾；雲端（Tier 2）預設關閉、純 opt-in。任一層缺席都不影響核心可用性（落回 Tier 0）。
3. **部分解析優於全有全無。** 解析器回傳「各欄位 + 信心度」，UI 能即時預覽，模型 fallback 也能無痛接上。
4. **雙語對等。** 中文與英文走同一套 pipeline，差異只在 tokenizer 與字典。
5. **不破壞既有行為。** 既有測試（[`quickAdd.test.ts`](../src/domain/quickAdd.test.ts)）必須持續通過。

---

## 3. 三層架構

```
使用者輸入
   │
   ▼
┌──────────────────────────────────────────────┐
│ Tier 0  規則解析器（預設、離線、必做）          │
│  tokenizer → 金額/日期/帳戶/標的/分類 抽取      │
│  → ParseResult { fields, confidence, spans }   │
└──────────────────────────────────────────────┘
   │ 信心足夠 → 直接帶入確認卡（或即時預覽）
   │ 信心不足 / unknown
   ▼
┌──────────────────────────────────────────────┐
│ Tier 1  Apple Foundation Models（計畫內、裝置端）│
│  可用時自動啟用：macOS26+/iOS26+/Apple Intelligence│
│  guided generation → 直接吐出 ParseResult       │
│  離線、免費、不外傳。Windows 無此層→等同只有T0。 │
└──────────────────────────────────────────────┘
   │ 仍失敗 / 平台不支援
   ▼
┌──────────────────────────────────────────────┐
│ Tier 2  雲端 LLM（純 opt-in、進階設定）         │
│  使用者自填 API key 才啟用（如 Claude Haiku）    │
│  長尾疑難句。會外傳交易文字 → 預設關閉並警示。    │
└──────────────────────────────────────────────┘
```

**實作以 Tier 0 為基礎、Tier 1（Apple Foundation Models）為計畫內目標**（§7、P6）；Tier 2 純 opt-in、可延後。

---

## 4. 共用資料模型

把 `parseQuickAdd` 的回傳從「全有全無的 union」改成「部分解析 + 信心度」。

```ts
export type FieldConfidence = "high" | "low" | "none";

export interface ParsedField<T> {
  value: T | null;
  confidence: FieldConfidence;
  /** 在原字串中對應的字元區間，供輸入框高亮用 [start, end) */
  span?: [number, number];
}

export interface QuickAddParseResult {
  kind: "ledger" | "investment";          // 由 mode 或自動偵測決定
  source: "rules" | "on-device" | "cloud"; // 哪一層解析的，供 UI 標示與遙測
  ledger?: {
    entryType: ParsedField<"expense" | "income">;
    amount: ParsedField<number>;
    accountId: ParsedField<string>;
    merchant: ParsedField<string>;
    name: ParsedField<string>;
    category: ParsedField<string>;
    subcategory: ParsedField<string>;
    date: ParsedField<string>;            // ISO datetime-local
  };
  investment?: {
    action: ParsedField<"buy" | "sell">;
    ticker: ParsedField<string>;
    quantity: ParsedField<number>;
    price: ParsedField<number>;
    accountId: ParsedField<string>;
    date: ParsedField<string>;
  };
}
```

> 既有 `QuickAddParsed` union 暫時保留，由一層 adapter 從 `QuickAddParseResult` 折疊回舊型別，
> 讓 [`QuickAdd.tsx`](../src/components/QuickAdd.tsx) 的 `toConfirm()` 先不必大改；待即時預覽 UI 上線後再切換。

---

## 5. Tier 0 解析器規格

### 5.0 個人化字典（self-learning lexicon）— 貫穿全節的核心

字典**不寫死**，而是每次開啟快速新增時從使用者的即時資料衍生出一份 `UserLexicon`
（如同 [`QuickAdd.tsx`](../src/components/QuickAdd.tsx) 現在用 `useMemo` 算 `merchantCat`）。
它隨使用者新增資料自動成長、變準，是衍生狀態、永遠最新，**不需另存**。
內建字典（§5.5）只當「冷啟動種子」，之後逐步被使用者自己的資料覆蓋。

```ts
// src/domain/userLexicon.ts（新檔）
export interface UserLexicon {
  /** 別名 → accountId。來源：帳戶名自動衍生(富邦證券→富邦) + 使用者自訂別名 */
  accountAliases: Map<string, { accountId: string; weight: number }>;
  /** 商家索引，依使用次數排序，供模糊比對。來源：settings.merchants + 記帳歷史 */
  merchants: Array<{ name: string; count: number }>;
  /** token → 分類。來源：歷史 token→category（學習） + 內建種子字典 */
  keywordCategory: Map<string, { category: string; subcategory: string; count: number }>;
  /** 使用者修正回饋（見下）。優先序最高 */
  corrections: Map<string, { field: "account" | "category"; value: string }>;
}

export function buildUserLexicon(
  ledger: LedgerTransaction[],
  settings: AppSettings,
  accounts: Account[],
  corrections: CorrectionStore,
): UserLexicon { /* … */ }
```

**資料源（全部已存在）：**

| 來源 | 餵給 | 說明 |
|---|---|---|
| `accounts[].name` | accountAliases | 自動拆出前綴別名（`富邦證券`→`富邦`）、卡別（amex/visa） |
| 帳戶自訂 `aliases?` | accountAliases | 使用者在帳戶設定手填（schema 後補） |
| `settings.merchants` | merchants | 使用者的商家清單 |
| 記帳歷史 merchant | merchants | 用過的商家（含次數），支援部分輸入模糊比對 |
| 記帳歷史 merchant→category | keywordCategory | 即現行 `buildMerchantCategoryMap`，擴充為 token 級 |
| 記帳歷史 token→category | keywordCategory | `計程車 250 → 交通` 一旦記過，`計程車` 就成為學到的關鍵字 |
| 內建種子字典（§5.5） | keywordCategory | 僅新使用者/無歷史時生效 |

**信心度跟頻率走：** 對應出現 ≥N 次 → `high`；1 次 → `low`。種子字典固定 `low`（讓使用者資料能蓋過它）。

**修正回饋迴圈（progressive learning）：** 當解析器猜錯、使用者在確認卡改掉帳戶或分類後，
把 `（輸入 token → 修正後的值）` 寫入一個輕量 `corrections` 儲存（localStorage 或 app_settings 一個 key），
下次同 token 直接命中、`high` 信心。這是「逐步建立使用者自己字典」最直接的機制。

> 優先序（高→低）：**使用者修正 > 記帳歷史 > settings 清單 > 帳戶名自動衍生 > 內建種子字典**。

### 5.1 Tokenizer

- 以空白切分為主，但**保留數字型 token 的完整性**：`7-11`、`2330.TW`、`$4.50`、`1,200`、`1.2k` 視為單一 token。
- 中英混排不分詞（中文不靠空白），改以「pattern 掃描」抽取各欄位，剩餘連續中文/英文字串歸為商家候選。

### 5.2 金額解析（取代「第一個數字」）

支援格式，依序嘗試：

| 樣式 | 例 | 解析 |
|---|---|---|
| 阿拉伯數字 + 千分位 | `1,200` `120` | 1200 / 120 |
| 貨幣符號 | `$4.50` `NT$300` `￥500` | 去符號取值 |
| 單位後綴 | `5萬` `3千` `1.2k` `2m` | 50000 / 3000 / 1200 / 2000000 |
| 中文數字 | `一百二` `兩千五` `三百` | 120 / 2500 / 300 |
| 口語 | `5塊` `50元` `30 bucks` | 5 / 50 / 30 |

**消歧規則：** 金額候選**排除**已被辨識為標的代號、股數（接 `股/張/shares`）、日期、`@單價` 的數字。
`7-11 50` → `7-11` 先被商家/數字型 token 規則吃掉，`50` 才是金額。

> 實作建議：中文數字用一個小型 `parseChineseNumber()`（涵蓋 零一二…十百千萬／兩），
> 單位後綴用 `{ 萬:1e4, 千:1e3, k:1e3, m:1e6 }` 對照表。皆為純函式、好測試。

### 5.3 帳戶模糊比對（取代全名子字串，吃 §5.0 lexicon）

候選比對由強到弱，取最高分（來源皆為 `UserLexicon.accountAliases`）：

1. 使用者修正回饋命中（最高信心）。
2. 完整名稱子字串（現行行為）。
3. **帳戶名與輸入 token 互為子字串**：`富邦` ⊂ `富邦證券` → match（high）。別名由帳戶名自動衍生。
4. 別名表：自動衍生 + 種子（`卡→信用卡`、`現金/錢包→cash`、`amex/visa→對應卡`）+ 使用者自訂（帳戶設定加 `aliases?: string[]`，schema 後補）。
5. 英文大小寫、全半形正規化後再比。

回傳 `accountId` 帶 `confidence`；若多個帳戶同分 → `confidence: "low"`，UI 立即顯示帳戶 chips 讓使用者點選（這次點選即寫入修正回饋）。

### 5.4 日期關鍵字

抽出並從商家字串移除：

| 中文 | 英文 | 解析 |
|---|---|---|
| 今天/今日 | today | 今天 |
| 昨天/昨日 | yesterday / yest | 今天 −1 |
| 前天 | — | 今天 −2 |
| 上週三 / 週三 | last wed / wed | 最近的該星期幾 |
| 3/15 · 0315 · 3月15 | mar 15 · 3/15 | 該日期（年份取最近的過去） |

無日期關鍵字 → 沿用現行 `nowAsDatetimeLocal(timezone)`。

### 5.5 分類關鍵字（學習為主、種子字典為輔）

分類來源依 §5.0 優先序：**使用者修正 > 歷史 token→category > 內建種子字典**。
內建字典只是冷啟動種子，給沒有歷史的新使用者；一旦使用者記過帳，他自己的用法就接手。
種子字典範例：

```ts
// src/domain/categoryKeywords.ts（新檔）
// keyword（中/英、可多個）→ { category, subcategory? }
計程車/uber/taxi/小黃   → 交通/計程車
捷運/mrt/metro          → 交通/捷運
加油/gas/油錢           → 交通/加油
拿鐵/咖啡/星巴克/coffee  → 餐飲/飲料
便當/午餐/lunch/晚餐     → 餐飲/外食
房租/rent               → 居住/房租
水電/電費/water/utility  → 居住/水電
薪資/薪水/salary/payroll → 收入/薪資（且自動判定 entryType=income）
```

種子字典的 category 須對應使用者目前的 `settings.categories`（[repositories.ts:320](../src/data/repositories.ts)）；
找不到對應分類就只填 category 不填 subcategory。種子可隨產品擴充，與 i18n copy catalog 分開維護。
（學習與回饋機制見 §5.0。）

### 5.6 投資 / 記帳自動偵測

維持手動 toggle，但當輸入符合**標的樣式**（`\d{4,6}(\.[A-Z]{1,4})?` 或 2–5 碼純英文 + 接 `股/張/shares/@`）時，
在記帳模式下顯示一個輕量提示：「看起來像投資 · 切換？」讓使用者一鍵切。不自動切換（避免誤判）。

### 5.7 英文路徑

同一 pipeline，差異點：

- 介係詞清洗：金額/帳戶抽取後，從商家候選移除 `at / from / on / for / paid / with`。
- 帳戶英文別名（5.3）。
- 英文日期（5.4）。
- 商家保留原始大小寫。

---

## 6. UX 改善（與解析同等重要）

1. **即時預覽（debounce 150ms）。** 邊打邊在輸入框下方用 chip 顯示已辨識欄位：
   `金額 $120 · 信用卡 · 餐飲/飲料 · 今天`。低信心欄位用虛線框 + 點一下展開選擇。
   → 大幅減少「解析 → 確認卡」的來回。
2. **輸入框 token 高亮。** 用 `span` 把金額/帳戶/日期上色，使用者一眼看出系統理解了什麼。
3. **低信心即時補救。** 帳戶沒 match → 直接在預覽列出帳戶 chips；分類靠猜 → 標「建議」可一鍵改。
4. **範例 chips。** 空輸入時，placeholder 之外再放 2–3 個可點的範例（記帳 / 投資各一），點了帶入輸入框。
5. **記住每分類的常用帳戶。** `餐飲` 預設帶上次用的帳戶，減少手動選擇。
6. **語音輸入（mobile，後續）。** iOS 用系統聽寫 → 文字進同一 pipeline；與 NL 解析天然互補。
7. **解析來源標示。** 若由 Tier 1/2 解析，確認卡角落標一個小 icon（透明度，使用者知道資料是模型推得）。

---

## 7. Tier 1：Apple Foundation Models（計畫內項目）

裝置端模型，補強 Tier 0 規則無法處理的長尾自然語句（語序自由、口語、複合句）。
**離線、免費、不外傳**——對隱私優先的理財 App 是最佳的「智慧」來源。

- **可用條件：** macOS 26+ / iOS 26+，Apple Silicon，使用者已開啟 Apple Intelligence。
  執行期偵測 `SystemLanguageModel.default.availability`（回傳 `.available` 才啟用，否則此層 no-op）。
- **橋接：** 一支 Tauri plugin（Swift `FoundationModels` ↔ Rust command `parse_quick_add`），
  桌面與 iOS 各自編譯，沿用 [ios-mobile-plan.md](./ios-mobile-plan.md) 的 capability gating 模式。
  TS 端用 `@tauri-apps/api` 的 `invoke()` 呼叫，非 Tauri/不支援平台 catch 後回 `null`。
- **guided generation（關鍵）：** 用 `@Generable` + `@Guide` 定義一個對應 §4 `QuickAddParseResult` 的
  Swift struct，讓模型**保證吐出合法結構化結果**（不必解析自由文字、不會 hallucination 出亂格式）。
  把帳戶清單、分類清單、今天日期放進 prompt 當 context，模型輸出 accountId/category 直接可用。
- **觸發點：** 僅在 Tier 0 對關鍵欄位回 `confidence: "none"` / `kind: unknown` 時才呼叫——
  Tier 0 命中就不打擾模型（省電、零延遲）。模型結果以 `source: "on-device"` 標示。
- **語言：** Foundation Models 原生支援中英；prompt 用使用者當前語系。
- **延遲與體驗：** 首次載入模型有冷啟動成本 → 在快速新增開啟時預熱（`prewarm()`）；
  解析時顯示輕量 loading 態，逾時（~2s）放棄並退回 Tier 0 部分結果。
- **降級鏈：** Tier 0 → (可用則) Tier 1 → (opt-in 則) Tier 2 → Tier 0 部分結果。
  Windows / 舊機型沒有 Tier 1，行為等同只有 Tier 0（不影響核心可用性）。

介面草案：

```ts
// src/domain/nlParser.ts
interface NlParser {
  available(): Promise<boolean>;   // Tier 1: invoke 偵測; Tier 2: 設定開關+key
  parse(text: string, ctx: QuickAddContext): Promise<QuickAddParseResult | null>;
}
// rulesParser 永遠存在且同步；onDeviceParser / cloudParser 視平台與設定注入。
// orchestrator：先 rules，欄位不足且 parser.available() → 才 await parse()。
```

Swift 端（plugin）概念：

```swift
@Generable struct ParsedDraft {
  @Guide(description: "ledger or investment") var kind: String
  @Guide(description: "expense or income")    var entryType: String?
  var amount: Double?
  @Guide(description: "must be one of the provided account ids") var accountId: String?
  var merchant: String?
  @Guide(description: "must be one of the provided category names") var category: String?
  var date: String?   // ISO; resolve 今天/昨天/yesterday relative to provided today
  // …investment 欄位
}
// let session = LanguageModelSession(instructions: …帳戶/分類清單…)
// let result = try await session.respond(to: text, generating: ParsedDraft.self)
```

---

## 8. Tier 2：雲端 LLM（純 opt-in，後續）

- 進階設定中「智慧解析」開關，預設**關閉**，開啟時明確告知「輸入文字會送往 <provider>」。
- 使用者自填 API key（沿用既有 secret 儲存）。建議 Claude Haiku（便宜、快、雙語強）。
- 僅在 Tier 0/1 都失敗時呼叫，逾時 1.2s 即放棄並退回部分結果。
- 隱私：只送該行文字＋帳戶/分類名稱清單，不送金額歷史或其他交易。

---

## 9. 實作階段

| 階段 | 內容 | 產出 |
|---|---|---|
| **P0** | `QuickAddParseResult` 型別 + adapter（折疊回舊 union） | 不改 UI 行為，測試全綠 |
| **P1** | `buildUserLexicon`（§5.0，從 settings/歷史/帳戶衍生） + 金額解析（中文數字/單位/貨幣符號）+ 數字型商家修正 | `userLexicon.test.ts`、`parseAmount.test.ts` |
| **P2** | 帳戶模糊比對（吃 lexicon）+ 修正回饋儲存 | `matchAccount.test.ts` |
| **P3** | 日期關鍵字 + 分類關鍵字（學習 + 種子字典） | `parseDate.test.ts`、`categoryKeywords.test.ts` |
| **P4** | 英文路徑（介係詞清洗、英文別名/日期） | 雙語 fixture 測試 |
| **P5** | 即時預覽 + token 高亮 UI（切到 `QuickAddParseResult`） | UI |
| **P6** | **Tier 1 Apple Foundation Models** — `NlParser` orchestrator + Swift plugin（`@Generable` guided generation）+ 平台 gating + 預熱 | 裝置端智慧解析 |
| **P7** | Tier 2 雲端 opt-in（純加分、可延後） | 進階設定 |

P0–P5 為核心離線改善，可獨立交付並涵蓋 ~90% 情境；**P6（Apple Foundation Models）為計畫內、補長尾**；P7 為純加分、可延後。
建議 P5 時就把 `NlParser` orchestrator 的接縫留好（即使 P5 只接 rulesParser），P6 才能無痛插入。

---

## 10. 測試策略

- 既有 [`quickAdd.test.ts`](../src/domain/quickAdd.test.ts) 全數保留並通過（回歸保護）。
- 每個純函式（`parseChineseNumber` / `parseAmount` / `parseDate` / `matchAccount` / `categoryKeyword` / `buildUserLexicon`）獨立測試。
- 學習測試：餵入一段記帳歷史 → 斷言 lexicon 對「之前用過的商家/帳戶/詞」的信心提升、修正回饋命中。
- Tier 1 plugin：mock `invoke()` 回傳，測 orchestrator 的「Tier 0 命中不呼叫模型 / 不足才呼叫 / 逾時退回」分支。
- 一份雙語 fixture 表（§1 的失敗案例 + 正常案例），中英各 ~30 句，斷言各欄位 value 與 confidence。
- 信心度回歸：高信心欄位不得因新規則退化成低信心。

---

## 11. 待決問題

1. 帳戶自訂別名要做成正式 schema 欄位，還是只靠自動衍生 + 修正回饋？（建議先靠衍生+回饋，schema 後補）
2. 修正回饋（§5.0 corrections）存哪：localStorage 還是 app_settings 一個 key？要不要跟著 sync（[[project_sync_sqlite]]）跨裝置？
3. 種子分類字典要不要納入 i18n copy catalog（[copy.csv](../copy.csv)）一起維護？
4. Tier 1：plugin 要不要也吃 lexicon/修正回饋當 context，還是只給 settings 清單？（建議至少給帳戶/分類清單）
5. Tier 2 預設 provider 與 key 儲存位置（沿用現有 secret 機制？）。
6. 即時預覽 + 每次重算 lexicon 是否在大量歷史/低階機型造成輸入延遲（debounce 值與 lexicon 快取需實測）。
