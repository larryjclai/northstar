# Plan 286: e2e 改用 fixture 播種，取代點 UI 造資料

> **Executor instructions**: 在 git worktree 的分支 `test/ai-e2e-fixture-seeding` 上工作。
> **第一件事**：`pwd` 確認在 worktree；`npm install`；接著
> `git checkout -b test/ai-e2e-fixture-seeding main`，然後 `git log --oneline -1` 的 SHA
> 必須是 `4736832d`。對不上就 STOP 回報。
>
> **這份計畫只改／新增測試檔，不准動任何 `src/` 底下的應用程式碼。**
>
> **Drift check**：
> ```bash
> git diff --stat 4736832d..HEAD -- src/test/e2e/sticky-chrome.spec.ts
> ```
> 空輸出才往下走。

## Status

- **Priority**: P3（測試品質，不影響出貨）· **Effort**: M · **Risk**: LOW（只動測試）
- **Depends on**: 無（284B 的 timeout 修復已 merge @ `44d7c384`）
- **Category**: test infrastructure
- **Planned at**: commit `4736832d`, 2026-08-01
- **Requested by**: operator, 2026-08-01

## 問題：測試花 15 秒點 UI 造資料，然後靠 90 秒 timeout 撐著

`src/test/e2e/sticky-chrome.spec.ts` 目前每個 case 的 setup：

1. 進設定 → 點「進入示範模式」→ **固定等 7 秒**
2. 把日期範圍從「本月」拓寬到「近 12 個月」（示範資料在本月太少）
3. **用 CSV 匯入 60 列**交易（示範資料仍不夠高）
4. 展開 2 個折疊的月份標題（長區間走月份分組，不是日分組）

這串在開發機約 15 秒、在 CI 更久。284B 就是因此在 CI 撞上 Playwright 預設的 30 秒上限，
最後靠 `test.describe.configure({ timeout: 90_000 })` 解決 —— **那是給真實成本讓出空間，
不是修掉成本**。

而且步驟 1 的 `waitForTimeout(7_000)` 是**固定等待**：機器快也等滿 7 秒，機器慢可能還不夠。
這正是不穩定的來源。

## 可行性：已查證，走 localStorage 就好

瀏覽器端的 repository 這樣載入資料（`src/data/repositories.ts:3102-3118`）：

```ts
async function loadBrowserRepositoryData(storageKey) {
  const indexedDbData = await readIndexedDbRepositoryData();
  if (indexedDbData) return indexedDbData;

  const localStorageData = readLocalStorageRepositoryData(storageKey);
  if (!localStorageData) return null;
  ...
}
```

**IndexedDB 先，找不到就退回 localStorage。** 所以測試只要在頁面腳本執行前把資料寫進
localStorage 就行 —— 不需要碰 IndexedDB（那要 async、要開 db、要等 upgrade，複雜得多）。

| 事實 | 出處 |
|---|---|
| localStorage key | `northstar.browserRepository.v1`（`repositories.ts:994`） |
| 資料形狀 | `Partial<RepositoryData>` —— `normalizeStoredData` 對**每個欄位**都 `?? []`（`repositories.ts:7518-7527`），所以只給 `accounts` + `ledgerTransactions` 就夠 |
| **不需要提供 books** | `ensureDefaultBookInMemory()` 在載入時自動建立「個人帳」並把帳戶掛上去（`repositories.ts:1034/1040/1124-1143`） |
| 寫入時機 | Playwright 的 `page.addInitScript()` —— 在頁面腳本之前執行，`page-width.spec.ts` 已經用它關 onboarding |

## 關鍵設計：把交易集中在「最近 3 天」

`CashFlowRoute.tsx:1706-1720` 的 `defaultVisibleCount`：

```
// Default visible window = the most recent 3 days' worth of rows
```

**預設只渲染最近 3 個不同日期的列。** 所以「在本月灑 60 筆分散在 30 天」只會渲染出 3 天份、
頁面還是不夠高；但「**60 筆集中在最近 3 天**」會全部渲染。

這一條讓 setup 從四步變成零步：

