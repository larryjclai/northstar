# Northstar Roadmap

執行順序：**Phase 4 UX → Phase 5 財務深度 → Phase 6 收尾**。同一 Phase 內部從上到下大致是優先順序，但允許並行。

每一條後面的標註：
- `[新]` 本次新加入的項目
- `[H]` 來自 HANDOVER.md「Outstanding work / Polish / Known cosmetic debt」的延續
- `[PRD]` PRD 早期承諾、尚未實現

---

## Phase 4 — UX（current focus）

讓「日常重訪」這件事真正成立。當前 app 對熟悉資料的人可用，但新手會卡、老用戶會在重複操作中累積摩擦。

### 4.1 新手 onboarding — `[新]` **⏸ Deferred**
> 功能尚未完全定案前先不寫，避免反覆修改。等 Phase 4 / 5 收斂後再做。
- 首次啟動 flow：歡迎 → 選 base currency → 建第一個帳戶（或載入範例資料）→ 介紹 6 個 tab 各做什麼。
- 在 `RootView` 加 `@AppStorage("northstar.hasCompletedOnboarding")` 旗標，未完成時推 sheet。
- 範例資料可重用既有 `SampleDataBootstrap`，加一個按鈕「載入範例資料試玩」。
- 在 CSV import preview 旁放「下載範例 CSV」連結，給願意自己填資料的人。

### 4.2 統一「新增」入口 + App Intent 補齊 — `[H]` + `[新]` ✅
- 目前 `IntentRouting.openAddTransaction` 只能開投資紀錄 sheet（HANDOVER 自承）。
- ✅ `AddEntryMenu` 元件：primary action = 該 tab 最合理的新增（Holdings/Transactions → 投資紀錄；Dashboard/CashFlow → 記帳），長按 / 下拉選單露出 三選一（投資紀錄 / 記帳 / 轉帳）。
- ✅ 已掛到 Dashboard / Holdings / Transactions / CashFlow toolbar；Accounts 因為 `+` 語義是「新增帳戶」保留原樣。
- ✅ 新增 `AddCashTransactionIntent`、`AddTransferIntent` App Intent，並改用統一的 `IntentRoutingKeys.openAddKind` 字串 key。原本的 `openAddTransaction` 已下線。
- ✅ 加入 `AddSheetKind` enum 集中 routing 用的 title / icon / landing tab。
- ✅ `CashFlowEditorView` 新增 `initialEntryType:` 參數，讓「轉帳」入口直接 preset 為 `.transfer`。
- ✅ Add sheet 集中由 RootView 透過 `.sheet(item: $pendingAddKind)` 呈現，無論透過 toolbar 還是 App Intent 都走同一個 presentation path。
- ✅ macOS Cmd+N 仍維持 per-tab 的 primary action（透過 AddEntryMenu 的 primaryAction）。
- iOS FAB 暫不額外做：toolbar `+` 在所有主要 tab 都已露出，覆蓋度足夠。日後若 dashboard 加 hero CTA 再評估。

### 4.3 記帳輸入人因 — `[新]`
- ✅ **金額欄位接受運算式**：`120+85+30` 自動求和。改用手刻的 recursive-descent parser（不用 NSExpression，避免畸形輸入丟 ObjC exception），支援 `+ - * /`、括號、一元負號、小數、逗號當小數點。檢測到算式時顯示 `= 235` 預覽。14 個 unit test 覆蓋。
- ✅ **日期快選 chip**：今天 / 昨天 / 本週一 / 上月底，放在 DatePicker 上方。currently-selected 自動高亮。
- ✅ **類別 autocomplete「最近用過」**：`RecentCategorySuggester` 純 Domain helper，按頻率排序，最近用過破平手；過濾投資連動分類；自訂類別寫入後自然會出現（因為直接讀 `LedgerTransaction.category`）。8 個 unit test 覆蓋。
- ✅ **拆分一筆**（split transaction）：採 Option 1（編輯器內模式切換）。
  - `LedgerTransaction` 新增 `groupID: UUID?`，lightweight migration。
  - `SplitTransactionBuilder` Domain helper（9 個 unit test）：純函數產出 N 筆共用 groupID 的 row，sign 由 entryType 決定，受票據附在第一筆，note 自動串接 shared + line note。
  - `CashFlowEditorView` 加 `拆分明細` toggle：ON 時隱藏單一金額欄、改為 N row（每 row 有分類 picker + 算式金額欄 + 刪除按鈕），頂端顯示「已分配 / 明細筆數 / 可儲存 vs 尚有未填」。Toggle OFF 收合為第一筆；single-line split 儲存時自動 collapse 為普通 row。
  - 編輯既有 split：editor init 偵測 `editing.groupID`，從 recentTransactions 撈 sibling，自動進 split mode。
  - Save 流程：split path 刪除舊 siblings 後依 builder 重新 insert；切換 split ↔ single 也會清掉 orphan。
  - CashFlowView 列表把同 groupID 的紀錄折成單一 `CashFlowSplitGroupRow` 卡片（總額 + 明細列表 + 帳戶 / 收據 / 備註 icons），點擊進 editor，整組刪除走 context menu。

