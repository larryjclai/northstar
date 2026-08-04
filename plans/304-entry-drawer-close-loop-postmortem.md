# Plan 304 — Postmortem：EntryDrawer 動畫關閉的 React #185 迴圈（已修復，記錄防再犯）

- **狀態**：DONE — 修復已合併（PR #36，merge commit `45cbd198`，2026-08-03）。
  本文件是 postmortem + 防再犯規則，不是待派工計畫。
- **症狀**：production build（0.2.0-beta.x）在記帳頁用**動畫路徑**關閉記一筆/編輯抽屜
  （Escape、取消、點遮罩、右上 ✕ — 除「儲存」外的任何關法）→ minified React error #185
  （Maximum update depth exceeded）→ route error boundary 把整頁換成「這個畫面發生問題」。
- **潛伏期**：2026-07-12（`1686d574` 加入 two-phase close）埋雷、2026-07-19（`6be395bd`
  plan 222 的 `setShareDrafts([])`）引爆，到 2026-08-03 才被 operator 回報。

## 根因（三個條件缺一不可）

`CashFlowRoute.tsx` EntryDrawer 的 two-phase close effect：

```
useEffect(() => {
  if (!closing) return;
  const panel = panelRef.current;
  if (!panel) { onClose(); return; }   // ← 迴圈的引信
  …transitionend/timeout → onClose()…
}, [closing, onClose]);                 // ← onClose 是不穩定 identity
```

1. **deps 放了不穩定的 `onClose`** — 它是父層的 `closeDrawer`，plain function，
   每次父層 render 都是新 identity。
2. **`closing` 只在重開時重置** — 動畫關閉完成、`open=false`、panel unmount 之後，
   `closing` 仍卡在 `true`。EntryDrawer 常駐 mounted（`if (!open) return null` 自 gate），
   hooks 持續在跑。
3. **`closeDrawer` 保證觸發 re-render** — 內含 `setShareDrafts([])`，每次都是新陣列，
   `Object.is` 永不 bail。

三者組合：關閉完成後每次父層 render → `onClose` 變新 → effect 重跑 → `panel === null`
→ 再呼叫 `onClose()` → setState → 再 render →……巢狀更新疊到上限。**dev 只在 console
連噴 error 不會 throw；production 直接 throw #185** — 這是「開發時看起來都正常」的原因。

## 修法（`f049b0ec`）

照抄 `ModalShell` 既有的 closeRef 模式（`ModalShell.tsx:136-141` — 它當初就是為此設計，
EntryDrawer 移植時漏抄了這一半）：

- `onClose` 收進 `closeRef`，每次 render 用無 deps effect 更新；close effect 依賴縮回
  `[closing]`。
- `closing`／`closingRef` 在 `open` **兩個方向**的翻轉都重置 — ModalShell 關閉即 unmount
  所以只需開啟時重置；常駐 mounted 的抽屜必須兩邊都清，殘留的 `closing=true` 正是迴圈
  住的狀態。
- `requestClose` 依賴清空（順帶修掉抽屜開著時每次 render 重綁 keydown + scroll lock）。

## 防再犯規則

1. **任何「two-phase close（先播退場動畫、transitionend 才通知父層 unmount）」的 overlay，
   一律用 ModalShell 的 closeRef 模式**：回呼 prop 收進 ref、close effect deps 只留
   `[closing]`。若元件關閉後仍保持 mounted（用 `open` prop 自 gate），`closing` 必須在
   `open` 兩向翻轉都重置。寫新 overlay 前先看 `ModalShell.tsx` 或直接複用它。
2. **不穩定的回呼 prop（父層每 render 重建的 function）永遠不要放進「會呼叫它自己」的
   effect deps** — 這是 #185 的教科書配方。
3. **這類迴圈需要真實 CSS transition 才會發生**：jsdom 的 `transition-duration` 是 0，
   會走同步關閉分支，**單元測試永遠測不到** — 回歸測試必須寫 e2e
   （`src/test/e2e/entry-drawer-close.spec.ts`，監聽 "Maximum update depth" console/page
   errors；已做紅綠對照：修復前 4/4 紅、修復後 4/4 綠）。
4. Debug 線索備忘：production 的 minified React error **#185** ＝ dev console 的
   "Maximum update depth exceeded"。看到 route error boundary（「這個畫面發生問題」）
   包著 #185，先找「effect 依賴不穩定回呼 + 常駐 mounted 元件的殘留旗標」這個組合。

## 相關

- 修復 PR：https://github.com/larryjclai/northstar/pull/36
- 同型正確實作：`ModalShell.tsx`（closeRef）、`NotificationCenter.tsx`（finish 內重置旗標）
- Plan 222（分帳，引爆點）、plan 157（overlay motion 架構）
