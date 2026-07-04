# Plan 102: Add lint guardrail against hand-rolled money formatting + CI test/lint gate

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 479b6256..HEAD -- eslint.config.js .github/workflows/ src/routes/TransactionsRoute.tsx src/routes/FIRECalculatorRoute.tsx src/routes/settings/GeneralSection.tsx src/routes/settings/ExportSection.tsx src/routes/CashFlowRoute.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/101-money-display-privacy-mask-bypass.md（101 未完成前，新 lint 規則會在它要修的位置爆錯）
- **Category**: dx
- **Planned at**: commit `479b6256`, 2026-07-02

## Why this matters

DESIGN.md §9 規定所有金額顯示必須走 `src/domain/currency.ts` helpers（內建隱私遮罩），
但這條規範只存在於文件，沒有工具強制。結果就是 Plan 101 修掉的那批遮罩繞過
（`NT$…M` 手刻、`toLocaleString` 手刻）。本計劃補兩道護欄：
(1) eslint 規則禁止 `src/routes/**` 內呼叫 `toLocaleString`；
(2) GitHub Actions 在 PR/push 時跑 lint + typecheck + test（目前 CI 只有
`cla.yml`、`etf-feed.yml`、`release.yml`，82 個測試檔完全不在 PR gate 裡）。

## Current state

- `eslint.config.js` — flat config，現有結構：

```js
// eslint.config.js:8-27
export default tseslint.config(
  { ignores: ["dist", "node_modules", "worker", "src-tauri", "scratch", "**/*.cjs"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "warn",
      // …
    },
  },
  prettier,
);
```

- `.github/workflows/` — 只有 `cla.yml`、`etf-feed.yml`、`release.yml`。
  `release.yml` 的慣例：`actions/checkout@v4`、`actions/setup-node@v4` +
  `node-version: lts/*`、`npm ci`。
- 驗證指令：`npm run lint`（= `eslint src`）、`npx tsc`（tsconfig 已設 noEmit）、
  `npm test`（= `vitest run`）。
- **`src/routes/**` 內合法的 `toLocaleString` 使用**（規則上線後需逐點
  `eslint-disable-next-line` + 一行理由註解；這些是日期或輸入框編輯狀態，
  不是金額展示）：
  - `src/routes/TransactionsRoute.tsx:656` — `date.toLocaleString("en-US", { month: "long" })` 月份名稱
  - `src/routes/FIRECalculatorRoute.tsx:421` — 數字輸入框編輯狀態
  - `src/routes/settings/GeneralSection.tsx:534` — 備份時間點日期顯示
  - `src/routes/settings/ExportSection.tsx:286` — 匯出筆數（非金額）
  - `src/routes/CashFlowRoute.tsx:2708` — `fmtAmountDisplay`，金額輸入框編輯狀態
  （行號以 `479b6256` 為準；Plan 101 landing 後可能略有位移，以 grep 為準。）
- `src/components/**` 不納入規則範圍：`NumberField.tsx`、`useNumericField.ts`、
  `QuickAdd.tsx`、`ui/calendar.tsx` 的用法全是輸入編輯/日期，屬合法大宗。

## Commands you will need

| Purpose   | Command           | Expected on success |
|-----------|-------------------|---------------------|
| Lint      | `npm run lint`    | exit 0              |
| Typecheck | `npx tsc`         | exit 0              |
| Tests     | `npm test`        | all pass            |
| Workflow syntax | `node -e "require('js-yaml')"` 不可用時跳過；改以 GitHub push 後觀察 | — |

## Scope

**In scope** (the only files you should modify):
- `eslint.config.js`
- `.github/workflows/ci.yml`（新建）
- 上列五個檔案中加 `eslint-disable-next-line no-restricted-syntax` 與理由註解的**那幾行**

