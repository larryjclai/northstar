# Implementation Plans

## 🔄 Reconciled 2026-07-26 @ `0aa7f972`

278 份計畫全數盤點。**沒有 IN PROGRESS，沒有未處理的 TODO，沒有漂移的計畫。**
259–275 這批在同一個 session 內完成，這次 reconcile 的價值在於**獨立複驗它們在當前 HEAD 上仍然成立**，
而不是複述 session 記憶。

### 現況（全部在 `0aa7f972` 實跑）

| 檢查                                                                              | 結果                                                            |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `npm test`                                                                        | 130 檔 / **1512 全過**                                          |
| `tsc --noEmit` / `lint` / `format:check` / `build`                                | 全部 exit 0                                                     |
| `check-eager-bundle.mjs`                                                          | exit 0；charts 不在 eager set；14 route chunks / 14 lazy routes |
| `no-useless-assignment` / `preserve-caught-error` / `react-hooks/refs` / `purity` | **全部 0**                                                      |
| 工作區 / 未推送 commit                                                            | 0 / 0                                                           |

### 一個「像回歸、其實不是」的發現

259 的兩條驗收條件現在對不上：`migrations.ts` 的 `create index if not exists` 是 **16**（原訂 14），
`repositories.ts` 是 **0**（原訂 2）。

**不是回歸。** 268 把 imperative 的 index 語句從 `repositories.ts` 搬進 `migrations.ts` 的
宣告式 `ADDITIVE_INDEXES` 陣列——那正是 268 的設計目的（讓 DDL 可被 fingerprint）。
逐一比對 13 個索引名稱，**全部仍然存在**。

已在 259 的計畫檔標註,並改成驗**性質**而非驗字串位置：

```bash
grep -ohE "idx_[a-z_]+" src/data/migrations.ts src/data/repositories.ts | sort -u
```

這是**同一個教訓的第三次**：269 修掉 R2 的 chunk 數量帶、275 發現 alias 從沒被執行過，
現在是 259 的 grep 條件被 268 搬家搞失效。**斷言代理指標，代理就會漂走。**

### ⚠️ 仍待 operator（跨 reconcile 未動，已第二次點名）

**`RELEASES_TOKEN` 是孤兒 secret，建議撤銷。** 2026-07-25 那次 reconcile 已點名，今天複查：

- `gh secret list` → **仍然存在**，建立於 2026-06-02（約兩個月）
- `grep -rn "RELEASES_TOKEN" .github/` → **零命中**，沒有任何 workflow 還在用它

也就是說這是一個**沒有任何用途、卻仍具備寫入權限的 PAT**躺在 repo secrets 裡。

**更新（同日，operator 明確指示後）**：repo secret **已刪除**
（`gh secret delete RELEASES_TOKEN`；`gh secret list` 複驗不再列出）。
刪除前全 repo 複查零引用。

**✅ 2026-07-26 結案。** operator 已在 GitHub 撤銷該 PAT，advisor 已刪除 repo secret
（`gh secret list` 複驗只剩 4 個，`RELEASES_TOKEN` 不在其中）。**plan 243 Step 4 至此完成，243 全案關閉。**

其餘既有 operator 項目維持原狀：238 的 5 個問題仍 gate 著 vault-key rotation；
233/245/246/247 的手感驗收非阻塞。

### Dependabot 複查：2 個 open alert，兩個都不影響出貨的 app

GitHub 在每次 push 都提示「3 high」，實際查 API 是 **2 個 open**（另一個已關）。逐一追過：

| 套件          | Dependabot 標的 scope | 實際情況                                                                 |
| ------------- | --------------------- | ------------------------------------------------------------------------ |
| `postcss`     | development           | 確認為 dev-only（`autoprefixer` / `shadcn` 的相依，不進 runtime bundle） |
| `quinn-proto` | **runtime** ⚠️        | **實際上沒有被編進 binary** —— 見下                                      |

`quinn-proto` 值得說明，因為 Dependabot 把它標成 runtime，看起來像是真的暴露：

- 它由 `reqwest` 帶進**鎖檔**，但 `src-tauri/Cargo.toml:33` 是
  `reqwest = { default-features = false, features = ["json", "rustls-tls"] }` ——
  **`http3` 沒開**，而 quinn 只在 `http3` 之下才會被編譯。
- `cargo tree -i quinn-proto`（host target）回報 **"nothing to print"** —— 它不在建置圖裡。

Cargo.lock 會記錄 optional 相依的解析結果，Dependabot 讀鎖檔、看不到 feature 沒啟用，
所以誤判為 runtime。**這是 false positive，不需要處理**，但值得記著：
下次若有人啟用 `reqwest/http3`，這個 alert 就會從誤判變成真的。

（先前記錄「所有 Dependabot alert 皆為 dev-only」需要修正 —— `quinn-proto` 不是 dev-only，
它是 **lockfile-only**，兩者不同。）

### 一個順帶的影響（不阻塞任何事）

270 重排了 279 個 `src/` 檔案，所以**任何引用 `src/` 程式碼的舊計畫，其 excerpt 現在都與檔案不再逐字相符**
（縮排／換行變了）。對已 DONE 的計畫無害——它們是記錄。但若日後要重跑某份舊計畫，
drift check 會亮，需要先刷新 excerpt。目前沒有 TODO 的舊計畫，所以不擋任何事。

## 🚨 2026-07-31 事故 — `v0.2.0-beta.2` 少了 Apple Silicon 與 Windows 產物（CI 全綠）

**症狀**：operator 在 app 內按「檢查更新」得到
`None of the fallback platforms ["darwin-aarch64-app", "darwin-aarch64"] were found`。

**根因**：同一個 tag 產生了**兩個 release**。四個 build job 各自把 `tagName` 交給
tauri-action，而它是「用 tag 查詢，查不到就建立」——但 **GitHub 不會把 draft release
綁到 tag 上**（draft 只能用 id 定位），所以查詢漏掉兄弟 job 剛建好的 draft，分裂成：

| release | 內容 |
| --- | --- |
| `363049988`（**已發布**） | macOS x86_64 + Linux；`latest.json` 只有 5 個 platform 鍵 |
| `363050034`（**孤兒 draft**） | **macOS aarch64 + Windows**；`latest.json` 另外 4 個鍵 |

`publish` job 用 `... | head -1` 找 draft，挑中一個就發布，**另一個連同它的產物永遠沒人看到**。
四個 job 全部回報 success。

**這是「驗收要掃 binary、不能只看 CI 綠燈」的第二次實例**（第一次是 release CI env）。
advisor 在發版時只確認了 workflow `completed/success` 就回報完成，**沒有比對產物清單** ——
這是流程缺口，已寫進 workflow 讓機器來擋。

### 根治（先做）— `fix/ai-release-race`，已 merge @ `ae800509`

1. **一個 tag 只建一個 release**：`notes` job 建立（或重用）唯一的 draft 並輸出 id，
   四個 build job 改用 tauri-action 的 `releaseId` 上傳。tauri-action 會把 `latest.json`
   與 release 上既有的合併，所以四個 job 現在收斂到**一份完整檔案**而不是兩份半套。
2. **`publish` 不再信任 CI 綠燈**：改用 id 定位，並在翻正式版前驗三件事（無第二個同 tag
   release／五個安裝檔齊全／`latest.json` 四個平台鍵齊全且版本相符），任一不過就 fail。

**這個 guard 是實測過的**，不是寫完就算：拿真實 release 跑驗證腳本 ——
`v0.2.0-beta.1`（已知正常）exit 0；分裂的 `v0.2.0-beta.2` exit 1（擋在第 1 關）；
把第 1 關繞過後，第 2 關**獨立**抓到缺少 `_aarch64.dmg` 與 `x64-setup.exe`。兩層各自都能攔。

### 止血（後做）

把孤兒 draft 的 5 個產物搬到已發布的 release、合併兩份 `latest.json`（9 個 platform 鍵，
與 beta.1 的已知正常集合完全一致）、刪除孤兒 draft。

⚠️ **過程中踩到同一個坑的縮影**：第一次用 `gh release upload v0.2.0-beta.2 …` 上傳，
**東西又跑進 draft** —— 因為 `gh` 也是用 tag 定位，而當時兩個 release 共用該 tag。
改用 `releases/<id>/assets` 端點明確指定 id 才成功。**tag 在這種狀態下是不明確的定址方式**，
這正是 workflow 改用 id 的理由。

驗收（全部實跑）：live release 13 個產物（與 beta.1 相同）、
`releases/latest/download/latest.json` 回傳 9 個 platform 鍵含 `darwin-aarch64`、
aarch64 的 `.dmg` 與 `.app.tar.gz` 匿名下載皆 HTTP 200 且大小正確、該 tag 只剩一個 release。

> 備註：換掉 `latest.json` 後約一分鐘內，`releases/latest/download/` 這條路徑仍短暫回傳舊內容
> （blob storage 最終一致性，redirect 本身是 `no-cache`）。稍等即恢復，不需要額外處理。

## 🧹 2026-07-31 收尾 — 死 token 併入、260 保存分支退場、分支/worktree 清理 @ `d7e652d6`

### `fix/ai-dead-shadow-token` — reviewed+APPROVED，**已 merge**（`d7e652d6`）

從本批的順手發現長成一份完整修正。**advisor 複驗要點**：

- 它比原始任務**多做了兩件事**（a11y 修正 + 新增測試檔），advisor 逐項查證後判定**都成立**：
  - `--ns-warn-soft` 在 main **確實未定義**（`grep -- "--ns-warn-soft:"` 零命中），
    而 `--ns-warning-soft` **是有定義的真 token**（3 處，含深色主題）。分支是把死引用改成活的，
    **不是**反過來引入新的死 token —— 這是我一開始最擔心的失敗模式，實際查證後排除。
  - ConnectSection 七個警告面板原本落在 fallback 上，其中兩個是寫死的 `#fef3c7`；
    深色模式下等於淺琥珀底 + `--ns-warn` 文字，**對比 1.53:1**（實質不可讀）。改後 7.96:1。
- 新增的 `src/styles/designTokens.test.ts` 是**真測試**：走訪原始碼樹、收集已定義 token 與所有
  `var(--ns-*)` 引用，對「無 fallback 且指向未定義 token」的引用 fail。而且它自帶**反空轉 canary**
  （檔案 > 100、定義 > 50、引用 > 100），避免 refactor 後掃不到東西還綠燈。
- **在 merge 結果上驗收，而非只驗分支**：tsc/lint(0 errors)/format/build 全 0、
  **132 檔 / 1530 測試**、playwright 6/6、死引用殘留 **0**。
  順帶交叉驗證：279/280/281 新增的 `--ns-page-max` / `--ns-page-gutter` / `--ns-shadow-strong`
  全部通過這支新 guard test。

### `wip/ai-plan260-blocked` — **判定不可 merge**，已標籤保存後刪除

operator 要求「兩支都併進去」，但這支經查**不能併**，advisor 沒有照做，改為回報後保存刪除：

- 它自己的 commit message 就寫著 BLOCKED，且會讓 `repositories.creditGroup.test.ts` **倒 2 個測試**。
- index 早已記錄 260 **SUPERSEDED by 268**：前提是錯的 —— 那三個 backfill/heal 函式是**持續性
  資料自癒**，gate 掉會讓同步進來的髒資料**永遠不被修**。對理財 App 是資料完整性問題，不是風格議題。
- advisor 實地複核 268 的重寫**確實在 main**（`repositories.ts:3348 runSchemaDdl`），
  且 260 當初弄倒的那支測試在 main 上 **20/20 全過**。
- 刪除前先打標籤 **`archive/plan260-blocked-2026-07-31`**（指向 `fe24855e`），
  隨時可用 `git checkout -b <name> archive/plan260-blocked-2026-07-31` 復原。

### 清理結果

- **刪除 worktree 3 個**（advisor 自己派工建立的 agent worktree）。
- **刪除分支 7 條**：3 條已合併的計畫分支（279/280/281）+ 3 條 harness 自動建立的
  `worktree-agent-*` + 1 條 `wip/ai-plan260-blocked`（已標籤）。
- **刻意保留**：`fix/ai-dead-shadow-token` 分支與 `jolly-elion-abcc46` worktree ——
  該 worktree 裡**還有另一個 Claude session 活著**（`lsof` 查到 pid 34960 的 cwd 在其中），
  在別人腳下砍目錄會弄壞那個 session。等該 session 關閉後可自行刪除。
- **未動**：`archive/*`、`backup/*`、`claude/jolly-elion-abcc46` —— 都是 operator 自己的長期分支。

## 279–280 — 桌機寬度 + 總覽趨勢圖（`/improve plan` @ `27e3c8e1`, 2026-07-30）

Operator 兩項回報，兩份計畫。**都是呈現層，零財務計算變更。**

| Plan | Title                                                                                                                                                                              | Priority | Effort | Depends on          | Status |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------------------- | ------ |
| 279  | 全站頁面寬度契約：抽出 `--ns-page-max: 1920px` + `.ns-page`，取代 9 處寫死的 `maxWidth: 1180`。桌機大螢幕不再留死白（2560 螢幕單邊死白 570px → 0）                                  | P2       | S      | —                   | **DONE — reviewed+APPROVED**（未 merge，等 operator）：分支 `fix/ai-page-width` @ `3cdcbb21`，8 檔 / +74 −32。advisor 在 worktree 獨立複驗全部閘門（tsc 0、lint 0 errors／799 既有 warnings、format:check 乾淨、**1512/1512 與 baseline 完全相同**、build 0、playwright 6/6）。**另外自己量了計畫沒要求的東西**：7 種視窗 × 6 條路由的實際 shell 寬度 —— 375→375(gutter 16)、1024→784、1440→1200、1512→1272、1920→1680(gutter 48)、2560→**1920 封頂**（主欄 2320，即單邊 200px 留白）、3840→1920 天花板守住；**每一格 `scrollWidth === clientWidth`，零橫向溢出**（計畫的 STOP 條件之一，執行者沒驗）。列印覆蓋鏈也實測：`.ns-annual-report.ns-page` 在 screen 是 `max-width: 1920px`，`emulateMedia("print")` 後變 `none` / `padding-left: 0`（另一條執行者沒驗的 STOP 條件）。範圍乾淨：out-of-scope 那 5 個路由零命中 |
| 280  | 總覽 hero 的淨值趨勢從 300×64 裝飾用 sparkline 升級為卡片主圖：X/Y 軸標籤、hover 十字 + tooltip（日期／淨值／相對區間起點的變化）、區間起點 dashed 基準線。順手修掉固定 ±20000 的 Y domain | P2       | M      | 279（已 merge @ `b7bfd7a1`） | **DONE — reviewed+APPROVED**（未 merge，等 operator）：分支 `feat/ai-hero-trend-chart` @ `36e6d4bf`，4 檔 / +356 −41（新增 `dashboardHeroTrend.ts` + 9 個測試）。閘門全綠：tsc 0、lint 0 errors／799 既有 warnings、format 乾淨、**131 檔 / 1521 測試**（baseline 1512 + 9）、build 0、playwright 6/6。**最關鍵的一條實測成立**：`git diff` 對 `reconciledTrend`/`rangeView`/`longView`/`visibleTrend`/`momChange`/`momPct` 零命中 —— 財務數字來源一行都沒動。**advisor 用 Playwright 真實滑鼠事件獨立複驗**（執行者受 browser pane 限制只能用 click-drag）：X 軸 6 個日期刻度（6/29…7/30，maxTicks=6 均勻分布含頭尾）、Y 軸 4 個 compact 金額刻度、grid、`起點 TWD −7.41萬` 基準線 label、hover 出現十字 + active dot + 三行 tooltip、tooltip 變化數字 class 為 `text-caption num gain`（**走 gain/loss 色軸，無 pos/neg**）。**plan-032 invariant 實測**：hover 最右端點的 tooltip 金額 `617161` 與 hero headline `617161` **完全相同**。隱私模式（⌘⇧H）：Y 軸元素整條消失、基準線 label 消失、圖內 4 位以上數字掃描為 **0**。高度 240/190/160 對應 1440/900/390，三種寬度皆零橫向溢出 |

**Operator 已拍板的兩個決策**（2026-07-30，寫在這裡以免日後重審）：

1. **寬度＝滿版但設 1920px 天花板**（不是無上限、也不是只提高到 1440）。理由：27" 2560
   螢幕實務上等於邊到邊，4K/5K 又不會出現一列表格橫跨 2500px。
2. **趨勢圖＝升級成 hero 卡內的主圖**（不是把預設隱藏的「淨值趨勢」卡復活、也不是移除它）。
   那張降級卡片還裝著 `PortfolioStrip` 與四張資產 KPI，退場得先幫它們找新家 → 279/280
   都不碰，留作後續計畫。

**調查中確認的兩件事（別再重查）**：

- 1180 這個上限**只在視窗 > 1420px（240 側邊欄 + 1180）時才咬到**——所以「筆電看起來滿版」
  不是巧合，是上限根本沒生效。Operator 的觀察完全正確。
- `FIRECalculatorRoute` / `HoldingDetailRoute` / `ReconcileRoute` / `CategoriesRoute`
  **本來就沒有 `max-width`**，今天就是滿版在跑。它們是「拿掉上限不會炸」的現成證據，
  也因此**不在 279 範圍內**（套上 `.ns-page` 反而會把它們變窄，那是回歸）。

### 279 執行後：計畫本身的兩條驗收條件寫壞了（實作沒問題）

執行者照實回報、沒有為了變綠而動手，這是對的。兩條都是**我寫的 grep 太鬆**，不是缺陷：

1. `grep -rn "1180" src/` → 4 命中，全部是**散文**：`globals.css` 註解裡的沿革說明兩處
   （而那段註解正是計畫 Step 1 自己指定要寫的字）、新 e2e 的 test 名稱與註解各一處。
   真正的魔術數字用法 `grep -rn "maxWidth: 1180\|max-w-\[1180px\]" src/` → **0**。
   → 判準該寫成後者，不是「repo 內不准出現 1180 這四個字」。
2. `grep -c "ns-page\b" src/routes/*.tsx` 合計 **10** 而非計畫寫的 9。第 10 個是
   `InvestmentsRoute.tsx:620` 的 `ns-page-tabs`（既有 class）—— `\b` 在 `-` 前面成立，
   所以 `ns-page\b` 會吃到 `ns-page-tabs`。`.ns-page` 的實際套用數是 **9**，完全符合。

**同一個教訓的第四次**（269 chunk 數量帶、275 alias 從沒執行、259 被 268 搬家搞失效）：
**斷言代理指標，代理就會漂走。** 判準要斷言性質（「魔術數字用法為 0」），不要斷言字串出現次數。

### 280 派工的環境教訓：worktree 不是從當前 main 切出來的

第一次派 280 空跑了。**harness 建立的 worktree 基準 commit 是 session 起始的 `27e3c8e1`，不是當前 `main`**，
所以 advisor 讓執行者「從 worktree 讀已 commit 的計畫」時，那個 commit 裡還沒有 279/280 的計畫檔。
執行者在第一道 gate 就停住、零檔案變更、worktree 乾淨 —— **正確行為**。

更嚴重的是它避開的第二個後果：那個 worktree **不含 279 的變更**，若硬做下去，280 剛刷新過的
行號會全部差 3 行，drift check 還會把 279 的變更倒過來顯示成漂移。

修法（第二次派工用的，之後照抄）：強制前置步驟
`git checkout -b <plan-branch> main` → `git log --oneline -3` 必須看到預期的 main HEAD，
看不到就 STOP。這同時解決「基準 commit」與「建立計畫指定分支」兩件事。

## 281 — hero 圖 Y 軸整數級距（operator 2026-07-31 指定）

| Plan | Title | Priority | Effort | Depends on | Status |
| ---- | ----- | -------- | ------ | ---------- | ------ |
| 281  | hero 趨勢圖 Y 軸從 `1.95萬 / 26.95萬` 改成整數級距（`20萬 / 40萬`）：`buildHeroTrendMeta` 加 nice-step 計算與 `yTicks`，domain snap 到刻度邊界 | P3 | S | 280（已 merge @ `adfd17db`） | **DONE — reviewed+APPROVED**（未 merge，等 operator）：分支 `fix/ai-nice-y-ticks` @ `dc9b88b8`，3 檔 / +133 −11。閘門全綠：tsc 0、lint 0 errors／799 既有 warnings、format 乾淨、**1527 測試**（1521 + 6 新）、build 0、playwright 6/6。`DashboardRoute.tsx` 只多**一行** `ticks={heroTrend.yTicks}`（實測 diff = 3 行含 context，符合「≤6」判準）；財務 memo 鏈 grep 零命中。**守門測試的門檻沒被動過**（`lo > 12_000_000`、`hi − lo < range × 4` 原封不動）。瀏覽器實測（示範資料）：刻度 `−25萬 / 0 / 25萬 / 50萬 / 75萬`，線仍佔繪圖區高度 **61%**（改前 64%）—— 有整齊、沒壓平。⚠️ **執行者兩次被基礎設施中斷**（第一次 API 連線中斷、第二次 stream watchdog stall），Step 4/5 與 commit 由 advisor 接手完成：**程式碼全部是執行者寫的，advisor 只做驗證與 commit**，未改動任何一行實作 |

### ⚠️ 281 帶出的驗證陷阱：Playwright 會重用別的 checkout 起的 dev server

複驗 281 時，advisor 的第一次瀏覽器量測顯示刻度**完全沒變**（仍是 `1.95萬 / 26.95萬`）。
差一點就據此判定「修法無效」。實際原因是 `playwright.config.ts` 的
`reuseExistingServer: !process.env.CI` —— 127.0.0.1:5173 上還活著一個**主 checkout**
起的 dev server（`lsof` 查 pid 的 cwd 確認），於是 worktree 裡跑的 e2e 量到的是 **main 的程式碼**。

**教訓：在 worktree 裡跑 e2e 之前，先確認 5173 是誰的。** 正確做法是自己在 worktree 內起一個
獨立 port（`npm run dev -- --port 5175 --strictPort`）、用 `lsof -a -p <pid> -d cwd` 驗證它的
cwd 真的是該 worktree，再讓 probe 走絕對網址。換 port 之後同一支 probe 立刻顯示
`−25萬 / 0 / 25萬 / 50萬 / 75萬`。

同一批的 280 複驗**不受影響**：那次的 probe 找到了 `.ns-hero-chart` / `.ns-chart-tip` /
`起點 …` 基準線 —— 這些元素在 280 之前的程式碼裡**根本不存在**，所以它量到的必然是 280 的樹。

**這份計畫的核心是一條守門測試**：起點 13,000,000、波動 ±10 萬時，Y 軸**不准**一路抓到 0 ——
那會把線壓成畫面中央一條水平直線，等於把 280 剛救回來的可讀性又打回去，而且更糟
（使用者會以為淨值一整個月沒動）。級距只從「已 padding 的資料範圍」外擴 snap，永不強迫包含 0。

### 280 落地後唯一的視覺 nit（已由 281 承接）

Y 軸刻度是**非整數**：`1.95萬 / 26.95萬 / 51.95萬 / 72.77萬`。成因是 domain 用
`[min − pad, max + pad]` 的精確值，Recharts 再等分切刻度。舊版 Y 軸是 `hide` 的所以沒人看見。
理想是 `0 / 20萬 / 40萬 / 60萬 / 80萬` 這種「nice number」。
**這不是計畫的缺陷**（280 明文指定了這套 domain 數學，執行者照做），是升級後才浮現的可讀性議題。
修法是在 `buildHeroTrendMeta` 加一層 nice-number 取整並回傳明確 `ticks` 給 YAxis —— 值得單獨開一份小計畫。

## 282–283 — operator 的兩個 UX 需求（`/improve plan` 2026-07-31 @ `f62b3c0b`）

兩份都是 `plan <description>` 模式：operator 直接指定要什麼，advisor 只做「查證現況 + 寫規格」，
**沒有跑全面 audit**（correctness / security / perf / deps 這批這次完全沒看）。

| Plan | Title | Priority | Effort | Depends on | Status |
| ---- | ----- | -------- | ------ | ---------- | ------ |
| 282  | 「名稱」與「商家」比照「分類」：設定裡有完整可搜尋的主檔清單、改名連動所有交易、名稱補上 autocomplete。新增 `renameLedgerName` repository 方法與 `ledgerLabels.ts` 純函式；`renameMerchant` 補上漏掉的週期規則 cascade | P2 | M | — | **DONE — reviewed+APPROVED**（未 merge，等 operator）：分支 `feat/ai-label-master-list` @ `418c0713`，17 檔 / +946 −79（含 5 個新檔）。advisor 獨立複驗：tsc 0、**1564 測試全過**（baseline 1530 + 34 新：8 `ledgerLabels` + 26 rename）、build 0、e2e 6/6、scope 與計畫清單逐檔相符、`migrations.ts` 零改動、i18n 純新增（`copy.csv` 零刪除行）。**瀏覽器獨立複驗**（advisor 自寫 probe + 服務內容指紋斷言）：商家聯集清單 **31 個**（seed 只有 6 個 → 聯集生效）、30 列有使用次數；名稱分頁 `共 37 個名稱（顯示 37）`。**對當前 `main`（已含 284A）實測 `git merge-tree` 零衝突**。⚠️ 兩個文件級瑕疵見下 |
| 283  | ~~記帳 / 投資的頁首 + 分頁列改成 sticky~~ | P3 | M | 279 | **⛔ SUPERSEDED by 284** — 不要派工 |
| 284A | **取代 283。** Phase A：抽出 `--ns-sticky-top` 頂端邊緣契約，**並修好一個已在線上的 bug**（投資→分析的區塊導覽列在示範模式下被橫幅 100% 蓋住、完全不可點） | P2 | S | 279（已 merge） | **DONE — reviewed+APPROVED+MERGED**（operator 2026-07-31 指示合併，merge commit `3aed0fc4`，尚未 push；revert 點 `00ec7688`）。合併後在 `main` 上重跑全套：tsc 0、lint 0 errors、1530 測試全過、build 0、e2e 6/6。原分支 `feat/ai-top-edge-contract` @ `abf1fa31`，3 檔 / +52 −2。advisor 在 worktree 獨立複驗全部閘門（tsc 0、lint 0 errors／799 既有 warnings、format 無變更、**132 檔 / 1530 測試與 baseline 完全相同**、build 0、真 e2e 6/6、impeccable detector `[]`）。**bug 修復由 advisor 自己寫的 probe 獨立複驗**，不是採信執行者回報：`navComputedTop: "47px"`、`overlap: 0`、`hitIsInsideNav: true`、hit 元素為 `NAV.ns-scroll-edge`（修前 advisor 自量的 baseline 是 overlap 46 / `hitIsInsideNav: false` / hit 為橫幅的 `SPAN.flex-1`）。**另外驗了計畫沒要求的非示範模式路徑**：`--ns-demo-banner-h` 與 `--ns-page-chrome-h` 都收斂回 `0px`、橫幅不存在 —— 若這條沒收斂，一般使用者的所有固定元素都會下移 47px |
| 284B | Phase B：頁首改成**凝縮式**而非整塊釘住 —— 桌機 132px → ~52px、手機 236px → ~90px，不需要斷點分岔；含 e2e 釘住「凝縮高度 ≤ 56px」 | P3 | M | **284A** | TODO — 執行者依計畫明文授權「只做 Phase A 就回報」而**刻意未開始**（非 STOP、非失敗）。派工前請先讀下方的 worktree dev-server 陷阱 |

### ⚠️ 282 複驗留下的兩個文件級瑕疵（不影響行為，**尚未修**）

實作正確、測試有實質斷言（不是空測試），但 `src/data/repositories.rename.test.ts` 裡有兩處
**錯誤的文字**會誤導後人。原執行者的 transcript 已無法 resume，所以沒有派回去修：

1. **soft-delete 測試的註解陳述了一件假的事。** 註解說「兩種 repo 實作的所有讀取路徑
   （`listLedgerTransactions` **與 `exportSnapshot`**）都排除 soft-deleted 列，所以只能斷言
   `changed === 0`」。**對 memory repo 是假的** —— `BrowserFinanceRepository.exportSnapshot()`
   （`repositories.ts:2709-2715`）回傳的是**未過濾**的 `this.data.ledgerTransactions`，
   tombstone 全在裡面（否則同步永遠傳不出刪除）。所以其實**有**更強的斷言可用：

   ```ts
   const snap = await repo.exportSnapshot();
   expect(snap.ledgerTransactions.find((r) => r.id === "l1")?.merchant).toBe("小半天");
   ```

   現有的 `expect(changed).toBe(0)` **本身是有效的**（守衛拿掉就會轉紅），問題只在那個假的理由 ——
   它會讓下一個人相信「tombstone 在測試裡讀不到」。

2. **一個測試標題與它自己的斷言矛盾。** `renameLedgerName` 最後一案標題是
   `"merging onto an existing name combines rows: returned count = both groups"`，
   但斷言是 `expect(changed).toBe(1)`。**斷言才是對的，標題是錯的** ——
   而且錯誤源頭是**計畫本身**：282 的 Step 2d 第 10 案寫了「回傳筆數 = 兩群相加」，
   那是 advisor 寫錯了。只有**真的被改到**的列才該計數（`l2` 早就是目標名稱，沒被 UPDATE），
   這樣「已更新 N 筆」toast 報的才是真實變更數而不是群組大小。

**建議**：下次動這個檔案時順手修掉這兩段文字，或開一份 XS 計畫。**不要**因為註解錯就把斷言放寬。

### 執行者回報中一處不精確的說法（advisor 已追出真相）

執行者說 lint warning 799 → 801 的 +2 來自「照計畫指定的 `visibleCount` effect 模式」。
實際逐條 diff（`eslint -f json` 比對 main 與 worktree）是 **+3 −1**：

| 變化 | 位置 | 判定 |
| --- | --- | --- |
| +1 `react-hooks/set-state-in-effect` | `NamesSection.tsx:45` | 計畫指定的 `visibleCount` 重置 effect —— 執行者說對的那一條 |
| +1 `react-hooks/exhaustive-deps` | `CashFlowRoute.tsx:381` 群 | 新的 `namePool` memo 加入既有的 `ledgerRows` 警告叢集（該檔原本已有 ~10 條同型） |
| +1 `react-hooks/exhaustive-deps` | `QuickAdd.tsx:119` 群 | 新的 `nameOptions` memo，同上 |
| −1 `@typescript-eslint/no-unused-vars` | `MerchantsSection.tsx` | 順手清掉的未用變數 |

**結論仍然是良性的**（三條新增全都是計畫自身指令的結構性後果，型態與既有的十幾條完全相同），
但「原因」與執行者說的不同。**教訓：warning 總數的差值不等於原因，要逐條 diff 才知道發生什麼事。**

### ⚠️ 284A 的複驗結論：修好了，但**沒有回歸測試**