### 4.4 轉帳 / 換匯成為一等公民 — `[新]` ✅
- 改用既有的 `groupID` 機制（沿用 4.3 拆分），不另開 model。
- ✅ `TransferBuilder` Domain helper（10 個 unit test）：產出兩筆共用 groupID 的 row，來源是負值、目標是正值；同幣別兩邊必須一致，跨幣別需提供目標金額。
- ✅ `LedgerGroupClassifier` Domain helper（9 個 unit test）：依「成員數量 + 帳戶分布 + 正負號」分類為 `.singleton / .split / .transfer / .unknown`。Editor 與列表用同一個 source of truth 來判斷類型。
- ✅ 獨立 `TransferEditorView`：fields 為 來源帳戶 / 目標帳戶 / 來源金額 / （跨幣別才出現）目標金額 / 隱含匯率讀數 / 備註 / 收據。同幣別輸入一個金額即可，跨幣別會顯示「1 USD ≈ 31.45 TWD」。
- ✅ RootView 的 `.transfer` 入口改開 `TransferEditorView`（從 AddEntryMenu 或 App Intent 都走同一條路）。
- ✅ CashFlowView 列表加 `CashFlowTransferRow`：圖示為 `arrow.left.arrow.right`、副標「A → B」、跨幣別同時顯示兩個金額與匯率徽章。
- ✅ Edit 既有轉帳：點列表的 transfer row 自動開 `TransferEditorView` 並載入雙腿。
- ✅ 月度收入 / 支出總和排除轉帳類（`轉帳 / 對帳調整 / 外幣兌換`）與投資連動類；新增 `LedgerCategoryCatalog.excludedFromCashFlowTotals` 集合統一管理。`SpendingSummaryBuilder` 也跟進，新增測試 `testExcludesTransferRows`。

### 4.5 投資紀錄編輯器的解釋性 — `[新]` ✅
- `StockDividend / CapitalReduction / StockSplit` 對薪水族投資人是低頻、高困惑事件。
- ✅ 在 `InvestmentAction` extension 上新增 `explanation` / `examplePhrase` / `brokerCaveat` 三個語意屬性，所有 6 個 action（含 buy / sell / cashDividend）都各有一行人話說明 + 一個具體例子（例如「2:1 分割（比例填 2）；100 股 @ 600 → 200 股 @ 300」）。文字全部寫在 source 字串裡，會被 xcstrings 自動萃取。
- ✅ `InvestmentRecordEditorView` 在「基本資訊」section 內、`動作` picker 下方加 `actionExplanationBlock`：info icon + 說明 + 灰字例子，切換 action 即時更新。
- ✅ Capital reduction 走 `brokerCaveat`：用 warning 三角圖示 + 「採『保留總成本』估算，券商常以『現金退還沖抵成本』，數字可能不同」一行字呈現，把 HANDOVER 對 FIFOCalculator 的語意註記搬到 UI。
- ✅ 順手清掉 `分割比例` section 內重複描述（"套用後…"），因為新的 example 已具體說明同一件事。

