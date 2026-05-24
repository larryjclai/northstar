# Northstar — Liquid Glass Redesign

> 狀態：草案 v1（2026-05-18）
> 觸發：Phase 4 功能告一段落，主畫面與編輯 sheet 看起來「太 raw」（macOS Form 預設樣式 + 未套用 Liquid Glass）。
> 目標：在進入 Phase 5（財務深度）之前，把整體 UI 升級到 Liquid Glass 視覺語言，且不破壞既有功能。

---

## 1. Goals / Non-Goals

### Goals
- 整個 App 在 **iOS 26+ / macOS 26 Tahoe+** 上採用 Liquid Glass 材質，視覺一致。
- 把編輯類 sheet（新增收支、編輯帳戶、轉帳、投資紀錄、定期收支）從原生 `Form` 升級為 **glass card 群組** 的版型。
- 主畫面 list rows、navigation chrome、toolbar 加入 glass 材質，但不過度（保留可讀性、不讓資訊背景被質感蓋過）。
- **舊系統 graceful fallback**：iOS 25 / macOS 25 以下走目前的 `Color.nsSurface + border` 路徑，已內建在 [`northstarCardSurface()`](../../Sources/NorthstarApp/UI/Views/View+PlatformStyles.swift:50)。

### Non-Goals
- 不改 Domain / 資料層。純 View 層改動。
- 不重做色票（`NorthstarTheme`）。Liquid Glass 自帶 vibrancy；如果有色彩衝突再微調。
- 不換 navigation 結構（`TabView` on iOS / `NavigationSplitView` on macOS 維持）。
- 不引入第三方 UI library。

---

## 2. Design Principles

1. **Content over chrome**：玻璃是背景，不是主角。資料（金額、分類、日期）永遠比材質明顯。
2. **Glass groups, not glass everything**：把相關欄位放進同一張 glass card；不要每個欄位獨立浮一塊。
3. **One picker style per role**：segmented = semantic switch；dropdown = selection from many；chip = quick shortcut。不混用。
4. **Inverted hierarchy fix**：使用者來這個 modal 的主要目的是輸入**金額**——金額必須是 sheet 中視覺最重的元素。
5. **Fallback first，glass second**：所有新元件先寫舊系統能跑的樣式，再加 `if #available(iOS 26.0, macOS 26.0, *)` 升級。

---

## 3. Current State Audit

| Surface | 目前狀態 | Glass 套用？ |
|---|---|---|
| Dashboard cards | `northstarCardSurface()` 已套 | ✅ Glass on 26+ |
| Transactions list rows | `northstarCardSurface()` 已套 | ✅ |
| Holdings cards | `northstarCardSurface()` 已套 | ✅ |
| CashFlow summary cards | `northstarCardSurface()` 已套 | ✅ |
| **TransactionEditor sheet**（新增/編輯收支） | 純 `Form` + `Section` | ❌ 主要痛點 |
| **AccountEditorView** | `Form` | ❌ |
| **TransferEditorView** | `Form` | ❌ |
| **InvestmentRecordEditorView** | `Form` | ❌ |
| **RecurringTransactionsView** 編輯 sheet | `Form` | ❌ |
| AccountsView 列表 | `List` 預設 | ❌（list rows 沒上玻璃） |
| Sidebar (macOS) | `NorthstarSidebar` 自訂 | ❌ |
| Toolbar buttons (＋、勾選、匯入) | 系統預設 | ❌ |
| DateQuickPickStrip chips | 純 Capsule + accent fill | ❌（chip 風格與主題不統一） |

**痛點熱區排序**：
1. 編輯 sheet（5 個檔案，看到使用者最痛的就是新增收支）
2. List rows 在主畫面之間視覺斷層（Dashboard 有 glass，AccountsView 沒有）
3. Sidebar/toolbar 玻璃感缺席，整體不像「同一個 app」

---

## 4. Liquid Glass Primer（給未來實作者）

### API 速查
```swift
// 單一元件玻璃
.glassEffect(.regular, in: RoundedRectangle(cornerRadius: 16, style: .continuous))

// 多元件 morphing 群組（chips、tab bar 等）
GlassEffectContainer(spacing: 12) {
    HStack { chip1; chip2; chip3 }
}

// Tinted glass（強調色 + 玻璃）
.glassEffect(.regular.tint(NorthstarTheme.accent.opacity(0.25)),
             in: Capsule())

// Interactive（受 hover/press 影響的玻璃）
.glassEffect(.regular.interactive(), in: ...)
```

### Variants
| Variant | 用途 |
|---|---|
| `.regular` | 預設。卡片、sheet 背景。 |
| `.regular.tint(...)` | 強調用 chip、被選中的 segment、CTA 按鈕。 |
| `.regular.interactive()` | hover/press 時要有玻璃反應的元件（按鈕、可點 row）。 |
| `.clear`（避用） | 太透明，文字可讀性差。 |