這是 advisor review 唯一的保留意見。284A 修的是一個**只有渲染才看得見**的 bug
（sticky 元素互相遮擋），修法正確且已實測，但**沒有任何自動化測試會在它復發時失敗**——
計畫把 e2e 排在 Step 4（Phase B），Phase A 單獨出貨就把測試一起留在後面了。

具體風險：任何人日後在 `AppShell` 的橫幅或 `InvestmentsAnalyticsTab` 的導覽列上改 `top`，
或新增第三個頂端固定元素，都能無聲地把這個 100% 遮擋帶回來，而全套閘門會是綠的。

**建議**：284B 的 e2e 檔（`sticky-chrome.spec.ts`）裡**先加一條純 Phase A 的回歸測試**
（示範模式 + `/investments` 分析 + `elementFromPoint` 命中測試），不要等凝縮頁首做完。
若 284B 遲遲不派工，這條測試值得單獨開一份 S 級計畫先補上。

### 📌 派工 284B 之前必讀：worktree 裡的瀏覽器量測會量到主 checkout

284A 的執行者在這上面花掉可觀時間，advisor 複驗時也獨立確認了：

- `preview_start`（`.claude/launch.json` 的 `northstar-dev`）實測會綁到**主 checkout** 的
  dev server，`name` / port / `--root` 覆寫都被忽略。5173 上是一個 cwd 為 `/` 的常駐
  Claude 程序（`lsof -a -p <pid> -d cwd` 可查），`preview_start` 回報 `reused: false`
  但實際附著上去。**不要 kill 它** —— 那是 harness 自己的。
- `playwright.config.ts` 的 `reuseExistingServer: !process.env.CI` 會讓 worktree 裡跑的
  e2e 同樣量到別人的樹。這已經是**第二次**（plan 281 的複驗踩過同一個坑）。

**唯一可靠做法**：臨時 config（`reuseExistingServer: false` +
`npm run dev -- --port 5199 --strictPort`），並在測試裡**斷言服務內容的指紋**：

```ts
const css = await page.evaluate(async () => (await fetch("/src/styles/globals.css")).text());
expect(css, "server is NOT serving the worktree build").toContain("--ns-sticky-top");
```

advisor 的複驗就是這樣跑的，驗完刪掉臨時檔。

### 本 session 期間 `main` 前進了兩次（都不影響這兩份計畫）

`f62b3c0b` → `3f69a867`（version bump）→ `00ec7688`（release CI 修復 + RELEASING.md +
plans/README.md）。後三個 commit 只動 `.github/workflows/release.yml`、`RELEASING.md`、
`plans/README.md` —— **`src/` 零命中**，所以 282 / 284A 兩條以 `3f69a867` 為基準的分支
都沒有被追上。兩份計畫的 in-scope 檔案在整個 session 中漂移為零。

### 282 查證出來的三個具體缺口（不是「從零做功能」）

1. **設定的商家清單看不到打字打出來的商家。** `settings/MerchantsSection.tsx:128-130` 只過濾
   `form.merchants`（預設就 6 個 seed），但 `CashFlowRoute.tsx:470-473` 的表單下拉早就是
   `settings.merchants ∪ 帳目歷史` 的聯集。**同一份資料，兩個地方不同意**——operator 說的
   「在設定中有一個完整的商家列表可以讓我搜尋到這個商家」缺的就是這個聯集。
2. **`renameMerchant` 漏掉 `recurring_transactions`。** 週期規則是未來交易的模板
   （`repositories.ts:4971-4976` 用 `name: recurring.merchant || recurring.category`），
   所以改名後**下個月跑出來的那筆會叫回舊名**。這正好違反 operator 要的「所有有連動紀錄的都一起變」。
3. **名稱完全沒有主檔**：兩處表單（`QuickAdd.tsx:592-599`、`CashFlowRoute.tsx:4681-4688`）都是裸 input。

### 282 的兩個設計決定（寫進計畫，執行者不得自行更改）

- **名稱不新增 `AppSettings.names`。** 商家有 `settings.merchants` 是歷史包袱（它同時餵自動分類
  的 seed）；名稱不需要 —— 「預先建一個交易名稱」沒有意義，而多一個持久化陣列就多一份要同步、
  要合併、會與歷史值不一致的狀態（`AppSettings` 參與 E2E 同步）。operator 要的兩件事
  （改名連動 + autocomplete）**都只需要歷史值**。所以名稱分頁是「衍生清單 + 改名」，沒有新增/刪除。
- **改名到已存在的值 = 合併，不擋。** 商家分頁現在會 `toast.error("商家已存在")` 硬擋，
  但合併正是清資料的主要用途（「小半天」+「小半天咖啡」→ 統一）。rename 的 SQL 本來就是
  「所有等於 old 的改成 new」，合併是天然行為，只要 UI 別擋。**新增**時的重複檢查保留。

### 283 的四個既有互動（這件事沒有看起來單純）

1. 示範模式橫幅已經佔了 `top: 0` 且 `z-index: 30`（`AppShell.tsx:491-501`），而且它**會換行**，
   高度不是常數 → 必須 runtime 量測成 `--ns-demo-banner-h`。
2. macOS 有一條 `position: fixed` 的 28px 拖曳條（`globals.css:647`）蓋在最上緣。
   **順帶發現：現在的示範橫幅就有鑽到它底下的既有 bug**，283 一併修（堆疊要對就必須同基準）。
   注意 `--ns-titlebar-inset` 是 **40px**，那是 sidebar 內距，**不是**遮擋高度，兩者不可互換。
3. iOS 瀏海：`main` 的 `paddingTop: env(safe-area-inset-top)` 對 sticky **無效**——
   sticky 偏移相對 viewport，`top: 0` 就是貼在動態島底下。
4. **三個既有 sticky 會被新頁首蓋住**：`InvestmentsAnalyticsTab.tsx:780`（同一條路由上的區塊導覽列，
   `sticky top-0 z-20`）、`CashFlowRoute.tsx:2535`（`lg:top-5`）、`InvestmentsRoute.tsx:916`（`lg:top-4`）。

### 283 的產品決定：手機只釘分頁列 —— **已被 284 推翻**

283 原本的判斷是「`<1024px` 頁首會 `flex-wrap`，釘住等於吃掉太多視窗，所以手機只釘分頁列」。
方向對，但**用斷點分岔迴避了問題本身**。284 實測後改成凝縮式頁首，一個行為涵蓋所有寬度。
唯一原封不動保留的是那條紅線：斷點**只能用 `min/max-width`**，**不准用 `pointer: coarse`**
（Tauri WKWebView 在桌機也回報 coarse，plans 244/245 踩過兩次）。

## 284 — `/impeccable` 重新調查 283 的產出（2026-07-31 @ `f62b3c0b`）

Operator 看完 283 後指定「用 `/impeccable` 更好的調查再給我新的計劃建議」。
在**真實 dev server 上量測**（不是讀程式碼推論）之後，283 的核心假設被推翻，並且挖出一個線上 bug。

### 🐞 找到一個已經在線上的 bug（與 operator 的需求無關，是量測過程的副產品）

`/investments` → 分析，示範模式，1440×900，`scrollY = 420`，用 `getBoundingClientRect()`
加 `document.elementFromPoint()` 實測：

```
分析區塊導覽列 : top 0 → bottom 46   z-index 20   （報酬/貢獻/風險/股利/集中度）
示範模式橫幅   : top 0 → bottom 47   z-index 30
垂直重疊       : 46px  ← 導覽列高度的 100%
elementFromPoint(導覽列中心) → SPAN.flex-1 min-w-0 muted truncate
nav.contains(hit) → false      banner.contains(hit) → true
```

**兩者都釘在 `top: 0`**，橫幅 z 較高 → 導覽列被完全蓋住、**點不到**。而它是一個
**4,294px 高**分頁的主要導覽。截圖上看得見文字互疊。

這證明了一件事：**app 沒有「誰擁有畫面頂端」的規則，而 283 是在這之上再疊一層 sticky。**
284 把「建立契約 + 修好這個 bug」抽成獨立可出貨的 Phase A。

### 📐 量測數據（示範資料，2026-07-31 dev server）—— 這推翻了 283

| 量測項 | 1440×900 | 1024×768 | 390×780 |
| --- | --- | --- | --- |
| 記帳 頁首列 | 64px | 64px | **168px（換行成 3 列）** |
| 記帳 chrome 合計（頁首+分頁） | 132px（**14.7%**） | 132px（**17.2%**） | **236px（30.3%）** |
| 投資 chrome 合計 | 130px（14.4%） | — | 180px（**23.1%**） |
| 示範橫幅 / 手機 dock / 手機 FAB | 47px / — / — | 47px | 47px / 57.5px / 52px |

390×780 上，283 的方案讓可讀內容只剩 **439px = 56% 的螢幕**（236 chrome + 47 橫幅 + 57.5 dock）。
而且 `記一筆` 在那個 3 列換行的版面裡**孤懸在第 3 列右側**，左邊一整片空白 ——
這是一個**獨立於 sticky 議題的既有版面缺陷**。

### 💡 284 的設計主張：凝縮，不是凍結

> 頂端固定的東西，應該只保留「捲動中仍然需要」的部分，而不是把靜止狀態的版面整塊搬上去。

捲動時 eyebrow 消失、h1 降到 `--ns-t-title-3`、分頁列與動作併成一列：

- 桌機 **132px → 約 52px（−61%）**；手機 **236px → 約 90px**
- **不需要斷點分岔**（283 需要），這是它比 283 好的主要理由
- 順帶修掉手機頁首 3 列換行的既有缺陷
- 是原生平台的標準模式（iOS large title → inline title），符合 Operate mode 的
  "earned familiarity" 原則

**約束（已量測）**：1440 內容欄 1136px、凝縮列需 ~800px → 寬鬆；
**1024 內容欄只有 720px**，800 > 720 → 該寬度分頁列**必須**沿用既有的 `overflow-x: auto` 橫向捲動，
**不准換行**（換行就白做）。這條寫成了 284 的 STOP condition 之一。

### 🔒 284 用測試釘住「凝縮高度 ≤ 56px」

e2e 直接斷言凝縮後的 chrome 高度上限。理由寫在計畫的 maintenance note 裡：
**擋住「一次加一個按鈕，一年後回到 132px」**。

### 這次沒審的範圍

`/impeccable` 的機械掃描（`detect.mjs --scope layout`）對五個目標檔回傳 `[]`，
但那只證明沒有可機械偵測的版面問題 —— 上面那個 100% 遮擋的 bug **它抓不到**，
是靠命中測試找出來的。correctness / security / perf / deps 這批這次完全沒看。

### 這兩份計畫刻意排除的範圍

- 282 不碰 `MerchantsTab.tsx` / `MerchantDetailRoute.tsx`（那是分析分頁，不是主檔管理）、
  不碰 `userLexicon.ts` / `nlParser.ts` / `quickAddCorrections.ts`（NLP 學習層會自然 rebuild）、
  **不碰 `migrations.ts`**（設計上不需要任何 schema 變更；若執行者推導出需要 → STOP）。
- 283 只動記帳與投資兩條路由，**不全站套用** sticky；不碰 `.ns-detail-page` 那套版面契約。

### 一個寫計畫時才查出來的陷阱（已寫進 283）

`src/styles/designTokens.test.ts` 的 `collectDefinedTokens` 認得兩種定義形狀：CSS 宣告
`--ns-x:`，以及 TSX style object 裡的**純引號 key** `"--ns-x":`。283 要用的
`["--ns-demo-banner-h" as string]:` 這種 computed key **不符合它的 regex**，
所以新 token 一律要在 `globals.css` 也宣告一次，否則整個 suite 會判定成「引用了未定義 token」而轉紅。
計畫已明文禁止用「把 token 加進 `KNOWN_FALLBACK_ONLY_TOKENS`」的方式繞過
（那份清單的註解寫著 "Shrink this list; do not grow it"）。

**順手記下、不在這兩份計畫內的**：`AppShell.tsx:537` 的 mobile Quick-Add FAB 引用
`var(--ns-shadow-xl)`，但 `globals.css` 只定義 `--ns-shadow-1/2` 與別名 `--ns-shadow`/
`--ns-shadow-strong`——**那個 token 不存在**，FAB 目前實際上沒有陰影。無害但是死引用。

## ✅ 2026-07-26 收尾 — 259–273 全批完成 @ `0dee6867`

`/improve` 效能+升級批次結束。**13 份計畫派工，11 份落地、1 份 REJECTED（被量測否決）、1 份部分完成（卡在上游相依）。**

| 量測                        | 之前                         | 之後                                            |
| --------------------------- | ---------------------------- | ----------------------------------------------- |
| eager bundle                | 1,799,730 B                  | **1,397,251 B**（−402 kB，recharts 移出開機圖） |
| `pragma table_info` 冷啟動  | 65 次                        | **7 次**；第二次啟動 **0 次**                   |
| 核心表索引                  | 0 個                         | **13 個**                                       |
| `daily_prices` 開機 payload | 17.28 MB / 1,833 ms          | **12.69 MB / 1,143 ms**（−690 ms，271 實測）    |
| `format:check`              | 失敗（279 檔，且 CI 沒在跑） | **exit 0 且已納入 CI**                          |
| 測試                        | 1,498                        | **1,508**                                       |
| `tsc` / `lint` / `build`    | —                            | 全部 exit 0                                     |

**未收下的**：TypeScript 7 的 `tsc --noEmit` **10.877 s → 1.92 s（~5.7×）**——實測有效，但 `typescript-eslint@8.65.0` 的 peer 是 `typescript: ">=4.8.4 <6.1.0"`，硬擋。tsconfig 遷移已落地，等上游放寬只需改一行版本號（plan 263）。

### 後續：274（266 的 40 條違規裡，只取值得修的 6 條）

| Plan | Title                                                               | Priority | Effort | Depends on | Status                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---- | ------------------------------------------------------------------- | -------- | ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 274  | 修 `react-hooks/refs`（5）+ `react-hooks/purity`（1）——四類四種修法 | P2       | M      | 266        | **DONE** — reviewed+APPROVED，**已 merge @ `7947825f`**。refs/purity findings 歸零，`npm test` **1508 → 1512**（+4 新測試），lint 804 → 799 warnings。**Group C** 調查後判定為 render-prop API 本質：執行者逐一查了 **24+ 個呼叫點**，全部只是把 `dismiss` 接到之後的 `onClick`，沒有一個在 render 期間同步呼叫 → 依計畫允許的結果加行範圍豁免（非 `-next-line`，Prettier 不會孤立它）。**Group D 是使用者可見的財務數字修正**（見下）。 |

**④ 不只是 lint 問題。** 同檔另有三處用 `new Date().toISOString()` 取「今天」——那是 **UTC**。
UTC+8 的使用者在當地 00:00–08:00 之間會拿到**昨天**，讓 **持倉天數** 差一天、**配息 YTD** 在跨年邊界可能歸錯年度。
repo 已有正確慣例（`todayInTimezone(timezone)`，DashboardRoute / InvestmentsRoute / CashFlowRoute 都在用），
這個檔案沒跟上。計畫要求四處一起改並補測試，且**必須在報告裡明講這是使用者可見的行為修正**，不能當 lint 修正混過去。
（同類前例：plan 042 的淨值視窗時區修正。）

### 274 帶出的兩件事

**1. 我的計畫把 line 269 說錯了。** 我寫「它在 event handler 裡，不是 render purity 問題」——
實際上它在 `useMemo` 的 callback 裡，**就是 render 期間**。執行者查證後照樣修掉，並在報告裡指出我寫錯。
最終 `HoldingDetailRoute` 有 **5 處** UTC 來源被改成 `todayInTimezone(timezone)`：手動價格表單預設日期、
標準估值日、XIRR as-of 日、**持倉天數**、**配息 YTD** 的年度過濾。

行為改變（已在 merge 前確認並記錄）：UTC 以西的使用者在當地早晨，**持倉天數會差一天**；
跨年邊界時**配息 YTD 可能把股利歸到正確年度**。新測試用同一個時刻證明差異：
`2026-05-24T18:42:00Z` 在 UTC 是 24 日（0 天）、在 Asia/Taipei 已是 25 日（1 天），兩個都斷言。

**2. `vitest.config.ts` 缺少 `@` path alias（`vite.config.ts` 有）。**
執行者要為 `HoldingDetailRoute` 寫測試時撞到：匯入該檔會拉進 `coss/*`／`ui/*` 元件，
它們用 `@/lib/utils` 解析，在 vitest 下解不開；另外 `state/uiPreferences` 在 module scope 就讀 `localStorage`（jsdom 沒有）。
它選擇用 `vi.mock` + `vi.stubGlobal` 繞過並寫進註解，**沒有為此擴大 scope 去改 `vitest.config.ts`**——判斷正確，
但這是真正的測試基建缺口：**下一個想測路由元件的人會撞到同一堵牆**。真正的修法是把 `@` alias 加進 `vitest.config.ts`，值得單獨開一份小計畫。

### 275 — vitest 的 `@` alias 缺口（274 帶出，已修）

| Plan | Title                                                                                                                                                                                                                                  | Priority | Effort | Depends on                     | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 275  | 把 `@` alias 加進 `vitest.config.ts`（`vite.config.ts` 早就有，兩份 config 不會互相繼承）+ `setup.ts` 補 localStorage fallback                                                                                                         | P2       | S      | 274（已 merge）                | **DONE** — reviewed+APPROVED，**已 merge**。`HoldingDetailRoute.test.ts` 的 **9 個 `vi.mock` 全部刪光**（0 剩），測試維持 130 檔 / 1512 全過。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 276  | **手動「立即更換加密金鑰」按鈕**（spike 238 §7 Q4 的後續，2026-07-19 拍板「要，但排在 phases A–D 之後」）。純 UI：`ConnectSection.tsx` 加常駐入口 + 兩段式確認，沿用已出貨的 `rotateVaultKey()`，**不動任何密碼學／worker／migration** | P3       | S      | 239/240/241/242（皆已 merged） | **DONE — reviewed+MERGED** 2026-07-26。單檔 **95 增 0 刪**（零刪除，既有 revoke／輪替文案完全未動）。advisor 獨立複驗 8 條判準全過：tsc 0、lint 0 errors、format:check 乾淨、1512/1512（與 baseline 相同）、build ok、`rotateVaultKey` call site 5→6。三種 `reason` 全部有 UI 回應（含 solo-device 的 no-op 明說，而非靜默）；成功後刷新 `kitStale`。**advisor 額外查核（計劃未要求）**：確認 `rotation.ts` 只有 3 條 return path，`reason === "ok"` ⟺ `rotated === true`，故 `else` 分支只可能是 `no-remaining-devices`——不會把 confirmation-ping 失敗誤報成「只有這台裝置」。文案依 §1 誠實框架，明說**舊資料仍維持原金鑰、更換不會收回**。刻意未加測試（2200 行元件無既有 harness，機制本身有 `rotation.test.ts` 12 條覆蓋）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 277  | 把 161 的 GA-motion spike doc(`docs/motion-ga-spike.md`,336 行)從未合併分支收進 main;PoC code 依其自身註解「throwaway, remove before merging」**不收**,改以 tag `spike/161-ga-motion-poc` 保存後刪除分支                               | P3       | S      | —                              | **DONE — 2026-07-26 執行並 merged**。docs-only,**零 source 變更**。doc 內三處指向「this branch」的自我參照已改指 tag(否則分支刪除後成為 dangling reference)。index 兩處「lives only on that branch」已標為過時。**未動任何 follow-up** —— #1(View Transitions 真實 ticket,含 spike 抓到的 `prefers-reduced-motion` 不涵蓋 view-transition 偽元素這個 bug)與 #3(scroll-edge:demo banner + analytics in-page nav)都已 scoped 且無阻塞,值得各自開計劃                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 278  | 兩個 sticky header 的 scroll-edge 效果（demo banner + 投資分析 in-page nav）：邊框只在內容捲到底下時才出現。來自 `docs/motion-ga-spike.md` Part B 的 do-top-2 判定                                                                     | P3       | S      | 277                            | **DONE — reviewed+MERGED** 2026-07-26。計劃對 spike 未接線原型提的**兩項修正都經實測成立**：(1) app 內部沒有任何捲動容器（`overflow-y` 掃描為空），捲的是 window——spike 原稿監聽 `mainRef.current` 會**掛得上但永遠不觸發**；(2) 分析頁 nav 的自然位置實測在頁面下方 **434px**，用 `scrollY > 0` 會讓邊框**提早 434px** 亮起，故改用 IntersectionObserver sentinel。**advisor 複驗時抓到一個執行者截圖看不出來的缺陷**：sentinel 原是 `grid gap-5` 的 in-flow 子元素，grid item 即使高度 0 也自成一列、吃掉整個 20px gap 把 nav 往下推。瀏覽器實測：in-flow → nav +20px／容器 130px；`position:absolute` → nav 0px／容器 110px（與完全沒有 sentinel 相同），且 sentinel 仍落在 nav 自然頂端。先試的 `-mb-5` **無效**（grid gap 不能用 margin 抵銷）。自動檢查全綠（tsc 0、lint 0 errors、format、1512/1512、build）。⚠️ **邊框出現時機未經視覺驗證** —— browser pane 對本 app 渲染成 0 高度 viewport 且 `visibilityState: "hidden"`，IntersectionObserver 在該環境完全不觸發（執行者第 4 張截圖是手動塞 `data-stuck` 產生的，非真實行為）。邏輯已逐行 traced，但時機需操作者實機一瞥。⚠️ 本批另有一起事故：worktree 的 node_modules symlink 被 `git add -A` 收進版控，merge 後覆蓋主 checkout 的真實目錄 → 已修並強化 `.gitignore`（`47af49d7`） |

**這個缺口能存活這麼久，是因為它從來沒被執行過。** `grep -rl '@/' src/` 會撈到 `nlParser.test.ts`，
但那個命中在**註解裡**——沒有任何測試曾經成功透過 alias 匯入。它不是壞掉，是沒被碰過。
25 個檔案用這個 alias，全是 `coss/*`／`ui/*` 共用 UI 層，所以**任何路由元件測試都會撞牆**。

**⚠️ 我的假設被探測推翻了。** 我看到 265 把 jsdom 升到 29、又驗到 `new JSDOM('', {url})` 有 localStorage，
就推論「AGENTS.md 那條 gotcha 是舊時代遺留、274 執行者診斷錯了」。計畫因此把「先實測再決定」寫成 Step 1。

實測結果：`typeof window.localStorage` = **`undefined`**，即使 `document.URL` 是 `http://localhost:3000/`。
**274 的執行者是對的，AGENTS.md 那條 gotcha 一直都是對的，錯的是我。**
真正原因執行者也查出來了：**Node 26 的實驗性全域 `localStorage`**（沒給 `--localstorage-file` 就不可用）
**遮蔽了 jsdom 自己的實作**——所以單獨測 jsdom 會得到相反結論，必須在 vitest 環境裡測才準。

setup.ts 的 fallback 有守衛（`typeof window.localStorage === "undefined"` 才裝），
18 個用 `vi.stubGlobal` 做隔離的測試檔仍然優先，全部照常通過。

### 這批的方法論教訓

**13 次派工裡，執行者 7 次正確地 STOP，而其中 6 次錯在計畫（我），不在執行。**

| 誰擋下什麼                                                               | 後果                                         |
| ------------------------------------------------------------------------ | -------------------------------------------- |
| 259：索引引用的欄位是 `ensureSqliteColumn` 加的，跑在 migrations 之後    | 新資料庫直接崩，36/72 測試倒                 |
| 267：`manualChunks` 在 Rolldown 下是 deprecated shim，搶不過遞迴相依捕獲 | 修法無效，只省 73 B                          |
| 268：我用 `grep -c` 數欄位，把註解也數進去（64 說成 65）                 | 湊數會污染 fingerprint                       |
| 260：把持續性自癒當成一次性 schema 工作                                  | gate 掉 → 同步進來的髒資料永不修復           |
| 261：假設「賣掉的標的歷史會累積」                                        | 實測 0.2%，計畫依自己的 STOP 條件被 REJECTED |
| 270：Prettier 換行會孤立 `eslint-disable-next-line`                      | 隱私遮罩的合法豁免失效                       |

**結論**：把「校驗碼式」的 STOP 條件寫進計畫（`ADDITIVE_COLUMNS.length` 必須是 64、非持有列數 < 2000 就 REJECT、diff-grep 必須印空）比寫「請仔細做」有效得多。它們讓轉錄錯誤與錯誤假設無所遁形，而不是靠執行者的謹慎。

### 待你決定的事

1. **push**：所有 merge 都只在本地，一次都沒 push。
2. **清理已合併分支**：14 條可刪（`git branch --merged main --list 'perf/ai-*' 'chore/ai-*' 'fix/ai-*' 'docs/ai-*' 'spike/ai-*' 'style/ai-*' | xargs -n1 git branch -d`）。`wip/ai-plan260-blocked` 是 260 的保存，可一併刪（268 已取代）。
3. **`git config blame.ignoreRevsFile .git-blame-ignore-revs`** 已在本機設好；每個 clone 都要各自設一次（已寫進 CONTRIBUTING.md）。
4. **266 的 go/no-go**：React Compiler 目前是 annotation 模式（等同 no-op，僅 `InvestmentsAnalyticsTab` 標註）。全面開啟前要先處理 40 條 Rules-of-React 違規——其中 `AnimatedNumber`/`AppShell`/`ModalShell` 的 render 期間改 ref 看起來是真 bug。

## Reconciled 2026-07-25 @ `b22c566e`

94 個表格列全部盤點：**沒有任何 TODO / BLOCKED / IN PROGRESS**。積壓的不是「待做」，
而是**索引落後於現實** —— 10 列還寫著「待操作者 merge / awaiting merge / NOT merged」，
但那些 commit 早就進 main 了。已逐列更正（見下方各列的 ✅）。

**驗證方法**：對每列記錄的 commit SHA 跑 `git merge-base --is-ancestor <sha> main`，
外加在現行 HEAD 上重跑各計畫的 grep 判準。

| 計畫            | 記錄的 commit                                   | 結果                                                                     |
| --------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| 200             | `1e603f19`/`42955c15`/`1f171585`                | 皆為 main 祖先 → 已合併                                                  |
| 227             | （原本沒記 SHA，分支已刪）                      | 以產物驗證：`updateTransfer` 存在於 `repositories.ts` → 已合併           |
| 246 / 247 / 248 | `e406997e` / `ee99c6d5` / `fa435518`            | 全在 main                                                                |
| 250             | `645cc1ab`                                      | 在 main                                                                  |
| 251 / 252 / 253 | `8d2f4842`+`a3fc1418` / `0b628d58` / `f240f902` | 全在 main                                                                |
| 256             | `e9a88d70`                                      | 在 main；群組名 follow-up 亦由 `6f2a5fc3` 修掉 → **該 follow-up CLOSED** |

**HEAD 上重跑的判準（全過）**：237 `formatPercent`/`MASKED_PERCENT` 0 命中；
213 `grid size-8 place-items-center` 0 檔；217 `.tsx` 內 `cubic-bezier` 0 命中；
202/213 `ModalCloseButton` 16 檔（≥15）；255 `credit_groups` 22 命中。

**分支現況**：上述分支皆已刪除（合併後清理，正常）。`feat/ai-ga-motion-spike`
(`46b00892`) 仍**刻意未合併** —— 其 `docs/motion-ga-spike.md` 只存在於該分支，刪掉會遺失文件。

### 仍然開著的事（這次 reconcile 的重點）

1. ~~**249 的殘餘驗收已逾期**~~ → **CLOSED 2026-07-25，實際掃過 binary。**
   在 `v0.1.0-alpha.69` 發版後下載官方產物 `Northstar_aarch64.app.tar.gz`，
   解開後掃 `Northstar.app/Contents/MacOS/northstar`（前端被 Tauri 編進二進位檔，
   不是散落檔案，所以 `find` 找不到、必須 `strings` 掃）：
   **13 個銀行 logo 全在**（`/bank/007_ileo.svg`…`/bank/kgi.svg`），與本機
   `public/bank/` 的 13 個完全相符。同時確認 `PRIVATE_ASSETS_KEY` secret 已設
   （2026-07-22）、該 run 的 unpack 步驟**沒有**走 `exit 0` 跳過路徑。
   順帶驗到同步 endpoint（`https://northstar-sync.larrynote.workers.dev`）與
   updater endpoint 都已烘焙進 binary —— alpha.63–65 那兩個歷史缺口都不存在。
   註：`etf-sector-feed.json` 在本機與官方產物中皆不存在，但這是預期行為
   （`private-assets/etf/` 本來就沒有，程式會 fall back 到 on-demand public feed）。
2. ~~**257 是唯一未合併的程式碼**~~ → **已合併並隨 alpha.69 出貨**（見下）。
3. **243 Step 4 仍待 operator**：刪除 `RELEASES_TOKEN` secret 並撤銷該 PAT。
   2026-07-25 以 `gh secret list` 確認**該 secret 仍然存在**（建立於 2026-06-02）。
4. **238 的 5 個 operator 問題**仍 gate 著 vault-key rotation 的實作（239–242 是已合併的前置）。
5. 待操作者「手感 / 肉眼」驗收（非阻塞）：233 列印、245 桌面 Tauri 列印鈕、246 滾動手感、247 光暈質感。

### 兩個舊 follow-up 的複驗結果（一個已關、一個成立）

- **232 — CLOSED，我先前的判定是錯的。** `incompleteSplitGroupIds` **有**被渲染：
  `AccountsRoute.tsx:300` 與 `settings/GeneralSection.tsx:300` 都有消費端訊息
  （「發現 N 筆拆分交易不完整（同步中，稍後會自動補齊）」）。第一次複驗時我的
  `grep … | head` 剛好在第 10 行截斷，被切掉的正是這兩個 `.tsx` 渲染點（全檔共 13 筆引用）。
  **教訓：複驗 dead-code 類判定時，grep 不要接 `head`。** 232 的 follow-up 到此結案。
- **220 — 成立。** `perf.nudgeInput` 確為 write-only：`InvestmentsAnalyticsTab.tsx`
  380（型別）/402/415/436（三處賦值），`grep "\.nudgeInput"` 零讀取點，而 `perf` 其餘欄位
  （`basis`/`data`/`alpha`/`portFinal`/`benchFinal`/`hasBenchmark`）都有讀取端。
  成因：plan 220 把 nudge 改成 full-history 自行建序列後，這個舊的期間範圍輸入就沒人要了。
  連帶 `CumPoint`（371 行）也只被 380 行引用，一起孤兒化。→ **已開 plan 258 清理。**

## 258 — 清掉死掉的 `nudgeInput`（reconcile 2026-07-25 帶出）