### 4.6 Transactions / CashFlow 既有摩擦 — `[H]` ✅
- ✅ **Checkbox 衝突解法**：採 iOS Mail 風格的「選取模式」。Toolbar 加 `選取` 按鈕，按下後 `isInSelectionMode = true`，每列才會出現 leading 邊的 `SelectionCheckmark`；點擊列在選取模式下變成 toggle，不再開編輯器。`完成` 退出。`TransactionRecordCard` 與 CashFlow 的三種 row variant（single / split / transfer）都吃 `isInSelectionMode + isSelected + onToggleSelection` 三個參數。`TransactionRecordCard` 原本永遠顯示的 checkbox 移除；非選取模式下 inline 的 `Mark reviewed` 按鈕保留，選取模式下隱藏避免和 bulk 動作搶 tap。
- ✅ **收據全螢幕預覽**：新元件 [ReceiptPreviewView.swift](Sources/NorthstarApp/UI/Components/ReceiptPreviewView.swift)：黑底全螢幕，pinch / drag 縮放、雙擊放大 / 還原、`Reset` 按鈕、`X` 關閉。`ReceiptPreviewItem` 是 Identifiable wrapper 讓 host 用 `.sheet(item:)` 呈現；同檔案還有 `ReceiptImage` 跨平台 factory 與 `SelectionCheckmark`。`ReceiptAttachmentSection` 內的 inline 預覽圖也接上同個 sheet（點圖放大）。
- ✅ **列表行收據縮圖**：`ReceiptThumbnail` 元件，圓角小縮圖（22pt for rows、可調 size），解析失敗 fallback 為迴紋針底色；CashFlow 三種 row variant 把原來的 `paperclip` icon 換成縮圖按鈕，點擊呼叫 `onPreviewReceipt(Data)` callback 開 `ReceiptPreviewView`。
- ✅ **批次操作**：
  - `LedgerTransaction` 加 `isReviewed: Bool = false`（SwiftData lightweight migration）。
  - CashFlowView 加 `bulkActionBar`（safeAreaInset）：`改分類` / `已審核` / `刪除`；split / transfer 群組 toggle 時整組視為單一單位，bulk delete 連同 group 內 sibling 一起刪、自動 recompute 帳戶餘額。Bulk `改分類` 走新的 `BulkCategorySheet`，picker + 自訂分類，投資連動列自動略過。
  - TransactionsView 也吃同套模式：`bulkActionBar` 提供 `已審核` + `刪除`（bulk delete 後重算 affected `PortfolioAsset` 的均價）；新增 `選擇全部 / 全不選` toolbar 切換。
- ✅ **全域搜尋**：新檔 [GlobalSearch.swift](Sources/NorthstarApp/UI/AppState/GlobalSearch.swift) 是純函數 helper，吃 accounts / assets / records / ledger / holdings 回傳統一的 `Result` list，每筆有 `kind / title / subtitle / icon / targetTab`，每類最多 5 筆，順序固定。
  - macOS：`NorthstarSidebar.searchResults` 改吃 GlobalSearch，新增 ledger 結果（顯示分類 + 帳戶 + 金額 + 日期）。
  - iOS：Dashboard 加 `.searchable` prompt「搜尋帳戶、持倉、交易或收支」；有輸入時用 `globalSearchResults` 取代原本 grid，每筆是卡片按鈕，點擊透過 `IntentRoutingKeys.selectedTab` 切到對應分頁。後續若要 deep-link 進編輯器，可在 IntentRouting 加 target ID key。

### 4.7 圖表可讀性 — `[H]` + `[新]` ✅
- ✅ HANDOVER 自承：互動 overlay 在 rebased benchmark 上顯示 raw 數字無意義 → 切換到 benchmark 線時顯示「相對變化 %」、隱藏絕對金額。
- ✅ TimeRange 切到 ALL 加 footnote「目前以 Yahoo 1 年 history 為上限」。
- ✅ Dashboard 加一張 **本月敘事卡**：收入 X / 支出 Y / 淨流入 Z / 最大支出類別 W / 投資淨流入 V，把現在散落的卡整合成一句話。

### 4.8 Holdings 列表的排序、篩選與風險提示 — `[新]`
- 排序維度可選：市值 / 報酬率 / 持股比重 / 名稱 / 最近活動。
- 篩選：幣別 / 交易所（TW vs US） / 獲利 vs 虧損。
- **集中度警示**：單一持股佔比 > 30%（threshold 可調）顯示淡色橫條，呼應「方向感」品牌。

### 4.9 Apple 平台原生面 — `[新]`（PRD 第 4 條原則：Native first）
- **Widget**：淨值（小 / 中）、本月收支（小）、單一持股（中）。
- **Spotlight 整合**：讓 ledger / investment record 出現在 Spotlight 搜尋。
- **Local notifications**：定期交易執行當日通知（不是只在啟動時 silent 跑）、月初推送上月結算。
- Live Activity / Watch：列入 backlog，不在 Phase 4 必做。