| 現在 | 改後 |
|---|---|
| 進示範模式（等 7 秒） | fixture 直接有資料 |
| 拓寬到近 12 個月 | 不需要 —— 資料就在本月，預設區間就看得到 |
| CSV 匯入 60 列 | fixture 直接有 60 列 |
| 展開 2 個月份 | 不需要 —— 短區間走日分組，不折疊 |

（長短區間的分界是 92 天，`CashFlowRoute.tsx:235` `LONG_RANGE_CUSTOM_DAYS`。
本月屬短區間，走日分組 + 「顯示更早的交易」分頁鈕，不是月份折疊。）

## Files in scope

**新增**
- `src/test/e2e/fixtures/seed.ts`（或 `src/test/e2e/seed-fixture.ts` —— 位置你決定，
  但必須在 `src/test/e2e/` 底下，且**檔名不可被 `testMatch` 當成測試檔**。
  現行 `playwright.config.ts` 沒有 `testMatch`，預設會把 `*.spec.ts` 當測試，
  所以只要不叫 `*.spec.ts` 就安全。）

**修改**
- `src/test/e2e/sticky-chrome.spec.ts`

**不准碰**

| 檔案 | 為什麼 |
|---|---|
| `src/data/**`、`src/routes/**`、`src/components/**` 等所有應用程式碼 | 這是測試計畫。若你覺得需要為了測試而改產品碼 → **STOP 回報** |
| `playwright.config.ts` | 不需要改；如果你認為需要，STOP 回報 |
| `src/test/e2e/smoke.spec.ts`、`page-width.spec.ts` | 它們不依賴播種，別動 |
| `src/data/demoData.ts` | 示範模式是產品功能，不是測試工具 |

## 專案慣例

1. **`page-width.spec.ts` 是這個目錄的範本** —— `test.use({ viewport, isMobile, hasTouch })`
   在 describe 層、`addInitScript` 關 onboarding。照它的形狀。
2. **`sticky-chrome.spec.ts` 現有的註解密度要保留** —— 那些註解記錄了踩過的坑
   （sentinel 為什麼不能用 `scrollY > 0`、`setViewportSize` 為什麼不夠、timeout 為什麼要放寬）。
   **不要因為重寫 setup 就把它們刪掉。**
3. 型別要真的對 —— fixture 用 `import type { LedgerTransaction, Account } from "../../domain"`
   之類的具名型別，讓 `tsc` 幫你擋掉欄位錯誤。**不要用 `as any` 繞過型別。**

---

## Step 1 — 寫 fixture 建構器

新檔案匯出一個函式，產生 `Partial<RepositoryData>` 形狀的物件，以及一個
把它裝進 `addInitScript` 的 helper。大致形狀：

```ts
// 這裡的 key 與形狀對應 src/data/repositories.ts:994 的 storageKey 與
// loadBrowserRepositoryData 的 localStorage fallback（repositories.ts:3108）。
// IndexedDB 優先、找不到才讀 localStorage，而測試環境的 IDB 是空的，
// 所以寫 localStorage 就會被讀到。
const STORAGE_KEY = "northstar.browserRepository.v1";

export function buildLedgerFixture(opts: { rows: number; days: number }): ... {
  // 交易日期必須落在「本月」且集中在最近 `days` 個不同日期 ——
  // CashFlowRoute 的 defaultVisibleCount 只渲染最近 3 天份
  // （CashFlowRoute.tsx:1706-1720）。分散到 30 天的話畫面高度不夠。
}

export async function seedLedger(page: Page, opts) {
  await page.addInitScript(([key, data]) => {
    window.localStorage.setItem(key, data);
  }, [STORAGE_KEY, JSON.stringify(buildLedgerFixture(opts))] as const);
}
```

要求：

- **日期用「今天往回數」動態產生**，不要寫死 `2026-08-01` 之類的字串 ——
  寫死的日期明年就會掉出「本月」而讓測試無聲失效。
- 帳戶只要 **1 個**就夠（交易的 `accountId` 指向它）。
- **不要提供 `books`** —— `ensureDefaultBookInMemory()` 會處理。
- 金額、分類、商家隨便給合理值即可，但**必須 deterministic**（不准用 `Math.random()`，
  否則失敗時無法重現）。
- 同時保留 onboarding 的關閉（現有 `dismissOnboarding` 的行為）。

