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
- **Connect Sync — 加密層 + Worker + 配對 UI** — Cloudflare Worker + D1 relay（`northstar-sync.larrynote.workers.dev`）；AES-GCM-256 vault key；PBKDF2 短配對碼（`XXXX-XXXX`）+ QR Code 雙路徑；push/pull encrypted envelopes；設定頁完整裝置管理 UI（啟用、顯示配對碼、輸入配對碼、撤銷裝置）。
- **其他修復** — 子分類內嵌編輯（修 Tauri prompt 失效）、週期交易自動入帳 + 時區修正、跨幣轉帳金額、商家自動分類。

---

## 🟢 NOW (近期執行)
*Focus: 補完 Connect Sync 的完整資料同步，讓變更真正在裝置間流動。*

### 1. Connect Sync — 完整 Record Payload 同步
- **已完成**: Cloudflare Worker relay、加密 envelope 傳輸、裝置配對 UI、push/pull 架構。
- **待辦**:
  - **Full record serialisation** — 目前 push 的 payload 只有 `PendingChange` metadata（entity + entityId + revision），尚未包含完整的 record 欄位。需為每個 entity type 加上 `getById` 查詢，把完整資料序列化後加密打包。
  - **Pull apply** — pull 下來的 envelopes 解密後，需 upsert 進本地 SQLite（目前只有 log，尚未實際寫入）。
  - **Conflict resolution** — 以 `revision` 為版本號，last-write-wins；刪除（`deletedAt`）優先。
  - **Recovery Kit** — 產生並確認一次性備援碼（已在 `policies.ts` 定義為前置條件，但 UI 尚未實作）。

---

## 🟡 NEXT (中期規劃)
*Focus: 同步穩定性、背景自動同步、進階帳務。*

### 1. Connect Sync — 背景自動同步
- **Action**: 在 Tauri 的 background task 或 app focus 事件觸發 push/pull，讓使用者不需手動同步。
- **前置條件**: 完整 record payload 同步完成。

### 2. Recovery Kit UI
- **Action**: 設定頁加入「產生備援碼」流程（12 組隨機字，下載或列印），確認後才能啟用雲端功能。確保 `canEnableCloudBackedFeature` 的前置條件在 UI 上被強制執行。

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
