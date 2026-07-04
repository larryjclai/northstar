# Plan 115: 樣式系統裁決規則 + 逐步清理 inline style（分階段）

> **Executor instructions**: This is a PHASED plan. Phase 1 is one commit and
> should be executed fully. Phase 2 is a repeatable per-file procedure — execute
> as many files as the dispatch scope says, one file per commit, and STOP when
> told or when you have done the files named in your dispatch. Run every
> verification command before moving on. If a STOP condition occurs, stop and
> report. Update the status row in `plans/README.md` unless a reviewer maintains it.
>
> **Drift check (run first)**: `git diff --stat b7dd5ba5..HEAD -- src/styles/globals.css AGENTS.md DESIGN.md`

## Status

- **Priority**: P3
- **Effort**: L（Phase 1 = M；Phase 2 = 分次進行，總量大）
- **Risk**: MED（大量機械改動，逐檔驗證降風險）
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `b7dd5ba5`, 2026-07-03

## Why this matters

程式碼並存三套樣式手法：COSS 元件、`ns-*` utility class、與 inline
`style={{}}`（全 src 共 **2144 處**，CashFlowRoute 一檔就 211 處）。沒有裁決規則，
新代碼隨手寫哪種都行，樣式散落、難改主題、難一致。操作者要「手動清舊的，讓
程式碼比較乾淨」。策略不是盲目把 2144 處逐一轉 class（純機械 churn、回歸風險高），
而是：**先立規則擋新債，再把最高頻的重複 inline 模式抽成共用 class（一次消掉數百處），
最後逐檔清剩餘的靜態 inline**。

盤點（`grep` 統計）最高頻的重複靜態模式：

| 次數 | 模式 | 處置 |
|---|---|---|
| 56 | `{ marginBottom: N, color: "var(--ns-fg-muted)", fontWeight: 500 }` | 抽 `.ns-field-label` |
| 23 | `{ display: "block", marginBottom: N, color: "var(--ns-fg-muted)", fontWeight: 500 }` | 同上（block 版） |
| 37 | `{ display: "flex", flexDirection: "column", gap: N }` | Tailwind `flex flex-col gap-*` |
| 34 | `{ display: "flex", alignItems: "center", gap: N }` | Tailwind `flex items-center gap-*` |
| 31/25 | `{ color: "var(--ns-muted)" }` / `{ color: "var(--ns-fg-muted)" }` | 既有 `.muted` class |

## Current state

- `src/styles/globals.css` — utility class 區（`.ns-eyebrow` @543、`.muted` @696…）。
  **已有** `.muted { color: var(--ns-fg-muted); }`（696 行）——31+25 處手寫
  `color: var(--ns-fg-muted/muted)` 本可直接用它。
- `AGENTS.md` — 「Non-negotiable invariants」第 4 條已有「Don't overwrite the
  Design System」（47 行），但**沒有** inline-style vs class 的裁決規則。
- `DESIGN.md` §6 元件庫 / §12 設計慣例 — 記錄元件與慣例，可加樣式撰寫規則。
- Tailwind v4 已在用（COSS 元件、arbitrary values 如 `bg-[color-mix(...)]`）。

## Commands you will need

| Purpose   | Command        | Expected on success |
|-----------|----------------|---------------------|
| Install   | `npm ci`       | exit 0              |
| Typecheck | `npx tsc`      | exit 0              |
| Tests     | `npm test`     | all pass            |
| Lint      | `npm run lint` | exit 0              |
| 統計 inline | `grep -rho 'style={{' src --include="*.tsx" \| wc -l` | 追蹤下降 |

## Scope

**Phase 1 in scope**:
- `AGENTS.md`、`DESIGN.md`（加規則）
- `src/styles/globals.css`（新增 `.ns-field-label`）
- 抽 `.ns-field-label` 時所觸及的 call sites（見 Phase 1 Step 3）

**Phase 2 in scope**（每次 dispatch 指定的檔案）:
- 單一 route/component 檔 + 必要時 `globals.css`（新增共用 class）

**Out of scope (all phases)**:
- COSS 元件內部（`src/components/coss/**`）。
- **動態** inline style（值來自 props/state/計算，如 `width: `${pct}%``、
  `color: someCondition ? … : …`、`background: a.color`）— 這些留 inline 是對的。
- 改變任何算出來的視覺結果（純重構，畫面像素不變）。
- `.ns-*` 既有 class 的定義值。

## Git workflow

- Phase 1 branch: `refactor/ai-style-rule-and-label`
- Phase 2 branch (per file): `refactor/ai-style-cleanup-<filename>`
- Commit style: `refactor(style): <what>`；Phase 2 一檔一 commit。
- Do NOT push or open a PR unless the operator instructed it.

## Phase 1 — 立規則 + 抽最高頻 label 模式

### Step 1: AGENTS.md 加裁決規則

在「## Gotchas worth knowing」或 invariants 區加一條（照該檔既有條列語氣）：

