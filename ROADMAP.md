# Northstar Roadmap

This roadmap is organized into **Now (近期執行)**, **Next (中期規劃)**, and **Later (遠期願景)** to ensure we stay focused on delivering real value while building towards a complete local-first and multi-device finance OS.

## ✅ SHIPPED (已完成)
*以下項目已實作並合併進 main。*

- **Ledger Refinement (手續費與海外交易)** — 轉帳手續費欄位、海外支出「外加手續費」模式（自動產生連結的手續費分錄）。
- **Account & Asset Customization (帳戶與客製化資產)** — 新增「實體資產」帳戶類型（手動更新市值、Dashboard 獨立淨值卡），帳戶 Emoji/顏色客製化。
- **Visual Trust & Branding (投資標的 LOGO)** — `AssetLogo` 元件，依 ticker 抓品牌圖、失敗退回字母標記；**預設關閉**，設定中可開啟（含隱私風險提示）。
- **App Maintenance (內建檢查更新)** — 接上 Tauri Updater + process plugin 與「檢查更新」按鈕；發佈簽章/endpoint 設定見 `HANDOVER.md §11`。
- **Credit Card Reconciliation (信用卡對帳與結帳日提醒)** — 結帳日/繳款日欄位、Dashboard 繳款提醒、對帳模式（逐筆勾選核對）。
- **Quick Add (快速記帳)** — ⌘N 全域自然語言輸入列，解析支出/收入/投資買賣 → 預填確認後送出；側邊欄按鈕 + 手機 FAB 入口。
- **Connect Sync 前置（裝置身份 + 變更追蹤）** — 本地裝置身份；以既有 SyncFields 推導的待同步變更清單（含軟刪除）；設定頁「Connect 同步 · 準備中」狀態卡。
- **Dashboard 卡片高度一致** — 淨值卡改為 flex column，圖表 `flex:1` 填滿高度，與右側 KPI stack 等高無空白。
- **Connect Sync — 加密層 + Worker + 配對 UI** — Cloudflare Worker + D1 relay（`northstar-sync.larrynote.workers.dev`）；AES-GCM-256 vault key；PBKDF2 短配對碼（`XXXX-XXXX`）+ QR Code 雙路徑；push/pull encrypted envelopes；設定頁完整裝置管理 UI（啟用、顯示配對碼、輸入配對碼、撤銷裝置）。
- **Connect Sync — Full Record Payload + Recovery Kit** — push 帶完整 record 序列化；pull 解密後 last-write-wins merge 寫回 SQLite；Recovery Kit（64-char hex，下載 .txt，確認流程）。
- **其他修復** — 子分類內嵌編輯（修 Tauri prompt 失效）、週期交易自動入帳 + 時區修正、跨幣轉帳金額、商家自動分類。
- **Connect Sync — 背景自動同步** — app focus（`tauri://focus`）與啟動時自動執行 `pushPendingChanges` + `pullAndApply`（60 秒冷卻、與手動同步共用互斥鎖）；套用遠端變更後自動 invalidate React Query 快取讓畫面即時更新；設定頁「同步中…」spinner 與「上次同步：X 秒前」即時相對時間。
- **介面精修（UI Polish）** — 帳戶篩選改為可搜尋 / 分組 / 帶圖示的 Combobox（取代原生 `<select>`，Dashboard + 記帳共用 `AccountFilter`）；以 Phosphor 圖示系統（`src/lib/icons.tsx` + `IconPicker`）取代 emoji 作為帳戶 / 分類圖示，舊 emoji 資料向後相容渲染；移除 `emoji-picker-react` 依賴；散落的裝飾性符號（📊 ⚠ ✓）改用 Phosphor 圖示。
- **Recovery Kit 強制前置條件** — 同步在 `runSync` 層集中守門，未確認備援碼前 push/pull 一律擋下（`RECOVERY_KIT_REQUIRED`）；自動同步在未確認時靜默略過、手動同步按鈕停用並顯示守門提示；配對加入的裝置自動視為已備份（繼承主裝置金鑰）；設定頁「待備份備援碼」狀態 + 守門橫幅。對應 `policies.ts` 的 `canEnableCloudBackedFeature`。

---

## 🟢 NOW (近期執行)
*Focus: 散佈與安裝體驗。*

### 1. Apple Notarization（解決 AirDrop 安裝問題）
- **Problem**: AirDrop 傳送的 `.app` 會被 macOS Gatekeeper 標記為「已損壞」，需要手動執行 `xattr -cr` 解除。
- **Action**: 設定 Apple Developer 帳號、codesign + notarize Tauri 打包流程，讓 `.app` 可直接在任何 Mac 上開啟。

---

## 🟡 NEXT (中期規劃)
*Focus: 穩健性與進階帳務。*

### 1. 持續介面精修
- 其他下拉選單（分類篩選、幣別、週期）一致化為帶搜尋 / 分組的元件。
- 圖示選擇器導入「最近使用」與更多分類圖示。

---

## 🔴 LATER (遠期願景：跨平台與家庭協作)
*Focus: Expand to new platforms and multi-user environments.*

### 1. Mobile Expansion (iOS App 開發上架)
- **Problem**: 目前依賴電腦，無法隨時隨地記帳。
- **User Impact**: 實現真正的「消費當下立即記帳」，完整使用者的記帳習慣。
- **Action**:
  - 針對手機重新設計 Touch-friendly 介面。
  - App Store 上架與 ASO 最佳化。
  - **前置條件**：必須先完成 Connect Sync (雲端同步)，否則手機與電腦資料無法連動。

### 2. Household Sharing (家庭財務協作)
- **Action**: 建立家庭空間，讓伴侶可以共同檢視或編輯指定的帳戶與資產。