### Fallback 模式（專案現行做法，保留沿用）
```swift
if #available(iOS 26.0, macOS 26.0, *) {
    view.glassEffect(.regular, in: shape)
} else {
    view.background(Color.nsSurface, in: shape)
        .overlay { shape.stroke(Color.nsBorder.opacity(0.55), lineWidth: 1) }
}
```
已封裝在 `northstarCardSurface()`，新元件直接呼叫。

### Performance 注意
- `GlassEffectContainer` 內最多放 ~6 個元件，超過會掉幀。
- 不要在 `List` 的每個 row 都套 `.glassEffect`，改用單一容器 + cell 透明背景。
- 動畫時的 glass morphing 不能跨 `GlassEffectContainer` 邊界。

---

## 5. Component-Level Redesign

### 5.1 TransactionEditor（最高優先）

目前長相見 [CashFlowView.swift:1449-1559](../../Sources/NorthstarApp/UI/Views/CashFlowView.swift:1449)。Critique 摘要：
- 金額（最重要欄位）被埋在第 6 列、字最小
- 4 個 quick date chip + DatePicker stepper 重複佔位
- 最近用過 chips 與 分類 Picker 功能重疊
- Section 標題太「系統設定」感

#### 新版 Layout

```
┌─────────────────────────────────────┐
│  新增收支                        ✕  │  ← Toolbar with close
│                                     │
│  ┌─────────────────────────────┐   │
│  │  [收入] [支出] [轉帳/調整]  │   │  ← Hero segmented (large)
│  └─────────────────────────────┘   │
│                                     │
│  ┌─ Identity card (glass) ──────┐  │
│  │  帳戶  Firstrade · TWD   ⌄  │  │
│  │  分類  [伙食] [交通] [購物]  │  │  ← chips = primary
│  │        ⌄ 更多分類            │  │  ← dropdown collapsed
│  │  日期  本週一 · 5/18  ⌄      │  │  ← single combined row
│  └──────────────────────────────┘  │
│                                     │
│  ┌─ Amount card (glass, tinted)─┐  │
│  │                               │  │
│  │      $  ___________  TWD     │  │  ← HERO: huge digits
│  │      = $235（如有算式）      │  │
│  │                               │  │
│  │      ⊕ 拆分明細              │  │  ← icon-only toggle
│  └──────────────────────────────┘  │
│                                     │
│  ┌─ Meta card (glass) ──────────┐  │
│  │  備註  ___________           │  │
│  │  收據  📎 從檔案加入         │  │
│  └──────────────────────────────┘  │
│                                     │
│         [Cancel]      [Save]        │  ← Glass tinted CTA
└─────────────────────────────────────┘
```

#### 主要決策
- **沒有 Form / Section**：改用 `ScrollView { VStack { ... } }` 配 3 張 `northstarCardSurface()`。
- **金額卡片**用 `tint(accent.opacity(0.15))`，視覺最重。
- **DateQuickPickStrip** 與 `DatePicker` 合併成一個「本週一 · 5/18」row，點開為 popover；chips 留在 popover 上方。
- **分類 chips** 變主要輸入；下方加可摺疊「更多分類…」露出舊的完整 Picker。
- **拆分明細**：從 toggle + 解說字變成金額卡片右下的 icon button，點下去金額卡片才展開拆分行。
- **macOS 視窗寬度**：當前 modal ~540pt，新版維持 540pt 寬，預估高度 ~620pt（拆分前）。

### 5.2 其他 Editor sheets（AccountEditor / TransferEditor / InvestmentRecordEditor / Recurring）

統一套用「**Identity card + Money card + Meta card**」三段式骨架；不一定每張都用到三段，但是用 glass card 取代 `Form Section`。

實作技巧：
- 抽出一個 helper：`GlassFormCard<Content>` view，內部就是 `VStack(spacing: 12) { content }.padding(16).northstarCardSurface(cornerRadius: 16)`。
- 編輯 sheet 共用一個 wrapper：`SheetCardLayout { ... }`，處理 scroll + bottom CTA + macOS 視窗 sizing。

### 5.3 List Rows（Transactions / Accounts / Holdings / Recurring）

問題：Dashboard 上每張卡是 glass，進入 Accounts 變成系統 `List` 灰白底——斷層感。

