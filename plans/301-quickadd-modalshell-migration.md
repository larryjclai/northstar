# Plan 301: QuickAdd 遷移到 ModalShell — 最後一個手刻 overlay 歸隊

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5140008b..HEAD -- src/components/QuickAdd.tsx src/components/ModalShell.tsx`
> On any in-scope change, compare "Current state" excerpts against live code;
> mismatch = STOP.（plan 292 預期會先動 QuickAdd——那不算 drift，read 292 的 diff
> 後在其結果之上作業。）

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: plan 292（先救急再遷移；292 的 grid class 與 `useKeyboardInset` 原樣保留）
- **Category**: tech-debt
- **Planned at**: commit `5140008b`, 2026-08-03

## Why this matters

DESIGN.md §6.4 明文：「新 modal / sheet / drawer 一律用共用元件 ModalShell」，並列出
已遷移清單——QuickAdd 是**最後一個**手刻 overlay。代價是實際的：沒有 body scroll lock
（iOS 上拖曳 overlay 背後的頁面會跟著捲、非原生手感）、沒有 focus trap（VoiceOver 會
走到 overlay 背後的頁面）、沒有 `role="dialog"`/`aria-modal`、Escape 是掛在 window 的
手刻 listener（與 SuggestInput 的 Escape stopPropagation 契約靠巧合共存）、也吃不到
`.ns-sheet-bottom` 的拖曳關閉與 safe-area。遷移後這些全部由 shell 統一提供。

## Current state

- `src/components/QuickAdd.tsx`：
  - 手刻 overlay（line 426–446）：fixed 容器 + 手刻 scrim div + `<style>` 內嵌 media
    query 把 `left` 歸零（桌機讓出 sidebar 寬 `overlayLeft = sidebarCollapsed ? 64 : 240`，
    line 116）。
  - 手刻 Escape（line 209–216）：

```tsx
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
```

  - panel（line 442–445）：`flex flex-col gap-2.5`、`width: min(620px, 94vw)`、貼底
    （容器 `alignItems: "flex-end"`）。plan 292 之後另有 maxHeight 與 keyboard transform。
- `src/components/ModalShell.tsx`：提供 scroll lock（`lockViewportScroll()`，line 293）、
  focus trap（line 295–322，**綁在 panel 節點**——body-portal 的 Base UI popover 不受
  影響，這對 QuickAdd 內的 `AccountFilter` popover 是關鍵既有保證）、Escape、
  `mobilePresentation="bottom-sheet"`（手機變 `.ns-sheet-bottom`：全寬、拖曳關閉、
  safe-area）。
- DESIGN.md:293–296（§6.4）＋ :326–329 的已遷移清單——完成後把 QuickAdd 加進清單。
- QuickAdd 的特殊性：panel 不是單一卡片，而是「確認卡（條件渲染）＋建議列＋輸入列」
  的縱向堆疊；桌機貼底置中、讓出 sidebar。

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Typecheck + build | `npm run build` | exit 0        |
| Tests     | `npm test`           | all pass            |
| Lint      | `npm run lint`       | 0 errors            |
| Format    | `npm run format:check` | 通過              |
| e2e       | `npm run test:e2e`   | all pass            |

## Scope

**In scope**:
- `src/components/QuickAdd.tsx`
- `DESIGN.md`（§6.4 已遷移清單加一行）

**Out of scope**:
- `ModalShell.tsx` 本體（若遷移需要改 shell，STOP——那是 shell API 的討論）。
- NLP 解析、送出、UserLexicon 邏輯。
- `SuggestInput`／`AccountFilter` 內部。

## Git workflow

- Branch: `feat/ai-quickadd-modalshell`
- 先 `git status` 確認乾淨；有未提交變更就 STOP。
- Conventional commits；推分支開 PR，不 push main。

## Steps

### Step 1: 包 shell、拆手刻件

- 外層改為：

```tsx
    <ModalShell
      variant="center"
      mobilePresentation="bottom-sheet"
      title="快速記帳"
      onClose={onClose}
      style={{ zIndex: 80, paddingLeft: overlayLeft }}  // 桌機讓出 sidebar；手機 sheet 全寬自動忽略
      panelStyle={{ width: "min(620px, 94vw)" }}
    >
