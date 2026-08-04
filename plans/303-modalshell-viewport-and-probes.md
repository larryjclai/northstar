# Plan 303: ModalShell 視口變化即時重估 + 兩個低信度疑點查證（雙月曆高度、onboarding 100vh）

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5140008b..HEAD -- src/components/ModalShell.tsx src/components/LedgerDateControl.tsx src/components/ui/date-picker.tsx src/components/ui/calendar.tsx src/components/OnboardingOverlay.tsx`
> On any in-scope change, compare "Current state" excerpts against live code;
> mismatch = STOP.

## Status

- **Priority**: P3
- **Effort**: S–M
- **Risk**: LOW-MED（ModalShell 是每個畫面都在用的元件）
- **Depends on**: 建議在 287/298/299 之後（bottom-sheet call site 增多後效益更大）
- **Category**: bug ＋ investigate
- **Planned at**: commit `5140008b`, 2026-08-03

## Why this matters

**主修**：ModalShell 的手機判斷在 mount 時取樣一次就丟掉 setter——modal 開著時視窗跨過
1023px（iPad 直橫轉、桌機拖窗）不會重估。實際後果：iPad 直向開的 bottom-sheet 轉橫後
仍是 sheet，但桌面 sidebar（z-index 1100）已重新出現、壓住 sheet 左緣——這正是當初
width gate 要防的重疊（plan 244）。反向則是手機寬度下殘留右側 drawer、沒有 safe-area。

**兩個查證**（audit 標 LOW confidence，需實測再決定修不修）：
1. 記帳的自訂區間雙月曆 popover（直向堆疊 ~600px 高）在矮視窗是否溢出且無內部捲動。
2. Onboarding 卡高度用 `100vh`（repo 慣例是 `dvh`）是否在 WKWebView 造成 CTA 出視野。

## Current state

- `src/components/ModalShell.tsx:153–159`：

```tsx
  const [isMobileViewport] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 1023px)").matches,
  );
  const sheetActive = mobilePresentation === "bottom-sheet" && isMobileViewport;
```

  （`useState` initializer、setter 被丟棄、無 change listener。）
- 拖曳關閉的進行中狀態：`dragRef`（line 182–190）、`settleDrag`（line 226–239）。
- `src/components/LedgerDateControl.tsx:133–168`：`PopoverContent`（`w-auto`）內
  `SegmentedControl` + `<Calendar mode="range" numberOfMonths={2} …>`，無
  maxHeight/overflow。`src/components/ui/date-picker.tsx` 的 `DateRangePicker` 同構。
- `src/components/ui/calendar.tsx:41`：`months: "relative flex flex-col gap-4 md:flex-row"`
  ——<768px 兩個月**直向堆疊**；`:28` `[--cell-size:--spacing(7)]`（~28px 格）。
- `src/components/OnboardingOverlay.tsx:153`：`maxHeight: "min(760px, calc(100vh - 24px))"`
  （repo 其他 overlay 用 `dvh`，如 `.ns-sheet-bottom` 的 `92dvh`）。

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Typecheck + build | `npm run build` | exit 0        |
| Tests     | `npm test -- ModalShell` | all pass       |
| Lint      | `npm run lint`       | 0 errors            |
| Format    | `npm run format:check` | 通過              |

## Scope

**In scope**:
- `src/components/ModalShell.tsx`（isMobileViewport → 訂閱式）
- 查證結果為真時：`src/components/LedgerDateControl.tsx`、
  `src/components/ui/date-picker.tsx`（DateRangePicker）、
  `src/components/OnboardingOverlay.tsx`（各一小修）

**Out of scope**:
- ModalShell 其他 API；calendar.tsx 內部結構。
- 查證結果為假的項目——記入 plans/README.md「considered and rejected」，不修。

## Git workflow

- Branch: `fix/ai-modalshell-viewport`
- 先 `git status` 確認乾淨；有未提交變更就 STOP。
- Conventional commits；推分支開 PR，不 push main。

## Steps

### Step 1: isMobileViewport 改訂閱

用 `useSyncExternalStore`（React 內建）：

```tsx
  const isMobileViewport = useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return () => {};
      }
      const mql = window.matchMedia("(max-width: 1023px)");
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 1023px)").matches,
    () => false,
  );
```

**拖曳防護**：跨界切換時若 `dragRef.current.active`，presentation 突變會讓手勢殘留
inline transform——在 `sheetActive` 變化的 effect 裡重置：

```tsx
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    dragRef.current.active = false;
    dragRef.current.pointerId = null;
    panel.style.transition = "";
    panel.style.transform = "";
  }, [sheetActive]);
```

**Verify**: `npm test -- ModalShell` 全綠（jsdom 走 server snapshot `false`——與現行
`matchMedia` 缺失時的行為一致，既有測試不應變紅）；`npm run dev` 開任一 bottom-sheet
（如 390px 的分類管理）→ 拖寬視窗過 1024 → 變回 drawer/center、sidebar 不壓 sheet；
拖回 → 變回 sheet。

### Step 2: 查證 A — 雙月曆高度

`npm run dev`，390×844 與 390×667 兩個視口：記帳 → 日期範圍控制 → 自訂。量
popover 實際高度與可視性（第二個月、確認用的按鈕是否可及）。

- **溢出屬實** → `LedgerDateControl.tsx:135` 的 PopoverContent className 加
  `max-h-[70dvh] overflow-y-auto`；`date-picker.tsx` 的 DateRangePicker 同款。重驗。
- **不溢出** → 不改，README 記 rejected（含實測數字）。

### Step 3: 查證 B — onboarding 100vh

iOS Simulator（或 WKWebView 實機）開首次 onboarding：CTA 是否出視野。屬實 →
`OnboardingOverlay.tsx:153` `100vh` → `100dvh` 一字修（若 plan 299 的 maintenance note
已順手改掉，跳過並記錄）。無法取得 iOS 環境 → 記「未驗證，改法一行、風險零」直接改
（`dvh` 在桌機與 `vh` 等值，安全）。

## Test plan

- `ModalShell.test.tsx` 新增案例：mock `matchMedia`（既有測試已有 mock 模式可抄，
  見檔內 `:266` 附近的負向斷言寫法）→ 觸發 `change` 事件 → 斷言 panel 的
  `ns-sheet-bottom` class 隨之增減。
- Verification: `npm test` 全綠。

## Done criteria

- [ ] `npm run build` exit 0；`npm test` exit 0（含新 ModalShell 案例）
- [ ] `npm run lint` 0 errors；`npm run format:check` 通過
- [ ] 手動：開著的 sheet 跨 1024px 邊界即時換 presentation、無 sidebar 重疊、無殘留 transform
- [ ] 查證 A/B 各有結論：修掉或 README 記 rejected（附數據）
- [ ] `git status` 只有 in-scope 檔案（+ 測試檔、plans/README.md）
- [ ] `plans/README.md` 狀態列更新

## STOP conditions

- 摘錄與 live code 不符。
- presentation 切換觸發 enter 動畫重播且觀感不可接受（`data-motion` 值變化會重設
  transition）——回報，可能需要在切換時暫時掛 `motion="none"`，那是 shell API 改動。
- `useSyncExternalStore` 與既有 `closing` 狀態機（requestClose 流程）出現競態
  （切換瞬間 dismiss）——回報 repro 步驟。

## Maintenance notes

- 此改動讓所有 `mobilePresentation` call site 自動獲得轉向正確性——不需要逐 call site
  處理。
- Reviewer 盯：`getServerSnapshot`（第三參數）回 `false` 保持 SSR/jsdom 語意與現狀一致。