### 4.10 iOS layout 收尾 — `[H]`
- HANDOVER 自承 iOS 沒被認真 UX 測過。
- TabBar 目前 6 個 tab → iOS HIG 限 5 個，第 6 個會被收進 More。把「設定」做進個人 / 大頭貼選單，或合併 Accounts + Settings。
- iPad 對 NavigationSplitView 與 macOS sidebar 共用程度檢查。
- 跑一次「打開 app → 新增記帳 → 看 Dashboard」三步流程在 iPhone 14/15 mini / Pro Max / iPad 各做一次手動驗收。

### 4.11 i18n 補完 — `[H]`
- 把 Phase 4 各畫面碰到的新字串都丟進 `Localizable.xcstrings`。
- 進行一次 `xcrun extractLocStrings` 大盤掃描，把現存零散字串補齊到至少 80%。

### 4.12 收尾雜項 — `[H]`
- 移除 `DashboardView.statusText`（dead code）。
- 定期交易加「跳過下一次」 / 「立即執行」按鈕。
- 定期交易延伸到 weekly / yearly（等真實使用情境出現再做，不必硬上）。

---

## Phase 5 — 財務深度

當「日常重訪」順了，再把這個 app 真正配得起「north star」之名。

### 5.1 報酬率指標 — `[新]`
- **TWR（時間加權）**：排除進出資金影響，才能跟 0050 / SPY 公平比較。
- **MWR / XIRR**：對 DCA 投資人更貼近實感；Domain 層用 Newton-Raphson 解 IRR。
- **年化報酬、波動率、最大回撤（max drawdown）**：在 HoldingDetail 與 Dashboard hero 卡呈現。
- 全部寫純 Domain 計算 + 對應單元測試。

### 5.2 資產配置 — `[新]`
- `PortfolioAsset` 加 `assetClass`（股 / ETF / 債 / 現金 / REIT）與 `region`（TW / US / 全球 / 其他）欄位。lightweight migration 即可。
- 圓餅圖 / 長條圖按 class、region、currency、sector（先空 sector，要的話 ETF 拆解延後）。
- **目標配置 vs 實際配置**：定義 target weight，畫偏離量；不做自動 rebalance 下單，只給提示。

### 5.3 股利系統升級 — `[新]`
- **預估年股利收入**：以最近 12 個月實際股利為 baseline。
- **股利月曆**：用過去發放月份預測未來 12 個月，呈現 timeline。
- **Yield-on-cost**：股利 / 成本基礎，呈現在 HoldingDetail。
- **DRIP（股利再投資）標註**：勾選 DRIP 的記錄自動補一筆 Buy。

### 5.4 台灣稅務在地化 — `[新]`
- **股利年度歸戶**：本國公司股利合計、可分離課稅 28% vs 合併稅率試算。
- **二代健保補充保費**：單筆股利 ≥ 20,000 元觸發 2.11%，UI 提醒。
- **海外所得 670 萬最低稅負門檻**：年度累計逼近時提示。
- **年度已實現損益報表**：CSV + PDF 出口（給報稅用）。
- 把 `FIFOCalculator` 的結果**持久化**為 `RealizedLot` model（HANDOVER backlog），這層做完後上面才好出報表。

### 5.5 Goals / 北極星數字 — `[新]`（呼應品牌命名）
- 模型：`Goal(name, targetNetWorth, targetDate, baseCurrency)`。
- Dashboard hero 加一條「距離目標 X％」進度。
- 給 FIRE 計算器：目前淨值 + 月儲蓄 + 預期報酬 → 預計達標日。

### 5.6 投資紀錄結構性補強 — `[新]`
- `InvestmentAction.stockSplit` 在 enum 但 calculator 是否真的處理？驗證 + 補測試 + 必要時補實作。
- 加 `broker` 欄位（多券商投資人剛需）。
- `fee` 拆成 `commission` + `transactionTax` + `other`（台股賣方 0.3% 證交稅與手續費分開算對成本基礎有差）。
- 美股投資人：登錄匯款 / 換匯紀錄作為投資成本一部分（連動 5.1 的 TWR 在「台幣計價」下才合理）。
- 公司行動（更名、合併、下市）歷史欄位。