| Plan | Title                                                                                                                                                                                                | Priority | Effort | Depends on | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 258  | 刪除 `InvestmentsAnalyticsTab.tsx` 的 `nudgeInput` 欄位（4 處，全為寫入零讀取）＋連帶孤兒化的 `CumPoint` 型別別名。plan 220 把 nudge 改 full-history 後遺留。純刪除 5 行、不新增測試、不動任何算式。 | P3       | S      | —          | DONE — reviewed+APPROVED，branch `fix/ai-dead-nudge-input` @ `394f1e30`（1 commit，base `b22c566e`）。**MERGED** ✅ 隨 `v0.1.0-alpha.69` 出貨（merge `3a44d14d`）。reviewer 複驗：diff 為 **5 deletions / 0 insertions**、五個 hunk 全是純刪行、無任何算式變動；`grep nudgeInput\|CumPoint` → 0；`nudgeVerdict` 仍在（5 refs，live nudge 未受影響）；tsc 0 / lint 0 errors / **1487 tests 全過**。⚠ **計畫寫錯的數字，執行者抓到**：plan 258 寫「1496 tests」，但那是我從 257 分支帶過來的數（1487 + 257 新增的 9 筆 = 1496）；main 基線本來就是 1487。執行者用 `git stash` 前後對照證明刪除未改變測試數，並明講落差而非硬套通過 —— 判斷正確。 |

## 257 — 基金搜尋排序（`/improve plan` @ `b22c566e`, 2026-07-25）

Operator 回報 https://www.capitalfund.com.tw/fund/detail/019
「群益新興金鑽基金-新臺幣」在基金搜尋找不到。**資料層沒問題** — 該基金就在
SITCA NAV CSV 第 1398 列（`DIO04` / 受益憑證 `T1605Y`，2026-07-25 實測），
33b9add2（2026-07-11）修好的 基金代號 碰撞問題仍然有效。壞的是**搜尋層**：
`filterFunds` 依 CSV 原始順序掃描並在第 20 筆 `break`，而「群益」共 259 檔命中、
目標排第 **151**；「新興」386 檔命中、排第 **87** — 兩者都被無聲截斷。另外從
基金公司官網貼上的名稱「群益新興金鑽基金 **- **新臺幣」（連字號兩側有空白）
在 CSV 是無空白版本，直接 **0 筆命中**；臺/台 變體同理（767 檔用臺、874 檔用台）。

| Plan | Title                                                                                                                                                                                                                                                                                                                                           | Priority | Effort | Depends on | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 257  | 基金搜尋可達性 — `normalizeFundQuery`（NFKC/去空白標點/臺↔台/滙↔匯）、`filterFunds` 改為評分排序後才截斷（不再 file-order `break`）、解析並可搜尋 `公司名稱`、`countFundMatches` + 下拉「還有 N 檔」提示 + 可捲動面板（cap 20→50）、基金結果補上 `currency`/`assetType: "mutual_fund"`（選取後類型自動＝共同基金）。搜尋層 only，不動計價路徑。 | P1       | M      | —          | DONE — reviewed+APPROVED，branch `fix/ai-fund-search-ranking` @ `c4187c28`（4 commits，含 1 輪 REVISE，base 確認為 `b22c566e` = 現行 main）。**MERGED** ✅ 隨 `v0.1.0-alpha.69` 出貨（merge `2b777fe4`）。tsc 0 / lint **761 warnings，與 main 完全同數（0 新增）** / 1496 tests（sitcaFundProvider 22→31，+9 新測試；其中 7 個在修復前確實會紅）。計價路徑 `fetchQuotes`/`buildFundSymbolIndex`/`fetchFunds`/`isPlausibleFundList` diff 完全為 0。**Reviewer 用線上 CSV（4,251 筆解析）實測**：`T1605Y` → 目標第一筆 ✓；`群益新興金鑽基金 - 新臺幣`（官網含空白版）→ 1 筆命中即目標 ✓（修復前 0 筆）；`群益新興金鑽基金-新台幣`（台）→ ✓；`滙豐` → 103 筆（原本靠公司名完全搜不到）；`群益` → 250 命中/顯示 50/溢出 200（＝執行者回報的「還有 200 檔」）。單次擊鍵成本實測 26–32ms，在 250ms debounce 內。**REVISE 輪（`c4187c28`）已修掉 plan 自身的 regex 瑕疵**：`normalizeFundQuery` 原本寫 `[\s　]`（字面全形空白）觸發 1 個新 `no-irregular-whitespace` warning，已改為 `/\s/g`（JS 的 `\s` 本就涵蓋 U+3000），並補一條用真 U+3000 的斷言把行為釘住（reviewer 已驗 codepoint 確為 `0x3000`，非普通空白）。檔案剩下的唯一 warning 在 `stripBom` docstring 的 BOM 字元，main 同樣有（main:199 = branch:272），故新增 warning 為 0。 |

**境外基金仍不在範圍內**：SITCA CSV 僅涵蓋境內投信基金（~4,400 檔 / 36 家），
`docs/taiwan-fund-nav-plan.md` decision 2 已明載。本次回報的基金屬境內，故不受影響；
若日後要支援境外基金需另接資料源，是獨立且更大的工作。

## 254 — 信用卡「群組一等公民」架構決策 + 分階段地圖（`/improve plan` @ `8fed759d`, 2026-07-24）

larry 選定：把信用卡分組升級成**一等公民實體**（群組持有額度/結帳日/繳款日，卡片歸屬並
繼承/自動貼齊），取代 253「欄位手動一致才合併」的脆弱觸發。此改動**觸及 E2E 同步子系統**
（新增 synced 實體），屬 L+ 高風險，故比照金鑰輪替 spike（238→239–242）先鎖決策+整合點，
再分階段建置。

| Plan | Title                                                                                                                                                                                                                                                                                                                                                       | Priority | Effort | Depends on | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 254  | **架構 gate**：鎖定資料模型決策（群組=單一事實來源、卡片 derive-on-read、離開群組快照回寫、幣別硬約束、自由文字→群組實體的非破壞 migration）＋ synced 實體整合點地圖 A–L（SyncEntity/migration/ensureSqliteColumn/outbox triggers/tableByEntity×3/getSyncPayload/pull-apply/snapshot roundtrip/CRUD）。**參考實體 = client（plan 190）**。此計劃不改 `src/` | P2       | S      | 253        | **DONE（決策 gate）2026-07-24**：larry 確認 **derive-on-read**（群組覆蓋、卡片即時跟隨）；Decision 4（statement_day 分歧取眾數/最新、不阻斷 migration）採為預設。255 已展開；256 待 255 落地後補                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 255  | **Phase B（資料層）**：credit_groups 表 + 同步註冊 + 帳戶 credit_group_id + derive-on-read + 離開快照 + migration/backfill + 快照 roundtrip + CRUD + 型別。**無 UI**，253 暫用舊觸發（並存無害）                                                                                                                                                            | P2       | L      | 254        | **DONE — executed+reviewed 2026-07-24**，branch `feat/ai-credit-group-data-layer`（commit `4de7167a`，基於 `8fed759d`）。**執行者正確 STOP 一次**：advisor 的觸點地圖漏了 6 個同步觸點，其中 2 個為非編譯強制的靜默地雷（`pull.ts` `VALID_ENTITIES` 會丟棄 pull 進來的群組；`SyncSource`/`allSyncRecords` 瀏覽器推送路徑）。advisor 窮舉補全清單後執行者續跑完成。複驗：build 0、**1482/1482 tests**、grep+oracle 全過、derive/leave-group/backfill 兩 repo 平行且測試以「刻意相異欄位」證明真的 derive、backfill 冪等/跨幣別 skip 有測。deviation（`AccountDraft.creditGroupId` optional 比照 `bookId`）已核准。**已 MERGED 進 main `ba5ef85a`**（乾淨 union merge，整合後 build 0 + 1487/1487 tests） |
| 256  | **Phase C（UI + 收斂）**：AccountsRoute 群組管理（建立/編輯/刪除群組的額度/結帳日/繳款日）+ 帳戶表單「歸屬群組」下拉取代自由文字 + 成員欄位唯讀顯示「來自群組」；ReconcileRoute（253）分組觸發改用 `creditGroupId`；`calculateCreditGroup` 改讀群組實體 + `useFinanceData` 暴露 creditGroups；自由文字 `creditLimitGroup` 退出 UI（欄位保留）               | P2       | M–L    | 255        | **DONE — executed+reviewed 2026-07-24**，branch `feat/ai-credit-group-ui`（commit `e9a88d70`，直接疊在 `ba5ef85a` 上→乾淨 FF）。複驗：build 0、1487/1487 tests、grep 判準全過、ReconcileRoute 改用 `creditGroupId`、刪群組先清成員（觸發 leave-group 快照）不留孤兒、繼承欄位唯讀+「來自群組」提示。⚠ 執行者遇 worktree base 錯置（又是 `8fed759d`），以 `git reset --hard main`（自有 disposable 分支，安全）復正並透明記錄，advisor 已驗 ancestry 正確。⚠ 小追蹤：合併對帳頁 H1 title 仍 fallback `creditLimitGroup                                                                                                                                                                                   |     | name`，creditGroupId 分組的卡會顯示卡名而非群組名（Step 5「其餘不動」所接受，值得小 follow-up）。**MERGED** ✅（reconcile 2026-07-25 驗證 `e9a88d70`已在 main；標題顯示群組名的 follow-up 也已由`6f2a5fc3` 修掉） |

## 251–253 — 信用卡對帳/繳款三連修（`/improve plan` @ `8fed759d`, 2026-07-24）

使用者回報三件事（皆圍繞對帳頁 `src/routes/ReconcileRoute.tsx`）：
(1) 繳款無法選期別、且繳一期把後續各期都標成已繳款；(2) 同家銀行/同組卡希望一起對帳；
(3) 繳款產生的記帳紀錄日期改不動。調查後根因與修法：

| Plan | Title                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Priority | Effort | Depends on | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 251  | **繳一期卻全標已繳款**（財務正確性 bug）。根因：`markPaid()` 把 watermark 設成 `currentPeriod?.dueDate`——那是**尚未結帳的開放當期**繳款日；經 `isPaid = paidUntil >= dueDate` 使所有繳款日 ≤ 該值的期別全翻已繳款。修法：`markPaid(dueDate)` 只用選定期別繳款日；`PayCardModal` 加「繳款期別」選擇（預設最舊未繳已結帳帳單）、金額預設該期淨額；header「已繳款」只在無待繳已結帳期別時顯示。保留 watermark 語意（不改 `creditCardStatements.ts`）。含 1 筆 domain regression 測試 | P1       | M      | —          | **DONE — executed+reviewed 2026-07-24**：executor (sonnet) 於 worktree 分支 `feat/ai-reconcile-251-253`（commit `8d2f4842`）完成；advisor 獨立複驗 build exit 0、`creditCardStatements`/`datetime` 共 17 tests 全過、lint 0 errors、grep 判準（`currentPeriod?.dueDate` 歸零、`繳款期別` 命中）、diff 忠於計劃。**MERGED** ✅（reconcile 2026-07-25 以 `git merge-base --is-ancestor` 驗證 commit 已在 main）。追加：切換「繳款期別」下拉自動帶入該期淨額（保留手動輸入、無 useEffect），commit `a3fc1418`，advisor 複驗 build/lint exit 0、僅動 ReconcileRoute.tsx |
| 252  | **繳款紀錄日期改不動**（可編輯性 bug）。根因：`handlePay` 用 `todayInTimezone`（date-only `YYYY-MM-DD`）寫 ledger/transfer 日期，但編輯抽屜是 `<input type="datetime-local">`（需 `YYYY-MM-DDTHH:mm`），date-only 值被瀏覽器當空值→欄位空白。修法：(a) 治本—`handlePay` 改 `nowAsDatetimeLocal`；(b) 相容既有—新增純函式 `toDatetimeLocalValue`（date-only 補 `T00:00`）包住輸入 value。含 3 筆單元測試                                                                           | P1       | S      | —          | **DONE — executed+reviewed 2026-07-24**（同分支 commit `0b628d58`）：advisor 複驗 `datetime` 測試 9 passed（6+3）、build/lint 過、`toDatetimeLocalValue` 在 CashFlow 命中 2 處（import+使用）、`const today = todayInTimezone` 日曆日用法保留。治本＋顯示層 coercion 兩層都在。**MERGED** ✅（reconcile 2026-07-25 以 `git merge-base --is-ancestor` 驗證 commit 已在 main）                                                                                                                                                                                        |
| 253  | **同組卡合併對帳**（使用者要求的功能）。玉山 UniCard+UBear 帳單合出，希望一起核對。重用既有 `creditLimitGroup` 為分組鍵（免 schema 變更）；偵測「同組、同結帳日/繳款日/幣別、≥2 卡」時切合併視圖：跨卡匯入同帳單週期、逐筆標卡片來源、合併統計、跨卡「全部對帳」、繳款對整組寫 watermark。`buildStatementPeriods` 無需改（`LedgerTransaction` 已帶 `accountId`、T 保留）。合併繳款金額拆分明確延後。含 1 筆 domain 測試                                                           | P2       | L      | 251        | **DONE — executed+reviewed 2026-07-24**（同分支 commit `f240f902`）：疊在 251 上，advisor 複驗 build 0、`creditCardStatements` 8 tests（含合併測試）全過、lint 0 errors、grep `groupAccountIds.has`/`for (const a of groupAccounts)` 命中、單卡無回歸（`groupAccounts=[account]`）。⚠ 已知（計劃已載）：markPaid 逐卡 await 中途失敗會部分寫入（watermark 冪等、重繳補齊）。需 `creditLimitGroup` 兩卡同值＋同結帳/繳款日才觸發合併——操作者驗收前先確認帳戶設定。**MERGED** ✅（reconcile 2026-07-25 以 `git merge-base --is-ancestor` 驗證 commit 已在 main）      |

**執行順序**：251 → 252 → 253（三者皆動 `ReconcileRoute.tsx`；253 的繳款迴圈疊在 251 的
`markPaid(dueDate)` 上，252 只改 `handlePay` 日期一行，彼此衝突面小）。

**調查結論／刻意不做（勿再報）**：

- 不把 watermark 換成「每期一個已繳布林」——那是 schema migration；watermark（`paidUntil >= dueDate`）
  語意正確且與 `dashboardSummary.ts:172` 提醒一致，251 只修「選錯期別」。
- 253 不合併「同銀行但不同結帳日」的卡（帳單週期會錯）；不實作合併繳款的金額拆分（v1
  轉帳入單一選定卡、watermark 對整組生效已滿足「一起對帳」訴求）。
- 252 保留顯示層 coercion 不可拿掉（否則歷史 date-only 紀錄仍空白）。

## 250 — 應付「借款入帳」可發現性（`/improve plan` @ `dea84016`, 2026-07-22）

| Plan | Title                                                                                                                                                                                                                                                                                                                                                                                                     | Priority | Effort | Depends on | Status                                                                                                                                                                                                                                                                                                                                                           |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 250  | 操作者以為「應付無法設定借款入哪個帳戶」——調查結論：**功能已存在**（AP 的「收款帳戶」`counterAccountId`，自 alpha.26 `1d956eab`），語意正確（建立時入帳、結清扣款、整筆不計收支）。缺陷是**可發現性**：文案只講「代墊」，全程沒出現「借」字，操作者本人沒認出來。修法＝純文案：AR/AP 提示點名「借錢給別人／跟別人借錢」、AP placeholder 加借款方示例、AP 欄位標籤加「借入」。三處字串無測試引用，S 工作量 | P3       | S      | —          | **DONE — executed+reviewed 2026-07-22**：executor (sonnet) 於 worktree 分支 `fix/ai-payable-borrow-copy`（commit `645cc1ab`）完成；reviewer 重跑全部 done criteria（tsc/lint 過、1462 tests 全過、三 grep 命中、舊 AP 標籤歸零、diff 僅 CashFlowRoute.tsx 4+/4−）。**MERGED** ✅（reconcile 2026-07-25 以 `git merge-base --is-ancestor` 驗證 commit 已在 main） |

**已考慮而排除**（勿再報）：不新增「借款」交易類型（`counterAccountId` 已涵蓋，
借入=AP+收款帳戶、借出=AR+付款帳戶）；不在 QuickAdd 加 AR/AP（QuickAdd 刻意限縮
已結清收支，擴充屬產品決策）；銀行貸款另有帳戶層 loan 欄位，與個人間借款分工正確。

## 249 — CI release 私有資產注入（sync-endpoint 斷線事故的姊妹缺口, 2026-07-22）

| Plan | Title                                                                                                                                                                                                                                                                | Priority | Effort | Depends on | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 249  | 官方 CI build 自 alpha.63 起缺銀行 logo + ETF feed:`release.yml` 沒有 `private-assets/`(1.1MB,僅存維護者本機)的注入。**方案 A 已選定並落地**:openssl 加密封存檔 + `PRIVATE_ASSETS_KEY` secret,CI 解密後 prebuild 照常;無 secret 的 source build 印 skip 訊息照常建置 | P2       | M      | —          | **DONE(程式面)— reviewed+MERGED** @ `36caa1ad`(fix commit `211e2f1d`)。pack/unpack 腳本 round-trip/錯 key/no-op 三測全過、YAML 驗證過、RELEASING.md 已載新流程。執行插曲:advisor 派發提示編號衝突使 release.yml 先被跳過(執行者判斷正確),補指示後完成;amend 被環境擋,以 `reset --soft` 非破壞收單 commit。**operator 步驟已完成(2026-07-22)**:secret 已設、`.enc`(801K,`Salted__` 標頭驗證)已 commit @ `aa0264ac`。**唯一殘餘驗收**:下一次發版(alpha.67+)確認官方 build 銀行 logo 回來 |

**事故脈絡(2026-07-22)**:使用者裝置出現「Sync worker endpoint is not configured」。
根因:`release.yml:168` 讀 repository variable `NORTHSTAR_SYNC_WORKER_URL`,但它從未被建立;
RELEASING.md 又誤載為 secret `VITE_NORTHSTAR_SYNC_WORKER_URL`(名字與類型雙錯)。2026-07-16
恢復 CI 自動發版後 alpha.63–65 官方 build 同步全斷(本地 build 因 `.env` 有值而掩蓋)。
**已修**:variable 已設(2026-07-22)、RELEASING.md 已更正、alpha.66 發版驗證。
私有資產是同一類「CI 未按 §0 配置」的殘餘缺口 → 本計劃。

## 246–248 — 動畫審計新增機會（`/improve-animations` @ `92a96210`, 2026-07-21）

| Plan | Title                                                                                                                                                                                                                                                        | Severity | Effort | Depends on   | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 246  | Dashboard 淨值 hero 數字滾動(count-up):新增可重用 `<AnimatedNumber>`(rAF tween 560ms ease-out、可中斷 retarget),hero 換用。snap 條件:首次 mount、resetKey(指標/帳本)切換、reduced-motion、隱私模式、null。registry 已有 `value: number` 只需補 `formatValue` | HIGH     | M      | —            | **DONE — MERGED** ✅（reconcile 2026-07-25 驗證） @ `e406997e`(branch `feat/ai-animated-number-hero`)。advisor 複驗:tsc 0、6/6 新測試、全套 1462、lint 0。兩個記錄應變合理(benchmarkGap 需顯式 `(n: number)`;eslint disable 按計劃條件移除)。⚠ 執行者 worktree 消失後曾在主 checkout 切分支工作(隔離違規,無實害,advisor 已復原 main)。**CLOSED 2026-07-26** — feel check(滾動手感)改為回報式驗收，不再掛著等操作者專門確認;覺得動畫礙眼或太慢再回報調 tween。                                                                                                          |
| 247  | FIRE 達成瞬間一次性慶祝(操作者拍板:低調光暈掃過):進度條 accent 高光掃過 600ms + 百分比 scale-pop 1→1.06→1 320ms。只在 in-session false→true 跨越時播,mount 已達成不播,`animationName` 過濾收尾。無 confetti                                                  | MEDIUM   | S      | 建議先做 248 | **DONE — MERGED** ✅（reconcile 2026-07-25 驗證；1 REVISE round） @ `ee99c6d5`(branch `feat/ai-fire-celebration`)。執行者正確抓到**計劃自身的 Rules-of-Hooks bug**(指定位置在 early return 後),搬移時引入 `projection ? … : false` 假轉變 bug(已達成者每次開 Dashboard 誤播)→ advisor REVISE → null 三態修法落地。CSS 逐字吻合。**CLOSED 2026-07-26** — feel check(光暈質感、mount 不重播)改為回報式驗收;註:「mount 不重播」這條**已有自動化測試涵蓋**(null 三態修法的迴歸測試),真正主觀的只剩光暈質感。⚠ 與 248 都動 FireGoalCard/globals.css,合併順序 248 → 247,見下 |
| 248  | 進度條填充動畫統一 token:抽 `.ns-progress-fill`(scaleX + `var(--ns-dur) var(--ns-ease)`),四處換用 —— FireGoalCard(Tailwind 預設 timing drift)、GoalsRoute ×2(完全無動畫且用 width%)、AccountsRoute(hand-typed 0.3s)                                          | LOW      | S      | —            | **DONE — MERGED** ✅（reconcile 2026-07-25 驗證） @ `fa435518`(branch `fix/ai-progress-fill-tokens`)。advisor 複驗:diff 與計劃逐字吻合、tsc 0、全套 1454、grep 判準 1/2/1 精確。executor worktree 重建應變有記錄且同基底                                                                                                                                                                                                                                                                                                                                               |

**審計脈絡**:全專案 corrective 掃描結果乾淨 —— 零 `ease-in` / `transition: all` / `scale(0)`,
toast/sheet 可中斷,reduced-motion 全域處理含 view-transition。以下為**刻意決定、勿再報**:
recharts 全面 `isAnimationActive={false}`(防 hover/filter 重畫 jank,不要反轉);按鈕
`:active` = `translateY(1px)`(刻意的 no-bounce 質感)。
**建議執行順序**:248 → 247(shimmer 疊在 248 的結構上)/ 246 獨立可並行。

## 245 — 年度報表列印按鈕被 coarse 假訊號錯藏（`/improve plan` @ `d7818bde`, 2026-07-21）

| Plan | Title                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Priority | Effort | Depends on | Status                                                                                                                                                                                                                                   |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 245  | `AnnualReportRoute.tsx` 用 `(pointer: coarse) OR (max-width:1023px)`(plan 233 引入)判斷「mobile」以隱藏「列印 / 匯出 PDF」按鈕。同 244 的 WKWebView-coarse 假訊號 → 桌面 Tauri app(窗永遠 ≥1024、列印排版正常)反而**看不到列印按鈕**。修法:改用寬度訊號 `(max-width:1023px)`(側欄隱藏 = mobile layout),桌面顯示、窄視窗隱藏。無現成同步 desktop-vs-iOS 判斷(`isTauri()` 兩者皆 true),故用寬度;精準 iOS 判斷需 async `plugin-os`(範圍外)。單檔改動,無新測試(component 無測試 + jsdom 無 matchMedia,同 233) | P3       | S      | —          | **DONE — reviewed+MERGED** 2026-07-22。diff 與計劃逐字吻合,advisor 獨立複驗全部 grep 判準 + tsc 0 + 1462 tests + lint 0。**CLOSED 2026-07-26** — 操作者拍板改為「回報式驗收」：不再掛著等實機確認，日後桌面 app 若仍看不到列印鈕再回報。 |

**與 244 關係**:同根因、不同檔、**無相依**。兩者都 inline 了 `matchMedia("(max-width: 1023px)")`;
待兩者都合併後,可另開 cleanup 抽共用 `isMobileLayout()` 作單一「側欄已隱藏」判斷,避免 coarse 假訊號被 copy-paste 復活。

## 244 — 小視窗下交易 Sheet 跑版（`/improve plan` @ `d7818bde`, 2026-07-21）

| Plan | Title                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Priority | Effort | Depends on | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 244  | 桌面 app 縮到最小視窗時，「新增交易」抽屜左緣被側欄切掉。根因：`ModalShell` 用 `(pointer: coarse) OR (max-width:1023px)` 判斷是否走 bottom-sheet，但 (a) Tauri 桌面窗 `minWidth:1024` → 側欄永遠顯示、`max-width:1023` 永不觸發；(b) macOS/Tauri WKWebView 回報 `pointer: coarse=true`。於是 sheet 在側欄仍在畫面上時啟動，`.ns-sheet-bottom`（`position:fixed; left:0; right:0` 全寬）被 `z-index:1100` 的側欄蓋住左緣。修法：把 sheet 的啟用條件收斂成與側欄互斥的 `(max-width:1023px)`，桌面 fallback 回右靠 drawer（不碰側欄）。只改 `ModalShell.tsx` + 其 test | P2       | S      | —          | **DONE — reviewed + MERGED** @ merge `2431c321`（fix commit `9a81ba25`）。advisor 獨立複驗全部 done criteria、讀完整 diff、稽核新測試（負向測試確實鎖住「coarse 桌面不啟用 sheet」）。scope 乾淨（僅 2 檔）。`tsc` 0、`ModalShell.test.tsx` 19 passed（17+2）、full suite 1456 passed、lint 0 errors/761 warnings（基線相同）。⚠ 計畫 done-criteria 的 `grep "pointer: coarse" → no matches` 是**過度指定**：新註解文字裡有這串字，程式碼查詢已無此 query——執行者照抄計畫原文並回報，判斷正確，非缺陷（245 已修正此 grep 寫法）。⚠ **最終驗收需真 Tauri 桌面 build**（瀏覽器 fine-pointer 測不出）。 |

**同源但另案**：`AnnualReportRoute.tsx:32` 有同一份 `(pointer: coarse), …` query（plan 233 引入），
同樣的 WKWebView-coarse 假訊號會讓「列印」按鈕在桌面 Tauri 被錯誤隱藏——症狀不同、tradeoff 不同，
不在 244 範圍內。若要修，建議抽一個共用 `isMobileLayout()`（單一「側欄已隱藏」判斷）給兩處共用。

## 243 — 鏡像遺留物清理（alpha.64 發布時發現，`/improve plan` @ `16d5ed7c`, 2026-07-20）

| Plan | Title                                                                                                                                                                                                                                                                                                            | Priority | Effort | Depends on | Status                                                                                                                                                                                                                                                                                                                                                                               |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 243  | 清掉 `northstar-releases` 鏡像的三個遺留物：`tauri.conf.json` 的死 fallback endpoint（指向停在 alpha.44 的封存 repo）、`RELEASING.md` 仍宣稱本 repo 是 private 且教人建立 `RELEASES_TOKEN` 的過期整節、以及閒置的 `RELEASES_TOKEN` PAT（**Step 4 為 operator-only**：撤銷憑證不由執行者代勞）。`pubkey` 絕對不動 | P3       | S      | —          | **DONE — reviewed+MERGED** @ `1793d44b`。advisor 逐行確認 `pubkey` 為 diff context（未動）、`release.yml` 零改動。執行者另修兩處計畫未列但屬 Step 3 判斷範圍的檔案：`docs/DEVELOPMENT.md`（**事實錯誤**——仍描述 private repo + 鏡像流程）、`docs/REPOSITORY_CLEANUP_AUDIT.md`（加淘汰標註，內容保留為歷史）。⚠ **Step 4 仍待 operator**：刪除 `RELEASES_TOKEN` secret 並撤銷該 PAT。 |

**背景**：`d206e2cc`（2026-06-26）已刻意移除鏡像 job——repo 轉 PUBLIC 後，
「private repo 無法匿名下載」的原始理由消失，release 直接發本 repo 即可。那次清理
漏了上述三項。**死 endpoint 今天無立即危害**（Tauri 依序嘗試，第一個永遠成功；且
只在 feed 版本較新時才更新，不會降版），屬誤導性死參照 + 憑證衛生問題。

⚠ 計畫內含三條 STOP：`pubkey` 若有任何 diff 立刻停（換簽章金鑰會讓所有現有安裝
無法驗證更新）；`release.yml` 若還有鏡像參照則前提錯誤；repo 若不是 PUBLIC 則那個
「死」endpoint 其實是唯一可用的，絕對不能移除。

## 239–242 — vault-key rotation BUILD (operator answered 238's §7, 2026-07-19 @ `b4fbe894`)

**Operator decisions (2026-07-19) — encoded in every phase, do NOT re-ask:**

1. **Auto-rotate on revocation, no prompt.**
2. **Old key versions retained locally forever.** ⚠ Operator initially chose
   "delete", advisor flagged the concrete consequence — deleting breaks
   `forceFullResync` (which must decrypt EVERY envelope ever pushed, incl.
   pre-rotation ones) while buying **zero** security (the threat is someone
   else's leaked copy; your own copy's plaintext is already resident). Operator
   re-decided: **retain**. If "make old data unreadable" is ever genuinely
   wanted, that's relay-side ciphertext deletion — a different, bigger feature.
3. **Solo-device account → rotation is a no-op.**
4. **Manual "rotate now" button: yes, but as a thin follow-up AFTER phase D.**
5. **Relay-side version allocation accepted** (rotation-count metadata < what
   the relay already sees).

| Plan                                                                              | Phase | Title | Effort | Risk | Depends on | Status |
| --------------------------------------------------------------------------------- | ----- | ----- | ------ | ---- | ---------- | ------ |
| **✅ ALL FOUR PHASES DONE — reviewed + MERGED 2026-07-19.** Final gates on merged |
| `main`: tsc 0 / lint 0 errors (761) / **client 1454** / **worker 61**.            |
| Test growth across the build: client 1414→1454, worker 33→61.                     |

**Advisor REVISE round (phase A) — the catch that mattered**: the executor's
first cut allocated `wrapped_key_version` **per deposit**, so one rotation
fanning out to 3 devices minted 3 different versions for the SAME key → in
phase B/C that becomes device A stamping envelopes v5 while device B holds the
same key as v6, and each silently skipping the other's data forever
(`unknown-key-version`). Spike §2 says per-KEY. Sent back; executor's fix was
better than my suggested one — it added a dedicated `key_version_counters`
table + `POST /keys/version` (allocate once per rotation), correctly noting
that validating against `MAX(key_envelopes.wrapped_key_version)` would reject
the first deposit of a freshly-minted version. Regression test added: one
allocation + 3 deposits → all three rows carry the identical version.

**Design properties verified by the advisor on merged code, not taken on trust**:

- `forceFullResync` does NOT call reset.ts's wipe paths (recovery stays intact
  under the never-delete invariant); reset.ts wiping ALL versions is correct —
  that's the user-initiated "unlink / start over" path, a different thing.
- Pre-upgrade install (only `northstar.vault.key.v1`, no pointer, no index)
  syncs with zero user action — test seeds the raw slot bypassing every new API.
- New key is saved to its own slot BEFORE the deposit loop, pointer flips LAST
  (`rotation.ts:133` vs `:194`) → on partial failure the initiator still HOLDS
  the new version and can read devices that did pick it up; a crash leaves it
  safely on the old key and re-running converges.