**Verify**：
```bash
npx tsc --noEmit          # 0 —— 型別是這一步的主要驗證
npm run lint              # 0 errors
npm run format:check      # clean
```

**STOP condition**：若 `tsc` 逼你為了讓 fixture 通過型別而加 `as any` 或 `@ts-expect-error`，
**STOP 回報** —— 那代表 fixture 的形狀猜錯了，我要知道，而不是讓你繞過去。

---

## Step 2 — 記帳的三個 case 改用 fixture

`sticky-chrome.spec.ts` 裡三個走 `/cash-flow` 的 case（1440×900、1024×768、390×780）：

- 刪掉 `enterDemoMode`、`widenCashFlowDateRange`、`seedExtraCashFlowTransactions`、
  `expandCashFlowMonths`、`prepareTallCashFlowPage` 這些 helper 以及它們的呼叫。
- 改成在 `goto` 之前呼叫 `seedLedger(page, { rows: 60, days: 3 })`（列數自己調到夠高為止）。
- **`assertTallEnoughToScroll` 保留** —— 它是 STOP 條件的守門員，換了播種方式之後更需要它。
- **`assertServingThisWorktree` 保留**。
- **所有斷言一字不改**：`≤56px`、`≤100px`、`height < restBox.height`、
  `tabsBox.height <= 48`、`scrollWidth > clientWidth`。

**Verify**：用臨時 config（見 Step 4 的注意事項）跑，三個記帳 case 必須綠，
且**回報每個 case 的實際耗時**與 `document.body.scrollHeight`。

---

## Step 3 — 投資那個 case：先決定，再動手

第四個 case 走 `/investments` → **分析**分頁。它比較麻煩，因為分析分頁有 gating：

```
navCanRender = positions.length > 0 && hasHistory          (InvestmentsAnalyticsTab.tsx:703)
hasHistory   = hasEnoughReturns(dailyReturns(...))         (:658-660)
hasEnoughReturns → returns.length >= MIN_ANALYTICS_DAYS = 30   (portfolioAnalytics.ts:51-56)
```

也就是說要讓分析分頁渲染，fixture 得包含 **portfolioAssets + investmentRecords +
至少 30 天的 dailyPrices**。

**這個 case 同時在守兩件事**，拆開來看：

| 它驗的東西 | 需要分析分頁嗎 |
|---|---|
| 投資頁的 chrome 會凝縮到 ≤56px | **不需要** —— 只要頁面夠高就行 |
| 分析分頁的區塊導覽列緊貼 chrome 下緣（284A 那個 bug 的回歸守門） | **需要** |

**建議做法（照這個做）**：

1. **chrome 凝縮**的部分改用**持倉**分頁 + fixture 播 `portfolioAssets`
   （純清單，沒有 gating，便宜又穩）。
2. **分析導覽列**那條斷言**保留在分析分頁**，並為它播 30 天以上的 `dailyPrices`。
   這是 284A 那個「示範模式下導覽列被橫幅 100% 蓋住、完全點不到」的回歸守門，
   **價值高，不要為了省事刪掉**。

**STOP condition**：若播 30 天 dailyPrices 讓 fixture 複雜到你覺得不對勁
（例如需要跟著補 marketQuotes、FX、或一堆衍生欄位才過得了 gating），
**STOP 回報實際卡在哪**。屆時的退路是「這一個 case 保留示範模式、其餘三個用 fixture」，
但**那要我決定，不要自己選**。

---

## Step 4 — 重新評估 timeout

setup 變快之後，284B 那個 `timeout: 90_000` 可能就不需要了。**但這件事有前科**：

> 284B 的教訓（`plans/README.md`）：本機綠**不是** CI 會綠的證據。那次的 flake 成因是
> runner 比開發機慢 2–3 倍，本機用任何跑法都重現不了。

所以：

- **不要**因為本機變快就直接把 timeout 拿掉。
- 做法是：**先不動 timeout**，把 Step 1–3 完成並讓 CI 綠一次；
  **降 timeout 是另一個 commit**，讓 advisor 推上去看 CI 結果再決定。
- 在你的回報裡給出**每個 case 實測耗時**，advisor 會據此決定新的上限
  （原則：CI 大約是開發機的 2–3 倍，上限要留該倍數之上的餘裕）。