```

  （`variant="center"` 的 scrim 是 `flex items-end justify-center p-4 sm:items-center`
  ——注意它在 `sm+` 會**置中**而 QuickAdd 現在是**貼底**。若要保留貼底手感，改用
  `variant="sheet"` + 自帶定位、或 `motion="none"` + className 覆寫 alignment：
  以「桌機視覺與改前一致」為準，實作時二選一並記錄在 PR。`paddingLeft` 動態值合規。）
- 刪除：手刻 scrim div、`<style>` 內嵌 media query、window Escape listener
  （line 209–216 整段——shell 的 panel-scoped keydown 接手；**先驗 SuggestInput**：
  它的 Escape `stopPropagation`（SuggestInput.tsx:72–78 附近）會擋住 shell 的 panel
  listener 嗎？shell 綁在 panel 節點、SuggestInput 在 panel 內部——stopPropagation 會
  阻斷冒泡到 panel，等於「suggestion 開著時 Esc 只關 suggestion」，**這正是想要的層級
  行為**，確認後記錄）。
- 內容改為 `{(dismiss) => (…)}` render prop，取消鈕接 `dismiss`。

**Verify**: `npm run build` exit 0；`npm test` 全綠。

### Step 2: 行為驗證矩陣

390px：
1. 開啟 → bottom-sheet、拖把手存在、往下拖可關。
2. 背景頁面不可捲（scroll lock）。
3. Esc（外接鍵盤）在 suggestion 關閉時關 overlay；suggestion 開啟時先關 suggestion。
4. `AccountFilter` popover（body portal）開啟時 Tab 循環正常、popover 內 Esc 只關 popover。
5. plan 292 的鍵盤避讓與 grid 收合仍生效。

1280px：
6. 貼底/置中位置與改前一致（Step 1 的抉擇）；`overlayLeft` 讓出 sidebar；sidebar
   收合切換時位置跟著變。
7. VoiceOver/axe 抽查：`role="dialog"`、`aria-modal="true"`、焦點在 panel 內循環。

**Verify**: 矩陣逐項 + `npm run test:e2e` 全綠。

### Step 3: DESIGN.md 清單

§6.4 已遷移清單（DESIGN.md:326–329）加上 `QuickAdd`。

## Test plan

- 既有 QuickAdd 測試（若有）在 shell 包裹後的 DOM 變化：更新 selector，不改斷言語意。
- 新增 vitest：渲染 QuickAdd（open）→ 斷言 `role="dialog"` 存在、unmount 後 body
  scroll 樣式復原（`lockViewportScroll` 的效果，參考 `ModalShell.test.tsx` 的既有做法）。
- Verification: `npm test`、`npm run test:e2e` 全綠。

## Done criteria

- [ ] `npm run build` exit 0；`npm test` exit 0；`npm run test:e2e` exit 0
- [ ] `npm run lint` 0 errors；`npm run format:check` 通過
- [ ] `grep -n "addEventListener(\"keydown\"" src/components/QuickAdd.tsx` → 無結果
- [ ] `grep -c "ModalShell" src/components/QuickAdd.tsx` → ≥1
- [ ] DESIGN.md 遷移清單含 QuickAdd
- [ ] 行為矩陣 7 項全過
- [ ] `git status` 只有 in-scope 檔案（+ 測試檔、plans/README.md）
- [ ] `plans/README.md` 狀態列更新

## STOP conditions

- 摘錄與 live code 不符（292 的預期改動除外）。
- 桌機「讓出 sidebar 的置中」在 shell 的 scrim flex 下做不出與改前等價的位置，且兩種
  variant 都試過——STOP 附截圖回報。
- SuggestInput 的 Escape 層級行為與 Step 1 的推理不符（Esc 直接關整個 overlay 丟失輸入）。
- focus trap 與 `AccountFilter` popover 的 Tab 循環互相干擾（shell 的 panel-scoped
  設計理論上已處理——ModalShell.tsx:107–111 的註解——若實測仍衝突，STOP）。

## Maintenance notes

- 遷移後 QuickAdd 自動獲得 shell 未來的所有改進（例 plan 303 的視口變化重估）。
- plan 292 的 `maxHeight` 手刻邏輯可在此刪除（`.ns-sheet-bottom` 的 `92dvh` 接手）；
  `useKeyboardInset` 保留。
- Reviewer 盯：開啟動畫從手刻 `ns-drawer-in` 換成 shell 的 `sheet-bottom` motion 後
  的手感差異（速度曲線不同屬預期，卡頓不是）。
