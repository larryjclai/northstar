# Changelog

All notable changes to Northstar will be documented in this file.

## [0.1.0-alpha.21] - 2026-06-03

### Added
- **可搜尋帳戶篩選**：總覽與記帳頁的「所有帳戶」下拉改為可搜尋、依類型分組、帶圖示的選單（共用 `AccountFilter`），帳戶多時也好找。
- **Phosphor 圖示系統**：帳戶與分類圖示改用內建的 Phosphor 圖示選擇器（含搜尋與分類），取代 emoji；舊有 emoji 資料仍可正常顯示。

### Improved
- **背景自動同步收尾**：套用遠端變更後自動刷新畫面；設定頁顯示「同步中…」與「上次同步：X 秒前」即時狀態。
- **Recovery Kit 安全守門**：未備份並確認備援碼前，雲端同步不會啟動（自動同步靜默等待、手動同步停用並提示），避免在未備份金鑰下啟用雲端功能。

### Fixed
- 移除未使用的 `emoji-picker-react` 依賴；散落的裝飾性符號改用 Phosphor 圖示。

---

## [0.1.0-alpha.20] - 2026-06-03

### Added
- **投資配股與減資**：投資交易支援記錄「股票股利（配股）」與「現金減資」，正確調整股數與平均成本。

### Improved
- **對帳金額語意**：信用卡對帳區分「帳單總刷卡額」與「淨額」，金額呈現更清楚。
- **FIRE 一致性**：報酬基準統一、提供 3 種情境的達成機率，並把所得通膨納入試算。

---

## [0.1.0-alpha.19] - 2026-06-03

### Added
- **目標 HeroCard 可切換**：上方目標卡可自選要呈現哪一個進行中的目標；FIRE 顯示退休預估曲線，一般目標改顯示「目前淨值 / 目標金額」進度。預估趨勢圖補上 X／Y 軸刻度、提示與目標參考線。
- **信用卡對帳分期**：對帳頁依結帳日把交易切成各期帳單，預設只展開本期、歷史各期可折疊；已繳款期別標示並與本期分離，上一期繳完即可獨立核對。
- **應收／應付提醒**：總覽與記帳頁新增未結清「應收 / 應付帳款」提醒 widget。
- **投資定期定額 / 定期定股**：投資頁新增「定期定額」分頁，可設定週期、金額或股數與扣款（交割）帳戶；到期時於總覽與投資頁提醒備妥交割款，一鍵記錄即建立買入並扣交割款。

### Improved
- **目標編修**：由鉛筆進入會帶入現有設定值，按鈕改為「儲存變更」並原地更新，不再誤建新目標。
- **帳戶列表**：移除每列占比長條，版面更乾淨、餘額對齊。

---

## [0.1.0-alpha.18] - 2026-06-02

### Fixed
- 端到端自動更新驗證版本（確認 alpha.17 起的 in-app updater 能正確偵測並安裝新版）。

---

## [0.1.0-alpha.17] - 2026-06-02

### Fixed
- **自動更新**：修正 in-app updater 一直顯示「已是最新版本」的問題。更新來源改為公開的 `northstar-releases` repo（原始碼維持 private），讓 updater 能正常抓到新版本與簽章。此版起安裝的版本之後都能自動更新。

---

## [0.1.0-alpha.16] - 2026-06-02

### Added
- **交易紀錄篩選**：投資的「交易紀錄」分頁新增「交易種類」「券商」兩組多選下拉篩選，並把轉帳到券商的入金紀錄一併納入列表，每筆顯示幣值與券商。
- **帳戶 → 記帳直達**：在帳戶頁點擊帳戶名稱，會跳到記帳頁並自動篩選該帳戶的交易。

### Improved
- **同步衝突中心**：同 revision 的差異改為依編輯時間自動裁決（新的覆蓋舊的），只有真正同時間的衝突才會列出；衝突卡片改為可讀（實體、標題、哪一版較新、逐欄位差異），並新增「全部保留本機／全部採用遠端」批次處理。
- **持倉 KPI 數字**：依介面語言以萬/億或 K/M 精簡顯示，數字不再被裁切。
- **市值排行**：以換算後的本位幣（TWD）排序，USD 部位不再被當小數。
- **總覽淨值卡片**：尚無趨勢時收合成精簡提示，不再佔用大片空白；資產配置圖例在窄螢幕不再溢位。
- **持股詳情**：趨勢圖與 Your Position 卡片等高對齊；無交易紀錄時，持倉天數改從新增持倉日期起算。

### Fixed
- 投資「交易紀錄」分頁移除重複的新增按鈕（保留 Header 的 Buy / Sell）。
- 持倉配置圓餅圖的提示文字在暗色佈景下不再被吃掉；過長的公司名稱會截斷並提供完整名稱提示。

---

## [0.1.0-alpha.5] - 2026-05-29

### Added
- **互動式分類 Donut 圖表**：記帳頁面右側新增可點擊的圓餅圖，直觀呈現各分類支出佔比。點擊任一扇區即可快速篩選該分類的交易明細。
- **分類篩選**：記帳頁面新增分類下拉篩選器，可單獨或搭配帳戶篩選使用，讓你快速聚焦特定類別的支出。
- **交易詳情面板**：點擊任一交易後會滑入詳情側面板，完整呈現金額、分類、商家、帳戶、日期等資訊。從面板可直接編輯或刪除交易。
- **分類管理 Drawer 正式啟用**：記帳頁面的「分類管理」按鈕現在會正確開啟分類管理側欄，可直接新增、重命名、刪除分類與子分類。
- **分類頁面升級**：分類總覽頁面的圓餅圖現在可點擊篩選，分類圖示改用 emoji 呈現，並可直接開啟分類管理。

### Improved
- **圖表互動連動**：Donut 圖表、分類清單、篩選下拉選單三者雙向同步——點擊任一處都會同步更新其他元件的狀態。
- **多國語系基礎設施 (i18n)**：側邊欄導覽與設定頁面已套用 react-i18next，支援繁體中文和英文切換。
- **設定頁面重構**：全新雙欄式設定介面，包含分類、商家、匯率、一般設定四大分頁。

---

## [0.1.0] - 2026-05-28

### Added
- **Global Search**: Instantly find specific transactions, accounts, and holdings across your entire financial life with a new unified search bar.
- **Cash Flow Entry Drawer**: Seamlessly record income and expenses without losing your place. The new slide-out drawer makes data entry fast and frictionless.
- **Holdings Detail View**: Dive deeper into your investments. You can now tap into individual holdings to see their performance and transaction history in one place.
- **FIRE Calculator**: Plan your financial independence. A new built-in calculator helps you visualize your trajectory to retirement based on your current savings rate and net worth.

### Improved
- **Modernized Interface**: We've completely overhauled the visual design to provide a cleaner, more accessible, and premium feel across the entire application.
- **App Shell Experience**: Navigation is now smoother and more intuitive, keeping your most important financial tools just one click away.