**若你自作主張把 timeout 改回 30 秒並宣稱修好了 → 那正是 284B 犯過的錯。**

---

## Step 5 — 驗證

⚠️ **臨時 playwright config 的欄位必須與 `playwright.config.ts` 逐項相同，只能改 port 與
`reuseExistingServer`。** 284B 就是因為臨時 config 多寫了 `timeout: 120_000`，
導致本機量到的結果與 CI 沒有可比性。

```ts
// pw-tmp.config.ts —— 除 port 與 reuseExistingServer 外，與 playwright.config.ts 完全相同
import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./src/test/e2e",
  webServer: {
    command: "npm run dev -- --port 5229 --strictPort",
    url: "http://127.0.0.1:5229",
    reuseExistingServer: false,
  },
  use: { baseURL: "http://127.0.0.1:5229" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 15"] } },
  ],
});
```

**注意它沒有 `timeout`** —— 這是刻意的，要跟 CI 一樣吃 Playwright 預設的 30 秒。

跑三次，回報每次結果。全部 **14/14**。跑完刪掉 `pw-tmp.config.ts`。

```bash
npx tsc --noEmit && npm run lint && npm run format:check && npm test
```

`npm test`（單元測試）數字必須與 baseline **完全相同** —— 這份計畫不碰單元測試。

## Done criteria（機器可驗）

```bash
# 1. 只動了測試檔，零應用程式碼
git diff --name-only 4736832d..HEAD          # 期望只有 src/test/e2e/ 底下的檔案
git diff --stat 4736832d..HEAD -- src/data src/routes src/components src/domain src/hooks src/styles
#   → 期望空輸出

# 2. UI 播種的 helper 已退場
grep -c "進入示範模式\|seedExtraCashFlowTransactions\|expandCashFlowMonths" src/test/e2e/sticky-chrome.spec.ts
#   → 期望 0（除非 Step 3 的 STOP 走了退路，那要在回報裡說明）

# 3. 固定等待已退場
grep -n "waitForTimeout(7_000)\|waitForTimeout(7000)" src/test/e2e/sticky-chrome.spec.ts   # 期望 0 命中

# 4. 斷言一條都沒少
grep -c "toBeLessThanOrEqual(56)\|toBeLessThanOrEqual(100)\|toBeLessThanOrEqual(48)\|toBeGreaterThan(clientWidth)\|toBeLessThan(restBox" src/test/e2e/sticky-chrome.spec.ts
#   → 期望與改動前相同（改動前是 8）

# 5. fixture 檔不會被當成測試跑
ls src/test/e2e/                              # 新檔不可叫 *.spec.ts

# 6. 沒有 as any / ts-expect-error
grep -c "as any\|@ts-expect-error" src/test/e2e/   # 期望 0
```

## Test plan

不新增測試 —— **這份計畫是換掉既有 4 個測試的 setup，測試數量與斷言都不變**。
判斷成功的標準是「同樣的斷言、更少的 setup、更短的時間、CI 仍然綠」。

## STOP conditions

1. 需要改任何 `src/` 底下的應用程式碼。
2. fixture 需要 `as any` / `@ts-expect-error` 才通過型別。
3. 分析分頁的 gating 讓 fixture 複雜到失控（見 Step 3）。
4. 任何斷言需要放寬才會綠。
5. 單元測試數量改變或有既有測試轉紅。

## Maintenance note

- **`defaultVisibleCount` 只渲染最近 3 天** —— 這是 fixture 必須把交易集中在少數幾天的原因。
  若日後那個邏輯改了（例如改成固定筆數），fixture 的分佈假設要跟著改，
  否則測試會以「頁面不夠高」的形式失敗。`assertTallEnoughToScroll` 就是為了讓那個失敗
  講人話而不是變成一個看不懂的 timeout。
- **localStorage 是 fallback 路徑，不是主要路徑。** 產品優先讀 IndexedDB。
  若日後 IDB 那條路變成唯一路徑，這套播種就會無聲失效 ——
  屆時 `assertTallEnoughToScroll` 會先炸，那是刻意的設計。
- **不要把 fixture 搬進 `src/data/`**。它是測試工具，不是產品資料；
  `demoData.ts` 是產品功能（使用者看得到的示範模式），兩者不可混用。