- Zero-deposit confirmation ping demotes to failure and the pointer never
  advances (phase D's load-bearing test).
- User-facing copy does not overpromise: 「移除裝置後,它收不到新的資料;但它先前
  已同步的資料仍留在該裝置上。」 — no wording implying remote wipe.

**Remaining (operator decision 4, deliberately deferred)**: the manual
「立即輪替金鑰」 button in Settings — same `rotateVaultKey()` entry point, small.

| 239 | A | Per-device public-key **directory** (the single biggest missing piece — a device's ECDH public key is only transiently visible today) + `wrapped_key_version` allocation with the `0006` per-user-scoped-MAX race pattern; worker migration `0008`, `POST /devices/:id/public-key`, client upload + one-time backfill | S–M | MED | 130/131/132 + spike 238 | **DONE — REVISE round (per-deposit→per-key version), merged** |
| 240 | B | **Versioned local key storage** — `northstar.vault.key.v{n}` family + current-version pointer, `sync_envelopes.key_version` stamped on push / selected on pull, differentiated unknown-version-vs-corrupt skip, Recovery-Kit staleness signal. **HIGHEST-RISK phase** (a mistake makes history undecryptable); never-delete is an invariant, not a preference | M | **HIGH** | 239 | **DONE — merged; backward-compat + never-delete verified** |
| 241 | C | **`rotateVaultKey()` protocol** — enumerate remaining devices → wrap-and-deposit per device → flip pointer LAST (crash-safe); recipient pickup wires the orphaned `fetchKeyEnvelopes` (zero prod call sites today) into `runSync`; auto-fires from `revokeDevice`; **LAZY** relay strategy (never re-encrypt history — spike proved `forceFullRepush` silently no-ops on unchanged revisions); v1 partial-failure = safe manual re-run | M–L | MED-HIGH | 239, 240 | **DONE — merged; pointer-flips-last verified** |
| 242 | D | **Hardening + honest UX** — post-rotation confirmation ping (zero deposits landed ⇒ FAILED, pointer must not advance), partial-failure UI naming unreached devices, Recovery-Kit regenerate prompt, and the §1 threat-model copy that does NOT overpromise (「移除裝置後它收不到新資料;先前已同步的資料仍留在該裝置上」) | S–M | LOW | 239, 240, 241 | **DONE — merged; copy verified non-overpromising** |

**Strictly sequential: A → B → C → D.** Each phase is independently verifiable;
this is the app's highest-risk surface (crypto + sync + worker + multi-device
skew in a finance product), so the phases are deliberately NOT merged into
fewer, larger plans. Total ≈ plan 131's effort + a Recovery-Kit UX slice — the
spike confirmed **every crypto primitive is already shipped and tested**; the
work is directory/versioning/protocol plumbing, not new cryptography.

## 222 + 232–233 — 分帳 UI + follow-up burn-down (`/improve` @ `4f9356fa`, 2026-07-19)

Operator: finish 分帳 (222) and keep burning the follow-ups list.

| Plan | Title                                                                                                                                                                                                                                                                                                                                                                                                                      | Priority | Effort | Depends on   | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 222  | 分帳 UI — share drafts in `splitEntryState` (amount/對象/應收帳戶, exit-rule gains shares), 分帳 section in the split editor (expense-only, 代墊 full-list account picker precedent), save passes `shares` to create/updateSplit, edit round-trip (`splitGroupRowsFor` + `startSplitEdit` + list collapse widen to legKind share, expanded rows show 分帳 · 對象). Foundation (221) frozen — UI calls, never re-implements | P2       | M–L    | 221 (merged) | **DONE — reviewed+MERGED**. Executor found+fixed a real plan gap: save gate still used `splitLegsError` alone → 1 category + 1 share (valid combined-≥2) had Save permanently disabled; added `combinedSplitError` mirroring the builder's rule order with a byte-parity regression test. Executor ran the FULL live pass itself (also closes the outstanding 182 live pass): −1000 bank / +600 應收 / 400 expense, 拆分 badge, edit round-trip no duplicate group. +17 tests (1409). |
| 232  | DRIP partial-sync guard — `incompleteDripGroupIds` (pair `!== 2` rule, mirrors transfer guard) into the data-health report + consumer message rows; ≥4 tests                                                                                                                                                                                                                                                               | P3       | S      | —            | **DONE — reviewed+MERGED**. +5 tests (1414). Side-finding recorded: `incompleteSplitGroupIds` is computed but rendered NOWHERE (only transfer has consumer messages) — tiny follow-up below.                                                                                                                                                                                                                                                                                          |
| 233  | 年度報表列印 gate off coarse-pointer devices (ModalShell media-query convention); CSV 匯出 stays                                                                                                                                                                                                                                                                                                                           | P3       | S      | —            | **DONE — reviewed+MERGED**. Gate at AnnualReportRoute:30, used :191. **CLOSED 2026-07-26** — 操作者拍板改為「回報式驗收」：不再掛著等一次專門的目視確認，日後實際用到列印覺得不對再回報開修正計劃。（註：233 引入的 coarse-pointer 判斷本身後來被 **245** 判定為假訊號並改成寬度訊號。）                                                                                                                                                                                              |

**138 tail — RETIRED at this session's inventory** (was "re-inventory before
planning"): ModalShell adoption = 18 files; every remaining non-ModalShell
overlay is deliberate — QuickAdd instant surface (plan 160), OnboardingOverlay
custom full-screen (+218 motion), quarantined `ui/dialog` (⌘K only), EntryDrawer
sidebar-offset scrim (plan 162 decision). The migration is effectively complete;
no further plan.

**234 + 235 — DONE, reviewed+MERGED (2026-07-19, same session)**:

- 234 split-guard messages: `拆分交易不完整` rendered in both consumers beside
  transfer+DRIP (grep = 2 hits). Three guards now wired identically — next new
  guard should generalize the message row (three-strikes note in 234).
- 235 分帳一鍵還款: `startShareRepayment` (CashFlowRoute:933) prefills a
  transfer (應收帳戶 → original account, |amount|, note 「對象 分帳還款」) via
  `openCreate("transfer")` reset; `HandCoins` 還款 button on share legs only.
  Executor live-verified end-to-end incl. balance round-trip. No per-leg repaid
  flag — account-balance-based by design; documented double-tap = two transfers.

## 236–238 — final burn-down (`/improve` @ `82839b85`, 2026-07-19)

| Plan | Title                                                                                                                                                                                                                                                                                                  | Priority | Effort | Depends on      | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 236  | Quick Add §6.3 preview-stage remediation — account chips in preview when unmatched (pre-seeds the confirm card, no parallel channel), 建議 badge on guessed category. Parser FROZEN                                                                                                                    | P3       | S–M    | —               | **DONE — reviewed+MERGED**. Rule derived from code: ALL preview-time categories are guesses (only source = `resolveCategory` lexicon); tap-建議 clears via `categoryGuessCleared`; account tap → `previewAccountOverride`, applied in `parse()` BEFORE §6.5's derived default. Live-verified 3 behaviors. Parser byte-unchanged (39/39).                                                                                                                                                                                                                                                                                                                                                                                                    |
| 237  | Retire 137-C — delete dead `formatPercent` (0 call sites; latent ratio-vs-percent unit-bug trap). 91-site migration verdict: won't-do (churn ≫ value, amounts already masked)                                                                                                                          | P3       | XS     | —               | **DONE — reviewed+MERGED**. `MASKED_PERCENT` (sole consumer) deleted too. 137-C CLOSED.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 238  | 132 vault-key rotation **design SPIKE** (doc-only → `docs/vault-key-rotation-plan.md`): threat model honestly bounded, key versioning, mailbox re-wrap protocol, lazy-vs-full-repush, skew failure modes, worker delta, phased build outline + operator questions. **BUILD stays a dedicated session** | P2       | M      | 130-132 shipped | **DONE — reviewed+MERGED** (514-line doc). **Spike's key discovery: `forceFullRepush` CANNOT replace stale-key ciphertext** — unchanged revisions hit the relay's `ON CONFLICT DO NOTHING` dedup (worker/src/index.ts:463) and silently no-op → recommendation = LAZY rotation (old envelopes stay old-key; deleting local old keys protects nothing). ~~5 operator questions in §7 gate the build~~ → **所有 5 題已於 2026-07-19 由操作者拍板（全數採納建議），phases A–D（plans 239/240/241/242）皆已 DONE+merged，此 track 已完整出貨。** §7 Q4 的後續（Settings 裡一顆常駐的手動「立即更換加密金鑰」按鈕）已由 **plan 276** 補上並 merged（2026-07-26）。**整條 vault-key rotation track（238 → 239/240/241/242 → 276）至此完整結案。** |

**Plan-173 print eyeball — advisor partial check DONE (2026-07-19)**: static
verification of the `@media print` block passed — chrome hidden (`.ns-sidebar`,
`.ns-mobile-dock`), `color-scheme: light !important` (dark theme prints
light-on-white), `print-color-adjust: exact` (gain/loss colors survive),
`.ns-annual-report tr { break-inside: avoid }` (no year-row page splits) — all
three eyeball concerns have CSS backing. **Remaining operator-only**: one real
print dialog output check (margins/fonts on paper or PDF).

**Resolved without a plan (this session's audit)**: Quick Add **§6.2 token
highlight = WON'T-DO-for-now** — the spec doc's `ParsedField.span` claim is
STALE (no span type exists; parser emits none), so cost = tokenizer-wide span
plumbing + transparent-input overlay + CJK/IME hazards, while §6.1's preview
chips already show what the parser understood (the doc's own status note
records the substitution). Revisit only on real user confusion reports.

**Still open after 236-238**: plan-173's operator-only print eyeball (advisor
will do a print-media emulation partial check), deferred-by-design 085-088 /
Tier 2, and the 238-spike's build (dedicated session).

## Reconciled 2026-07-19 (`main` @ `54f7339b`, in sync with origin)

- **228–231 (DCA batch) done-criteria re-verified by grep at HEAD** ✓ (tab entry ×2,
  `switcherAccountIds` filter, ROADMAP 已暫時隱藏 = 0, `"dca"` todoRows source,
  `upcomingDca`, `postConfirm`/`buildQuoteLookup` ×6, `isTaiwanListedTicker`
  export+use). Full suite re-run: **1392 tests green**.
- **DCA decision doc §6 worklist: all 8 items landed** (books-scope, tab, dashboard
  reminder, stale-price, TW lot call, fee test, ROADMAP, demo seed) — the Option A
  finishing pass is COMPLETE. Only deliberately-unbuilt remainder: auto-post
  (flagged in the doc as a separate, un-approved M-effort feature).
- **Open follow-ups pruned — 3 retired, 1 updated**: worktrees/Tailwind (fixed
  `55c636ac`), EntryDrawer autocomplete (plan 219), Index-Nudge full-history
  (plan 220) all retired; 分帳 phase-2 entry rewritten — foundation done (221),
  **plan 222 (分帳 UI) is the remaining piece**, still gated on the operator's 182
  live pass.
- **No BLOCKED / IN-PROGRESS plans. Executable frontier**: plan 222 (cut it when
  ready), the pruned Open follow-ups (132 vault-key rotation, DRIP partial-sync
  guard, annual-report print polish, Quick Add §6, 138 re-inventory, 137-C), and
  the deferred-by-design items (085-088, Tier 2 parked).

## Reconciled 2026-07-18 (`main` @ `9119cb8e`)

- **227 (編輯轉帳) is MERGED** — the background session merged `fix/ai-transfer-edit`
  @ `9119cb8e` (row below was stale at "awaiting operator merge"; now corrected).
- **Merged batch 223–227 re-verified on HEAD**: gates green — tsc 0 / lint **0 errors**
  (761 warnings, the plan-225 baseline) / **1373 tests** / 125 files. Artifact greps
  all present: `domain/todoRows.ts` (223), `lockCount` ref-count (224),
  `from:"reconcile"` across router+Reconcile+CashFlow (225), `planFeeLegUpdate` (226),
  `updateTransfer` + `editingTransferGroupId` + 6 `setEditingTransferGroupId` clears
  incl. the openCreate/startDuplicate symmetry the review added (227).
- **main is ~6 commits ahead of `origin/main`** (223–227 batch + this reconcile) —
  push pending, operator's call.
- **Stale branch safe to delete**: `fix/ai-transfer-edit` (merged at `9119cb8e`).
- **No BLOCKED / IN-PROGRESS plans; no drifted TODOs.**

## 228–230 — DCA Option A build batch (`/improve plan` @ `fd4af91f`, 2026-07-18)

Operator chose **Option A (rework & re-enable)** from `docs/dca-decision.md`.
The doc's §6 worklist (8 items) turns into these 3 plans — because 2 items were
already-resolved-in-code (no work) and 1 needs an operator decision (below).

| Plan | Title                                                                                                                                                                                                                                                                                                                                                   | Priority | Effort | Depends on                                | Status                                                                                                                                                                                                                                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 228  | Re-enable the DCA tab, **books-scoped** — add 定期定額 to InvestmentsRoute tabs array (union+render branch already wired), filter `RecurringInvestmentsTab`'s rules by `switcherAccountIds.has(r.accountId)` (the operator-decided 公司/個人 scoping, mirrors DashboardRoute:798-806), fee-preservation regression test, ROADMAP flip, 1 demo seed rule | P2       | M      | —                                         | **DONE — reviewed+MERGED**. Filter mirrors Dashboard precedent byte-for-byte; fee test (fee:15 survives post ×2 harnesses); demo seed 0050.TW@189.5 on 凱基證券; ROADMAP flipped. 1375 tests.                                                                                                                                |
| 229  | Restore the dashboard DCA reminder as a **待辦 source** (not a separate card) — add `dca` type + `dcaRules` source to `domain/todoRows.ts` (plan 223's maintenance note explicitly anticipated this), books-scoped 30-day upcoming list in DashboardRoute, row links to `/investments?tab=recurring`                                                    | P3       | S      | **228** (tab must exist to link to)       | **DONE — reviewed+MERGED**. +2 todoRows tests (1392 total). Live-verified: 待辦 shows 「定期定額 · 凱基證券」, click lands on `/investments?tab=recurring`. NOTE: pre-existing demo stashes don't contain the 228 seed — exit+re-enter demo to see it (demo reseeds on entry).                                               |
| 230  | DCA post-time **stale reference-price** guard — the one real semantic gap: posting uses a static 參考價 typed once, no staleness check. Post button → confirm dialog showing stored 參考價 vs latest loaded quote (`buildQuoteLookup`/`findQuoteForTicker`), offers 用參考價 or 更新為最新報價並記錄 (update-then-post). Posting math untouched         | P3       | S–M    | **228** (tab must be reachable); soft 231 | **DONE — reviewed+MERGED**. Three dialog states (differ/match/no-quote); update-then-post sequential awaits (verified postRecurringInvestment re-reads from storage, so ordering is load-bearing); +取消 button (convention, documented). Live-verified: dialog opens, quote==stored → single action, 分配不足 line renders. |

**Recommended order**: 228 → 231 → 230 → 229 (231 is independent but its
`isTaiwanListedTicker` powers 230's 分配不足 display line — soft dependency;
229 last, pure polish).

**Broker-flow refinement (operator, 2026-07-18)**: TW 定期定額 actually debits
the FULL pledged amount, buys whole shares, then refunds the remainder (扣款
15,000 → 成交 14,500 → 退 500); can't-afford-1-share → full refund, period
doesn't happen. Encoded in 231: Northstar records the NET result (one buy +
`quantity×price+fee` settlement — never a fake debit/refund cash-flow pair,
which would pollute statistics while netting to the same balance), and the
can't-afford case refuses to post (本期不成立 error). 230's dialog gained the
分配不足 line (實際投入 vs 約定金額) so the below-nominal record isn't a surprise.

**Worklist items NOT planned, and why** (from `docs/dca-decision.md` §3):

- **Reminder-vs-auto-post** (§3.1) — ALREADY the shipped model (manual one-tap
  post; no auto-scheduler exists). No work. _If the operator ever wants full
  auto-post like cash rules, that is a NEW M-effort feature (new code path +
  market-closed/stale-price story) — a separate decision, not "finishing" DCA._
- **By-amount-vs-by-shares** (§3.2) — both modes already in the type + UI toggle
  (`RecurringInvestmentsTab.tsx:257`). No work.
- ~~Fractional-share / lot-size rounding (§3.4) — needs an operator decision~~
  **RESOLVED → plan 231** (operator delegated to market convention 2026-07-18,
  investigated with sources): **台股 = 整股向下取整**（TWSE 最小單位 1 股、無
  sub-1-share；券商定期定額整股分配、分配不足；扣款不足 1 股即下單失敗）,
  **美股 = 小數股向下取到 4 位**（Fidelity/E*TRADE 3dp 捨去、Webull 1/100,000
  — 4dp 取中）。TW 定股模式非整數股數 → throw。

| Plan | Title                                                                                                                                                                                                                                                                                                                                                                                 | Priority | Effort | Depends on                                  | Status                                                                                                                                                                                                                                                                                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 231  | DCA 定額股數推導 market-aware — new `isTaiwanListedTicker` predicate in `domain/marketSymbols` (+first-ever test file for it), `recurringInvestmentToDraft` floors TW to integer / others to 4dp, insufficient-amount posts fail with honest zh-TW error (mirrors 券商圈存失敗), TW 定股 non-integer throws. ≥4 dual-harness cases; STOP if old suite asserted fractional TW quantity | P3       | S      | — (independent of 228-230; merge any order) | **DONE — reviewed+MERGED**. STOP-check clean (old TW tests already asserted whole numbers — never encoded the bug); 5 marketSymbols + 5×2 dual-harness tests (2330.TW 3000/612→4 股, 500/612→本期不成立 zero-record, VOO 500/411.3→1.2156). Live-verified end-to-end with 230's dialog: 10000/189.5 → 「實際投入 NT$9,854（約定 NT$10,000）」, posted record = 52 股. |

## 142 — DCA spike DONE + branch cleanup (2026-07-18, `main` @ post-merge)

- **142 (DCA finish-or-retire spike) executed + reviewed + MERGED** — doc-only,
  `docs/dca-decision.md` (335 lines). Recommendation: **Option A (rework & re-enable)**;
  the posting path is fully built+tested (reminder + manual one-tap post, NOT auto-post
  — verified: no `postDueRecurringInvestments` scheduler exists), only stale reference-price
  handling is a real gap. 8-item S–M worklist in the doc's §6. **Operator's finish/retire
  call is now unblocked.**
- **Branch cleanup**: pushed main to origin; deleted 12 fully-merged `feat/ai-*`/`fix/ai-*`
  branches (motion 214–218, autocomplete/nudge/share-legs 219–221, UX 223–226) +
  the DCA spike branch. `feat/ai-ga-motion-spike` deliberately kept (unmerged 161 spike;
  its `docs/motion-ga-spike.md` lives only on that branch). **→ 已於 2026-07-26 由 plan 277
  處理:doc 已進 main,PoC code 保存在 tag `spike/161-ga-motion-poc`,分支已刪除。** `fix/ai-transfer-edit` was
  never local (background session's worktree).
- **Next open items**: the DCA Option-A worklist (if operator chooses to finish) + the
  Open follow-ups list further down. No plan is blocked.

## 227 — 編輯轉帳 duplicate-pair bug (found by 225's executor, verified @ `93ee4103`; planned @ `9ece3bde`, 2026-07-18)

Editing a transfer is silently destructive: the detail panel offers 編輯交易 on
transfer rows (`TransactionDetailPanel.tsx:322`), but `startEdit` hydrates
`ledgerForm` only (transfer drawer opens empty/stale) and `submitTransfer`
always calls `createTransfer` — **saving mints a duplicate transfer pair while
the original stays**; balances double-move. Reverse direction broken too
(type tabs live while editing → 轉帳 tab on an expense edit creates + strands).

| Plan | Title                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Priority | Effort | Depends on                                                                | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 227  | 編輯轉帳 — new repo `updateTransfer(groupId, TransferDraft)` (**in-place leg update**, NOT updateSplit's tombstone+recreate: leg ids + `isReviewed`/`postDate` must survive — reconcile stores state ON legs), fee-leg reconcile table (mirrors 226), UI hydrates `transferForm` by groupId lookup (deep-link rows carry no `transferPair`), `editingTransferGroupId` state, `changeType` guards both hazardous directions. ≥7 dual-harness tests incl. the no-duplicate regression + atomicity | P1       | M      | — (226 touches the same files — coordinate merge order; disjoint regions) | **DONE — MERGED** ✅（reconcile 2026-07-25 驗證：`updateTransfer` 在 repositories.ts 存在） Branch `fix/ai-transfer-edit` @ HEAD. 16 dual-harness tests (8 情境 × 2 harness; 1341→1357), tsc 0 / lint 0 errors. Review fix folded in: executor omitted the `editingTransferGroupId` clears in `openCreate`/`startDuplicate` (the `editingSplitGroupId` symmetry) — stale state would have turned 複製轉帳 into an update. Live-verified in demo mode: edit hydrates, save 800 → ONE pair (27 筆 not 28), re-edit shows 800, fee 0→15→0 creates/hydrates/removes the 手續費 row, type tabs inert in BOTH directions. (Sonnet executor stalled at step-5 browser phase; advisor completed verification directly.) **MERGED @ `9119cb8e`** (background session, reconciled 2026-07-18; re-verified green at HEAD: 1373 tests). |

Interim mitigation option (operator's call, not in the plan's steps): hide
編輯交易 for `entryType === "transfer"` rows — 複製 (`startDuplicate` is
correct) + 刪除 (groupId cascade) remain as the workaround.

## 219–221 — follow-up batch (operator-selected from Open follow-ups, 2026-07-17 @ `55c636ac`)

Operator picked #1 (worktree/Tailwind — **done directly**, `55c636ac`: gitignore
`.claude/worktrees/` + `git worktree remove busy-mestorf`), #2, #5, #8 from the
Open follow-ups list. 分帳 (#8) follows the 181→182 precedent: 221 = data-layer
foundation now; **222 (分帳 UI) is cut only after 221 lands**, against its real
signatures. ⚠ 182's operator live pass (Manual-verification section) is still
outstanding — do it before or with 222, not later.

| Plan | Title                                                                                                                                                                                                                                                                                                                                                        | Priority | Effort | Depends on | Status                                                                                                                                                                                                                                                                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 219  | Shared `MerchantAutocomplete` — extract QuickAdd's (kb-nav + aria, plan 180) into `components/`, adopt in EntryDrawer, delete the weak local copy + `buildMerchantSuggestions`. **Corrects the stale follow-up**: the drawer was never a plain input (own autocomplete since `60ac6277`); the real gap is keyboard nav/a11y/dedupe                           | P3       | S      | —          | **DONE — reviewed+MERGED** @ `5a34af05`. Live-verified in drawer: 「全」filters 全家/全聯, ArrowDown+Enter selects, Escape closes dropdown NOT drawer. Accepted deltas: cap 12→8, exact-value hidden.                                                                                                                                                                         |
| 220  | Index Nudge full-history evaluation — nudge verdict from `"1900-01-01"` TWR+benchmark (period-independent), alignment extracted to `domain/indexNudge.ts` + 4 tests, banner 口徑 line updated; view's Alpha card untouched; params/copy operator-locked                                                                                                      | P3       | S–M    | —          | **DONE — reviewed+MERGED** @ `5b2e40a1`. +4 tests (1322). Executor correctly flagged two of my done-criteria greps as imprecise (fallback branch keeps its own unrelated `benchByDate`; `1900-01-01` appears 5× not 2× — the plan's own code adds 3). Residual: `perf.nudgeInput` now unconsumed (harmless; remove when the perf memo is next touched).                       |
| 221  | 分帳 foundation — `legKind: "share"` legs on the split model: builder `shares` param (對象→`name`, required `counterAccountId` = 代墊 pass-through, expense-only), repo `createSplit/updateSplit(shares?)` + counter-account guard, `incompleteSplitGroupIds` counts category+share, **reconciliation test** (bank −1000 / 應收 +600 / expense 400). Zero UI | P2       | M      | —          | **DONE — reviewed+MERGED** @ `98dd6ee9`. +16 tests (1338 total), reconciliation test green on BOTH harnesses — `deriveAccountBalances` (ledgerTrust.ts:106-136) already posts the pass-through, no new mechanism. Signatures for 222 recorded in the executor report + plan's maintenance notes. **222 (分帳 UI) is now cut-able**; do the outstanding 182 live pass with it. |

Key semantics locked in 221 (from the 176 spike + reconciliation identity): a
share IS a receivable (`counterAccountId` pass-through, neutral to spend); a
請客 portion is not a share leg, it stays in the payer's own category legs —
so bank moves by the full paid amount, expense only by the payer's share.

## 223–226 — operator UX batch #3 (reported live, `/improve plan` @ `3b857c73` + `af28266e`, 2026-07-17)

Operator went to do 信用卡對帳 and the bill was invisible. Root cause confirmed
at `DashboardRoute.tsx:816-894`: plan 164's 待辦 merge stacked THREE silent
truncations (recurring `.slice(0,5)` + AR/AP `.slice(0,5)` + merged `.slice(0,6)`)
with no 查看全部 — a card reminder dated beyond the 6 nearest items is
unreachable, and with it the card's link to `/cash-flow/reconcile/$accountId`
(the only other entry is AccountsRoute:496's small icon). 222 stays reserved
for 分帳 UI (cut after 221's live pass).

| Plan | Title                                                                                                                                                                                                                                                                                                                                                                      | Priority | Effort | Depends on          | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 223  | 待辦「查看全部」— merge logic → pure `domain/todoRows.ts` (uncapped, +4 tests incl. the pushed-out-card regression), card keeps 6-row pulse + footer 「查看全部 N 筆 →」 opening a ModalShell with ALL items (same row links); removes the per-source pre-caps (fairness fix)                                                                                              | P1       | M      | —                   | **DONE — reviewed+MERGED** @ `defe774c`. Modal modeled on ClientManager's `variant="center"` pattern; shared `TodoRowItem`; regression test proves a card beyond 7 nearer bills survives. Live-smoked: card renders, footer correctly hidden at ≤6, 0 console errors (demo data can't stably exceed 6 — recurring engine auto-posts due bills on load; unit test carries the >6 case).                                                                                                                                                                                                                                                                                 |
| 224  | Ref-count `lockViewportScroll` — 對帳→編輯 round-trip strands `overflow:hidden`: ModalShell's exit-motion delay (plan 157) makes release non-LIFO, drawer captures "hidden" as its restore value. First-acquire locks / last-release restores / idempotent handles; +3 tests incl. the interleave regression. API unchanged, zero call-site edits                          | P1       | S      | —                   | **DONE — reviewed+MERGED** @ `c11d9310`. Executor rightly rewrote the old test that documented the buggy out-of-order behavior as a "known limitation", and fixed a leaked handle in the first test (fatal under module-level count). 8/8 suite.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 225  | 對帳→編輯交易 round-trip — `from: "reconcile"` search param (schema `router.tsx:62`), ReconcileRoute:366 passes it, CashFlow's panel-close/edit-save/delete paths call `returnIfFromReconcile()`; duplicate deliberately stays. Dashboard todo links unaffected (no `from`)                                                                                                | P1       | S–M    | — (224 independent) | **DONE — reviewed+MERGED** @ `9ece3bde`. 6 finish-paths wired (incl. recurring-scope prompt tail in `applyRecurringScope` — waits for this/future/all to resolve, fires once). Lint 762→761: helper now uses the previously-dead `navigate` (baseline improvement). ⚠ **Executor surfaced + advisor verified a pre-existing bug: transfer editing is broken** — detail panel offers 編輯交易 on transfers but `submitTransfer` always `createTransfer`s (duplicate pair, form not hydrated) → spun off as background task `task_e19c9aed` (running in a separate session). Installment-delete's own prompt flow deliberately not wired (not a plan-named finish path). |
| 226  | 手續費 editable on edit — lifts the recorded deferral (`CashFlowRoute.tsx:913-916`): repo `updateLedgerTransaction` reconciles the linked fee leg (create/update/tombstone per Design table, groupId+手續費+legKind-null lookup, `bump()` discipline), UI drops `!editing` gate + hydrates from the leg. Transfers/installments/splits out of scope. ≥5 dual-harness tests | P2       | M      | —                   | **DONE — reviewed+MERGED** @ `78f911a2`. Shared `planFeeLegUpdate` decision fn; SQLite override mirrors 1:1 in one `withTransaction`; `feeAmount === undefined` = no-opinion is the fan-out guard — proven by the scope="all" test (sibling fee legs untouched, merchant propagates). 12 new tests (6×2 harnesses), 1353 total. Provenance note: first executor died to a session limit (partial discarded), the user-interrupted second dispatch had completed the work uncommitted; third executor line-by-line verified it against the plan before committing — advisor re-reviewed the full diff + re-ran gates.                                                   |

**Also recorded (2026-07-17)**: plan 142's Option A books-scoping question is
**operator-DECIDED** — DCA rules follow their target account's book (公司帳 view
never shows 個人帳 rules; same rule as the dashboard `upcoming` memo's
`switcherAccountIds` filter). Written into plan 142; the spike doc records it
instead of re-asking.

## Reconciled 2026-07-17 (`main` @ `cb1d5004`)

- **214–218 done-criteria re-verified by grep at HEAD** ✓ (`ns-notif-panel` in css+component;
  `ns-banner-collapse` css+Dashboard; `ns-expand-in`/`ns-caret-rotate` present, 0 caret swaps
  left in the 3 converted files; 0 `cubic-bezier` in tsx, 0 `transition: "left"`;
  `ns-onboarding-*` css+component). Also re-verified: 213 (0 raw close buttons), 212
  (fix intact — **drifted to `globals.css:750`**, the motion batch inserted ~50 lines above).
- **Corrected four stale "NOT merged" claims** (verified `git merge-base --is-ancestor`):
  **200** (`1f171585`), **196** (`b64b90fe`), **197** (`b0adf8e5`), **195** (`378c0e0f`)
  are ALL ancestors of `main`. The 2026-07-15/16 sections already said so; their own
  section rows still contradicted them — now fixed. 202's stale TODO row likewise.
- **161 spike still correctly NOT merged** (`46b00892` not an ancestor); reminder:
  `docs/motion-ga-spike.md` exists ONLY on that branch. **→ 過時(2026-07-26,plan 277):
  doc 已在 main,PoC 在 tag `spike/161-ga-motion-poc`,分支已刪。上面「exists ONLY on that
  branch」不再成立。**
- **142 (DCA spike) drift-checked — still valid TODO**: DashboardRoute still hides
  定期定額提醒 ("until the DCA workflow is finalised" comment intact),
  `RecurringInvestmentsTab.tsx` still present-but-gated.
- **⚠ Dead executor worktree found, with a build side-effect**: `.claude/worktrees/
busy-mestorf-dd21b7` (detached @ `9374ee9f`, clean, fully merged — zero unique work).
  Plan 217's executor proved it leaks into builds: **Tailwind v4 auto-source scanning
  respects .gitignore, and `.claude/worktrees/` is NOT gitignored** (`.claude/skills/` is),
  so stale worktree files emit dead utility classes into compiled CSS. Operator remedy
  (advisor can't mutate): `git worktree remove .claude/worktrees/busy-mestorf-dd21b7`
  and add `.claude/worktrees/` to `.gitignore`.
- **Executable right now**: nothing BLOCKED; TODO backlog = 142 spike + Open follow-ups
  below. `main` is ~13 commits ahead of `origin/main` (the 214–218 batch) — push pending,
  operator's call.

## 214–218 — motion audit round 2 (`/improve-animations` @ `ae708c1b`, 2026-07-17)

Second pass after the 156–163 motion batch. Round-1 hygiene held up: zero `ease-in`,
zero `scale(0)`, zero hot-path `transition: all`, overlays/toasts all interruptible
transitions. Round 2 is feedback gaps + cohesion.

| Plan | Title                                                                                                                                                                                                                                                                                       | Priority | Effort | Depends on                                                               | Status                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 214  | NotificationCenter panel enter/exit motion — the last teleporting anchored surface; `@starting-style` enter (origin top-right, scale 0.97) + `data-closing`/`transitionend` exit, mirroring ModalShell                                                                                      | P2       | S      | —                                                                        | **DONE — reviewed+MERGED** @ `c014144b`. Review fix: `requestClose` → `useCallback` + `closingRef` guard (executor's plain function added an exhaustive-deps warning; lint back to 762 baseline). Live-verified in browser: origin top-right, exit unmounts, spam-toggle never strands.                                                                                                                                  |
| 215  | Dashboard banner dismiss collapse (`1fr→0fr` grid-rows + opacity) — kills the 50px content jump on the most-visited page; entrances stay instant                                                                                                                                            | P2       | S      | —                                                                        | **DONE — reviewed+MERGED** @ `0e9a09a9`. Review fix: executor's wrapper rendered EMPTY on fresh healthy profiles (`healthy && !hasAnyData`) → phantom 14px gap, live-confirmed then fixed by hoisting the condition. Live-verified dismiss: below-content moves exactly 56px (42 + 14 margin), persistence intact. Executor deviation accepted: wrapped the whole plan-209 ternary (both banner variants), correct read. |
| 216  | Expand/collapse cohesion — rotating caret standardized across 5 sites (3 hard-swap `CaretRight↔CaretDown` today) + `.ns-expand-in` content enter on holdings rows & reconcile periods; NO height animation                                                                                  | P2       | S      | 214 lands its globals.css block first (adjacent edits, trivial conflict) | **DONE — reviewed+MERGED** @ `9d26765e`. Live-verified: caret rotates 0→90 (150ms token), expansion enters via `@starting-style`, collapse instant. `CaretDown` imports pruned in all 3 converted files.                                                                                                                                                                                                                 |
| 217  | Motion hygiene batch — RecurringRules toggle `left`→`translateX(14px)`, QuickAdd hardcoded bezier → `var(--ns-ease-out-strong)`, legacy `ui/button` `transition-all` → property list (transform excluded: instant press nudge is a settled decision), AppShell sidebar `0.2s ease` → tokens | P3       | S      | —                                                                        | **DONE — reviewed+MERGED** @ `c7d140b7`. +addendum: executor's done-when grep caught a 5th site my census missed — `TradingFeesSection.tsx` toggle had the identical `transition: left` pattern (fixed, 16px travel). `grep cubic-bezier src --include='*.tsx'` → empty.                                                                                                                                                 |
| 218  | Onboarding entrance + step-transition motion (first-run delight budget; enter-only, `key={step}` remount + `@starting-style`)                                                                                                                                                               | P3       | S      | —                                                                        | **DONE — reviewed+MERGED** @ `24565c49`. Executor deviation accepted: the four `step===N` ternaries had NO shared container — it introduced the wrapper div (presentational only; verified no `useState` below the key, file-input value already self-clearing). Live-verified step 1→2: remount fires enter, layout intact.                                                                                             |

**Recommended order**: 217 (mechanical, zero risk) → 214 → 215 → 216 → 218. All are
Sonnet-executable; 214 has the most moving parts (exit-state machine).

**Batch executed + merged 2026-07-17** in that exact order, one branch per plan
(`fix/ai-motion-hygiene`, `feat/ai-notif-panel-motion`, `feat/ai-banner-dismiss-motion`,
`feat/ai-expand-collapse-motion`, `feat/ai-onboarding-motion`), Sonnet executors +
Fable review. Every plan: tsc clean / lint 0 errors 762 warnings (baseline) / 1318 tests.
Browser feel-checks ran against the Vite dev server (demo mode); note for future sessions:
the browser-pane tab throttles transition clocks, so mid-transition computed-style samples
read as frozen — verify end-states + computed `transition` properties instead, or screenshot.

**Vetted non-findings this round (do not re-flag)**: COSS Select popup opens with no
animation — correct, it mimics macOS native menus (`alignItemWithTrigger`, instant);
⌘K/GlobalSearch `duration-0 animate-none` deliberate (plan 160); KPI numbers + charts
un-animated deliberate (finance data); global instant `:active` 1px press nudge settled;
segmented-thumb `width` transition left alone (tiny element, `will-change`, plan 160).
**Noted, not planned**: sidebar collapse animates whole-app grid layout (inherent to
push-sidebar; only revisit if device QA shows jank — see plan 217 §D note); global
reduced-motion rule zeroes ALL transitions incl. opacity feedback (Emil's bar says keep
opacity fades — defensible simplification, revisit only if a11y feedback asks);
scattered magic durations (`.12s/.15s`) in route inline styles — too diffuse to batch,
fix opportunistically when touching those files.

## 202 / 213 — modal close button unification (2026-07-16)

| Plan | Title                                                                                                                                 | Priority | Effort | Depends on | Status                                                                                                                                                                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 202  | Extract `<ModalCloseButton />`, replace the hand-built close buttons (six treatments: 3 hit sizes / 3 icon sizes / 3 hover languages) | P0       | M      | —          | **DONE — reviewed+APPROVED+MERGED** @ `cfd08051`. 13 sites converted; 2 raw `<button>`s gained COSS Button's 44pt `pointer-coarse` hit area; every close button now has BOTH `aria-label` and `title` (0 had a tooltip before). 1318 tests.                                 |
| 213  | Finish 202 — the 2 sites its census missed                                                                                            | P2       | S      | 202        | **DONE — reviewed+APPROVED+MERGED**. `GoalEditorSheet.tsx` (the app's LAST raw close button — the exact iOS tap defect 202 existed to kill) + `ConnectSection.tsx`. `grep -rln "grid size-8 place-items-center" src/` → **empty**. `ModalCloseButton` now used in 15 files. |

⚠ **Advisor census error, recorded as a rule**: plan 202's census used
**non-recursive globs** (`src/routes/*.tsx`, `src/components/*.tsx`) which never
reach `src/features/goals/` or `src/routes/settings/` — it silently missed 2
genuine close buttons, one of them the last raw one. **Any repo-wide census must
use `grep -rn … src/` (recursive), never per-directory globs.** This is the
SECOND census-methodology error of this batch (the first: reading the quarantined
`ui/button.tsx` instead of the real `coss/button.tsx`), and **both were caught by
executors measuring reality rather than trusting the plan**. 202's executor found
these, correctly refused to expand scope unilaterally, and flagged them — the
right call; extending scope is the reviewer's job.

**Deliberately NOT unified**: `src/components/ui/dialog.tsx:67` — the vendored
base-ui Dialog primitive's own internal close affordance, inside the quarantined
`ui/` layer (app code may not import it per `ui/README.md`). Not a hand-built app
close button; not ours to unify. `ModalCloseButton`'s docstring records this.

**Still deferred** (202's own follow-up): wire `ModalCloseButton` into
`ModalShell` behind a `showClose` prop so new modals get it free. Every modal
hand-rolls its own `<header>`, so hoisting the button means hoisting the header —
worth doing once those headers are uniform.

## 212 — stat-strip mobile scroll-snap (`/improve plan` @ `3a205f7c`, 2026-07-16)

| Plan | Title                                                                            | Priority | Effort | Depends on | Status                                                                                                                                                                                                                                                                        |
| ---- | -------------------------------------------------------------------------------- | -------- | ------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 212  | Fix mobile stat-strip scroll-snap — one-line CSS fix; repairs BOTH 帳戶 and 投資 | P3       | S      | —          | **DONE — reviewed+APPROVED+MERGED** @ `56623b90`. `flex-direction: row` (no `!important`, cascade prediction held) at `globals.css:700`; live-measured 375px both pages flexDirection=row + horizontal overflow, 1280px still grid; dev-server cwd lsof-verified. 1318 tests. |

Discovered by 210's executor (verified by the advisor). Cascade root cause
confirmed: globals.css's `.ns-holdings-*` are **unlayered**, Tailwind's
`flex-col` is **layered** → unlayered wins, so a plain `flex-direction: row`
(no `!important`) at :700 fixes it (the `display:flex !important` on that line
needs `!important` only to beat the later-in-file `:1269 display:grid`, an
intra-file source-order fight, not the utility). Fix is media-query-scoped to
mobile; desktop grid untouched. Deferred out of scope: a pre-existing
`padding-bottom` override quirk on the same line (cosmetic).

## Session close 2026-07-16 (`main` @ `1f56a812`) — 198–211 ALL DONE

**Every plan from this session's backlog is executed, reviewed, and merged**:
198, 199, 200, 201, 203, 204, 206, 207 (spike), 208, 209, 210, 211. Plus 195's
doc merge, the lockfile PR, and the origin-divergence resolution. Final gates on
merged `main`: tsc 0 / lint **0 errors** / **1318 tests** / build 0.
205 was never written (premise falsified — see the 201–205 section). 202
(`ModalCloseButton`) remains the only unexecuted written plan.

Late-session highlights the rows below don't capture:

- **203 caught a wrong-file error that survived three reviews**: the audit's
  Button pixel tables cited the quarantined `ui/button.tsx`; the real component
  is `coss/button.tsx` (responsive svg sizes, HAS `xl`+`destructive-outline` —
  meaning DESIGN.md:256's original row was right and 200's A4 "correction" was
  inverted; now re-corrected). Rule recorded: **`coss/` is the component source
  of truth; never cite `ui/` for app behavior.** Side-finding, accepted not
  reverted: 200's `h-9`→`lg` swap made 6 toolbar buttons h-10 below 640px
  (aligns with coss's mobile sizing; 200's "zero visual change" claim was false
  on mobile).
- **211 (highest-risk plan) landed clean**: merge-on-pull for untouched system
  mints only (`revision===1` + mint fingerprint; user-edited books never
  auto-merged), seam verified OUTSIDE `withOutboxSuppressed`, kind-aware
  straggler heal (dead company book → resurrect; dead personal/unknown →
  re-home), announce-on-local-merge-only via drainable counter (repositories
  never imports Toast). +33 tests incl. outbox-propagation and idempotence;
  live-verified with a fabricated duplicate (merged, toast fired, net worth
  unchanged, second reload byte-identical).
- **204 residuals** (executor lost to a session limit during verification;
  advisor completed the review directly): (1) BookManager's 確定刪除 confirm
  stays `destructive-outline` (pattern says solid `destructive`) — caused by
  the reviewer's own "leave the worked example untouched" instruction; one-line
  follow-up. (2) Operator visual pass on the new destructive styling pending —
  structurally palette-safe (`--ns-loss` used zero times).
- **Worktree hazards, systemic** (for future dispatches): the shared preview
  server serves the MAIN checkout (burned 4 executors; `lsof`-verify cwd), and
  `preview_start` reuses it even under a distinct config name. One executor
  briefly ran git commands in the main checkout itself — restored cleanly, but
  dispatches should name the worktree path explicitly.

## Reconciled 2026-07-15 (`main` @ post-merge, v0.1.0-alpha.62)

**Merged this session** (all reviewed+APPROVED by the advisor, gates re-run personally
on merged `main`: tsc 0 / lint **0 errors** / **1278 tests** / build 0):
198, 199, 200, 201, 206, 208, 209, plus `origin/main`'s lockfile PR and the
doc-only 195 shared-books spike.

**Branch reconcile — the headline: 18 of 20 `ai-*` branches were ALREADY merged.**
The "十幾條陳年 branch" were stale local refs, not unfinished work. Safe to delete:
`chore/ai-repo-polish`, `docs/ai-changelog-alpha50`, `docs/ai-reconcile-reality-2`,
`perf/ai-cashflow-fx-index`, `perf/ai-sqlite-recompute-scope`, `refactor/ai-scrim-tokens`,
`refactor/ai-style-rule-and-label`, `refactor/ai-token-compliance`, plus this session's
merged branches.

**Only 2 were genuinely unmerged, and they are NOT equivalent:**

- `feat/ai-shared-books-spike` (`378c0e0f`) — **doc-only, 663 lines. MERGED this session.**
  Its 6 open questions were answered by the operator 2026-07-14; the doc is the record.
- `feat/ai-ga-motion-spike` (`46b00892`) — **NOT merged, deliberately.** Unlike the other
  spike it carries **code** (`router.tsx` +45, `globals.css` +26), self-labelled
  "Throwaway PoC" for plan 161 Part A (View Transitions). This index already recorded it
  as "correctly NOT merged". ⚠ **Its doc `docs/motion-ga-spike.md` (336 lines) lives only
  on that branch** — deleting the branch loses the findings. Keep the branch, or
  cherry-pick the doc alone.

**Corrected stale index claims** (they said "NOT merged — awaiting operator"):
**196 (`b64b90fe`) and 197 (`b0adf8e5`) have been in `main` since before `36d25f50`**
(the alpha.62 bump) — merged, shipped, and their artifacts verified intact at HEAD
(`TransactionsRoute.tsx`, `HoldingDetailRoute.tsx`, `investmentDailySettlement.ts`;
note they never touched `InvestmentsRoute.tsx`, so plan 201's −225-line deletion there
did not endanger them). No review was needed.

**Merge-conflict resolution, recorded** — 200 × 208 collided on the net-worth MoM badge
(`DashboardRoute.tsx`): 208 changed the `Badge variant` (fixed → market axis), 200 changed
the arrow `size={11}` → `size={14}`. Orthogonal edits; resolution took **both**. Note the
arrows sit inside a `<Badge>`, so that `size` prop is **inert** (component CSS governs) —
**plan 203 will delete it** per operator decision 3. The resolution preserves 200's intent
without pretending the prop does anything.

**Systemic hazard found — worktree verification is unreliable here.** Two independent
executors hit it: the preview/dev server's cwd resolved to the operator's **main checkout**,
not their worktree, so their first visual check silently validated the **old, unfixed code**
and returned a plausible-looking wrong answer. Both caught it only by cross-checking
resolved CSS against the main repo's file contents. Future plans that ask for live
verification in a worktree must warn about this explicitly.

Backlog index for the `improve` skill. Each `plans/NNN-*.md` holds a plan's full
spec + its own Status block; this index keeps only **live, actionable state**.

> **Slimmed 2026-07-12.** ~500 lines of dated reconcile narrative + verbose
> per-plan rows (001–155, all long since merged) were removed to keep this index
> cheap to read — it is NOT auto-loaded into context, but every `/improve` op
> re-reads it. All removed detail is preserved in each plan file and in this
> file's git history (`git log -p plans/README.md`). Nothing was lost.

## 208–210 — operator UX batch #2 (`/improve plan` @ `087a9b2e`, 2026-07-15)

Three operator-reported items with screenshots. All planned directly (no audit).

| Plan | Title                                                                                                                                                                                                                                                                                                                                                                                                               | Priority | Effort | Depends on                                      | Status                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 208  | 淨值變動 badge onto the gain/loss axis — under 紅漲綠跌 the hero badge (green, `success/error`) contradicts 投資今日 (red, gain/loss) for the _same day's_ movement; §2.4 never classified 淨值變動 at all. Badge `gain`/`loss` variants already exist. Fix = variant swap + §2.4 amendment                                                                                                                         | P1       | S      | coordinate w/ 209 (same file, different region) | **DONE — MERGED** @ `6612c77b`. 淨值變動改行情軸；與 200 在 badge 撞過一次，解衝突取兩邊。               |
| 209  | 總覽 banners dismissable with **state fingerprints** — dismiss = "seen this occurrence", reappear on identity change (health: sorted issue kinds; overspend: month+category names, **amount deliberately excluded** or dismissal is useless). Overrides the recorded "stays discoverable" one-liner tradeoff with the operator's explicit request; new `dismissedBanners` in uiPreferences (per-device, not synced) | P2       | M      | coordinate w/ 208                               | **DONE — MERGED** @ `b9cf0d5f`. +12 測試；executor 找到 advisor 計畫的缺陷（`kind` 撞號→改 `kind:id`）。 |
| 210  | 帳戶 summary adopts 投資's visual language — 3 side-bar cards → one `ns-holdings-summary` strip (`data-cols="3"` param, 1-line CSS); N per-currency progress cards → one 幣別配置 alloc bar + legend. **Zero `InvestmentsRoute` changes** (pure class reuse → no 201 conflict). Full digits kept (reconciliation identity must stay visibly checkable — deliberate divergence from 投資's compact format)           | P2       | M      | **after 206 lands** (same file)                 | **DONE — MERGED** @ `19d94ade`. 附帶發現既有 mobile scroll-snap bug → plan 212。                         |

Key decisions encoded: **208 does NOT unify all colors** — full uniformity was
tried 2026-06-10 and rolled back (toasts turned red, expenses green); the fix
closes the classification gap (net-worth delta = market number), and the
remaining 投資-red vs 現金流-green split in TW mode is the decided semantics.
**209's fingerprint granularity is the whole design** — too fine (amounts) makes
dismissal useless, too coarse suppresses a NEW category's overspend alert.
**210 must wait for 206** (both edit `AccountsRoute.tsx`; 206's executor was live
at planning time).

## 206–207 — 帳本 (Books) data bugs, operator-reported live (`/improve plan` @ `087a9b2e`, 2026-07-15)

Operator hit two real bugs while using the app. **These outrank the 201–205
button/icon batch — data integrity before button looks.**

| Plan | Title                                                                                                                                                                                                                          | Priority | Effort | Depends on | Status                                                                                                                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 206  | `deleteBook` — soft-delete a 帳本, guarded on accounts / invoices / clients / last-personal-book. The escape hatch: operator has a duplicate 個人帳 they cannot remove                                                         | P0       | M      | —          | **DONE — MERGED** @ `2f98f054`. soft-delete + 4 道守衛 + 14 測試（含守墓碑的 outbox 回歸測試）。                                                                                                                                               |
| 207  | **SPIKE** — how should the default 帳本 converge across devices? Doc-only (+ optional pure-domain PoC)                                                                                                                         | P1       | M      | —          | **DONE — MERGED** @ `76b879ed`. 推薦 (c) merge-on-pull + straggler self-heal；發現 naive merge 會製造 FIRE/淨值靜默排除的數字 bug。→ build plan 211。                                                                                          |
| 211  | 帳本收斂 build — merge-on-pull（只合 untouched system mints：`revision===1` + mint 指紋，**使用者建立/編輯過的帳本永不自動合併**）+ kind-aware straggler self-heal（死公司帳→復活、死個人帳/未知→搬回預設）+ 本機 merge 才告知 | P1       | M–L    | 207, 206   | **DONE — MERGED** @ `971e0135`. +33 測試（含 outbox 傳播 + 冪等）；seam 驗證在 `withOutboxSuppressed` **外**（本計畫頭號陷阱：跑在裡面則墓碑永不進 outbox、跨裝置永不收斂）；live 驗證偽造重複本→合併→toast→淨值不變→二次重載 byte-identical。 |

### Confirmed root cause (duplicate 個人帳)

`initialize()` → `ensureSqliteDefaultBook()` (`repositories.ts:2487`) runs on
**every app start and BEFORE any sync pull**. It mints a book with
`createId("book")` = `` `${prefix}_${crypto.randomUUID()}` `` — a **random UUID**
(`repositories.ts:554`). Device A mints `book_<uuidA>` 「個人帳」; device B, on its
first run, has not pulled yet so it finds nothing and mints `book_<uuidB>`
「個人帳」. `books` is a synced entity (outbox trigger `repositories.ts:4885`; pull
allowlist `pull.ts:194`) → both devices show both. The `kind='personal'` guard only
blocks a second **local** insert, never a **foreign** one. **Operator's live report
— both devices show two 個人帳 — is this mechanism's fingerprint.** A third device
mints a third.

Why 207 is a spike, not a build plan: the obvious fix (deterministic id) doesn't
work alone (existing installs hold random ids → a fresh device still ends up with
two), and the migration that would make it work re-points account ownership across
devices under last-write-wins — in a finance app, with a **version-skew mode that
can turn one duplicate into three**. Advisor's prior is deterministic merge-on-pull;
the spike must verify or destroy it.

### `deleteBook` never existed — by documented deferral, not oversight

`repositories.ts:275-276`: _"No delete yet (soft-delete needs account-reassignment
UX — deferred to a later phase)."_ 206 is that phase. Design follows the repo's own
precedent — `deleteAccount` (`repositories.ts:970`) **blocks** with a zh-TW throw
(`"已有交易的帳戶不能刪除。"`) rather than cascading. Blocking is not a dead end: the
account editor already has a book picker (`AccountsRoute.tsx:854`). Note `invoices`
and `clients` **also** carry `book_id` (`migrations.ts:266,290`) — not just accounts.

### ⚠ Third bug — UNRESOLVED, deliberately NOT planned

The operator's 公司帳 book row does not reach device B, while the **account's**
`bookId` does (B shows the account with a blank book → it holds `book_company` but
has no such row). **The advisor audited every link end-to-end and found no code
defect**: outbox trigger has `["books","book"]`; `collectPendingChanges` doesn't
filter record_type; `push.ts` is generic; the worker relay stores **opaque
ciphertext** and cannot filter by entity; `pull.ts`'s `VALID_ENTITIES` includes
`"book"` and `isValidPayload` is generic; `applySqliteSyncChange` maps
`book: "books"`; `normalizeSqliteSyncPayload` does generic snake→camel;
`createBook` uses the same `personalSpace`; and `createBook` + the trigger shipped
in the **same commit** (`c8830b32`) so there is no version window.
`repositories.books.test.ts` even has a regression test asserting a created book
lands in the outbox.

**No fix is planned because no defect was located** — writing one would be guessing.
Believed to be runtime state (a lost/acked envelope, or a pull cursor). Pending
operator test: **rename the 公司帳 on device A** → `updateBook` does
`revision = revision + 1` → new outbox id `book:<id>:2` → forces a re-push. Outbox
ids are `entity:id:revision` and `pushed_at` is set on ack, so **a lost push at a
given revision is never retried** — that durability gap is real and confirmed, and
is the next planning candidate if the rename test succeeds.

### ⚠ Observed data-loss mode — warn before touching book assignments

The operator watched a **stale device overwrite a correct assignment**: device B
still had account X in its own 個人帳 (never received the 公司帳), pushed, and
last-write-wins **overwrote device A's correct 公司帳 assignment**. Any work in this
area must not make that class of event more likely. Until 公司帳 reaches B, book
assignments on B must not be touched.

## 201–205 — button/icon design critique batch (`$impeccable critique` @ `36d25f50`, 2026-07-15)

Operator asked for a broader review than 200's mechanical scope: "不單是大小問題,
還有其他的一致性、位置". Ran `$impeccable critique src/routes` dual-agent (A design
review · B detector + live browser measurement). **Score: 22/40 (Acceptable)** —
snapshot at `.impeccable/critique/2026-07-15T08-28-57Z__src-routes.md`.

**Headline: the icon layer is fine; the button layer isn't.** Glyph→concept
mapping is near-airtight (`PencilSimple`=edit 38×, `Trash`=delete 37×,
`ArrowsClockwise`=refresh 33× — **zero collisions app-wide**). The operator's
actual worry was the healthy part. The disease is in buttons: six close-button
treatments, `variant="destructive"` defined-but-used-**zero** times across 227
`<Button>` call sites, `title` vs `aria-label` decided per-file.

**Operator decisions (2026-07-15), which these plans encode:**

1. **Duplicate modal first** (not ModalCloseButton) — stop the bleeding before abstracting.
2. ~~**The ghost/outline monoculture is NOT intentional** — accent reaches only 2
   buttons app-wide. Worth adding primary at high-value moments (→ 205).~~
   ⚠ **VOID — the premise was false. See the correction below.**
3. **Icon-size contradiction resolves in the COMPONENT's favour** — DESIGN.md §7's
   13–16 band is wrong about Button/Badge internals; rewrite §7 and **delete the
   inert props** (→ 203).

⚠ **Decision 3 supersedes ~1/3 of plan 200's Phase B.** 200 raised 31 icon props
to 14; **10 of them are inert** (inside Button/Badge) and decision 3 deletes them.
No revert needed — merge 200, then 203 deletes those 10. Net result identical;
the churn is the cost of my plan-200 blind spot, not executor error.

| Plan | Title                                                                                                                                                                                                                                                                                                                                                                                                                    | Priority | Effort | Depends on                                                     | Status                                                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 201  | Delete the duplicated 編輯持倉 modal in InvestmentsRoute; use shared `HoldingEditModal` — **already-drifted: B16 Yahoo price view is in the component, absent from the copy (16 vs 0 grep hits), so the same button gives different capabilities per entry point**                                                                                                                                                       | P0       | M      | —                                                              | **DONE — MERGED** @ `e697ac93`. −218 行；B16 Yahoo 價格檢視補回投資列表入口（兩份已實際分岔）。                                                    |
| 202  | Extract `<ModalCloseButton />`, replace **14** sites (six treatments: 3 hit sizes / 3 icon sizes / 3 hover languages; the 3 raw `<button>`s forfeit the 44pt `pointer-coarse` expansion). Advisor's own census corrected the critique: **14 sites not 13**, and the raw ones carry `X size={18}` not 16. Also: **17 `aria-label="關閉"`, ZERO `title` — no close button anywhere has a tooltip**                         | P0       | M      | 201 (**soft** — plan says don't wait; expect 13 if 201 landed) | **DONE — see the 202/213 section at top** (this row was stale; corrected at reconcile 2026-07-17)                                                  |
| 203  | Rewrite DESIGN.md §7 (component wins) + delete the 10 inert `size` props inside Button/Badge                                                                                                                                                                                                                                                                                                                             | P1       | S      | **plan 200 must be merged first**                              | **DONE — MERGED** @ `72d9ff40`. §7 改雙 scope + 刪 10 個無效 prop；第 3 commit 更正貫穿 200/203 的 wrong-file 錯誤（真元件是 `coss/button.tsx`）。 |
| 204  | Adopt `variant="destructive"` / `destructive-outline` (**0 uses today**, both defined); collapse the hand-rolled red inline objects; one token (`--ns-neg`); one string (「確定刪除」 7× vs 「確認刪除」 3×). Advisor's census found **5 dead hex fallbacks** — `var(--ns-danger, #d33)` / `#c0392b` never fire (`--ns-danger` IS defined at `globals.css:157`) and **all three hexes disagree with the real `#c62a1d`** | P1       | M      | 201, 202 (**both soft**)                                       | **DONE — MERGED** @ `1f56a812`. 23 個 destructive 呼叫點；記帳頁刪除鈕首次與編輯有視覺區隔；`--ns-loss` 零使用（台股配色下結構性保紅）。           |
| 205  | ~~Primary/accent at high-value moments~~                                                                                                                                                                                                                                                                                                                                                                                 | —        | —      | —                                                              | **NOT WRITTEN — premise falsified, see below**                                                                                                     |

### ⚠ Correction to the critique (advisor, 2026-07-15): "accent reaches only 2 buttons" is FALSE

While writing 205 I verified the claim and it does not hold. **Assessment A grepped
inline `var(--ns-accent)`** — which finds only `AppShell.tsx:268` (Quick Add) and
`:418` (FAB) — **and missed the real chain**:

`globals.css:63` → `--primary: var(--ns-accent)`; COSS Button's `default` variant is
`bg-primary`; **every `<Button>` omitting `variant` renders accent green. There are
62** (e.g. `AccountsRoute.tsx:304` 新增帳戶). Assessment B missed it too — it only
sampled `variant="outline"` toolbar buttons. **The advisor's synthesis verified
`destructive` = 0 but did not verify `primary` = 2. That was the gap.**

A red herring ruled out on the way: `globals.css:1812` has a _second_
`--primary: oklch(0.922 0 0)`, but it sits inside a `.dark {}` block and **nothing in
this app ever adds a `dark` class** (theme is `data-theme`, via
`uiPreferences.ts:269-275`). So `:63` is the only live definition.

**Consequence: accent is not scarce, it is _unconsidered_.** 62 buttons became primary
because nobody typed a prop. The critique's own question 3 — "primary is encoded as
the _absence_ of a prop; a reviewer cannot catch a missing prop" — was more right than
it knew. The real question is whether `variant` should become **required** (~227 call
sites of blast radius), not whether to add more accent. **Operator decision 2 is void
and must be re-asked.**

### NEW finding while verifying the above: dead `.dark {}` shadcn palette (landmine)

`globals.css:1806-1838` — a complete 33-line shadcn default palette (`--background`,
`--foreground`, `--card`, `--popover`, `--primary`, `--secondary`…) inside `.dark {}`.
Dead today. **Anyone who copy-pastes a shadcn component or follows shadcn docs and adds
`className="dark"` silently hijacks the entire theme.** Not yet planned.

**Verified by the advisor personally** (not taken from subagent reports):
`variant="destructive"` = **0** call sites, `destructive-outline` = **0**, both
defined in `coss/button.tsx`; `* { cursor: default !important; }` at
`globals.css:603` makes 84 inline `cursor:"pointer"` **dead code**; the
`:focus-visible` rule at `globals.css:616-623` is **unlayered** so it outranks
~20 `outline-none` classes — focus is genuinely safe app-wide (A predicted a
finding and verified there wasn't one; B independently tabbed the chrome and
agreed).

**A/B contradiction, resolved**: B measured every icon-only button at 24–32px and
called the 44pt touch-target failure "systemic." **False positive for COSS
Buttons** — `coss/button.tsx:12` has `pointer-coarse:after:min-h-11 min-w-11`,
which only applies under `@media (pointer: coarse)`; B measured at desktop with a
fine pointer, where 24–32px is correct. The finding survives **only** for controls
bypassing COSS Button: `HoldingEditModal.tsx:175`, `InvestmentsRoute.tsx:1729`,
`AppShell.tsx:437`, sidebar collapse toggle. → folded into 202.

**Audit-only, NOT planned** (recorded so nobody re-audits): 84 dead inline
`cursor:"pointer"`; 27 redundant `fontFamily:"inherit"`; 7 `ns-*` classes
referenced but never defined (incl. `ns-btn-icon` — the ghost of the exact
abstraction 202 builds); `QuickAdd.tsx`'s 4 hand-rolled pills with 4 paddings
while `SegmentedControl`/`FilterPill` already exist; two `Button` implementations
with divergent physics (`coss` ring-2/opacity-64/solid-destructive vs `ui`
ring-3/opacity-50/soft-destructive — every date picker renders the `ui` one);
`weight="bold"` ~50/50 on-rule; `weight="duotone"` 41 uses undocumented but
coherent (docs fix); `AppShell.tsx:177` layout-transition (detector's only hit,
low impact — note `:154` double-animates the same collapse via
`grid-template-columns`); `AccountsRoute` inline banners instead of `toast`
(§12.5 violation, whole route is the exception); `AccountsRoute.tsx:485` deletes
an account with no confirm (§12.2 — blast radius limited, `repositories.ts:970`
rejects accounts with transactions).

## 198–200 — operator UI batch (`/improve plan` @ `36d25f50`, 2026-07-15)

Three operator-reported items, planned directly (no audit). All independent —
no ordering dependency; numbered by leverage. **199 and 200 both touch
`DashboardRoute.tsx:1529`** (an out-of-band `size={12}` icon): whichever lands
first makes the other's edit a no-op. Don't run them concurrently.

| Plan | Title                                                                                                                                                                                               | Priority | Effort | Depends on        | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 198  | 帳本 switcher popover renders behind the sidebar — `positionerClassName="z-[1101]"` on `BookSwitcher`'s `PopoverContent` (sidebar aside is z-1100 by design; portaled popover defaults to z-50)     | P1       | S      | —                 | **DONE — reviewed+APPROVED+MERGED** to `main` via `d92c7fae` (`--no-ff`, revertable). Branch `fix/ai-bookswitcher-popover-z` @ `72179b7b`. tsc 0 / lint 0 errors / 1252 tests. **Operator visually confirmed the sidebar menu now appears.** Executor correctly skipped the optional test (BookSwitcher needs `useFinanceData`+zustand mocking beyond the named exemplar's)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 199  | 總覽 AI 本月摘要 gets its own full-width row under the header — out of the `justify-between` left column, drop `max-w-xl`, refresh button to the row's right edge via `justify-between` + `icon-xs` | P2       | S      | —                 | **DONE — reviewed+APPROVED+MERGED** to `main` via `087a9b2e` (`--no-ff`). Branch `fix/ai-dashboard-summary-layout` @ `6bad8e38`. tsc 0 / lint 0 / 1252; privacy guards + generation logic byte-unchanged. **Operator visually confirmed.** ⚠ One REVISE round was **the advisor's fault, not the executor's** — the dispatch prompt truncated Step 1d, then the executor was wrongly accused of skipping it. Lesson applied to 200: pass the plan's absolute path instead of hand-inlining                                                                                                                                                                                                                                                                                                                                                                                    |
| 200  | Button/icon consistency audit → `docs/button-icon-audit.md` (Phase A, gated) + mechanical fixes only (Phase B): sub-13 icons → 14, 6 hand-rolled `h-9` → `size="lg"`                                | P3       | M      | coordinate w/ 199 | **DONE — MERGED** ✅（reconcile 2026-07-25 驗證：三個 commit `1e603f19`/`42955c15`/`1f171585` 皆為 main 祖先）. Branch `fix/ai-button-icon-consistency` @ `1f171585`, stacked on 198+199, **3 independently-takeable commits**: `1e603f19` audit doc + DESIGN.md, `42955c15` 14 src files (33+/33−), `1f171585` the CSS-override finding. tsc 0 / lint 0 / 1252 / build 0. **Executor corrected the advisor's census twice**: Button-only variants are `outline` 63 (not 84) and `secondary` 0 (not 5) — raw grep conflated `<Badge>`; and it verified the CSS override in the **compiled** CSS, not just source. ⚠ **~1/3 of Phase B is superseded by operator decision 3** → plan 203 deletes the 10 inert props. **MERGED since** (`1f171585` verified ancestor of main at reconcile 2026-07-17; the "NOT merged" here was stale — the 2026-07-16 session-close merged it) |

**198 is a real functional bug, not polish**: the 帳本 feature's primary entry
point (188–194, shipped alpha.61) is unreachable — the dropdown paints behind
the sidebar. One prop.

**Census behind 200** (at `36d25f50`, reproducible — commands in the plan):
icons appear at 8 distinct sizes vs `DESIGN.md` §7's two sanctioned bands
(13–16 general, 18–26 list/card); 29 instances fall below the band (12×18,
11×12, 10×3). `DESIGN.md`:256 is also **stale** — it documents a Button `xl`
size and `destructive-outline` variant that `ui/button.tsx` never implemented.
200 Phase A fixes the doc; Phase B fixes only what `DESIGN.md` already decided.

**Deliberately NOT in 200** (audit-only, needs operator taste — see the plan's
open questions): the ~22 raw `<button>` in `CashFlowRoute.tsx` + others
(bespoke-by-design vs drifted needs design judgment); the ghost(93)/outline(84)
affordance split; whether §7 should narrow from a 13–16 band to a single
default of 14 (if yes, an ESLint rule on the Phosphor `size` prop is the real
fix — a sweep deletes drift, a lint rule prevents it); the 13 `size={18}`
icons; in-band 13/15 normalization.

## Reconciled 2026-07-14 (`main` @ `db007657`, v0.1.0-alpha.61)

- **帳本 Phase 1+2 (188–194) ALL MERGED and SHIPPED in alpha.61.** Verified by
  artifact at `db007657`: `bookScope.ts`, `salesTax.ts`, `invoiceNumbering.ts`,
  `invoiceReporting.ts`, `invoiceEntry.ts` present; snapshot-roundtrip fix
  `f20ea5dc` in history; merge commits `da6c993c` (193), `51cf90ed` (191),
  `844b7c17` (194) on main. **Corrected four index rows** (189/190/192/193)
  that still read "NOT merged — awaiting operator" — they are merged.
- **196–197 (投資對帳) executed this session** (`/improve execute`, 2026-07-14):
  both reviewed+APPROVED on stacked branches `fix/ai-investment-total-fee`
  (`b64b90fe`) → `feat/ai-daily-settlement` (`b0adf8e5`), off `db007657`. tsc 0
  / lint 0 / 1252 tests. NOT merged — awaiting operator's merge decision.
- **142 (DCA spike) drift-checked — still valid TODO.** `DashboardRoute.tsx:100`
  still hides 定期定額 reminders "until the DCA workflow is finalised";
  `RecurringInvestmentsTab.tsx` still present-but-gated. Finding intact.
- **143 SUPERSEDED by 195** (terminal). **195 (共享帳本 spike): all 6 open
  questions answered by operator 2026-07-14** — Phase 3/4 build plans can be cut
  from `docs/shared-books-plan.md` whenever the operator starts Phase 3.
- **Executable right now**: merge decision on 196/197 (operator's call). No
  advisor-side plan is blocked. Next planning frontier is 帳本 Phase 3 (from 195).
- **macOS window-drag fix — DONE (operator-confirmed 2026-07-14).** Not a tracked
  `plans/` item, recorded here for completeness. The fix is live in `main` via
  `4a78b09c` (transparent title bar + drag region) + `b5f3172d`
  (`core:window:allow-start-dragging` grant) + `52c75771` (sidebar header
  draggable); verified at `db007657`: `data-tauri-drag-region` / `ns-titlebar-drag`
  in `AppShell.tsx` and `titleBarStyle: "Overlay"` in `tauri.conf.json`. The stale
  local branch `fix/ai-macos-window-drag` (`734c80e8`) was a superseded earlier
  take (not an ancestor of `main`) — safe to delete.

## Current state — 2026-07-13 (`main` @ `48a74719`, v0.1.0-alpha.59)

- **170–182: ALL executed, reviewed+APPROVED, and MERGED to `main`.** The
  operator decided all three spike outcomes (172→A+TWR, 176→MOZE-style splits,
  175→Tier 2 parked; pain points → 180) and the decision builds 179–182 are in.
  Combined-main gates green: `tsc --noEmit` 0, `lint` 0 errors, **1155 tests**.
  Not pushed to remote (local merges only). Outstanding: operator live pass on
  the 182 split flows + 179 nudge visuals; old spikes 142/143 remain TODO.
- **Reconciled 2026-07-13** (`/improve reconcile` @ `607d0c41`): all 170–182
  done-criteria re-verified by grep at HEAD ✓; **156–163 motion batch found
  MERGED** (index said unmerged — corrected; 161 spike correctly unmerged);
  **Vite dev-proxy 502 found FIXED** independently → retired; RecurringRulesTab
  free-text retired (174); 088 Feature A downgraded to largely-addressed
  (lexicon + 174); Tier-2 marked PARKED; 分帳 phase-2 now plan-able. 142 (DCA
  spike) + 143 (household spike) drift-checked and still valid TODO (DCA still
  hidden, `isSharedToHousehold` still test-only).

## Earlier state — 2026-07-12 (`main` @ `4ac63576`, v0.1.0-alpha.58)

- **001–155: all DONE and merged to `main`.** Per-plan detail is in each
  `NNN-*.md` and git history. Grouped record below. Only two in that range were
  never built (still TODO): **142** DCA decision spike, **143** household-sharing
  design spike — both P3, client-only, dispatch when wanted.
- **156–163: motion / native-feel batch** — executed, reviewed, **ALL APPROVED**,
  but **UNMERGED** (a stacked branch chain). Your merge decision — see next section.
- **164–167: 總覽 + 投資 redesign** — MERGED + released in `v0.1.0-alpha.57`.
- **168–169: 記帳 (Cash Flow) redesign** — MERGED + released in `v0.1.0-alpha.58` (with the 8-item UI fix batch).
- **170–178: direction batch (`/improve next`, 2026-07-12)** — all TODO; see next section.

## 170–178 — direction batch (`/improve next` @ `4ac63576`, 2026-07-12)

Direction audit (roadmap/product intent vs code). **Headline recon finding:
Phase 6 is mostly SHIPPED** (6.1 northstarMetrics hero, 6.2 coverageRatioPct,
6.3 runwayMonths, 6.4 projection, 6.5 longViewMode/milestones) and roadmap 5.2
restore preview shipped for local backups (plan 047) — ROADMAP.md is stale;
plan 178 fixes it. Operator selected all six audit findings plus two write-ins
(iOS App 上架, 快速記帳再強化). All nine are independent — no ordering
dependency; numbered by rough leverage. 172/176 are **design spikes** (doc +
PoC, no UI ships); 177 Phase B is operator-only.

| Plan | Title                                                                                                                                                                | Priority | Effort | Depends on                | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 170  | Restore preview (counts diff + typed confirm) for the two remaining paths: JSON import + sync-backup restore                                                         | P2       | M      | —                         | DONE — reviewed+APPROVED, branch `fix/ai-restore-preview-gaps` @ `284ae0a7` (MERGED to main; adds `readBackupSnapshot`+`getBackupEntry` refactor, JSON-import + sync-backup previews mirror plan-047, new `backup.test.ts` 4 tests w/ in-memory IDB fake; tsc 0 / lint 0 / 1058 tests)                                                                                                                                                                                          |
| 171  | Debounced auto-push ~30s after local edits (roadmap 5.3①) via new pushScheduler + useAutoSync handler                                                                | P2       | M      | —                         | DONE — reviewed+APPROVED+MERGED, branch `feat/ai-sync-debounced-push` @ `558add9a` (dumb 30s debounce `pushScheduler.ts`+4 tests, 2 funnels in hooks.ts, handler in useAutoSync under isTauriRuntime gate w/ cleanup; frozen sync files untouched; tsc 0 / lint 0 / 1058 tests)                                                                                                                                                                                                 |
| 172  | Index-Nudge design spike (roadmap 6.6, last unbuilt Phase-6 item) — return-series honesty (fixed-basket vs TWR), detection PoC in domain, variant A/B/C decision doc | P2       | M      | —                         | DONE — reviewed+APPROVED+MERGED (spike), branch `feat/ai-index-nudge-spike` @ `292e4289` (`docs/index-nudge-spike.md` + `domain/indexNudge.ts`+11 tests, no UI). **Q1 finding: honest TWR (`buildPortfolioTwr`) exists but every vs-benchmark surface (Alpha card + Dashboard `benchmarkGap`) is wired to the FIXED-BASKET approx. Recommends variant A (proactive banner) on TWR-vs-benchmark rolling windows. ⚠ OPERATOR DECISION (variant A/B/C + params) gates the build.** |
| 173  | 年度報表列印/匯出 — print-CSS + 列印按鈕 on /reports/annual (Tauri-print feasibility gate first; PDF lib only via escape hatch)                                      | P2       | M      | —                         | DONE — reviewed+APPROVED+MERGED, branch `feat/ai-annual-report-print` @ `ae564994` (`@media print` + 列印/匯出 PDF button + `annualReportPrint.ts`+7 tests; privacy-mask gate). **Feasibility: `window.print()` works in Tauri macOS webview + browser, no dep/capability needed.** tsc 0 / lint 0. ⚠ visual print-preview + mobile button-gating deferred (see follow-up).                                                                                                     |
| 174  | Recurring rules structured category picker (kills free-text at RecurringRulesTab:467) + suggest-and-confirm bulk categorization of uncategorized txns                | P3       | M      | —                         | DONE — reviewed+APPROVED+MERGED, branch `feat/ai-category-picker-bulk-categorize` @ `3c610b77` (Part A chip picker; Part B `bulkCategorize.ts`+10 tests + `BulkCategorizeCard` in CashFlow overview; confirm-gate verified, 5 exclusion guards). **Plan-assumption correction: CashFlow stores category as TWO fields (category+subcategory), not one composed string — executor adapted.** tsc 0 / lint 0 / 1064 tests.                                                        |
| 175  | 快速記帳再強化 — inventory quick-add-nlp-plan §6/§11 vs code, ship ≤3 offline gaps (§6.4/6.5/6.7), Tier 2 cloud spec-only (operator decision)                        | P3       | M      | —                         | DONE — reviewed+APPROVED+MERGED, branch `feat/ai-quickadd-next-wave` @ `2b9ca902` (inventory annotated in spec; **§6.7 already shipped** so built only §6.5 default-account + §6.4 example chips; `quickAdd.test.ts` byte-unchanged). **Tier 2 §12 decision-draft appended → ⚠ OPERATOR DECISION gates any cloud build.** Unbuilt §6 items (6.2 token-highlight, 6.3 preview remediation) listed as follow-up.                                                                  |
| 176  | Split-legs data-model spike — one schema decision serving 分帳 + 多類別 (repo already has 3 bespoke linked-record-group mechanisms)                                  | P3       | M      | —                         | DONE — reviewed+APPROVED+MERGED (spike, doc-only), branch `feat/ai-split-legs-spike` @ `8fe979f7` (`docs/split-legs-plan.md`; mapped 4 mechanisms). Recommends sibling parent+legs on existing `groupId` + additive nullable `legKind`; no migration (plain row = singleton group); 代墊 reused for 分帳 應收/應付. ⚠ surfaced open risk → see follow-up below.                                                                                                                 |
| 177  | iOS App Store readiness — submission dossier, privacy label w/ grep evidence, export compliance, icons, Phase-B operator runbook ($99 enrollment NOT executor's)     | P3       | M      | —                         | DONE — reviewed+APPROVED+MERGED, branch `feat/ai-appstore-readiness` @ `56fb11bd` (`docs/app-store-submission.md` 467 lines + ios-mobile-plan link; check:tauri passed). **Privacy claim verified: NO tracking SDKs → "Data Not Collected".** Export-compliance = `ITSAppUsesNonExemptEncryption=false` (left as operator apply-step; Info.plist in regenerated gen/apple). ⚠ Phase B ($99 enroll, signing, sim-build, icon-gen, submit) = OPERATOR-ONLY.                       |
| 178  | Roadmap reality-sync — mark 6.1/6.2/6.3/6.5 + 5.2(local) shipped, retire stale analytics follow-up                                                                   | P3       | S      | coordinate wording w/ 170 | DONE — reviewed+APPROVED, branch `fix/ai-roadmap-reality-sync` @ `09b40afd` (MERGED to main; ROADMAP.md only — executor scoped to it, reviewer applied the plans/README.md Step 2 below)                                                                                                                                                                                                                                                                                        |

Direction findings NOT re-planned: household sharing → existing TODO spike
**143**; DCA rework → existing TODO spike **142**; iOS $99 enrollment /
signing / App Store Connect = operator-only (177 Phase B).

## 179–180 — operator decisions on the spikes (2026-07-13, planned at `f8473bef`)

Operator reviewed the 172/175/176 decision points:

- **172 → decided: variant A + 全面改接 TWR** → build plan **179**.
- **175 Tier 2 → effectively deferred**; operator instead reported two real
  Quick Add pain points (no merchant autocomplete; merchant/name duplication
  without `@`) → build plan **180**. Tier 2 §12 draft stays parked in the spec.
- **176 → DECIDED (2026-07-13, MOZE screenshots as reference)**: sibling-legs
  model approved. Entry = MOZE-style: category area gains「+」, multi-select
  categories EACH with their own amount, form total = derived sum (not
  fixed-total allocation). List = one collapsed row +「拆分 N 筆」badge,
  expandable to legs. Edit re-enters the same form. 分帳 = phase 2.
  → build plans **181** (foundation) + **182** (UI).

| Plan | Title                                                                                                                                                                                                        | Priority | Effort | Depends on | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 179  | Index Nudge variant A + repoint analytics Alpha card & Dashboard benchmarkGap to TWR (fixed-basket fallback + 口徑 labels; suggestive copy; params 8 windows / 5pp hardcoded)                                | P2       | L      | 172 (done) | DONE — reviewed+APPROVED+MERGED, branch `feat/ai-index-nudge-build` @ `590de4be` (geometric rebase to first common date, triple-gated banner — never renders off fixed-basket; basis-dependent disclaimers; Dashboard had records already, no STOP; +6 window-builder tests; tsc 0 / lint 0 / 1099). ⚠ known scope: nudge evaluates over the SELECTED analytics period → fires only on 5Y/All/long ranges (needs ≥8 quarters in-window); always-full-history evaluation = possible follow-up.                                                                                                                       |
| 180  | Quick Add 商家 autocomplete dropdown + known-merchant extraction (stop name/merchant duplication without `@`) — sanctioned quickAdd.test.ts merchant/name assertion updates, category VALUES must not change | P2       | M      | —          | DONE — reviewed+APPROVED (1 revision round)+MERGED, branch `feat/ai-quickadd-merchant-ux` @ `e3a70703` (known-merchant extraction w/ longest-match + substring split + digit-merchant amount masking; inline autocomplete dropdown reusing `chooseMerchant`; 13 merchant/name-only assertion updates, zero category-value changes; REVISE fixed the `tier0Insufficient` escalation regression — now inspects name AND merchant, +3 nlParser tests; tsc 0 / lint 0). Follow-up noted: same autocomplete belongs on EntryDrawer 商家 field.                                                                           |
| 181  | 多類別拆分 foundation — `legKind` column, `buildSplitLegs`, `createSplit`/`updateSplit` (both repos, dual-harness tests), `incompleteSplitGroupIds` guard                                                    | P2       | M      | —          | DONE — reviewed+APPROVED+MERGED, branch `feat/ai-split-legs-foundation` @ `c6c619a5` (updateSplit = tombstone-all+recreate SAME groupId w/ revision bumps in one SQLite transaction; signs: expense −/income +, builder applies; +6 splitLegs +10×2 dual-repo +4 ledgerTrust tests; consumers untouched; tsc 0 / lint 0). Signatures for 182: `createSplit(shared, legs)` / `updateSplit(groupId, shared, legs)` / `SplitLegInput={amount>0, category, subcategory}` / errors zh-TW (拆分至少需要 2 筆明細。 etc.).                                                                                                 |
| 182  | 多類別拆分 UI — MOZE-style multi-category EntryDrawer (+分類, per-leg amounts, derived total), list collapse+expand mirroring the transfer precedent                                                         | P2       | L      | 181        | DONE — reviewed+APPROVED+MERGED, branch `feat/ai-split-legs-entry-ui` (「＋ 分類」split mode w/ per-leg amount + derived「多類別 · 共 $X」, save via create/updateSplit, edit hydrates all legs, fee-leg pairs excluded via legKind gate; list collapse in `mergeTransferRows` + 拆分 N 筆 badge + inline expand; `splitEntryState.ts` +17 tests; aggregation audit: all money sums use RAW rows, no double count; tsc 0 / lint 0 / 1146). Scope notes: plain→split conversion while editing not offered; split affordance hidden for 外幣/installment; needs operator live pass (add/edit/delete/expand + totals). |

## 183–186 — operator UX batch + 帳本 spike (2026-07-13, planned at `bb051f59`)

Operator-reported items (`/improve` with screenshots). One item needed no
plan: **多類別記帳的桌面版入口已存在** — EntryDrawer 支出/收入表單選好分類後,
分類列尾端出現虛線「＋ 分類」按鈕即進入拆分模式（182 的 scope notes:
編輯既有單筆不能轉拆分、外幣/分期不提供拆分）— answered, nothing to build.
183/184/185 are independent S-effort UI fixes; 186 is a design spike
(doc-only, no code) for the 公司/個人 books requirement.

| Plan | Title                                                                                                                                                                                                                                                    | Priority | Effort | Depends on              | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 183  | 記帳列表金額置右對齊 — `ns-cf-actions` hover 鈕改 absolute overlay（Gmail-style）+ touch 裝置整組隱藏（detail panel 已有同功能）+ day-header Net 對齊 20px 右緣                                                                                          | P2       | S      | —                       | DONE — reviewed+APPROVED, branch `fix/ai-cashflow-amount-alignment` @ `f13c3fd0` (CSS overlay w/ pointer-events gate + `--ns-shadow-1` per plan's allowance; executor live-verified computed styles on a worktree Vite; tsc 0 / lint 0 / 1155 tests). MERGED to main @ `eb5f30d8` (operator-instructed, 2026-07-13). Plan's Step-3 grep expected 1 match, got 2 — pre-existing unrelated `"14px 20px"` literal at :1533, verified predates plan.                                                                                                                                                                                                                                                                                      |
| 184  | 持倉表數字對齊 — 未實現損益 % 移至副行（block sub-line）、市值/成本基礎貨幣字尾定寬 `w-9`，數字右緣一致                                                                                                                                                  | P2       | S      | —                       | DONE — reviewed+APPROVED, branch `fix/ai-holdings-numeric-alignment` @ `5179adec` (exactly the 3 in-scope cells; tsc 0 / lint 0 / 1155 tests; greps 1+2 as specced). MERGED to main @ `7814304e` (operator-instructed, 2026-07-13). Executor NOTE: briefly created its branch in the shared checkout by mistake, self-reverted cleanly (verified by reviewer: main @ bb051f59 clean).                                                                                                                                                                                                                                                                                                                                                 |
| 185  | 總覽預算進度只列有設定預算的分類 — 移除「無上限」假進度條分支，空狀態改指引設定預算                                                                                                                                                                      | P2       | S      | —                       | DONE — reviewed+APPROVED, branch `fix/ai-dashboard-budget-budgeted-only` @ `4935afcb` (type-predicate filter, 無上限/0.5-bar branches removed, new empty-state copy; tsc 0 / lint 0 / 1155 tests; 無上限 grep = 0). MERGED to main @ `f923875f` (operator-instructed, 2026-07-13).                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 186  | 帳本 (Books) design spike — 公司/個人/總帳 scoping model（已決策：bookId on Account）、發票+銷項營業稅 v1 slice（Model A 傾向、B 為 v2 路徑；客戶主檔+帳齡+DSO 入列）、共同記帳終極目標雙向共寫、per-book 淨值/FIRE toggle → `docs/ledger-books-plan.md` | P3       | M      | read 176 doc + plan 143 | DONE — reviewed+APPROVED (1 revision round), branch `feat/ai-ledger-books-spike` @ `a03cf86e` (`docs/ledger-books-plan.md` 424 lines, doc-only; 12-surface scoping table, option (a) bookId-on-Account fully specified w/ per-book+總帳 reconciliation identities, Model A tax v1 + Model B/`legKind:"tax"` v2 path w/ A→B migration, dedicated `invoices`+`clients` tables, 5 open questions w/ recommendations). REVISE fixed: DSO must read an explicit `invoices.settledAt` stamped at settle — NOT the ledger row's `updatedAt` (bumped by any later edit). MERGED to main @ `f892a1d6` (operator-instructed, 2026-07-13); Phase 1 build plans cut from `docs/ledger-books-plan.md` after operator reviews its 5 open questions. |

Dependency notes: none between 183–185 (different files: globals.css+CashFlowRoute /
InvestmentsRoute / DashboardRoute). 186 is paper-only and gates any books build;
its Phase 3 (shared books) stays blocked on spike 143.

**186 open questions — OPERATOR ANSWERED (2026-07-13), bake into the Phase 1/2 build plans:**

1. Budgets/goals = personal books only (per recommendation).
2. Cross-book 股東代墊 shows in 未結清 from BOTH books (per recommendation).
3. Invoice numbering = BOTH free-text AND auto-sequencing, user-toggleable; must support
   台灣統一發票 字軌 input (2-letter track prefix + 8 digits, tax-authority-issued blocks);
   UI must present this as the Taiwan 統一發票 feature — or design the field generically.
   **CONFIRMED design (operator approved advisor's recommendation)**: generic
   prefix(字軌)+sequence invoice-number structure; a「統一發票 (TW)」preset supplies 字軌
   validation (2 letters + 8 digits) and auto-sequencing; other locales get plain
   prefix+sequence. EXPANDS Phase 2 scope beyond the doc's free-text-only recommendation.
4. 401 summary = live query for v1 (per recommendation).
5. Shared books = convert-in-place upgrade of an existing book (per recommendation).
   Note: nothing to migrate TODAY (books don't exist yet) — this decision means Phase 1's
   schema must keep per-book envelope namespacing from day one so the later upgrade is
   "invite a member", not a data migration. Already the doc's design; now operator-locked.

| Plan | Title                                                                                                                                                                                                                           | Priority | Effort | Depends on       | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 187  | 持倉表跨列對齊 root-cause fix — per-row independent grids + `auto` optional tracks → fixed px tracks per column key (advisor measured live DOM: 台積電 row shifted 4–12px; header on a 3rd offset)                              | P2       | S      | 184 (merged)     | DONE — reviewed+APPROVED+MERGED to main @ `7c08b45c` (operator-instructed), branch `fix/ai-holdings-grid-fixed-tracks` @ `103e0651`. Reviewer re-measured live DOM post-merge: all 5 rows + header resolve IDENTICAL column edges [489,589,688,805,931,1071,1171,1223] (pre-fix: rows differed 4–12px, header a 3rd offset). Executor self-corrected a stale worktree base by branching from main. tsc 0 / lint 0 / 1155 tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 188  | 帳本 Phase 1a foundation — `Book` entity + `accounts.book_id` + migration/自癒 backfill(個人帳)+ sync 接線(8 個 tableByEntity sites, compiler-guided)+ 純分割特徵測試先行 + dual-harness books tests                            | P2       | M      | 186 doc (merged) | DONE — reviewed+APPROVED+MERGED to main @ `fd724031` (operator-instructed), branch `feat/ai-books-foundation` @ `7e9891ee`. `Book` entity + `Account.bookId` + migration id 5 + idempotent 個人帳 backfill w/ revision-bump; sync接線全補(4 tableByEntity + browser keyByEntity + 2 outbox trigger arrays + pull VALID_ENTITIES + conflictSummary label + normalize boolean hydration + insertBookRow); +booksPartition characterization (byte-frozen, asserts netWorth/cash/liabilities incl. 對帳恆等式) + 12 dual-harness tests incl. SQLite outbox-tracking guard. **TWO executor STOPs, both correct** (pull.ts VALID_ENTITIES + conflictSummary.ts — literal/Record entity lists tsc-or-silently-missable; now the verified-complete set of 4 non-test SyncEntity consumers). push.test 3→4 = legit behavior change (default book syncs). tsc 0 / lint 0 / 1171 tests.                                                                                                                                                                                                                                                                                 |
| 189  | 帳本 Phase 1b UI — 側欄切換器(Search 與 QuickAdd 之間)、`bookScope.ts` 語意先寫成測試(總帳 identity / 過濾 / FIRE toggles / 跨帳本轉帳中性)、§1 12 surfaces 逐 cluster 範圍化、帳戶歸屬+帳本管理、QuickAdd/EntryDrawer 預設帳本 | P2       | L      | 188 MERGED       | DONE — reviewed+APPROVED (1 STOP for operator hero-KPI decision), branch `feat/ai-books-switcher` @ `59866d9c` (9 commits, off `fd724031`). MERGED to main (帳本 Phase 1, shipped alpha.61). `bookScope.ts` (4 helpers, 7 tests) + sidebar 帳本 switcher + 12 §1 surfaces scoped per two-axis rule (general=switcher, FIRE-family=fireMetricAccountIdSet switcher-independent) + AccountsRoute 帳本 select + 帳本管理 modal + QuickAdd/EntryDrawer book-default. **Hero-KPI: operator decided netWorth follows switcher; firstGoalPct/FIRE recomputed from personalNetWorthAccountIdSet so they DON`T move with switcher.** Zero repo/sync/migration change. tsc 0 / lint 0 / 1178 tests; 188 booksPartition byte-unchanged+green. **Reviewer LIVE browser pass (worktree vite): switcher renders between Search/QuickAdd + lists 總帳/個人帳/公司帳; 帳本管理 modal creates books; 個人帳 toggles ON / 公司帳 toggles OFF (188 semantic verified in UI); 0 console errors.** Executor judgment calls (all sound): milestone toast bound to personalNetWorth; cross-book transfer/代墊 pickers full-list; asset book-membership by owning-or-linked account. |

## 168–169 — 記帳 (Cash Flow) redesign (from Claude Design, 2026-07-12)

Imported from `記帳交易 Redesign.html` (project `a2b50679…`,
`northstar-ledger-redesign.jsx`) via DesignSync. Operator chose **toolbar B + B-2**
and **bottom A + D** (of toolbar A/B/B-2 and bottom A/B/C/D). Both are
layout/interaction only — no finance math or filter-semantics change. Independent
(both preserve/read the existing `dateScope` state); execute in either order.

| Plan | Title                                                                                                                                                             | Priority | Effort | Depends on | Status                                                                                                                                                                            |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 168  | Toolbar — single period control (B-2 stepper+popover) + 篩選 popover with count badge & active-filter chips (B); account/category leave the header                | P2       | L      | —          | DONE — reviewed+APPROVED, branch `feat/ai-cashflow-toolbar` @ `9af7fe70` (unmerged; new `LedgerDateControl` + `activeFilterChips`+5 tests; DateScopeControl untouched)            |
| 169  | 近期動態 + 固定收支 — right-column upgrade (30-day recurring + 未結清 moved in, sticky) + load-more/recent-3-days (A), and month-collapse for >3-month ranges (D) | P2       | L      | —          | DONE — reviewed+APPROVED, branch `feat/ai-cashflow-recent-recurring` @ `fc394c70` (unmerged; extracts `cashFlowGrouping`+6 tests; executor caught+fixed a visibleCount load race) |

**⚠ Both 168 & 169 edit `CashFlowRoute.tsx`** (168 the header ~906–1015; 169 the
bottom ~1178+, `UpcomingPayments`, and it extracted `groupByDay`→`cashFlowGrouping.ts`).
Regions are mostly disjoint, but the **import block overlaps** — merging both will
likely need a small manual conflict resolution there (and possibly `globals.css`,
though the new classes are distinct). Merge one, then merge/rebase the other and
resolve the imports.

Planned at `bdfa0c09`. Key constraint (both): reuse `dateScope`/`resolveDateScope`,
the `selectedAccount`/`selectedCategory` filter state (sentinel `"all"`), and the
`groupByDay`/`settlements`/`recurringRows` data — the same rows must match and the
same amounts must net. 168 must NOT regress `DateScopeControl`'s other callers
(Dashboard/Investments) — prefer a new `LedgerDateControl`.

## 156–163 — motion batch — ✅ MERGED (reconciled 2026-07-13)

Executed + reviewed via `/improve execute`, delivered as a linear stacked chain.
**Reconcile verification (2026-07-13): all seven implementation tips
(44039cc7…e4a85cca) are ancestors of `main`** — the chain was merged before the
alpha.56 release. The 161 spike branch (`46b00892`) is correctly NOT merged.
The pre-merge device eyeball list below is therefore now a POST-merge live-QA
list (still outstanding; folded into the manual-verification section).

| Plan | What                                                                                              | Branch @ tip                                 |
| ---- | ------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 156  | hover-gating for touch, row press-feedback, FAB safe-area, `transition:all`/keyframe cleanup      | `fix/ai-touch-hover-hygiene`@`44039cc7`      |
| 157  | ModalShell symmetric enter/exit motion (render-prop `dismiss`; caught + fixed a plan design flaw) | `feat/ai-overlay-exit-motion`@`f290d7b9`     |
| 158  | Toast motion + hover/hidden-tab pause + swipe-dismiss                                             | `feat/ai-toast-motion`@`ff653c42`            |
| 160  | ⌘K instant, QuickAdd 140ms, segmented sliding thumb, privacy scroll+blur, haptics wrapper         | `feat/ai-interaction-polish`@`5d008ca5`      |
| 159  | mobile bottom-sheet presentation + drag-to-dismiss (momentum)                                     | `feat/ai-bottom-sheet-gestures`@`8bbf8420`   |
| 162  | CashFlow EntryDrawer exit motion (reuses 157 classes; keeps sidebar-offset scrim)                 | `feat/ai-entrydrawer-exit-motion`@`1686d574` |
| 163  | `prefers-reduced-motion` → `::view-transition-*` pseudos (161 a11y finding)                       | `feat/ai-reduced-motion-vt-guard`@`e4a85cca` |
| 161  | GA motion **SPIKE** — doc + THROWAWAY PoC (do NOT merge)                                          | `feat/ai-ga-motion-spike`@`46b00892`         |

**To merge:** the chain tip **`feat/ai-reduced-motion-vt-guard` @ `e4a85cca`
contains all seven implementation plans** (156+157+158+160+159+162+163) — merging
it lands everything at once. Do NOT merge the 161 spike branch; cherry-pick only
`docs/motion-ga-spike.md` if you want the findings doc.

**Pre-merge eyeball** (device/live — deferred by design; jsdom can't run CSS
transitions or pointer gestures): overlay enter/exit + ×/取消 animation; toast
swipe/pause; ⌘K instant; segmented slide; privacy scroll+blur; bottom-sheet drag;
EntryDrawer exit; real haptics on an iOS build.

**161 spike verdicts** (full doc: `docs/motion-ga-spike.md`): **A** View
Transitions push/pop = **GO** (scope via `view-transition-name` on `.ns-app-main`,
never root, so chrome stays static); **B** scroll-edge fade = **do-top-2** (demo
banner + analytics in-page nav only — no sticky table headers exist); **C**
Dynamic Type = **DEFER past GA** (two independent fixed-px type systems;
`-webkit-text-size-adjust:100%` already disables inflation → rem alone insufficient).

## 164–167 — 總覽 + 投資 redesign (from Claude Design, 2026-07-12)

Imported from claude.ai/design project `a2b50679-620a-465b-80c5-ef0ca5574bce`
(`Overview + Invest Redesign.html`) via DesignSync. Four independent, siblable
plans — no ordering dependency; execute in any order (or parallel branches).
**All are layout/IA only; none change financial math.** Operator chose Overview
**Direction A「一眼脈搏」** (of three variants A/B/C in the design).

| Plan | Title                                                                                                                                                                         | Priority | Effort | Depends on | Status                                                                                                                                                                             |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 164  | Overview redesign — Direction A minimal pulse (FX→header, merge bills/cards/AR-AP into 待辦, default-hide allocation/goals/recent/projection+trend, demote trend behind 版面) | P2       | L      | —          | DONE — reviewed+APPROVED, branch `feat/ai-overview-variant-a` @ `aa6979d8` (unmerged; incl. operator tweak: 淨值趨勢 now default-hidden too)                                       |
| 165  | 持倉 tab — slim 5-col table + expandable rows, KPI cards→one strip, donut→thin distribution bar, 回補分類→⋯                                                                   | P2       | L      | —          | DONE — reviewed+APPROVED, branch `feat/ai-holdings-slim-table` @ `ab7fe66f` (unmerged)                                                                                             |
| 166  | Holding Detail — collapsible「今日」band (3 cells + impact; **no OHLC in data layer** so 開盤/區間 omitted, not faked)                                                        | P2       | M      | —          | DONE — reviewed+APPROVED, branch `feat/ai-holding-detail-today-band` @ `1fb247fc` (unmerged; adds pure helper `src/routes/holdingDetailToday.ts` + 7 tests)                        |
| 167  | 分析 tab — one global period control (+Custom), reorder to 01 報酬 / 02 貢獻 / 03 風險 / 04 股利 / 05 集中度 with scope tags, delete 365D calendar heatmap                    | P2       | L      | —          | DONE — reviewed+APPROVED, branch `feat/ai-analytics-global-period-reorder` @ `4063b049` (unmerged; incl. operator tweak: YTD+5Y presets restored; 02 貢獻 tag = 不隨期間·成本基準) |

### 164–167 — MERGED & RELEASED in `v0.1.0-alpha.57` (2026-07-12)

All four executed via `/improve execute`, reviewed, **APPROVED**, operator tweaks
applied, then **merged to `main`** (four `--no-ff` merges off `9441c152`) and
released as **`v0.1.0-alpha.57`** (`cc66b467`, tag pushed). Combined-`main`
verification before tagging: `tsc --noEmit` 0, `npm test` **1040/1040** (100
files), `npm run lint` 0 errors. No financial math changed (analytics/domain
untouched; day-change reuses `dayChangeMovers`). **Binary publish still pending** —
`./scripts/release-local.sh v0.1.0-alpha.57` (local signed macOS build) is the
operator's step; the source + tag are pushed but no release workflow auto-fires.

| Plan | Branch @ tip                                               | Files                                                    |
| ---- | ---------------------------------------------------------- | -------------------------------------------------------- |
| 164  | `feat/ai-overview-variant-a` @ `aa6979d8` (5 commits)      | `DashboardRoute.tsx`, `uiPreferences.ts`                 |
| 165  | `feat/ai-holdings-slim-table` @ `ab7fe66f` (1)             | `InvestmentsRoute.tsx`, `globals.css`                    |
| 166  | `feat/ai-holding-detail-today-band` @ `1fb247fc` (1)       | `HoldingDetailRoute.tsx`, `holdingDetailToday.ts`(+test) |
| 167  | `feat/ai-analytics-global-period-reorder` @ `4063b049` (2) | `InvestmentsAnalyticsTab.tsx`                            |

Note: `package-lock.json` shows an uncommitted version-field sync (alpha.55→.56)
in each worktree from `npm install` — a stale-lock catch-up, not a dependency
change; ignore or commit at merge.

**Key cross-cutting constraint (all four):** the app stores only daily `close`
per `DailyPrice` and `{symbol,price,currency}` per quote — **no open/high/low/
previousClose**. Day-change % and impact are derivable (reuse `dayChangeMovers`
in `domain/portfolioAnalytics.ts`); OHLC-dependent design cells are omitted, not
invented. Per-holding day-change may need `dayChangeMovers` to expose raw prices
— each plan flags that as a STOP/escape-hatch rather than duplicating valuation.

## Grouped record — 001–155 (all merged to `main`)

- **001–004** initial UI fixes. **072–078** licensing / RN-feasibility / decision docs.
- **079–095** Apple-platform + market-data batch (macOS native feel, notifications,
  SITCA/TWSE search, sync dedup, notification center). 090 superseded by 094.
- **096–111** 2026-07-02 correctness + critique batch (cash-leak, QuickAdd kind,
  privacy-mask, number-credibility, decimal precision, DRIP, notification entry).
- **112–115** chart semantics + annual-tax deepen + style-system rule & cleanup.
- **116–117** no-dep markdown renderer (AI summary + updater toast).
- **118–149** 2026-07-09 deep-audit batch (fee autofill, repo parity, FX visibility,
  perf memoization, dual-repo test harness, migration tests, CI build surface, sync
  orchestration + worker tests, Stronghold cutover, ECDH pairing, per-device
  revocation, worker hardening, gain/loss tokens, aria-labels, scrim tokens,
  ModalShell a11y, docs reality-sync). 140 rejected (shipped independently).
- **150** GitHub security-alerts clear. **151–155** operator bug batch (SITCA
  cert-code search, Chinese-name search, QuickAdd sidebar clipping, category-kind
  persistence, scroll-lock on documentElement).

## Open follow-ups (surfaced, not yet planned)

- ~~`.claude/worktrees/` pollutes Tailwind builds~~ **RETIRED (reconcile 2026-07-19)**
  — fixed directly 2026-07-17 @ `55c636ac` (gitignored + dead worktree removed).
- **138 tail — RE-INVENTORY before planning.** The old list of ~10 overlays to
  migrate to ModalShell is now **stale**: 157 (render-prop ModalShell across 14
  call sites), 159 (bottom-sheet + 更多 sheet), and 162 (EntryDrawer) migrated most
  of it. Re-grep `<ModalShell` and hand-rolled overlays against the merged chain
  before writing any further migration plan.
- **137-C — `formatPercent` migration WON'T-DO as specced**: it does `value*100`
  (expects a ratio) but the ~20 call sites hold percent-scale numbers with bespoke
  sign handling. Needs a percent-scale variant + sign audit, not a drop-in.
- **132 — vault-key rotation on device revocation** (deferred security spike): a
  revoked device that already captured ciphertext can still decrypt THAT (future
  data is cut off by per-device auth). Needs 131's `/keys` machinery; 131's
  `ade8e99d` ECDH helpers are groundwork, so it's cheaper now than when deferred.
- ~~EntryDrawer 商家 autocomplete~~ **RETIRED (reconcile 2026-07-19)** — shipped
  as plan 219 (shared `MerchantAutocomplete`, kb-nav + a11y, merged 2026-07-17).
  Note the original claim was wrong anyway: the drawer had its own weaker
  autocomplete since `60ac6277`, never a plain input.
- **Annual-report print — deferred polish** (from plan 173, 2026-07-13): (a) the visual print-preview check was never eyeballed (headless executor) — operator should print `/reports/annual` once (dark theme + a long multi-year report) to confirm no chrome bleed / no year-row page splits; (b) the 列印 button is not gated off on iOS (`window.print()` works in iOS WKWebView but is unpolished) — gate to desktop if the report becomes a mobile surface. Small.
- **Quick Add §6 remaining UX items** (from plan 175 inventory, 2026-07-13): §6.2 輸入框 token 高亮 (NOT shipped — needs an input overlay, bigger UI effort) and §6.3 低信心即時預覽補救 (PARTIAL — confirm-card chips exist, no preview-stage remediation). Both offline; a follow-up plan when Quick Add next gets attention. §6.6 語音輸入 stays with the iOS wave.
- **Quick Add Tier 2 (cloud parse) — PARKED by operator** (2026-07-13): the §12
  decision draft stays in `docs/quick-add-nlp-plan.md`; operator chose not to
  build for now (Tier 0+1 suffice). Do NOT build unless explicitly re-approved
  — it crosses the local-first invariant.
- ~~Index-Nudge — full-history evaluation~~ **RETIRED (reconcile 2026-07-19)** —
  shipped as plan 220 (period-independent `"1900-01-01"` TWR verdict, merged
  2026-07-17).
- **分帳 phase 2 — data layer DONE, UI (plan 222) remains** (updated at reconcile
  2026-07-19): foundation shipped as plan 221 (`"share"` legKind, `counterAccountId`
  pass-through, reconciliation-tested, merged 2026-07-17). Remaining: **plan 222
  (分帳 UI)** — cut it against 221's real signatures (`SplitShareInput`,
  `createSplit/updateSplit(shares?)`; see 221's index row + maintenance notes).
  Still gated on the operator's live pass of the 182 split flows (Manual-verification
  section) — do that pass before or with 222.
- **DRIP / fee-leg / installments lack partial-sync-arrival guard** (surfaced by plan 176 spike, 2026-07-13). Sync is per-record LWW with no group-atomic apply; only **transfers** detect a half-arrived group (`incompleteTransferGroupIds`, `ledgerTrust.ts:151-165`). A device that pulls one leg of a DRIP pair before its sibling transiently shows wrong cost-basis/XIRR until the other arrives. Fee-leg/installments are more benign (each row self-consistent). Fix = generalize the transfer guard to `incompleteGroupIds` covering `dripGroupId`; small, worth a plan when sync/DRIP next gets attention. Not a live-data-corruption bug (self-heals on next pull), so P3.

## Deferred by design (decide-then-build)

- **085 / 086 / 087** — SwiftUI Widget + App Intents; design pinned in 085, awaiting
  your simulator-vs-$99 decision + the Tauri-regeneration spike.
- **088 Phase 7.2** — on-device AI features; Feature B (monthly summary) shipped as 089. Feature A (transaction auto-categorization) is now **largely addressed**
  (reconciled 2026-07-13): entry-time categorization = lexicon + Tier-1 FM in
  QuickAdd; retroactive = plan 174's suggest-and-confirm bulk tool. Residual
  delta = FM-model-powered categorization for merchants the lexicon has never
  seen — keep product-gated, likely not worth building separately.
- **077 small gaps** — Phase 3.2 iOS lifecycle sync listeners
  (`visibilitychange`/`tauri://resumed`, touches AppShell, GUI-verify); Phase 7.4
  Writing-Tools check (trivial verify). Both small.

## Manual / operator-only verification outstanding (code already shipped)

- **182 split flows live pass** (2026-07-13): add 2-leg + 3-leg split, edit
  (re-save twice — tombstone+recreate round-trip), remove to 1 leg → plain-form
  exit, delete group, list expand/collapse, 收支 totals + 分類 chart match legs,
  credit-card split with 延後入帳.
- **180 Quick Add live pass**: merchant autocomplete dropdown (keyboard nav,
  Escape closes dropdown not QuickAdd), 「晚餐 50嵐 120」 merchant/name split.
- **179 nudge visuals**: 口徑 labels on the Alpha card + Dashboard strip; the
  banner needs 5Y/All + real lagging data to appear.
- **173 print preview**: `/reports/annual` 列印 — dark theme prints
  dark-on-white, no chrome bleed, no year-row page splits.
- **156–163 motion device QA** (chain now merged): overlay enter/exit, toast
  swipe/pause, ⌘K instant, segmented slide, privacy scroll+blur, bottom-sheet
  drag, EntryDrawer exit, real haptics on an iOS build.
- 2-device **pairing + revocation** (131/132) — worker deployed + 25 tests; needs 2 real phones.
- **macOS GUI eyeball** — title bar / app menu / Dock badge / window restore (079).
- **Live per-route 390px QA pass** — the static RWD audit missed the nav + date-strip
  bugs found live (084); other routes may have similar live-only issues.
- **Tauri spot-check of 151/152** ticker search (historic dev-proxy 502 blocker
  is now FIXED in vite.config.ts, so the browser dev shell works too).

## Findings considered and rejected (do NOT re-flag)

_(This ledger is the anti-re-audit record — kept verbatim.)_

- **Analytics usefulness review** — addressed by plan 167 (global period control + 5-section reorder, merged in v0.1.0-alpha.57) and the 2026-07-12 direction audit found no further analytics-direction gap worth planning; retired (was an Open follow-up).
- **RecurringRulesTab free-text category** — ADDRESSED by plan 174 (structured chip picker, merged 2026-07-13); retired from Open follow-ups at reconcile.
- **Vite dev-proxy 502** — FIXED independently (vite.config.ts:93-95 now parses `request.url` with a base URL; verified at reconcile 2026-07-13); retired from Open follow-ups. Browser dev shell market-data proxy works again.
- **Index-Nudge variant decision** — CLOSED: operator chose A + repoint-to-TWR (2026-07-13), shipped as plan 179. Only the full-history-evaluation follow-up remains open.
- (P3) Dashboard card-heaviness: flattening cards needs a significant visual redesign across DashboardRoute. A dedicated design sprint, not an incremental plan.
- Sidebar width transition in AppShell.tsx: intentional structural animation, not a data-driven bar. Not a layout-thrashing issue.
- `InvestmentsRoute.tsx:1339`/`1448` `hover:bg-black/5 dark:hover:bg-white/5`: impeccable 偵測器 flag 為 pure-black background — 誤報，是合法的列 hover 微調，非 scrim。107 明確排除，勿再掃出。
- Dashboard KPI 卡的 4px 色籤（`KpiCard`, DashboardRoute.tsx:1370）曾疑似 side-stripe 反模式 — 查證為圓角 pill 元素（非 border-left），屬允許寫法，不修。
- QuickAdd FAB 蓋到 Dashboard 圖表右下（375px）— 標準 FAB 行為，demo 資料下才明顯，影響低，不值得做。
- **137-C — `formatPercent`**: see Open follow-ups (WON'T-DO as specced).
- "DESIGN.md prescribes SwiftUI" — mis-attributed by a subagent; the line is in the known-stale `.impeccable.md:17`, not DESIGN.md. DESIGN.md is accurate.
- TransactionsRoute 「JANUARY 2026」English month header (`transactionsTxLabel`-adjacent, ~:643) — intentional: explicit eslint-disable + comment; matches the English-eyebrow convention. Not stray i18n.
- QuickAdd editable-input `toLocaleString` (~:261) and NumberField/FIRECalculator input formatting — inputs are exempt from the privacy-mask rule by convention (you can't mask a field mid-edit). Only DISPLAY chips were planned (137-E).
- Direct `getFinanceRepository()` calls in 10 files — mostly legitimate imperative one-offs (demo mode, export, device connect); not worth a consolidation plan.
- TypeScript 7 / ESLint 10 / worker-types v5 majors — track, don't migrate; all runtime deps are current-major. Batch the ESLint ecosystem when it's actually needed.
- Sortino/Sharpe/MaxDrawdown KpiCard ACCENT colors using pos/neg (AnalyticsTab :843/:861) — metric-quality cues, not price direction; the gain/loss litmus does not apply. Recorded in plan 134 as leave-alone.
- worker CORS `*` — re-confirmed fine (Bearer auth, no cookies). Standing rejection from the June audit.
- "Custom assets have no entry UI" (original DIR-04 wording) — STALE at vetting: InvestmentsAddSheet:304 creates `assetType:"custom"` and HoldingEditModal logs manual prices. Only the staleness data-health rule remained → plan 141 re-scoped.
- `next-themes`/`react-hook-form`/`@tanstack/react-table` — verified zero imports; removed in plan 139 item 6.
- Dead COSS primitives (coss/checkbox|field|label|select, 0 importers) — intentional scaffolding for the deferred form-primitive migration; plan 139 documents them instead of deleting.
- `components/ui/` "dual component stack" — largely by-design per `src/components/ui/README.md`'s whitelist (command/popover/date-picker have no COSS counterpart); only the migration-plan doc's "COMPLETE" wording drifted → folded into plan 139.
- NotificationCenter/FilterPill/SegmentedControl small `rgba(0,0,0,…)` shadows and CashFlow/QuickAdd active-chip `rgba(0,0,0,0.12)` borders — subtle elevation/edges, not scrims; excluded from plan 136.
- `InvestmentsRoute.createSnapshot/deleteSnapshot` invalidating only `["manualPriceSnapshots"]` (narrower than HoldingEditModal's siblings) — investigated during plan-124 execution: NOT a gap. Custom-asset valuation re-derives at render from the invalidated `manualPriceSnapshots` query; the extra sibling keys are defensive redundancy, not required. Do not "fix".
- Session-finding leave-alones (motion batch): QuickAdd `overlayLeft` 64/240 hardcode (plan 153, deliberate); charts `isAnimationActive={false}` + un-animated KPI numbers (correct for finance data); global `:active{translateY(1px)}` press nudge (deliberate macOS choice); `windowEffects:["mica","sidebar"]` mica-on-macOS (harmless until a Windows build); JS `onMouseEnter` hover on touch in 6 files (deferred, per-site judgment on chart tooltips — noted in 156).

## 190–191 — 帳本 Phase 2 (發票/營業稅, planned at `41d44e04`, 2026-07-13)

Phase 2 from docs/ledger-books-plan.md §3, split foundation+UI like Phase 1
(188/189). Operator decisions baked: Model A tax (tax fields on `invoices`
table ONLY, not LedgerTransaction), generic 字軌+序號 numbering w/ TW 統一發票
preset, 客戶主檔 + 帳齡 + DSO in scope, 401 = live query. Sync wiring now a
known playbook (188's 4 files + 2 outbox arrays).

| Plan | Title                                                                                                                                                                                                                                                                                        | Priority | Effort | Depends on           | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 190  | Phase 2a foundation — `Invoice`+`Client` entities, `salesTax.ts` (round(含稅×5/105)) + `invoiceNumbering.ts` (TW 統一發票 preset) pure modules, full sync wiring (mirror 188's book playbook), `stampInvoiceSettled`, dual-harness + characterization. Zero UI, no LedgerTransaction change. | P2       | L      | 188+189 (merged)     | DONE — reviewed+APPROVED, branch `feat/ai-invoices-foundation` @ `a35e4ff3` (5 commits, off `41d44e04`). MERGED to main (帳本 Phase 2a, shipped alpha.61; entities/`salesTax.ts`/`invoiceNumbering.ts` present at `db007657`). `Invoice`+`Client` entities; `salesTax.ts` (round(105000×5/105)=5000 ✓) + `invoiceNumbering.ts` (TW 字軌 `^[A-Z]{2}\\d{8}$` + 8-digit increment + overflow guard) pure modules; sync wiring EXACT parity w/ book (invoices=8/clients=8/books=8 grep); `stampInvoiceSettled`/`findInvoiceByLedgerId`; +36 tests (1214 total); characterization byte-frozen; **LedgerTransaction unchanged (verified)**. Reviewer-confirmed design: tax fields on `invoices` table ONLY. ⚠ SURFACED: snapshot round-trip gap → plan 192 (188 SQLite-export-drops-books regression + invoices/clients not in backup). |
| 192  | Snapshot round-trip fix (P1 data-integrity) — SQLite `exportSnapshot` omits `books` (188 shipped regression: desktop backup/restore silently drops books) + add invoices/clients to `RepositorySnapshot` + all 4 export/import paths; round-trip test first                                  | P1       | S      | 190 MERGED           | DONE — reviewed+APPROVED, branch `fix/ai-snapshot-roundtrip` @ `f20ea5dc` (off `e1e3c3b0`). MERGED to main (fix `f20ea5dc` in history at `db007657`; shipped alpha.61). Round-trip test FAILED pre-fix (SQLite lost company book, browser lost client — both gaps proven), passes post-fix; asserts book id/kind/toggles/color + client 統編 + invoice 號碼/稅額. Fix: SQLite exportSnapshot += books (188 regression) + invoices/clients through all 4 export/import paths + `RepositorySnapshot` type; `?? []` guards (normalizeStoredData 5346-5354) keep pre-190 snapshots importable. Only repositories.ts + new test touched; no entity shape/UI change. tsc 0 / lint 0 / 1216 tests.                                                                                                                                       |
| 191  | Phase 2b-1 UI — 開發票流程 (extends `ar`, auto tax via computeSalesTax, TW 字軌 preset), 客戶主檔 + ClientAutocomplete, wire `stampInvoiceSettled` into `confirmSettle`, `invoiceEntry.ts` pure helper. Company-book-gated.                                                                  | P2       | L      | 190+192 (merged)     | DONE — reviewed+APPROVED + LIVE-VERIFIED (integrated w/ 194), branch `feat/ai-invoice-entry` @ `14d82459` (off `50419301`). 開發票 toggle on `ar` (company-book-gated), `invoiceEntry.ts` pure helper (105000→未稅100000/稅5000 ✓), ClientAutocomplete+ClientManager, create-ledger-then-invoice w/ orphan-safe ordering + `InvoiceMetadataError` toast, `stampInvoiceSettled` in confirmSettle (verified no-op for plain 應收). tsc 0 / lint 0 / 1227 tests. Combined steps 2-5 into 1 commit (documented, sound). Live-verified (ar drawer + company-gate). MERGED to main @ `51cf90ed`.                                                                                                                                                                                                                                        |
| 194  | Fix 189 regression — `bookScope.scopeRows` drops unsettled 應收/應付 (`accountId:""`) from 未結清 in EVERY book view incl. 總帳 (found by 191 executor). One-line filter widen + test.                                                                                                       | P1       | S      | —                    | DONE — reviewed+APPROVED, branch `fix/ai-bookscope-unsettled` @ `d2a20c41`. One-line `scopeRows` widen (`!row.accountId                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |     | …`) + test (fails pre-fix `l_ar_unassigned`missing, passes post). tsc 0 / lint 0. LIVE-VERIFIED (未結清 shows the accountId="" row). MERGED to main @`51cf90ed`. |
| 193  | Phase 2b-2 reporting — `invoiceReporting.ts` pure math (agingBuckets/DSO/outstandingSalesTax/bimonthly401Summary) + 3 company-book-gated CashFlow cards (帳齡+DSO, 本期應繳營業稅, 401 雙月彙總). Completes Phase 2.                                                                         | P2       | M      | 190+191+194 (merged) | DONE — reviewed+APPROVED (1 revision: aging buckets) + LIVE-VERIFIED, branch `feat/ai-invoice-reporting` @ `f4b7aac8`. `invoiceReporting.ts` (agingBuckets 5 real buckets 未到期/1-30/31-60/61-90/90+, DSO, outstandingSalesTax, bimonthly401Summary) +17 tests; 3 company-gated cards. **REVISE fixed finance-correctness bug: a 15-day-overdue invoice was labeled 未逾期 — now correct 逾期1-30.** MERGED to main @ `da6c993c`. tsc 0 / lint 0 / 1245 tests. **LIVE (reviewer): company book → 開發票 (105000 含稅 → 未稅100000/稅5000, TW字軌 AB12345678) → 帳齡「未到期 1筆 105,000」+ 應繳營業稅卡 + 401表 all render; 開發票/客戶 buttons company-gated.** MERGED to main @ `da6c993c`. Completes 帳本 Phase 2 (188–194 all merged, shipped alpha.61).                                                                     |

## 196–197 — 投資對帳 (operator ask, `/improve plan` 2026-07-14 @ `db007657`)

Two operator requests on the 投資 交易紀錄 surface: (1) a 總額 bug — the on-screen
total drops the 手續費 (台光電 2×5065 shows −10,130, should be −10,138); (2) a 日結
view for reconciling against the broker's daily 成交回報 email. Diagnosis: the
**ledger cash leg is already correct** (`calculateInvestmentCashDelta` includes
fee); only the two display sites compute gross. 196 rewires the display to the
ledger's own cash-delta fn; 197 adds a 日結 grouping toggle with per-day 小計.
Operator decisions for 197: grouping-mode toggle (not a new route); 小計 columns
成交金額/手續費/應收付, combined fee (no 交易稅 split).

| Plan | Title                                                                                                                                                                                                                                     | Priority | Effort | Depends on | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 196  | 投資 總額 shows real net cash (incl. fee/tax) — rewire `TransactionsRoute` + `HoldingDetailRoute` display to reuse `calculateInvestmentCashDelta` (the ledger's own fn); opening lots stay 「—」. Display-only; balances already correct. | P1       | S      | —          | DONE — reviewed+APPROVED, branch `fix/ai-investment-total-fee` @ `b64b90fe` (off `db007657`). Both display sites rewired to `calculateInvestmentCashDelta`; opening lots stay 「—」. +1 test (5065×2+8 → −10138). tsc 0 / lint 0 / 1246 tests. **MERGED** (verified ancestor 2026-07-17; row previously stale — see Reconciled 2026-07-15).                                                                                                                                                                                                                                                     |
| 197  | 日結 grouping mode in 交易紀錄 — `SegmentedControl` 月分組↔日結, pure `investmentDailySettlement.ts` (group-by-day + per-currency 成交金額/手續費/應收付 小計), `InvestmentDayGroup` reusing existing row components.                     | P2       | M      | 196        | DONE — reviewed+APPROVED, branch `feat/ai-daily-settlement` @ `b0adf8e5` (stacked on 196's `b64b90fe`). `groupByDayWithSubtotals` pure helper +6 tests (incl. 5065×2 fee8 → net −10138); month path refactored to shared `groupRowsByMonth` page-slice (untouched behavior); `InvestmentDayGroup` reuses existing row/mobile components, tfoot 小計 balanced to 9 cols; per-currency subtotals, opening lots excluded. tsc 0 / lint 0 errors / 1252 tests. **MERGED** (verified ancestor 2026-07-17; row previously stale). Live browser check skipped (data-dependent; math carried by tests). |

**Dependency**: 197 requires 196 — its 應收付 小計 sums each row's `signed`, which
only includes fee after 196 lands.

## 195 — 共享帳本 spike (Phase 3 gate, operator chose "spike now" 2026-07-13)

帳本 Phase 2 COMPLETE (188–194 all merged @ `da6c993c`). Phase 3 (shared
books / 雙向共寫) is a HIGH-risk crypto+worker surface; operator chose to run
the design spike now and decide the build later. **143 SUPERSEDED by 195**
(143 predates books + references the pre-books account-sharing model + the
then-unbuilt 130–132 crypto foundation, which has since SHIPPED).

| Plan | Title                                                                                                                                                                                                                                                 | Priority | Effort | Depends on      | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 143  | Household sharing spike (pre-books, account-level)                                                                                                                                                                                                    | P3       | M      | —               | SUPERSEDED by 195 (books-aware rewrite; 143 designed against account-`isSharedToHousehold` + unbuilt 130–132; obsolete)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 195  | 共享帳本 key/membership spike — book-key wrapping (builds on SHIPPED pairing/secretStore/vault + worker ECDH), membership/revocation, worker namespace delta, 雙向共寫 conflict UX, phased Phase 3/4 outline → `docs/shared-books-plan.md`. Doc-only. | P3       | M      | 186 §4 (merged) | DONE — reviewed+APPROVED (doc-only), branch `feat/ai-shared-books-spike` @ `378c0e0f` (`docs/shared-books-plan.md` 663 lines, 7 sections; re-verified vs SHIPPED pairing/secretStore/vault + worker 0001-0007). **Recommends: Book Space Key** (per-book AES-GCM-256 wrapped to member devices via existing ECDH, zero new crypto primitives) + **mandatory rotation on member removal**; removed member keeps pre-removal data (locked honest answer); worker `0008` +3 additive tables, per-book relay_sequence. Found dead household/devices stubs (README-only). Phase 3 read-only=M, Phase 4 雙向共寫=XL. **6 open questions gate any Phase 3 build. Operator answers (2026-07-14):** Q1 removed-member-keeps-past-data = ACCEPT; Q2 convert-in-place confirmed NOT a server-resource concern (relay stores opaque blobs, one-time small upload; cost is client-side re-encrypt only); **Q3 NEW DECISION: member display names/nicknames are LOCAL-ONLY, never uploaded — relay stores only opaque device/member ids.** Q3 recovery-kit = NONE (use re-invite); Q4 push-gate = trust client for v1 (no relay enforcement until Phase 4); Q6 private-notes = NO per-row privacy tier (whole row shared). **ALL 6 open questions now answered — Phase 3/4 build plans can be cut from the spike whenever the operator starts Phase 3.** **MERGED** (`378c0e0f` verified ancestor 2026-07-17; `docs/shared-books-plan.md` present at HEAD — row previously stale). |

## 259–267 — 效能 + 版本升級（`/improve` 2026-07-25 @ `79032d3b`）

Operator ask：「改善程式速度，順便規劃 tauri 之類的版本升級」。範圍限縮在
**效能 + 依賴/遷移**兩類，其餘類別這次沒審。12 個發現全部選中，寫成 9 份計畫。

**先更正一個前提**：**沒有 Tauri 3**。`cargo search tauri` @ `79032d3b` 回報
`tauri = "2.11.5"`，目前 repo 在 `2.11.3` —— 是 patch bump，不是遷移。這批真正有份量的
升級是 **TypeScript 7**（原生 Go 編譯器）。

**實測數字（advisor 在此 commit 上實跑，非估算）**：

| 量測               | 現況                                     | 之後                                    |
| ------------------ | ---------------------------------------- | --------------------------------------- |
| `tsc --noEmit`     | **5.26 s**                               | **0.66 s**（TS 7，遷移後 0 error）—— 8× |
| 啟動 DB round trip | 約 **150 次序列化 IPC** + 11 次全表掃描  | 計畫 260 後約 4 次                      |
| eager bundle       | 約 **1.7 MB**，含整包 recharts           | 計畫 267 後 −388 kB                     |
| 核心表索引         | `ledger_transactions` 等 5 張表 **0 個** | 計畫 259 後 +13 個                      |

### 執行順序與狀態

| Plan | Title                                                                                                                                                                                           | Priority | Effort | Depends on        | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 259  | SQLite 索引（13 個，涵蓋 `group_id`/`asset_id`/`account_id`/`ticker`/`book_id` 等熱路徑）+ WAL 下 `PRAGMA synchronous=NORMAL`。純加法，不改任何 query 文字                                      | P1       | S      | —                 | **DONE** — reviewed+APPROVED，分支 `fix/ai-sqlite-indexes` @ `3d0f1a5c`，**已由 operator 同意並 merge 進 main @ `aa791298`**（`--no-ff`，未 push）。執行者第一輪正確地 STOP：原計畫把 `idx_investment_drip_group`/`idx_accounts_book` 放進 migration 9，但這兩個欄位是 `ensureSqliteColumn()` 加的、跑在 migrations 迴圈**之後** → 新資料庫 `no such column: drip_group_id`，`repositories.investments.test.ts` 72 個倒 36 個。計畫已修正：migration 9 收 11 個索引，那兩個改用 repo 既有先例（`idx_ledger_recurring_occurrence` @ 3095）在 `initialize()` 內 imperative 建立。Reviewer 獨立複驗：migration 6/6、investments **72/72**、`npm test` **129 檔 1498 測試全過**、tsc 0、lint 0、build 0。新測試逐一比對 13 個索引名（正是能擋下原錯的斷言）+ 冪等性。Scope 乾淨（3 檔）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 260  | ~~用 `PRAGMA user_version` gate 掉整段啟動管線~~                                                                                                                                                | P1       | M      | 259               | **SUPERSEDED by 268**（先 BLOCKED）。執行過才發現前提是錯的：`backfillCreditGroups` / `backfillUnassignedAccount` / `mergeAndHealBooks` 不是一次性 schema 工作，而是**持續性資料自癒**（程式碼註解自己寫著 `Runs every initialize() pass`、`at every wired call site … applySyncChanges`），gate 掉會讓同步進來的髒資料永遠不被修——`repositories.creditGroup.test.ts` 倒 2 個測試證實。更根本的是：資料修復語句**與 63 個 `ensureSqliteColumn` 交錯**，所以「整段 verbatim 搬走」在結構上就不可能。部分成果保存在分支 `wip/ai-plan260-blocked` @ `fe24855e`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 268  | **重寫版**：先把 schema DDL 與資料自癒**實體分離**，再用**自我失效的 fingerprint** 只 gate DDL                                                                                                  | P1       | L      | 259（已 merge）   | **DONE** — reviewed+APPROVED，分支 `perf/ai-schema-ddl-phase` @ `ce172efa`（3 commits：Phase A 純賺／結構拆分／加 gate，各自可獨立 revert），**尚未 merge，待 operator 決定**。Reviewer 獨立驗證的重點：(1) **64 組 `(table, column, definition)` 用腳本逐項比對原始碼 → 完全一致，順序與定義文字都沒變**；(2) 6 條動到資料列的語句同樣逐條比對 → text + order 完全一致，沒有任何 SQL 被改動；(3) `runSchemaDdl()` 內 `update`/`insert`/`delete` 數量 = **0**，那條「動資料列的語句不准進去」的規則是機械可查的。實測：`pragma table_info` 全新資料庫 65 → **7**，第二次啟動 65 → **0**；第二次啟動總 DB 呼叫 **44**（首次 166）。`npm test` **129 檔 1505 測試全過**（基線 1498 + 7 新）、`creditGroup.test.ts` **20/20**（260 掛掉的那支）、tsc/lint/build 全 0。新測試是真的：兩個自癒回歸測試都是「initialize → 插入壞資料 → 再 initialize」，把自癒函式搬進 gate 就會紅；第三個（credit group）沿用既有測試，我查證 `creditGroup.test.ts:206` 確實走第二次 `initialize()`，覆蓋成立。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 261  | ~~`daily_prices` 只載入「還持有的 ticker + benchmark」~~                                                                                                                                        | P2       | M      | 259               | **REJECTED — 量測數字否決了這個修法**（operator 於 `4473222a` 實跑）。`daily_prices` 共 **124,158 列 / 114 個 ticker**，但屬於**非持有 ticker** 的只有 **250 列（0.2%）**。計畫自己的 STOP 條件寫著「非持有列數 < ~2000 就判 REJECTED」，實測 250 → 依約否決。原假設「賣掉的標的價格歷史會永遠累積」在這份真實資料上**不成立**：99.8% 的列都屬於現在還持有的標的，收斂 ticker 省不到東西。**這是量測閘門發揮作用**——擋下了一次對財務載入路徑的無謂改動。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 262  | 依賴維護掃除：in-range patch/minor 全部、Tauri 2.11.3→2.11.5、`src-tauri` 補 `[profile.release]`                                                                                                | P2       | S–M    | —                 | **DONE** — reviewed+APPROVED，分支 `chore/ai-dependency-sweep` @ `7e532aa5`（3 commits），**尚未 merge**。Reviewer 獨立複驗：`npm test` **1498 不變**、tsc/lint/`license:check`/`check:tauri` 全 0、`check-eager-bundle.mjs` exit 0（`charts` 仍不在 eager set）。`package.json` **完全沒動**（所有 bump 都在既有 caret 範圍內，只動 lockfile）。Cargo.lock 只動 3 個 tauri 套件 + 移除重複的 `quick-xml 0.37.5`；**`tauri-plugin-sql` 確認仍在 2.4.0**（vendored patch 沒被拖動）。`catch_unwind` 零命中，故 `panic = "abort"` 四行全留。release binary 9,559,584 B。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 263  | **TypeScript 5.9.3 → 7.0.2**                                                                                                                                                                    | P2       | M      | —                 | **部分完成 — config 遷移 APPROVED；TS 7 升級 BLOCKED（外部相依）**。**config 遷移已合併進 main**（`b372c6d7` + `78d2d716`，隨 `v0.2.0-beta.1` 出貨；分支 `chore/ai-typescript-7` 已刪除。2026-07-26 複驗 `git branch --contains 78d2d716` → main）。**沒有任何分支懸著等處理**，卡住的只有編譯器本身。**已落地**：`tsconfig.json` 拔掉 `baseUrl`、`moduleResolution` 改 `bundler`、補 `types:["node"]`（三項在 TS 5.9.3 上也合法，已驗）；`typescript` 範圍 `^5.8.3` → `^5.9.3`。**擋住的原因**：`typescript-eslint@8.65.0`（確認為最新）peer 是 `typescript: ">=4.8.4 <6.1.0"`；TS 7 下 `npm run lint` **硬失敗** `Error: typescript-eslint does not support TS 7.0.`（exit 2，不是 lint 發現）。依 Step 4 的 fallback 只回退編譯器、保留 config 遷移。**實測效益（回退前量到，證明加速是真的）**：`tsc --noEmit` **10.877 s → 1.92 s（~5.7×）**，0 error。（我先前在主 checkout 量到 5.26 s → 0.66 s／8×；倍率差來自 worktree 冷快取，兩邊 error 都是 0。）⚠️ Reviewer 抓到並要求修正：install→revert 兩次連續安裝把 **12 個 `@typescript-eslint/*` 從頂層擠進巢狀目錄**（頂層 16→4），為一行版本 bump 產生 466 行 lockfile diff。已還原 lockfile 後單次 `rm -rf node_modules && npm install` 重建 → 巢狀 **0**／頂層 **16**，整條分支收斂成 **3 檔 4 增 4 刪**。**重啟條件**：`typescript-eslint` peer 放寬到含 TS 7 後，改一行版本即可收下 5.7–8×。**2026-07-26 複驗：`typescript-eslint@8.65.0` 仍是最新，peer 仍為 `typescript: ">=4.8.4 <6.1.0"`，未放寬 → 續押。** 這是**單一外部相依的版本相容性阻塞**（peer range 不含 TS 7 + lint 硬失敗），不是我們這邊有解不開的套件衝突；除了等上游沒有其他正解（硬吃 `--legacy-peer-deps` 只會讓 lint 直接爆 exit 2，等於拿掉整層型別檢查來換編譯速度，不划算）。**264 完成後應主動重驗**（264 會把 typescript-eslint 帶到最新）。 |
| 264  | Lint 全家桶：eslint 9→10、`eslint-plugin-react-hooks` 5→**7**、`eslint-config-prettier` 9→10、`globals` 15→17、`react-refresh` 0.4→0.5                                                          | P3       | M      | 262（已 merge）   | **DONE** — reviewed+APPROVED（1 輪 REVISE），**已 merge 進 main @ `62e935d8`**。**執行者的關鍵判斷（我認可）**：`eslint-plugin-react-hooks@7` 的 `recommended.rules` **偷偷多塞 14 條 React Compiler 診斷規則且全是 `error`**，照原樣 spread 會一次帶進 40 個錯誤，等於在「升級引擎」的 commit 裡順便打開 266 才該開的東西。它改成把 react-hooks 明確釘成升級前的兩條並加註解引用兩份計畫編號。⚠️ **Reviewer 攔下的 CI 阻斷**：ESLint 10 把 `no-useless-assignment` 與 `preserve-caught-error` 升成 `error` → `npm run lint` exit 1，而 `ci.yml:23` 正是跑 `npm run lint`，直接 merge 會讓 CI 變紅。依 repo 既有慣例（六條建議性規則全是 `warn`，只有隱私遮罩守衛 `no-restricted-syntax` 是 `error`）把這兩條設為 `warn`：發現仍可見，CI 不擋。複驗：lint **exit 0**（772 warnings / 0 errors）、tsc 0、build 0、**1505 測試全過**、隱私遮罩守衛反向驗證仍以 **error** 觸發、scope 乾淨 3 檔。**Step 5b 結果**：`typescript-eslint@8.65.0` peer 仍是 `typescript: ">=4.8.4 <6.1.0"`，**沒放寬 → 263 繼續 BLOCKED**。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 265  | 測試基礎建設 major：jsdom 26→29、`@types/node` 22→26、`jest-dom` 6→7                                                                                                                            | P3       | M      | 262               | **DONE** — reviewed+APPROVED，**已 merge @ `4030cb8f`**。零測試檔需要修改。**關鍵檢查做對了**：jest-dom 7 最危險的失敗模式是 matcher 靜默未註冊（斷言全變 no-op，測試「全過」卻什麼都沒驗）。執行者把一個 `.not.toBeInTheDocument()` 反轉,確認拿到**真正的 jest-dom 拋錯**才判定 matcher 是活的,然後還原。另查 CI 的 `node-version: lts/*`（5 處）滿足 jsdom 29 engine 範圍。複驗：1505 全過、tsc 0、lint 0、e2e 2/2。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 266  | React Compiler，**分階段**：先開 react-hooks v7 的 compiler lint 規則讀報告，再用 `compilationMode:'annotation'` 掛上（等同 no-op），單一路由試點量測後**停下來交決策**。不刪任何現有 `useMemo` | P3       | M      | **264（硬相依）** | **CLOSED — 決策為「不全面啟用」（操作者 2026-07-26 拍板）**。已落地並保留的部分：`compilationMode:'annotation'` 掛上（等同 no-op，不改任何執行期行為）、react-hooks v7 的 compiler lint 規則以 `warn` 開著當**體檢儀表**、`vitest.config.ts` 鏡射同一組 preset。**不做全面啟用的理由**：量到的只有建置期成本，沒有任何渲染期收益的證據；而 lint 報告中真正該修的 6 條（ref 讀寫、purity）**已由 plan 274 修完並合併**，剩下的 34 條以 `set-state-in-effect` 為主，多屬良性。**重啟條件**：出現實測的渲染瓶頸（profiler 有據），或 React Compiler 進到預設啟用。屆時 annotation 模式已是現成的漸進入口——單一元件加 `"use memo"` 即可試點。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 267  | 把 recharts 踢出 eager graph —— `clsx`/`tailwind-merge` 被塞進 `charts` chunk，導致 entry→`card`→`charts` 整包 388 kB 每次開機都載                                                              | P2       | M      | —                 | **DONE** — reviewed+APPROVED（2 輪 REVISE），分支 `perf/ai-eager-bundle` @ `f8751466`，**已由 operator 同意並 merge 進 main @ `72fc7a7f`**（`--no-ff`，未 push）。原計畫的 `manualChunks` 三行修法**在本專案無效**：vite@8.0.16 底層是 **Rolldown 1.0.3**，`manualChunks` 是 deprecated shim，會被轉成單一 `codeSplitting` group（無 `priority`），而 `includeDependenciesRecursively` 預設 true → charts group 遞迴吸走 `clsx`（recharts 自己的相依）。改用 `output.codeSplitting.groups` + `priority`（classutils:100 / 其餘:50 / charts:10）後成功。Reviewer 獨立複驗（自己重 build + 自己重走 import graph）：eager **1,799,730 → 1,411,980 B，−387,750 B**，`charts` 已不在 eager set，`card` 不再 import charts，chunk 數 57（45–60 內），Dashboard/CashFlow/Investments/HoldingDetail/Goals 五條圖表路由仍能 reach charts。新增 `scripts/check-eager-bundle.mjs`（真的會 fail：反向驗證把 priority 調成 1 後確實 exit 1）+ `docs/performance-budget.md` **R5**（並順手修好 R2 的過時 `manualChunks` 引用）。⚠️ 執行者發現並經 reviewer 確認：`npm run test:e2e` 跑的是 **dev server 不是 `dist/`**，無法驗證 production chunking——計畫的 test plan 已更正，真正的驗證是 Step 3 的靜態可達性檢查 + 該 script。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

### 相依說明

- **259 → 260**：260 的 `SCHEMA_GENERATION = 10` 假設 259 的 migration id 9 已存在。
- **264 → 266（硬相依）**：React Compiler 的 lint 規則出在 `eslint-plugin-react-hooks` v6+；
  沒有它，266 的 Step 2「讀 compiler 違規報告」無從做起，等於瞎裝。
- **262 → 263/264/265**：先把 in-range 的 patch/minor 清掉，三個 major 的 diff 才乾淨。
- 259 / 262 / 267 三份彼此獨立，可並行。

### merge 後的合併驗證（259 + 267 同時在 main 上）

兩條分支各自都是從 `79032d3b` 開出去的，彼此沒互相測過，所以 merge 後在 main 上重驗了一次：
`tsc` 0 / `npm run build` 0 / `npm test` **1498 全過** / `node scripts/check-eager-bundle.mjs` exit 0
（`charts` 不在 eager set，EAGER TOTAL **1,415,155**）。

註：1,415,155 比 267 worktree 內量到的 1,411,980 多約 3.2 kB，是 259 讓 `repositories.ts` 多了 14 行、
被打進 eager 的 `card` chunk 所致——預期內，不是回歸。

### ⚠️ 背景 executor 可能在主 checkout 裡動手（且會跟你的 git 指令 race）

260 的執行者沒有待在自己的 worktree —— 它在**主 checkout** 建了分支並改了
`src/data/migrations.ts` / `repositories.ts`。兩個後果：

1. 主工作區一度帶著會讓 2 個測試失敗的未提交改動。已備份成 `wip/ai-plan260-blocked`
   分支（commit `fe24855e`）後還原，main 回到 1498 全過。
2. 它在主 checkout 執行 `git checkout -b perf/ai-startup-schema-gate`，**剛好卡在**
   reviewer 檢查分支（顯示 `main`）與執行 merge 之間 —— 導致 267 的 merge commit
   落到那條分支上而不是 main。已用 `git merge --ff-only` 把 main 拉回正確狀態
   （`72fc7a7f`），該誤導性分支名已刪除。**沒有任何 commit 遺失。**

**教訓：有背景 executor 在跑時，不要在主 checkout 下 git 指令。** 分支狀態要在操作
的「同一個」指令裡檢查，不能分兩次 tool call —— 中間會被 race。

### ⚠️ worktree 派工的陷阱

背景 executor 的 worktree 是以**該 session 起始的 HEAD** 建立的，不是當下的 `main`。
260 第一次派工就撞到：main 已在 `aa791298`，worktree 卻停在 `79032d3b`，migration id 9 不存在。
（執行者的 base-commit 檢查有擋下來，沒動到任何檔案。）
**每次在 merge 之後派新工，都要先叫 executor 跑 `git merge --ff-only <目前 main sha>`。**

### ⚠️ 執行這批計畫時不要並行跑 e2e

`playwright.config.ts` 的 `webServer` 綁死 `http://127.0.0.1:5173`，且
`reuseExistingServer: !process.env.CI` —— 本機沒有 `CI` 變數時它是 **true**。
`vite.config.ts` 又是 `strictPort: true`。

後果：**兩個 worktree 同時跑 `npm run test:e2e`，第二個會直接沿用第一個的 dev server，
等於拿 A 分支的測試去測 B 分支的程式**。不是紅燈，是靜默的假結果。

262 / 265 / 266 / 267 的驗證清單都含 `npm run test:e2e`，所以這幾份**必須序列化執行**。
（`PORT` 環境變數只改得動 vite，改不動 playwright 寫死的 `url`/`baseURL`。）

## 269–270 — 262 帶出的兩個既有問題（2026-07-25 @ `72fc7a7f`）

| Plan | Title                                                                                                                                                                                                                                                                                                               | Priority | Effort | Depends on                                                        | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 269  | 修正 **R2** 守則：改成斷言「每條 lazy route 都有自己的 chunk」，拿掉 45–60 的總數帶                                                                                                                                                                                                                                 | P3       | S      | —                                                                 | **DONE** — reviewed+APPROVED，分支 `docs/ai-fix-r2-guardrail` @ `7fbecf1b`，**尚未 merge**。新判準從 `router.tsx` 的 `lazyRouteComponent(` 數量推導（正則帶括號，正確排除 import 那行：15 個提及 → **14** 個呼叫），與建出的 `*Route*.js` 比對，且用 `<` 不是 `!==`——route chunk 被切更細是合法的，這個檢查只抓崩潰。反向驗證有做：暫時加第 15 個宣告 → script exit 1 並印出 `FAIL: 15 lazy routes declared but only 14 route chunks built`，還原後 `git status` 乾淨。Reviewer 複驗：script exit 0 報 `14 route chunks for 14 lazy routes`、`npm test` 1505 全過、scope 只 2 檔。⚠️ 執行者抓到**我的計畫自相矛盾**：Step 1 的目標內容刻意保留「45–60」當歷史說明，但我的驗收條件寫 `grep -c "45–60" → 0`。它選擇忠於逐字目標內容並回報矛盾，而不是偷偷改寫散文去騙過 grep——判斷正確。條件已改成 `grep -c "45–60 range" → 0`（斷言消失即可，歷史說明要留）。 |
| 270  | **決定 Prettier 的去留**：`npm run format:check` 在 main 上失敗，**277 / 360 個檔案（77%）**，而且完全沒有強制力——沒有 husky／lint-staged／git hook，`ci.yml` 也沒跑它。分支 A 採用（跑一次 `--write` + `.git-blame-ignore-revs` + 加進 CI，**建議**）／分支 B 移除。**Step 0 需要 operator 決定,不准執行者自己選** | P3       | S–M    | ⏳ 需等 259–268 整批 merge 完（277 檔重排會跟每一條未合分支衝突） | TODO — 等 operator 選 A 或 B                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## 271 — daily_prices 啟動成本 spike（261 否決後的後續，2026-07-25 @ `4473222a`）

| Plan | Title                                  | Priority | Effort | Depends on | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---- | -------------------------------------- | -------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 271  | **量測 spike** — daily_prices 啟動成本 | P2       | M      | —          | **DONE** — reviewed+APPROVED，**已 merge @ `5137462a`**，產出 `docs/daily-prices-startup-spike.md`（零程式碼改動）。**實測（跑真 app、真 profile，非估算）**：fetch **1,833 ms**／payload **17.28 MB**／124,158 列；SQLite 本身只 **~80 ms**；JS 計算 **~11–13 ms**。→ **95.6% 的時間是 Tauri IPC 序列化 + JSON parse**，既不是資料庫也不是數學。這獨立佐證了 Dead End 3（下推 SQL）的否決：就算搬進 SQL 也打不到真瓶頸。發現 `source`／`updated_at` 兩欄無任何消費端讀取，實測拿掉後 **1833→1143 ms（−690 ms）／17.28→12.69 MB**。→ 建議 Option A，已開 plan 273。 |

| Plan | Title                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Priority | Effort | Depends on      | Status |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | --------------- | ------ |
| 272  | 清掉 264 帶出的 8 個 ESLint 10 發現，並補上其中一個暴露出的測試缺口。**四類問題四種修法**：①4 處是 `catch` 內重複賦值害初始值變死碼 → 刪 `catch` 內那行而非刪初始值 ②`fireGoal.ts:66` 所有分支都賦值 → 拿掉初始值，靠 TS definite-assignment 驗證 ③`portfolioMetrics.ts:325` 是 **XIRR bisection solver** 裡的死賦值（已證明：`fhi` 寫於 317、讀於 318，之後永不再讀）→ 刪，**但先補一個能觸發 bisect fallback 的測試**（現有 `calculateXirr` 測試沒有任何一個逼出這條路徑）④2 處重拋錯誤沒帶 `cause` → 補上，**不動繁中文案**。最後把兩條規則從 `warn` 調回 `error` | P3       | S–M    | 264（已 merge） | TODO   |

| Plan | Title                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Priority | Effort | Depends on      | Status |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | --------------- | ------ |
| 273  | **實作 271 的 Option A：啟動路徑只讀 4 個欄位，省 690 ms**。⚠️ **有資料損毀陷阱**：不能直接把兩欄從 `listDailyPrices()` 拿掉——它餵給 `exportSnapshot()`（`repositories.ts:4917`）→ 備份檔 → `importSnapshot()` → `saveDailyPrices()`，而後者是 `price.source \|\| "manual"`，會讓**每次備份還原都把 12.4 萬列的來源改寫成 "manual"**。設計因此是**新增**一個 `listDailyPriceSeries()` 給開機路徑，`listDailyPrices()` 一個字都不動。型別用 `DailyPrice extends DailyPriceSeriesRow` 讓既有呼叫端自動相容，只改**型別註記**、零邏輯 | P1       | M      | 271（已 merge） | TODO   |

### 264 帶出的 8 個新 lint 發現（已降為 warn，待獨立清理）

ESLint 10 的兩條新規則在既有程式碼上抓到 8 處。已設為 `warn` 讓 CI 通過，**發現本身沒有被消音**：

- `no-useless-assignment`（6）：`src/data/demoData.ts:519,524`、`src/domain/fireGoal.ts:66`、
  `src/domain/nlParser.ts:150,162`、`src/domain/portfolioMetrics.ts:325` —— 賦值後未被後續語句使用
- `preserve-caught-error`（2）：`src/data/repositories.ts:2739,2748` —— 重新拋出的錯誤沒帶 `cause`，
  原始錯誤資訊在傳播過程中遺失

後者對除錯有實質影響（sync 路徑上的錯誤鏈被截斷）。兩者都適合一份小的獨立清理計畫，
不該混進依賴升級的 diff 裡。

### 261 否決後**倖存下來**的發現（值得另開計畫）

261 的**修法**被否決了，但它想解決的**問題反而被量測放大了**：

`daily_prices` 有 **124,158 列**，而 `useFinanceData()` 在每次啟動時**無條件全量載入**
（`hooks.ts` 呼叫 `listDailyPrices()` 不帶 filter），整包序列化成 JSON 過 Tauri IPC。
平均每個 ticker 約 1,089 列 ≈ 4.3 年的日線。這仍然是目前最大的單項啟動成本之一。

**收斂 ticker 沒用**（只省 0.2%），**收斂日期會壞掉**（TWR／淨值走勢／報酬歸因都從
`1900-01-01` 走全歷史，`AGENTS.md` 明令不得靜默改動財務數學）。所以正確的方向必須是
第三條路，候選：

1. **把計算下推到 SQL** —— 淨值序列與 TWR 目前是把 12 萬列搬進 JS 再算；改成在 SQLite
   內聚合，跨 IPC 的就只剩結果序列。correctness 不變，搬運量降幾個數量級。
2. **延後而非截斷** —— Dashboard 只為了 data-health 橫幅需要價格，那不是首屏關鍵路徑；
   `dailyPrices` 可以移出開機 bundle，由真正需要的路由觸發。
3. **兩者併用**。

⚠️ 這**不是**「把 261 改一改」——修法完全不同、風險輪廓也不同，應該用新編號另開。

### 262 帶出的兩個新發現（都不是 262 的錯，是既有狀態）

**1. `npm run format:check` 在 main 上本來就是壞的 —— 277 個檔案。**
我在 main（`72fc7a7f`）上親自跑過：`exit=1`，`Code style issues found in 277 files`。
也就是說這個 script 現在沒有人能跑綠，等於**格式閘門是死的**。262 之後變 278
（多了 `src/domain/types.ts`，純粹是 Prettier 3.8.4→3.9.6 對 union type 換行的意見改變，
無功能影響）。我原本在 262 的驗收條件裡寫「`format:check` exits 0」——**那條從一開始就不可能成立，是我沒先驗證**。
條件已改成「比對失敗檔案數，不是比對 exit code」。
→ 值得單獨開一份計畫決定：要嘛跑一次 `prettier --write` 收乾淨並加 pre-commit hook，要嘛把這個 script 拿掉。維持現狀最糟。

**2. chunk 總數 84，超出 `docs/performance-budget.md` **R2** 的 45–60 帶。**
成因是 vite 8.0.16 → 8.1.5（rolldown 換版）把共用 chunk 切得更細。我實際診斷過，**是良性的**：
per-route splitting 完好（14 個 route chunk）、大 vendor 仍然合併（icons 415k / charts 409k / card 218k / react 190k）、
entry chunk 反而從 219k 縮到 **78k**、eager total 從 1,415,111 降到 **1,398,585**。只是多了 19 個 <1kB 的小 chunk。
R2 那條帶當初是為了抓「splitting 崩掉變成 1–2 個 chunk」而寫的，現在對**健康的成長**誤報。
→ R2 的判準該改成表達真正意圖（route chunk 數 ≥ 14、entry graph 不含 charts），而不是卡總數上限。

### 這次考慮過但判定不值得做（別再重審）

- **Phosphor icons chunk 415 kB**：tree-shaking **有**生效（已驗 `Acorn`/`Anchor`/`Alien`
  都不在產物裡），415 kB = 實際用到的約 134 個圖示 × 6 種 weight。而 app **4 種 weight 都在用**
  （regular / bold ×61 / duotone ×42 / fill ×24），砍掉 thin+light 只省約 ⅓，代價是自己維護一個
  Vite plugin。在本機讀檔的 Tauri app 不划算。
- **把 `repositories.ts`（7061 行）拆出 eager chunk**：它在開機關鍵路徑上
  （`getFinanceRepository()` 必須先跑完才有第一次 render），拆出去省不到啟動時間。
  它的**大小**是技術債議題，歸 plan 009，不是啟動效能議題。
- **`serializeDatabase()` 的序列化不要改成平行**：那是刻意的，配合 vendored
  `tauri-plugin-sql` 的 `max_connections(1)`，用來擋 iOS 上的 `db-locked`。260 是讓它**少做事**，
  不是讓它**平行做**。

### 這次沒審的範圍

correctness/bugs、security、test coverage、tech debt/architecture、DX、docs、direction
七類這次**完全沒看**——operator 的要求限縮在效能與升級。`src-tauri/` 的 Rust 程式碼除了
`Cargo.toml` 的 profile 之外沒有審。`worker/` 完全沒碰。
