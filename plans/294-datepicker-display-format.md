# Plan 294: DatePicker 顯示完整日期 — 修「顯示 2026-08、實存 2026-08-03」的錯位

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5140008b..HEAD -- src/components/ui/date-picker.tsx src/routes/HoldingEditModal.tsx src/routes/CashFlowRoute.tsx`
> On any in-scope change, compare "Current state" excerpts against live code;
> mismatch = STOP.

## Status

- **Priority**: P2（工作量極小、正確性 bug，隨 Wave 1 一起出）
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5140008b`, 2026-08-03

## Why this matters

`DatePicker` 的觸發鈕顯示 `format(date, "yyyy-MM")`（例 `2026-08`）、placeholder 是
「選擇月份」，但選取後 `onChange` 送出的是**完整日期** `yyyy-MM-dd`。唯一的使用點是
持倉編輯 modal 的「手動價格快照」日期——快照以**日**為粒度，使用者選完卻只看得到月份，
無法確認選到哪一天；同月兩筆快照在觸發鈕上長得一模一樣。行動裝置上日曆 popover 選完即
關，觸發鈕是唯一的回饋。

## Current state

- `src/components/ui/date-picker.tsx` — 檔首是 `// @ts-nocheck`（改動不受編譯器保護，
  必須靠 grep 確認呼叫端）。觸發與送出（line 34–43）：

```tsx
            <CalendarBlank className="mr-2 h-4 w-4" />
            {date ? format(date, "yyyy-MM") : <span>選擇月份</span>}
          </button>
        }
      />
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => d && onChange?.(format(d, "yyyy-MM-dd"))}
```

- 呼叫端（已全 repo 掃過）：
  - `src/routes/HoldingEditModal.tsx:350` — 唯一實際渲染點（手動價格快照日期）。
  - `src/routes/CashFlowRoute.tsx:61` — **死 import**（`grep -n "<DatePicker" src/routes/CashFlowRoute.tsx` 零筆），可順手移除。
  - 同檔的 `DateRangePicker` 是另一個 export，**不在此計畫範圍**。
- UI 字串慣例：文案改動照理走 copy.csv 工作流；但此元件的「選擇月份」是**寫死在 tsx 的
  bug 字串**（不在 translation catalog——先 `grep -rn "選擇月份" src/locales copy.csv` 確認；
  若其實在 catalog，改 catalog 走 `npm run copy:import` 流程並 STOP 回報偏差）。

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Typecheck + build | `npm run build` | exit 0        |
| Tests     | `npm test`           | all pass            |
| Lint      | `npm run lint`       | 0 errors            |
| Format    | `npm run format:check` | 通過              |

## Scope

**In scope**:
- `src/components/ui/date-picker.tsx`（`DatePicker` 的顯示格式與 placeholder）
- `src/routes/CashFlowRoute.tsx`（僅移除 line 61 死 import）

**Out of scope**:
- `DateRangePicker`（同檔）——行為正確，不碰。
- `HoldingEditModal` 的其他問題（bottom-sheet、70vh、刪除鈕 → plan 298）。
- 移除 `@ts-nocheck`（值得做，但另案；本計畫是一行修）。

## Git workflow

- Branch: `fix/ai-datepicker-display`
- 先 `git status` 確認乾淨；有未提交變更就 STOP。
- Conventional commits；推分支開 PR，不 push main。

## Steps

### Step 1: 顯示格式與 placeholder

date-picker.tsx line 35：

```tsx
            {date ? format(date, "yyyy-MM-dd") : <span>選擇日期</span>}
```

同時把 line 29 的 `w-[140px]` 放寬為 `w-[150px]`（`yyyy-MM-dd` 比 `yyyy-MM` 寬 ~24px，
先實測 140px 是否已足；足則不動）。

**Verify**: `npm run build` exit 0。

### Step 2: 清死 import

CashFlowRoute.tsx line 61 的 `import { DatePicker } …` 整行移除。

**Verify**: `npm run lint` 0 errors；`npm run build` exit 0。

### Step 3: 功能驗證

`npm run dev`：持倉 → 任一持倉 → 編輯 → 手動價格快照 → 選日期：觸發鈕顯示完整
`YYYY-MM-DD` 且與選取日一致；儲存後快照日期正確（與改前相同——送出格式本來就對）。

## Test plan

- 若 `HoldingEditModal` 已有測試檔，追加一個渲染斷言：給定 `date`，觸發鈕文字為
  `yyyy-MM-dd` 全格式。無現成測試檔則以 e2e 驗證為準（此檔 `@ts-nocheck`，單元測試
  價值有限）。
- Verification: `npm test` 全綠。

## Done criteria

- [ ] `npm run build` exit 0；`npm test` exit 0
- [ ] `npm run lint` 0 errors；`npm run format:check` 通過
- [ ] `grep -n '"yyyy-MM"' src/components/ui/date-picker.tsx` → 無結果（`DatePicker` 內）
- [ ] `grep -n "選擇月份" src/components/ui/date-picker.tsx` → 無結果
- [ ] `grep -n "DatePicker" src/routes/CashFlowRoute.tsx` → 無結果
- [ ] `git status` 只有 in-scope 檔案（+ plans/README.md）
- [ ] `plans/README.md` 狀態列更新

## STOP conditions

- 出現第三個 `DatePicker` 呼叫端（drift check 後重新 grep），且該呼叫端語意真的是
  「選月份」——此時要加 `displayFormat` prop 而非直接改，STOP 回報改用哪種 API。
- 「選擇月份」字串出現在 translation catalog（見 Current state 的確認步驟）。

## Maintenance notes

- 此檔仍是 `@ts-nocheck`——未來把它納入型別檢查時，`onChange` 的字串格式應改成型別化
  （`\`${number}-${number}-${number}\`` 或 branded type）以防這類錯位再發生。