**Out of scope** (do NOT touch, even though they look related):
- `src/components/**` — 不納入規則（合法輸入編輯用法為大宗）。
- `release.yml`、`etf-feed.yml`、`cla.yml` — 既有 workflow 不改。
- 任何金額顯示程式碼本身（那是 Plan 101 的事）。
- `npm run build` 不加入 CI — `prebuild` 會跑 `scripts/inject-private-assets.mjs`，
  依賴私有資產，公開 runner 上可能失敗。typecheck 用 `npx tsc` 即可。

## Git workflow

- Branch: `fix/ai-lint-ci-guardrails`
- Commit style: conventional commits，例：`chore(dx): lint-ban toLocaleString in routes; add CI gate`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: 加 eslint 規則

在 `eslint.config.js` 的 `tseslint.config(...)` 內、`prettier` 之前，新增一個
scoped 區塊（不要動既有區塊）：

```js
{
  files: ["src/routes/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: 'CallExpression[callee.property.name="toLocaleString"]',
        message:
          "金額顯示必須走 src/domain/currency.ts 的 helpers（formatMoney / formatNumber / formatCompactMoney…），它們內建隱私遮罩。日期或輸入框編輯狀態屬例外——加 eslint-disable-next-line 並附一行理由。",
      },
    ],
  },
},
```

**Verify**: `npm run lint` → 恰好在「Current state」列出的那幾行報
`no-restricted-syntax` 錯誤，**且沒有其他位置報錯**。若出現未列出的位置，
先確認它是否金額展示：是 → STOP 回報（那是漏網的遮罩繞過，屬 Plan 101 範圍）；
否 → 按 Step 2 處理。

### Step 2: 為合法用法加 disable 註解

對五個合法位置逐一加上（緊貼在該行上方）：

```ts
// 日期/輸入編輯狀態，非金額展示 — 不經 currency helpers
// eslint-disable-next-line no-restricted-syntax
```

**Verify**: `npm run lint` → exit 0。

### Step 3: 新建 CI workflow

建 `.github/workflows/ci.yml`：

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: lts/*
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npx tsc
      - run: npm test
```

（刻意不含 `npm run build`：`prebuild` 需要私有資產注入，公開 runner 上會失敗。）

**Verify**: `npx tsc`、`npm run lint`、`npm test` 本機全綠（模擬 CI 三步）。

## Test plan

- 不新增單元測試（本計劃是工具設定）。
- 負向驗證：暫時在 `src/routes/GoalsRoute.tsx` 任意處加一行
  `const x = (1234).toLocaleString();`，跑 `npm run lint` 確認報錯，**然後撤掉這行**
  （驗證後 `git diff src/routes/GoalsRoute.tsx` 必須為空）。
- CI 的實際觸發驗證由 operator 在 push 後於 GitHub Actions 頁確認。

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run lint` exits 0
- [ ] `npx tsc` exits 0
- [ ] `npm test` exits 0
- [ ] `.github/workflows/ci.yml` 存在且含 lint/tsc/test 三步
- [ ] 負向驗證做過且已撤（`git diff` 只含 in-scope 檔案）
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 101 尚未 landing（`grep -n "1_000_000" src/routes/GoalsRoute.tsx` 仍有輸出）
  — 本計劃依賴它先修完。
- Step 1 的 lint 掃出**未列於本計劃**且疑似金額展示的 `toLocaleString`。
- eslint flat config 結構與摘錄不符（例如已遷移到其他 config 格式）。

## Maintenance notes

- 未來若 `src/routes/**` 出現合法新用法（日期、輸入編輯），沿用 disable + 理由註解模式。
- 若之後想把規則擴到 `src/features/**`，先盤點該目錄的合法用法再擴。
- CI 刻意排除 build；若日後 `inject-private-assets.mjs` 改成缺資產時 degrade 而非 fail，
  可把 `npm run build` 加回 CI。
- Reviewer 檢查重點：disable 註解是否每處都附了理由；ci.yml 是否誤加了 build。
