# 

GeoFlow Finance 產品開發規格書 (PRD)

這份文件彙整了關於 GeoFlow Finance 的產品定位、技術架構、資料模型以及開發策略。本專案旨在結合 Copilot Money 的美學與 Wealthfolio 的投資深度，並針對台灣股市進行在地化優化。

## **1\. 產品願景與設計哲學**

* **產品定位**：Privacy First 的全資產管理與投資追蹤工具。  
* **設計風格**：  
  * **沉浸式體驗**：深色模式為主、大面積卡片設計、流暢的微動畫與 Haptic 反饋。  
  * **極簡美學**：內容優先、非對稱留白、無框線設計，減少視覺雜訊。  
* **核心架構**：Local-First 優先。數據存於裝置本地，同步採端到端加密 (E2EE)，確保絕對隱私。

## **2\. 核心功能規格 (MVP 階段：投資追蹤)**

### **A. 投資帳戶管理 (Portfolio Tracking)**

* **資產錄入流程**：  
  1. 於投資頁面觸發「新增買入紀錄」。  
  2. 系統提示選擇「扣款帳戶」（現金/銀行帳戶）。  
  3. 自動於投資組合增加庫存，並連動於銀行帳戶產生對應支出紀錄，維持淨資產平衡。  
* **台灣股市在地化邏輯**：  
  * 支援 **現金股利** 與 **股票股利 (配股)** 的獨立紀錄。  
  * **配股自動平攤成本**：輸入配股數量後，系統自動調降平均持倉單價。  
  * 支援 **減資** 紀錄與成本重算。  
* **多幣別與匯率支援**：  
  * 使用者可自定義本位幣 (例如 TWD)。  
  * 即時抓取匯率：顯示原始幣別損益，以及折算為本位幣的總價值。

### **B. 報表與視覺化 (Dashboard)**

* **自定義趨勢圖**：使用者可自由切換視圖，選擇顯示「總淨資產曲線」、「特定資產類別曲線」或「單一標的歷史走勢」。  
* **績效對比**：支援將個人投資組合績效與大盤 (如 0050, SPY) 進行漲幅對比。

## **3\. 技術架構與 API 策略**

### **核心技術棧 (Tech Stack)**

* **前端開發**：SwiftUI (共享 iOS, macOS, iPadOS 核心邏輯與 UI 元件)。  
* **本地資料庫**：SwiftData。  
* **遠端同步機制**：Supabase (作為遠端加密存儲，伺服器端零知識 Zero-knowledge)。

### **API 數據來源策略**

1. **台灣股市**：優先串接 **Fugle (富果) API**，提供盤中即時與歷史行情，JSON 結構現代化且易於解析。  
2. **全球股市與匯率**：使用 **Yahoo Finance API** (非官方 SPM 套件)，處理美股報價與各國匯率更新。  
3. **盤後校正輔助**：**TWSE OpenAPI**，用於每日盤後校正除權息數據與大盤總結。

## **4\. 資料匯入規格 (CSV 範本)**

系統支援一次性大量匯入，採用 UUID 防呆機制避免重複寫入。

### **日常記帳 (Ledger.csv)**

包含基本的收支與帳戶間轉帳。

| Date | Type | Amount | Currency | Category | Account | Note |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| 2026-04-20 | Expense | 150 | TWD | Food | Cash | 午餐 |
| 2026-04-22 | Transfer | 10000 | TWD | Transfer | Bank\_A | 轉帳至證券戶 |

### **投資紀錄 (Investment.csv)**

專注於資產的買賣與股利發放 (Buy, Sell, CashDividend, StockDividend)。

| Date | Ticker | Action | Price | Quantity | Fee | Currency | LinkedAccount |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| 2026-04-15 | 2330.TW | Buy | 800 | 1000 | 20 | TWD | Bank\_A |
| 2026-04-22 | 2884.TW | StockDividend | 0 | 50 | 0 | TWD | None |

## **5\. 核心資料模型 (SwiftData Model)**

`import Foundation`  
`import SwiftData`

`// 日常帳戶模型`  
`@Model`  
`class Account {`  
    `@Attribute(.unique) var id: UUID`  
    `var name: String`  
    `var currency: String`  
    `var balance: Double`  
    `@Relationship(deleteRule: .cascade, inverse: \LedgerTransaction.account)`  
    `var transactions: [LedgerTransaction] = []`  
      
    `init(id: UUID = UUID(), name: String, currency: String, balance: Double = 0.0) {`  
        `self.id = id; self.name = name; self.currency = currency; self.balance = balance`  
    `}`  
`}`

`// 投資組合資產模型`  
`@Model`  
`class PortfolioAsset {`  
    `@Attribute(.unique) var ticker: String`  
    `var name: String`  
    `var currency: String`  
    `var totalQuantity: Double`  
    `var averageCost: Double`  
    `@Relationship(deleteRule: .cascade, inverse: \InvestmentRecord.asset)`  
    `var records: [InvestmentRecord] = []`  
      
    `init(ticker: String, name: String, currency: String) {`  
        `self.ticker = ticker; self.name = name; self.currency = currency`  
        `self.totalQuantity = 0.0; self.averageCost = 0.0`  
    `}`  
`}`

`// 投資交易紀錄模型 (透過 linkedLedgerTransactionID 與日常帳戶連動)`  
`@Model`  
`class InvestmentRecord {`  
    `@Attribute(.unique) var id: UUID`  
    `var date: Date`  
    `var action: String // Buy, Sell, CashDividend, StockDividend`  
    `var price: Double`  
    `var quantity: Double`  
    `var asset: PortfolioAsset?`  
    `var linkedLedgerTransactionID: UUID?`  
      
    `init(id: UUID = UUID(), date: Date, action: String, price: Double, quantity: Double) {`  
        `self.id = id; self.date = date; self.action = action; self.price = price; self.quantity = quantity`  
    `}`  
`}`

## **6\. 商業模式與階段擴展計畫**

* **獲利模式 (Freemium)**：  
  * **基礎免費**：本機手動記帳、CSV 匯入、基礎投資圖表。  
  * **訂閱制 (Pro)**：API 自動即時更新股價與匯率、跨裝置 E2EE 同步、進階資產分析報表。  
* **後續擴展 (Roadmap)**：  
  * **Web 版本**：以 Next.js 打造，於前端實作解密邏輯，讀取 Supabase 上的加密資料，完成跨平台生態系。  
  * **自動化記帳**：整合台灣電子發票 API 與各家銀行 CSV 自動解析器。

## **7\. 專案管理結構建議 (Epic & Issue Tracking)**

為方便後續開發，建議將上述規格拆解為以下 Epic 進行追蹤：

* **\[Epic\] 核心資料庫與本地存儲**：實作 SwiftData Model 與 CRUD 邏輯。  
* **\[Epic\] 投資組合追蹤 (MVP)**：實作手動買賣、股利配發邏輯與成本計算。  
* **\[Epic\] CSV 匯入與防呆機制**：實作 Parser 與預覽確認介面。  
* **\[Epic\] 外部 API 串接**：整合 Fugle 與 Yahoo Finance API。  
* **\[Epic\] 視覺與報表 (Dashboard)**：實作自定義曲線圖與淨值總覽介面。