策略：
- iOS：`List` 用 `.listRowBackground(Color.clear)` + `.scrollContentBackground(.hidden)`，外層 ZStack 鋪 `Color.nsBackground`，每個 row 用 `.northstarCardSurface()` 包起來。
- macOS：考慮 `List` 改 `ScrollView + LazyVStack`，因為 macOS `List` 的 hover/selection 樣式跟 glass 不好搭。
- **每 row 一張 glass 不行**（performance），所以採用「**整個 list 區段一張大 glass**，row 本身透明 + selection 用 `tint glass`」。

### 5.4 Navigation Chrome

#### macOS Sidebar
- `NorthstarSidebar` 內層 `List` 設透明 background，外層套 `.glassEffect(.regular)`（macOS 26 sidebar 預設就是 glass，但要確認自訂 sidebar 也套上）。
- Sidebar selection 行用 `.glassEffect(.regular.tint(accent.opacity(0.25)).interactive())`。

#### iOS TabView
- iOS 26 `TabView` 預設就是 Liquid Glass tab bar。確認沒被 custom modifier 破壞即可。
- Tab icon 上 badge 用 `.glassEffect()` 包小圓 badge。

#### Toolbar
- 主要 toolbar buttons（＋、勾選、上傳、下載）改用 `.buttonStyle(.glass)`（macOS 26 / iOS 26 新 style）。
- Fallback：iOS 25 / macOS 25 維持 `.borderless`。

### 5.5 Chips（DateQuickPickStrip + Recent Category）

當前兩者都是 filled `Capsule` + `accent`，看起來同款但行為不同：
- **Date quick chip**：transient action（按下後跳到那天，chip 自身不持續高亮）→ 改為 **outlined glass chip**，按下播一個 morph 動畫到 DatePicker。
- **Recent category chip**：persistent selection → 維持 **filled tinted glass**，selected 狀態加亮邊框。

兩種放在 `GlassEffectContainer` 裡，獲得 morphing 動畫加成。

### 5.6 Buttons & CTAs

- 主 CTA（儲存、更新）：`.buttonStyle(.glassProminent)` 或 `.glassEffect(.regular.tint(accent))` + 白字。
- 次要（取消）：`.buttonStyle(.glass)` 無填色。
- Disabled 狀態：玻璃保留，內容 opacity 0.4，加 helper text 解釋為何 disabled。

---

## 6. Tokens & Theme

`NorthstarTheme` 不動。新增三個語意 token 在同檔案：

```swift
extension NorthstarTheme {
    static let glassCornerCard: CGFloat = 16
    static let glassCornerChip: CGFloat = 999    // capsule
    static let glassTintStrength: Double = 0.18  // tint opacity baseline
}
```

---

## 7. Phasing（建議切成 3 個 PR）

### Phase 4.5a — Editor Sheet Redesign ✅
- [x] 抽 `GlassFormCard` / `FieldRow` / `SheetCardScroll` helper（[Components/GlassFormCard.swift](../../Sources/NorthstarApp/UI/Components/GlassFormCard.swift)）
- [x] 重做 TransactionEditor（金額升 hero、3 段卡片：Identity / Amount / Meta）
- [x] 同步重做 TransferEditor / AccountEditor / InvestmentRecordEditor / Recurring sheet
- [x] xcstrings：未新增字串（保留既有 key）
- [ ] 螢幕截圖前後對照放 PR（手動拍）

### Phase 4.5b — List & Nav Chrome ✅
- [x] List rows：盤點後發現 AccountsView / TransactionsView / CashFlowView / DashboardView / HoldingsView 早已是 `ScrollView + LazyVStack + northstarCardSurface()`。僅 `RecurringTransactionsView` 主畫面仍用 `Form`，已轉成 glass card scroll。
- [x] Sidebar selection 玻璃化（`northstarSelectionSurface` modifier，iOS 26+/macOS 26+ 為 tinted glass，舊系統 fallback 為實心藍）
- [x] Toolbar buttons：iOS 26 / macOS 26 預設已套 glass；提供 `northstarToolbarGlass()` helper 供顯式 opt-in，未強制套用所有現有 button
- [x] DateQuickPickStrip 改為 transient outlined chip（無 sticky selection）；RecentCategory chip 維持 filled tinted，共用 `northstarChipStyle(.transient / .sticky)`

### Phase 4.5c — 細節打磨 ✅
- [x] Disabled state inline microcopy：每個 editor 暴露 `disabledReason: String?`，底部統一 `DisabledHintBanner` 顯示具體原因（「請選擇帳戶」「輸入金額後即可儲存」等）
- [x] Reduce Transparency / Dark mode：audit 後確認 `.glassEffect()` 與 SwiftUI Materials 都會自動 fallback；tinted card 是平面 alpha fill 不受影響；`NorthstarTheme` 文字色與 surface 已 dark-mode adaptive。無需新增 env 檢查。
- [ ] hover/press interactive glass on macOS — 保留為後續打磨（`.glassEffect(.regular.interactive())`）
- [ ] before/after 截圖 — 手動拍

