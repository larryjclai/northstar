# Northstar Roadmap

This roadmap is organized into **Now (近期執行)**, **Next (中期規劃)**, and **Later (遠期願景)** to ensure we stay focused on delivering real value while building towards a complete local-first and multi-device finance OS.

## 🟢 NOW (近期執行：核心體驗與細節優化)
*Focus: Refine the local-first experience, improve ledger accuracy, and enhance visual trust.*

### 1. Ledger Refinement (手續費與海外交易)
- **Problem**: 轉帳或跨國消費時常產生手續費，目前無法精準紀錄。
- **User Impact**: 資產餘額能 100% 吻合真實世界，不需靠「誤差調整」來修正。
- **Action**: 
  - 轉帳功能中加入「手續費 (Fee)」欄位。
  - 支出/海外交易加入「外加手續費」紀錄模式。

### 2. Account & Asset Customization (帳戶與客製化資產)
- **Problem**: 現有資產類別太少，且帳戶列表視覺較為單一。
- **User Impact**: 能追蹤房產、貴金屬、汽車等非流動資產，並讓帳戶列表更具個人化辨識度。
- **Action**:
  - 新增「客製化資產 (Alternative Assets)」模組，手動更新市值。
  - 導入 Emoji 或內建 Icon 選擇器來客製化帳戶與分類圖示。

### 3. Visual Trust & Branding (投資標的 LOGO)
- **Problem**: 投資組合列表目前只有文字與數字，缺乏直覺的視覺辨識。
- **User Impact**: 介面更精緻專業，提升使用者對產品的信任感。
- **Action**: 串接公開 Logo API (如 Clearbit) 自動抓取投資標的品牌圖示。

### 4. App Maintenance (內建檢查更新)
- **Action**: 透過 Tauri Updater plugin 實作「Check for update」，讓本地端軟體能無縫升級。

---

## 🟡 NEXT (中期規劃：進階帳務與雲端準備)
*Focus: Handle complex financial instruments and prepare for Connect.*

### 1. Credit Card Reconciliation (信用卡對帳與結帳日提醒)
- **Problem**: 信用卡並非一般現金帳戶，有結帳週期與遞延付款的特性。
- **User Impact**: 幫助使用者準確預估下個月的現金流，避免忘記繳款。
- **Action**:
  - 新增專屬的「信用卡」帳戶類型。
  - 設定結帳日與繳款日，並在 Dashboard 提供「即將到期帳單」提醒。
  - 實作「對帳模式 (Reconciliation mode)」，核對每筆刷卡紀錄與銀行帳單是否吻合。

### 2. Connect Sync Preparation (雲端同步前置作業)
- **Action**: 建立 Mutation Outbox、本地裝置身份驗證，準備迎接多裝置同步。

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