> **樣式撰寫優先序**：(1) COSS 元件；(2) `ns-*` utility class 與 Tailwind
> utilities；(3) inline `style={{}}` **僅限動態值**（來自 props/state/計算）。
> 靜態樣式不要寫 inline——用既有 class 或抽新的 `ns-*` class。重複 3 次以上的
> 靜態 inline 模式應抽成共用 class。

### Step 2: DESIGN.md 同步

在 §12 設計慣例加一小節「樣式撰寫優先序」，內容同上（中文），並指向
`.ns-field-label` 為新抽的範例。

### Step 3: 抽 `.ns-field-label` 並遷移

`globals.css` 加：

```css
/* 表單/區塊小標：muted 小字 + 中等字重。取代重複的
   { marginBottom, color: var(--ns-fg-muted), fontWeight: 500 } inline 模式。 */
.ns-field-label { margin-bottom: 6px; color: var(--ns-fg-muted); font-weight: 500; }
```

然後把符合 `{ marginBottom: 6, color: "var(--ns-fg-muted)", fontWeight: 500 }`
（含 `display: "block"` 變體——`.ns-field-label` 用在 `<label>`/`<div>` 上，
block 由元素本身或加 `block` class 決定）的 inline 換成 `className="… ns-field-label"`。
用 `grep -rn 'color: "var(--ns-fg-muted)", fontWeight: 500' src` 逐處核對：
**只換 marginBottom 為 6、無其他額外屬性**的那些；有額外屬性（如同時設
fontSize、marginTop）的先跳過，留 Phase 2。換完該處若 `style` 物件變空就移除
`style` prop。

**Verify**: `npx tsc` → exit 0；`npm run lint` → exit 0；
`grep -rc 'color: "var(--ns-fg-muted)", fontWeight: 500' src --include="*.tsx" | grep -v ':0' | wc -l` → 明顯下降；
`grep -c "ns-field-label" src/styles/globals.css` → 1。

### Step 4: Phase 1 驗證

**Verify**: `npm test` → all pass；`npm run lint` → exit 0。視覺回歸（label 樣式
不變）deferred to reviewer/operator。

## Phase 2 — 逐檔清理（每次 dispatch 指定檔案）

**建議順序**（inline 數量降冪，高頻先做）：
`CashFlowRoute.tsx`(211) → `InvestmentsAnalyticsTab.tsx`(174) → `DashboardRoute.tsx`(163)
→ `AccountsRoute.tsx`(115) → `settings/ConnectSection.tsx`(101) → `FIRECalculatorRoute.tsx`(101)
→ 其餘 >40 的檔。

**每檔的程序**：
1. 讀該檔所有 `style={{…}}`。
2. **靜態**且能對到既有 class（`.muted`、`.ns-field-label`、`.ns-eyebrow`…）→ 換 class。
3. 靜態的 flex/spacing → Tailwind utilities（`flex flex-col gap-3`、`mt-2`…）。
4. 靜態但重複 ≥3 次於本檔或跨檔 → 抽新 `.ns-*` class 進 globals.css 再套用。
5. **動態**值 → 留 inline（out of scope）。
6. 換完 `style` 若變空 → 移除該 prop。

**每檔驗證**：`npx tsc` → exit 0；`npm run lint` → exit 0；`npm test` → pass；
該檔 `grep -c 'style={{'` 相較改前明顯下降。一檔一 commit。

## Test plan

- 無新單元測試（純重構）；回歸靠 `npm test` + reviewer 逐檔視覺對照（畫面應零變化）。
- Phase 2 每檔獨立可回滾。

## Done criteria

**Phase 1**（可獨立宣告完成）:
- [ ] `npx tsc`、`npm test`、`npm run lint` 全 exit 0
- [ ] AGENTS.md 與 DESIGN.md 都有「樣式撰寫優先序」規則
- [ ] `.ns-field-label` 存在且已遷移多數符合處
- [ ] `grep -rho 'style={{' src --include="*.tsx" | wc -l` 相較 2144 下降

**Phase 2**（每檔）:
- [ ] 該檔 tsc/lint/test 綠，inline 數下降，畫面無變化，一檔一 commit

## STOP conditions

Stop and report back (do not improvise) if:

- 遷移後畫面樣式改變（例如 `.ns-field-label` 的 marginBottom 與某處原本不同）——
  回報差異，別硬套。
- 分不清某個 inline 是靜態還是動態——保守留 inline，記入 NOTES。
- 抽新 class 會與既有 `.ns-*` 撞名——回報，改個名。
- 一檔改動過大（>1 個檔或牽動共用元件行為）——縮回單檔，回報。

## Maintenance notes

- 規則立好後，Plan 102 的 lint 精神可延伸：未來若要**強制**（禁止 routes 內
  靜態 inline），需要一條能分辨靜態/動態的 lint 規則——技術上不容易（AST 難判
  值是否動態），故本計劃靠規則 + review，不加 lint 強制。
- Phase 2 是可長期進行的清償；每完成一檔就在本 plan 的 README 列追記進度。
- Reviewer 檢查重點：畫面像素零變化（純重構）、動態值仍留 inline、無撞名 class。
