# Plan 250: 讓「跟別人借錢」在應付表單一眼可見（文案／可發現性）

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat dea84016..HEAD -- src/routes/CashFlowRoute.tsx`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx / docs（UX 文案）
- **Planned at**: commit `dea84016`, 2026-07-22

## Why this matters

操作者提出需求：「應付的時候應該要可以設定借款到哪個帳戶？因為有個狀況是跟別人
借錢，例如先借錢到現金。」調查結論：**這個能力已經完整存在**（自 alpha.26 /
commit `1d956eab`, 2026-06-07）——應付表單的「收款帳戶」欄位（`counterAccountId`）
正是「借入款項先進哪個帳戶」：建立時立即入帳、結清時由付款帳戶扣款、整筆不計
收支（借款不是收入、還款不是支出——語意完全正確）。

但**app 的操作者本人沒有發現它涵蓋借款情境**——這是最強的可發現性缺陷證據。
現行文案把整個欄位框在「代墊」（reimbursement）語彙裡：「若你已先收到款項…」
「（我先收到，建立時入帳）」，從頭到尾沒出現「借」字。想記「跟朋友借錢」的
使用者不會把「應付＋收款帳戶」連到「借款入帳」。本計劃只改文案，讓借款情境
在應收／應付表單裡被直接點名。不改任何資料模型、行為或標籤以外的邏輯。

## Current state

- `src/routes/CashFlowRoute.tsx` — 收支頁與「記一筆」抽屜；應收/應付（AR/AP）
  區塊在 3766–3876 行。**全部字串為硬編碼繁中**（本檔慣例，不走 `src/locales`）。
- `src/components/arApAccountRoles.ts` — 交易詳情面板的帳戶角色標籤（**out of
  scope**，勿改：`arApAccountRoles.test.ts` 對這些字串有斷言）。
- `src/domain/types.ts:163-178` — `LedgerTransaction.counterAccountId` 的語意
  註解（AP: `counterAccountId` = 收款帳戶，建立時入帳；`accountId` = 付款帳戶，
  結清時扣款）。只讀，供理解，勿改。

今日程式碼（`src/routes/CashFlowRoute.tsx`）：

提示區塊（3768–3772 行）：

```tsx
{type === "ar"
  ? "應收帳款：對方欠你的錢。若你已先用某帳戶代墊，選下方「付款帳戶」會在建立時立即扣款，對方還款時點 ✓ 結清會入「收款帳戶」，整筆代墊不計收支；留空則結清後才計入收入。"
  : "應付帳款：你欠對方的錢。若你已先收到款項，選下方「收款帳戶」會在建立時立即入帳，付款時點 ✓ 結清會由「付款帳戶」扣款，整筆代墊不計收支；留空則結清後才計入支出。"}
```

對象欄位 placeholder（3807 行）：

```tsx
<input className="ns-input" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder={type === "ar" ? "例：小明、ABC 公司" : "例：房東、供應商"} />
```

代墊帳戶欄位標籤（3866 行）：

```tsx
<DrawerField label={type === "ar" ? "付款帳戶（我先墊付，建立時扣款，選填）" : "收款帳戶（我先收到，建立時入帳，選填）"}>
```

已確認：repo 內（含測試）**沒有任何其他檔案引用上述三段字串**
（`grep -rn "我先收到\|我先墊付" src` 只命中 CashFlowRoute.tsx 本身），
所以改字串不會弄斷測試。

## Commands you will need

| Purpose   | Command              | Expected on success        |
|-----------|----------------------|----------------------------|
| Install   | `npm install`        | exit 0                     |
| Typecheck | `npx tsc --noEmit`   | exit 0, no errors          |
| Tests     | `npm run test`       | all pass（~1460+ tests）   |
| Lint      | `npm run lint`       | exit 0, no errors          |

## Scope

**In scope**（唯一可修改的原始碼檔案）：
- `src/routes/CashFlowRoute.tsx` — 僅限 3768–3772、3807、3866 三處字串。
- `plans/README.md` — 狀態列更新。

**Out of scope**（勿碰，即使看起來相關）：
- `src/components/arApAccountRoles.ts` / `.test.ts` — 詳情面板標籤有測試斷言，
  且「付款帳戶（代墊）」在已結清列的語境下仍正確。
- `src/domain/types.ts` — 資料模型與註解不動。
- `src/components/QuickAdd.tsx` — QuickAdd 刻意只支援已結清收支，不擴充 AR/AP。
- 任何行為、狀態、儲存邏輯 — 本計劃是純文案改動。

## Git workflow

- Branch: `fix/ai-payable-borrow-copy`（自 `main` 分支）
- 單一 commit，conventional style，例：
  `fix(cash-flow): name the borrow use case in AR/AP form copy (plan 250)`
- 不要 push、不要開 PR，除非操作者另行指示。

## Steps

### Step 1: 改提示區塊文案（3768–3772 行）

把 ternary 的兩個字串換成（直接點名「借」情境，並保留原有的結清/不計收支說明）：

```tsx
{type === "ar"
  ? "應收帳款：對方欠你的錢（代墊、借錢給別人都算）。選下方「付款帳戶」＝你先出錢的帳戶，建立時立即扣款；對方還款時點 ✓ 結清會入「收款帳戶」，整筆不計收支。留空則結清後才計入收入。"
  : "應付帳款：你欠對方的錢（代墊、跟別人借錢都算）。選下方「收款帳戶」＝錢先進來的帳戶，例如借現金就選現金，建立時立即入帳；還款時點 ✓ 結清會由「付款帳戶」扣款，整筆不計收支。留空則結清後才計入支出。"}