完工標準：在 macOS Tahoe 與 iOS 26 模擬器上，**Dashboard / Cash Flow / Accounts / Holdings / 任一編輯 sheet** 視覺一致。

---

## 8. Validation

- **視覺**：自己拍 before/after 對照圖，每張表面（dashboard、list、sheet）一組。
- **效能**：用 Instruments / Xcode View Debugger 看 sheet 開啟動畫是否掉幀（目標 ≥58fps）。
- **可用性**：自己用 1 週，記錄三個常見場景時間：
  - 新增一筆便當（< 8 秒）
  - 編輯昨天那筆改金額（< 6 秒）
  - 拆分一張家樂福收據成兩個分類（< 25 秒）
- **Accessibility**：開啟 Reduce Transparency 確認所有 glass surface 都 fallback 到 `Color.nsSurface`。

---

## 9. Open Questions

1. macOS `List` 要不要換成 `LazyVStack`？影響到既有的 swipe action / context menu，需要先小範圍測。
2. 拆分明細展開後高度爆炸的 sheet — 要不要改 modal sheet → `.sheet(detents: ...)`？iOS 才有，macOS 不適用。
3. `Capsule` chip 的 `GlassEffectContainer` 在橫向 scroll 內表現？目前 DateQuickPickStrip 不 scroll，但 RecentCategoryStrip 是 horizontal ScrollView。
4. 是否要先做一個 `DesignTokens.swift` 統一所有 spacing / corner radius，趁 redesign 一起整理？

---

## Change Inventory（4.5a + 4.5b + 4.5c 實際動到的檔案）

新檔
- `Sources/NorthstarApp/UI/Components/GlassFormCard.swift` — `GlassFormCard` / `FieldRow` / `SheetCardScroll` / `DisabledHintBanner` / `NorthstarChipRole` enum / `.northstarChipStyle` / `.northstarToolbarGlass` / `.northstarSelectionSurface`

改檔
- `Sources/NorthstarApp/UI/Components/DateQuickPickStrip.swift` — transient outlined chip，移除 sticky selection
- `Sources/NorthstarApp/UI/Views/CashFlowView.swift` — `CashFlowEditorView` 3 段卡片 + hero 金額 + 拆分按鈕 + disabledReason + DisabledHintBanner；`recentCategoryChip` 改用 shared chip style；移除 dead `recentCategoryStrip`/`splitLinesSection`
- `Sources/NorthstarApp/UI/Views/TransferEditorView.swift` — 3 段卡片 + hero 來源/目標金額 + disabledReason + Banner
- `Sources/NorthstarApp/UI/Views/AccountEditorView.swift` — 2 卡片（基本資訊 + tinted 開帳金額）+ disabledReason + Banner
- `Sources/NorthstarApp/UI/Views/InvestmentRecordEditorView.swift` — 6 卡片 + tinted 交易數值/分割比例 + disabledReason + Banner
- `Sources/NorthstarApp/UI/Views/RecurringTransactionsView.swift` — 主畫面 Form → ScrollView+glass cards；editor 同 4.5a 改卡片 + disabledReason + Banner
- `Sources/NorthstarApp/UI/Views/RootView.swift` — `sidebarButton` 選中態用 `northstarSelectionSurface`
- `northstar.xcodeproj/project.pbxproj` — 註冊 `GlassFormCard.swift` 到 iOS + macOS targets

未動
- `Sources/NorthstarApp/UI/Theme/NorthstarTheme.swift` — 色票既有，dark-mode 已支援
- `Sources/NorthstarApp/UI/Views/SettingsView.swift` / `AccountReconcileView.swift` / `CashFlowView` BulkCategorySheet — 仍用 `Form`，屬於設定/小型對話框；本期不在 scope，視覺上不影響 daily flow
- Domain / Test 層完全沒動，130 tests 維持綠燈

## 10. Related Files

- 樣式 helper：[Sources/NorthstarApp/UI/Views/View+PlatformStyles.swift](../../Sources/NorthstarApp/UI/Views/View+PlatformStyles.swift)
- 主要痛點 sheet：[Sources/NorthstarApp/UI/Views/CashFlowView.swift:1449](../../Sources/NorthstarApp/UI/Views/CashFlowView.swift:1449)
- Sidebar / Nav：[Sources/NorthstarApp/UI/Views/RootView.swift:334](../../Sources/NorthstarApp/UI/Views/RootView.swift:334)
- 主題 token：`Sources/NorthstarApp/UI/Theme/NorthstarTheme.swift`
- ROADMAP 入口：[ROADMAP.md](../../ROADMAP.md) Phase 4.5 區塊