### 5.7 負債端 / 完整淨值 — `[新]`
- `Account` 在 `.loan` / `.credit` 時擴充：本金 / 餘額 / 利率 / 剩餘期數 / 帳單周期。
- Dashboard 多一張卡：下個月卡費預警、貸款剩餘月數。
- 淨值曲線把負債實際拆出來，不要混在一個數字裡。

### 5.8 私人 / 非市價資產 — `[新]`
- 新 model：`PrivateAsset(name, category[房地產/定存/保單/實體黃金/加密], valuation, valuationDate, currency)`。
- 手動更新估值的 UI（每年一次 / 季更新）。
- 計入淨值曲線，但在圖上以較淡顏色標示。

### 5.9 Budget per category — `[H]`
- HANDOVER 既有 backlog：`Budget(category, monthlyLimit)` model。
- CashFlow hero 加進度條、Dashboard 本月支出卡加色帶。
- 超支時用顏色而不是只用數字提示（呼應 Accessibility 原則「不只靠紅綠」）。

### 5.10 資料信任 / 備份 — `[新]` + `[PRD]`
- **iCloud 備份**：local-first 用戶硬碟壞 = 五年資料消失。SwiftData → CloudKit 整合（CloudKit container 走端到端加密路徑）。
- **手動價格覆寫**：當 Yahoo 對某 ticker 回傳爛資料時，使用者可手動 pin 一個價格 + 標註來源。
- **資料快照 / 變更歷史**：改一筆 10 年前的紀錄能看到「之前 vs 現在」。輕量做法是每次 mutate 寫 audit log，不一定要 model versioning。
- PRD 寫的 Supabase E2EE sync 列為長期目標，不在 Phase 5 必做。

---

## Phase 6 — 工程品質與收尾

不直接面向使用者但決定可維護性。

### 6.1 Snapshot 測試 — `[H]`
- 用 Point-Free `swift-snapshot-testing`，覆蓋 Dashboard / Holdings / HoldingDetail / CashFlow / Editor sheets。
- 至少跑一輪 light/dark + Dynamic Type 三種大小。

### 6.2 已實現損益持久化 — `[H]`
- `RealizedLot` model（被 5.4 報表依賴，這裡只是寫進 schema）。

### 6.3 i18n 完整化 — `[H]`
- 跑 `xcrun extractLocStrings` 全量；列出尚未翻譯字串並排程補 en。

### 6.4 macOS / iOS 平台 parity — `[H]`
- 把 `View+PlatformStyles` 漏掉的差異補齊。
- 用 macOS 26 glass 與 fallback 兩條 code path 都要在 CI 驗。

### 6.5 dead code 清理 — `[H]`
- `DashboardView.statusText`、其他 Phase 3 重構後留下的孤兒。

---

## 跨階段原則

- **Domain 邏輯先寫測試**：Phase 5 多數新功能（TWR、XIRR、稅務試算）都是純計算，要從測試起手。
- **每加一個字串都丟進 xcstrings**：避免 Phase 6 又要做一次大盤翻譯。
- **UI 改動實機驗收**：HANDOVER 規矩維持，type-check / unit test 通過不代表 UI 對；改 editor / dashboard / cash flow 之前先想清楚 manual flow，做完跑一次。
- **每個 Phase 結束更新本檔**：完成的 section 改成 ✅ 移到底部 changelog，不要刪。

---

## 來自 HANDOVER 的延續清單對照

| HANDOVER 條目 | 落在本 ROADMAP |
|---|---|
| Budget per category | 5.9 |
| Recurring weekly/yearly | 4.12 |
| Recurring skip-next / run-now | 4.12 |
| Receipt viewer | 4.6 ✅ |
| Persisted realized lots | 5.4 + 6.2 |
| i18n extraction passes | 4.11 + 6.3 |
| TransactionRecordCard checkbox 衝突 | 4.6 ✅ |
| DashboardView.statusText dead code | 4.12 + 6.5 |
| App Intent 缺 add cash transaction | 4.2 |
| Chart overlay benchmark 讀數無意義 | 4.7 |

HANDOVER.md 本身已被移除；工程入門資訊（執行方式、架構決策、Gotchas）已併入 [README.md](README.md)。
