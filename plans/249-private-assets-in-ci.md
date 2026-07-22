# Plan 249: 讓 CI release 帶上私有資產(銀行 logo + ETF feed)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command. On any STOP condition, stop and report. Do NOT update
> `plans/README.md`. **Step 0 是 operator-only 決策與操作,執行者不可代勞。**
>
> **Drift check (run first)**:
> `git diff --stat <Planned-at SHA>..HEAD -- .github/workflows/release.yml scripts/inject-private-assets.mjs package.json`
> 與 excerpt 不符 = STOP。

## Status

- **Priority**: P2(官方 CI build 自 alpha.63 起缺銀行 logo 與 ETF sector feed —— 使用者可見的體驗降級,但功能不壞)
- **Effort**: M(含一支新腳本、workflow 改動、operator 一次性設定)
- **Risk**: MEDIUM(動 release workflow;錯了會壞掉發版 —— 有明確驗收步驟)
- **Depends on**: 無(但發版驗收需要一次真的 release 或 workflow_dispatch 重建)
- **Category**: release infrastructure
- **Planned at**: 待 executor 以 `git rev-parse --short HEAD` 確認(本計劃寫於 alpha.66 發版當日,2026-07-22)

## Why this matters

`npm run build` 的 `prebuild` 會執行 `scripts/inject-private-assets.mjs`,從
gitignored 的 `private-assets/`(僅存在於維護者本機,**1.1MB、13 檔**:`bank/*.svg`
+ `etf/etf-sector-feed.json`)複製到 `public/`。`release.yml` **完全沒有**對應的
注入步驟(`grep -c "PRIVATE_ASSETS" .github/workflows/release.yml` → 0),所以
2026-07-16 恢復 CI 自動發版後,所有官方 build 都不含銀行 logo 與 ETF feed;
本地 fallback build 一直正常,掩蓋了缺口。與 alpha.63–65 的同步 endpoint 斷線
(已修,見 RELEASING.md §0 的歷史教訓)是同一類「CI 環境未按 §0 配置」問題。

## 方案決策(operator 已知的約束)

- **base64-in-secret 出局**:資產 1.1MB,GitHub secret 上限 64KB。
- **候選 A(推薦):加密封存檔進本 repo。** `tar.gz`(SVG 壓縮後估 ~200–400KB)
  以 `openssl enc -aes-256-cbc -pbkdf2` 加密成 `private-assets.tar.gz.enc`
  commit 進 repo;通行片語放 secret `PRIVATE_ASSETS_KEY`。CI 解密→解壓→照常
  prebuild。優點:單一 repo、單一 secret、無新 PAT、任何未來機器 clone 後解密
  即可重建 `private-assets/`。缺點:logo 更新時要重跑一次加密腳本。
  (logo 是第三方商標,加密的目的是**避免公開再散布**,不是機密防護 —— 強度足夠。)
- **候選 B:私有 repo `northstar-private-assets` + deploy key/PAT checkout。**
  優點:更新 logo 是普通 git 流程。缺點:多一個 repo + 一組長期憑證(repo 才剛
  在 243 清掉一個閒置 PAT,增加憑證與其管理負擔與方向相反)。

## Step 0(operator-only)— 選定方案

**STOP GATE**:執行者開工前,operator 必須在此二選一並告知。以下 Steps 以
**候選 A** 撰寫;若 operator 選 B,本計劃需改寫(STOP 回報)。

## Steps(候選 A)

1. **新增 `scripts/pack-private-assets.sh`**(operator 本機用,重新打包時執行):

   ```bash
   #!/usr/bin/env bash
   # Re-encrypt private-assets/ into private-assets.tar.gz.enc (plan 249).
   # Run after changing any bank logo / etf feed. Requires PRIVATE_ASSETS_KEY env.
   set -euo pipefail
   cd "$(dirname "$0")/.."
   : "${PRIVATE_ASSETS_KEY:?set PRIVATE_ASSETS_KEY}"
   tar -czf private-assets.tar.gz private-assets
   openssl enc -aes-256-cbc -pbkdf2 -salt -in private-assets.tar.gz \
     -out private-assets.tar.gz.enc -pass env:PRIVATE_ASSETS_KEY
   rm private-assets.tar.gz
   echo "wrote private-assets.tar.gz.enc ($(du -h private-assets.tar.gz.enc | cut -f1))"
   ```