```

**Verify**: `grep -c "跟別人借錢都算" src/routes/CashFlowRoute.tsx` → `1`

### Step 2: 改對象 placeholder（3807 行）

AP 側 placeholder 由 `"例：房東、供應商"` 改為 `"例：借我錢的朋友、房東、供應商"`。
AR 側維持不變。

**Verify**: `grep -c "借我錢的朋友" src/routes/CashFlowRoute.tsx` → `1`

### Step 3: 改代墊帳戶欄位標籤（3866 行）

AP 側標籤由 `"收款帳戶（我先收到，建立時入帳，選填）"` 改為
`"收款帳戶（借入／先收到的錢，建立時入帳，選填）"`。AR 側維持不變。

**Verify**: `grep -c "借入／先收到的錢" src/routes/CashFlowRoute.tsx` → `1`

### Step 4: 全套驗證

**Verify**:
- `npx tsc --noEmit` → exit 0
- `npm run test` → all pass
- `npm run lint` → exit 0
- `git diff --stat` → 只有 `src/routes/CashFlowRoute.tsx`（＋`plans/README.md`）

## Test plan

不新增測試：三處都是 JSX 硬編碼展示字串，repo 對此類 drawer 文案沒有測試先例
（已確認無任何測試引用原字串）。既有全套 vitest 通過即為迴歸保證。

## Done criteria

Machine-checkable，全部成立：

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run test` exits 0
- [ ] `npm run lint` exits 0
- [ ] `grep -c "跟別人借錢都算" src/routes/CashFlowRoute.tsx` → 1
- [ ] `grep -c "我先收到，建立時入帳" src/routes/CashFlowRoute.tsx` → 0（舊 AP 標籤已被取代）
- [ ] `git status` 顯示除 in-scope 檔案外無其他修改
- [ ] `plans/README.md` 狀態列已更新

## STOP conditions

Stop and report back（不要即興發揮）if：

- "Current state" 的三段摘錄與現行程式碼不符（行號漂移可接受——以字串內容
  定位；但**字串內容本身**已不同就 STOP）。
- 發現任何測試或 e2e 引用了被改動的字串（撰寫時確認為零；若出現代表 drift）。
- 改動後 `npm run test` 有任何失敗且與本改動相關性不明。

## Maintenance notes

- 若未來把 CashFlowRoute 的硬編碼字串遷移到 `src/locales` i18n，這三段文案
  一併遷移即可，無特殊耦合。
- Reviewer 應檢查：diff 僅含字串變更、無任何邏輯/JSX 結構變動。
- 明確不做（已考慮而排除）：
  - **不新增獨立的「借款」交易類型** — `counterAccountId` 語意已完全涵蓋
    （借入=AP+收款帳戶；借出=AR+付款帳戶），新類型只會分裂資料模型。
  - **不在 QuickAdd 加 AR/AP** — QuickAdd 刻意限縮在已結清收支（見
    `QuickAdd.tsx:26` 的型別），擴充屬產品決策，需操作者另行拍板。
  - 銀行/機構貸款仍走帳戶層的 `loanStartDate`/`annualInterestRate`/`loanTerm`
    （`types.ts:150-152`），與本情境（個人間借款）分屬兩套正確機制。
