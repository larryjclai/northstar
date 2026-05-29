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
- **其他修復** — 子分類內嵌編輯（修 Tauri prompt 失效）、週期交易自動入帳 + 時區修正、跨幣轉帳金額、商家自動分類。

---

## 🟢 NOW (近期執行)
*Focus: 補完雲端同步前置的加密層。*

### 1. Connect Sync Preparation — 剩餘項目
- **已完成**: 裝置身份、待同步變更追蹤（change feed）、設定頁狀態卡。
- **待辦**: 加密同步信封（envelope）序列化、crypto 抽象層與測試；（可選）改用既有 `sync_outbox` 資料表做 write-ahead 紀錄。

---

## 🟡 NEXT (中期規劃)
*Focus: 雲端同步與進階帳務。*

### 1. Connect Sync (雲端同步)
- **Action**: 在前置作業完成後，串接實際的多裝置加密同步。

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