2. **新增 `scripts/unpack-private-assets.sh`**(CI 與新機器用):

   ```bash
   #!/usr/bin/env bash
   # Decrypt private-assets.tar.gz.enc back into private-assets/ (plan 249).
   set -euo pipefail
   cd "$(dirname "$0")/.."
   : "${PRIVATE_ASSETS_KEY:?set PRIVATE_ASSETS_KEY}"
   [ -f private-assets.tar.gz.enc ] || { echo "no encrypted archive; skipping"; exit 0; }
   openssl enc -d -aes-256-cbc -pbkdf2 -in private-assets.tar.gz.enc \
     -out private-assets.tar.gz -pass env:PRIVATE_ASSETS_KEY
   tar -xzf private-assets.tar.gz && rm private-assets.tar.gz
   echo "unpacked private-assets/ ($(find private-assets -type f | wc -l | tr -d ' ') files)"
   ```

   兩支都 `chmod +x`。`.gitignore` 已排除 `private-assets/`,**不要**排除
   `private-assets.tar.gz.enc`(它就是要 commit 的);**要**加 `private-assets.tar.gz`
   (中間產物)進 `.gitignore`。

3. **`release.yml`**:在 tauri-action build step **之前**加一個解密 step
   (Linux/macOS/Windows 三平台 runner 都要跑到 —— 放在共用的 build job 內,
   tauri-action 那個 step 的正上方;Windows runner 用 `shell: bash`):

   ```yaml
   - name: Unpack private assets (bank logos + etf feed)
     if: env.PRIVATE_ASSETS_KEY != ''
     shell: bash
     env:
       PRIVATE_ASSETS_KEY: ${{ secrets.PRIVATE_ASSETS_KEY }}
     run: ./scripts/unpack-private-assets.sh
   ```

   注意 fork/無 secret 的 source build:`if:` 守門讓它靜默跳過,行為與現在相同。

4. **operator 一次性操作**(執行者在報告中列為待辦,不可代勞):
   - 產生一組強通行片語,存進 repo secret `PRIVATE_ASSETS_KEY`,並存入自己的
     密碼管理器。
   - 本機跑 `PRIVATE_ASSETS_KEY=… ./scripts/pack-private-assets.sh`,commit
     `private-assets.tar.gz.enc`。
   - 下一次發版(或對既有 tag `workflow_dispatch` 重建)驗收。

5. **RELEASING.md**:§0 的「已知缺口」警告塊改為指向新流程(pack/unpack 腳本
   + `PRIVATE_ASSETS_KEY` secret),secrets 表新增 `PRIVATE_ASSETS_KEY` 一列。

## Boundaries

- 只碰:`scripts/pack-private-assets.sh`(新)、`scripts/unpack-private-assets.sh`(新)、
  `.github/workflows/release.yml`(單一新增 step)、`.gitignore`(一行)、`RELEASING.md`。
- **不碰**:`scripts/inject-private-assets.mjs`(prebuild 邏輯不變 —— 解密後
  `private-assets/` 存在,它照常工作)、`private-assets/` 內容本身、tauri 設定。
- **絕不**把未加密的資產 commit 進 repo;**絕不**在任何輸出中印出通行片語。

## Verification

- **Mechanical**(執行者可做):
  - `bash -n scripts/pack-private-assets.sh scripts/unpack-private-assets.sh` → 語法 0 錯。
  - 本機 round-trip:`PRIVATE_ASSETS_KEY=test ./scripts/pack-private-assets.sh` →
    把 `private-assets/` 改名暫存 → `PRIVATE_ASSETS_KEY=test ./scripts/unpack-private-assets.sh`
    → `diff -r` 原目錄與解出目錄 → 零差異 → 還原、刪除測試產物。
  - `npx tsc --noEmit`、`npm test`、`npm run lint` → 全綠(不應有任何影響)。
  - workflow 語法:`gh workflow view Release` 或 actionlint(若有)。
- **Operator 驗收**(發版後):
  - CI build 的 app 裡銀行 logo 正常顯示(帳戶頁任一台灣銀行帳戶)。
  - fork/無 secret 情境:對一個沒有 secret 的分支跑 build,解密 step 顯示 skipped。

## STOP conditions

- Operator 未完成 Step 0 的方案選擇 → STOP。
- `release.yml` 的 build job 結構與 excerpt 認知不符(找不到 tauri-action step
  的單一插入點,或三平台是分開的 job 各自需要插入)→ STOP 回報實際結構。
- 任何步驟會導致未加密資產進入 git 歷史 → STOP。

## Maintenance notes

- logo 或 ETF feed 更新後,operator 必須重跑 `pack-private-assets.sh` 並 commit
  新的 `.enc` —— 忘了的話 CI 會繼續用舊資產(不會壞,只是舊)。可考慮日後加一個
  CI 檢查:比對 `.enc` 的 mtime/hash 與 `private-assets/` 是否落後(本機 hook)。
- 若未來資產長大很多(>10MB),重新評估候選 B。
- `PRIVATE_ASSETS_KEY` 遺失 = 只能從維護者本機的 `private-assets/` 重新打包
  (資產本體不會丟,只是 `.enc` 要重做)。
