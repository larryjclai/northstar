# Plan 105: 卡片標題中文化 — 對齊「英文 eyebrow + 中文標題」慣例

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 479b6256..HEAD -- src/routes/GoalsRoute.tsx src/routes/DashboardRoute.tsx src/routes/settings/CategoriesSection.tsx src/locales/zh-TW/translation.json src/locales/en/translation.json copy.csv`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none（與 101/103 同檔不同行；若先後執行，行號以 grep 為準）
- **Category**: tech-debt (copy consistency)
- **Planned at**: commit `479b6256`, 2026-07-02

## Why this matters

Northstar 是繁體中文優先的 app，頁首慣例是「英文 eyebrow（mono 小字）+ 中文標題」
（AGENTS.md、DESIGN.md §3.5 明文）。但有四處**標題本身**是英文：目標頁的
「1 active goal」、Dashboard 目標卡的「1 active」、Top Movers 卡標題、設定分類表
的「Category」表頭（同排其他表頭都是中文）。對照記帳新手 persona：讀不出
"active goal" 為何是英文，觀感是半成品。

## Current state

四個確認的位置（行號以 `479b6256` 為準）：

1. `src/routes/GoalsRoute.tsx:334` — 目標清單標題（硬編英文 + 複數邏輯）：

```tsx
<h2 className="text-lg" style={{ fontWeight: 500, margin: 0 }}>{goals.length} active {goals.length === 1 ? "goal" : "goals"}</h2>
```

2. `src/routes/DashboardRoute.tsx:1164` — Dashboard 目標卡（eyebrow 是
   "Goals"，正確；title 卻也是英文）：

```tsx
<SectionHead eyebrow="Goals" title={`${goals.length} active`} action={<Button variant="ghost" size="xs" render={<Link to="/goals" />}>全部 →</Button>} />
```

3. `src/routes/DashboardRoute.tsx:1472` — Top Movers 卡標題（eyebrow 是
   "Today"）：

```tsx
<h3 className="text-base" style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontWeight: 500 }}>Top Movers</h3>
```

4. `src/routes/settings/CategoriesSection.tsx:197` — 分類表頭第一欄硬編英文，
   同排其他欄都走 `t()`：

```tsx
<span>Category</span>
<span style={{textAlign:'right'}}>{t('settings.spent')}</span>
<span className="ns-settings-category-budget" style={{textAlign:'right'}}>{t('settings.budget')}</span>
```

慣例與 i18n 工作流：

- 大多數路由的中文字串**直接硬編在 JSX**（GoalsRoute/DashboardRoute 目前無
  `useTranslation`）— 位置 1–3 照此慣例直接寫中文，**不要**為它們引入 t()。
- `CategoriesSection` 已有 `t`（props 傳入）— 位置 4 走 t() + 新增 key。
- UI copy 由 `copy.csv` 與 `src/locales/*/translation.json` round-trip 維護
  （AGENTS.md：「UI copy is edited in copy.csv then round-tripped via
  `npm run copy:export/import`」）。新增 key 的正確流程：先加進兩份
  `translation.json`，再跑 `npm run copy:export` 讓 `copy.csv` 同步。

## Commands you will need

| Purpose   | Command               | Expected on success |
|-----------|-----------------------|---------------------|
| Typecheck | `npx tsc`             | exit 0              |
| Tests     | `npm test`            | all pass            |
| Lint      | `npm run lint`        | exit 0              |
| Copy sync | `npm run copy:export` | exit 0；copy.csv 出現新 key 列 |

## Scope

**In scope** (the only files you should modify):
- `src/routes/GoalsRoute.tsx`（僅 334 行的 h2 文字）
- `src/routes/DashboardRoute.tsx`（僅 1164 的 title 與 1472 的 h3 文字）
- `src/routes/settings/CategoriesSection.tsx`（僅 197 行）
- `src/locales/zh-TW/translation.json`、`src/locales/en/translation.json`（新增一個 key）
- `copy.csv`（僅由 `npm run copy:export` 產生的差異）

**Out of scope** (do NOT touch, even though they look related):
- 各處 **eyebrow**（"Goals"、"Today"、"Overview"、"Long-term progress"…）—
  英文 eyebrow 是慣例本體，保留。
- 其他英文字串（ticker、"Net worth · TWD"、"FIRE Calculator" 連結、
  "PROJECTION"）— eyebrow/專有名詞性質，本計劃不動。
- 手動改 `copy.csv` 內容（只允許 export 產生的機械差異）。

## Git workflow

- Branch: `fix/ai-zh-copy-consistency`
- Commit style: `fix(copy): localize English-only card titles`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: GoalsRoute 標題

334 行改為（中文無複數形，移除三元）：

```tsx
<h2 className="text-lg" style={{ fontWeight: 500, margin: 0 }}>{goals.length} 個進行中目標</h2>
```

**Verify**: `grep -n "active goal" src/routes/GoalsRoute.tsx` → 無輸出（註解不算，
若 334 行外的匹配是註解則通過）。

### Step 2: Dashboard 目標卡 title

1164 行 `title={`${goals.length} active`}` → `title={`${goals.length} 個進行中目標`}`。
eyebrow="Goals" 保留。

**Verify**: `grep -n '} active' src/routes/DashboardRoute.tsx` → 無輸出。

### Step 3: Top Movers 標題

1472 行 h3 內文 `Top Movers` → `今日漲跌`。eyebrow "Today" 保留。

**Verify**: `grep -n "Top Movers" src/routes/DashboardRoute.tsx` → 僅剩註解
（1215 行帶有一行區塊註解，保留無妨）。

### Step 4: 設定分類表頭

`src/locales/zh-TW/translation.json` 的 `settings` 物件內加 `"category": "分類"`；
`src/locales/en/translation.json` 同位置加 `"category": "Category"`
（照兩檔中 `settings.spent` 的既有結構放同一層）。197 行改為：

```tsx
<span>{t('settings.category')}</span>
```

然後 `npm run copy:export` 同步 copy.csv。

**Verify**: `npx tsc` → exit 0；`git diff copy.csv` → 恰好新增 settings.category
相關列，無其他 copy 內容變動。

### Step 5: 全量驗證

**Verify**: `npm test` → all pass；`npm run lint` → exit 0。

## Test plan

- 純文案替換，無邏輯變更 — 不新增測試。
- 若既有 e2e/snapshot 測試斷言了 "Top Movers"/"active" 字樣
  （`grep -rn "Top Movers\|active goal" src/ e2e/ tests/ 2>/dev/null` 檢查），
  同步更新斷言字串。

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc`、`npm test`、`npm run lint` 全部 exit 0
- [ ] `grep -rn "active goal\|} active\`" src/routes/` → 無輸出
- [ ] `grep -n "<span>Category</span>" src/routes/settings/CategoriesSection.tsx` → 無輸出
- [ ] zh-TW 與 en 的 translation.json 都有 `settings.category`
- [ ] `git status` 只含 in-scope 檔案
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `npm run copy:export` 對 copy.csv 產生**超出新 key** 的大量差異（代表 csv 與
  json 本來就不同步）— 不要提交那些差異，回報現象。
- 摘錄與現場不符（例如 Plan 101/103 已改動同檔造成行號位移超過 ±20 行且
  內容對不上）。
- 你想「順手」中文化 out-of-scope 清單裡的其他英文字串 — 收手，回報建議即可。

## Maintenance notes

- 判斷準則供未來新卡片沿用：**eyebrow 英文、標題中文**；ticker 與
  專有名詞（FIRE、XIRR）維持英文。
- 「今日漲跌」若 operator 想改用其他措辭（如「今日領漲領跌」），只動 1472 行
  一處 — 本計劃選最短可讀版本。
- Reviewer 檢查重點：copy.csv 的 diff 是否乾淨（只有新 key）。
