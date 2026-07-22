# Release Process

> **注意（2026-06）**：repo 已轉為 **public（GPLv3）**，release 直接發布在
> `larryjclai/northstar`，`release.yml` 的 `mirror-to-public` job 已移除
>（`243`，2026-07-20，已完成整併：`tauri.conf.json` 的 fallback endpoint 與本文件
> 過期段落一併清掉）。

Northstar 以 **GitHub Actions release workflow** 為主要發版流程：push `v*` tag 就會自動建置並
發布四個平台（macOS arm64／Intel、Linux、Windows）。

> **沿革（2026-07-16）**：自動觸發是恢復、不是新增。source repo 還是 private 時 Actions 額度
> 有限，因此改成手動 dispatch；2026-06 轉 public 後額度已免費，但沒有跟著改回來，導致每次
> 發版都得手動 dispatch，而 Windows／Linux 產物只有這條路徑產得出來。現已恢復自動。

`scripts/release-local.sh`（本地 macOS build）降為 **CI 不可用時的 fallback**，且**不可**與 CI
同時對同一個 tag 執行——見第 4 步的警告。

## Updater endpoint 現況

本 repo（`larryjclai/northstar`）是 **public**，release assets 可匿名下載，
in-app updater 直接讀本 repo 的 `releases/latest/download/latest.json`
（見 `src-tauri/tauri.conf.json` 的 `endpoints`）。

> **歷史**：早期原始碼 repo 是 private，private repo 的 release assets 無法匿名下載，
> 因此當時需要另一個 public 鏡像 repo `northstar-releases`，由 `mirror-to-public` job
> 把 binaries 與 `latest.json` 複製過去。`d206e2cc`（2026-06-26）在原始碼 repo 轉 public
> 後移除了 mirror job，`243`（2026-07-20）移除了 `tauri.conf.json` 裡最後的 fallback
> endpoint。`northstar-releases` 保留為歷史封存，**不再更新**，請勿再參照它。

- **endpoint 改動只對「之後建置」的版本生效**。現有安裝（binary 內仍烘焙著舊 endpoint
  列表）必須先**手動安裝一次**新 endpoint 的版本，之後才會開始自動更新。

## 版本號格式

採用 semver：`MAJOR.MINOR.PATCH[-PRERELEASE]`

| 範例 | 用途 |
|------|------|
| `0.1.0-alpha.7` | 早期測試版 |
| `0.1.0-beta.1` | 功能完整但待穩定 |
| `0.1.0` | 正式版 |

## 預設流程：本地 macOS release

### 0. 設定 release-only env / assets

公開 source build 預設不帶官方同步 endpoint，也不帶銀行 / 券商 logo。

**同步 endpoint — CI 與本地的來源不同,兩邊都要有:**

- **CI(正式流程)**:`release.yml` 從 repository **variable**（不是 secret）
  `NORTHSTAR_SYNC_WORKER_URL` 注入。設定方式:
  ```bash
  gh variable set NORTHSTAR_SYNC_WORKER_URL --body "https://northstar-sync.larrynote.workers.dev"
  ```
  > ⚠ **歷史教訓（alpha.63–65）**:本文件過去把它誤寫成名為
  > `VITE_NORTHSTAR_SYNC_WORKER_URL` 的 *secret*,而 workflow 實際讀的是上述
  > variable——結果兩邊都沒設,2026-07-16 恢復 CI 自動發版後連續三版官方 build
  > 的同步都是斷的（本地 build 一直正常,因為本機 `.env` 有值,掩蓋了缺口）。
  > variable 已於 2026-07-22 補設;若未來換 relay,兩處(variable + 本機 `.env`)要一起改。

- **本地 build / fallback 腳本**:在本機 `.env` 設定:
  ```bash
  VITE_NORTHSTAR_SYNC_WORKER_URL="https://northstar-sync.larrynote.workers.dev"
  NORTHSTAR_PRIVATE_ASSETS_DIR="private-assets"
  ```

**私有資產（銀行 logo、ETF feed）**:若 `NORTHSTAR_PRIVATE_ASSETS_DIR`（預設 `private-assets/`）內有 `bank/` 資料夾，`npm run build` 會先執行 `scripts/inject-private-assets.mjs`，把 private logos 複製到 `public/bank/` 後再打包。這些檔案被 `.gitignore` 排除，不應 commit。

> ⚠ **已知缺口**:`release.yml` 目前**沒有**任何私有資產注入——CI 建置的官方版本
> **不含銀行 logo 與 ETF sector feed**（只存在於維護者本機的 `private-assets/`）。
> 修復方案見 `plans/249-private-assets-in-ci.md`。

### 1. 確認版本號

五個檔案必須始終保持一致，否則 updater 行為不可預測，或 lockfile 會在下次
install 時產生多餘 diff：

| 檔案 | 欄位 | 說明 |
|------|------|------|
| `package.json` | `"version"` | 來源真值 |
| `package-lock.json` | `"version"` 與 `packages[""].version` | 兩處都要跟著 `package.json`，否則 CI／worktree 的 `npm install` 會把它改回來 |
| `src-tauri/tauri.conf.json` | `"version"` | updater feed 版本 |
| `src-tauri/Cargo.toml` | `version = "..."` | |
| `src-tauri/Cargo.lock` | `name = "northstar"` 的 `version` | 必須跟著 `Cargo.toml` |

### 2. 更新版本號（五檔同步）

```bash
npm run version 0.1.0-alpha.7
```

腳本（`scripts/version-bump.mjs`）會同時更新五個檔案並印出下一步指令。

> **不要改用 `npm version`。** 本 repo 的 `package.json` 把 `"version"` 註冊成 npm script，
> `npm version` 會在更新完 lockfile 後以「無參數」呼叫這支腳本而失敗中止，而且它還會自行
> 產生 commit 與 tag，與下面手動的 commit／tag 流程衝突。

### 3. Commit + Tag + Push

```bash
git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: bump version to 0.1.0-alpha.7"
git tag v0.1.0-alpha.7
git push && git push --tags
```

**推上 tag 就會自動觸發 Release workflow**（2026-07-16 起）。它會在 CI 上建置並簽署四個平台
（macOS arm64／Intel、Linux、Windows），全部上傳完成後才把 draft release 翻成正式版。
到這一步就沒事了，直接跳到第 5 步驗收。

> 建置期間 release 維持 draft，`releases/latest` 仍指向前一版，所以 updater 只會回報
> 「已是最新」，不會拿到只有部分平台的 `latest.json`（v0.1.0-alpha.54 的教訓）。

### 4.（僅在 CI 無法使用時）本地 release 腳本

**一般情況不需要這一步，第 3 步的 CI 已經涵蓋。**

```bash
./scripts/release-local.sh v0.1.0-alpha.7
```

⚠ **不要對 CI 正在建置的 tag 執行這支腳本。** 它會 `gh release edit --draft=false`，在
Windows／Linux 還沒上傳完就把 release 發佈出去——正是第 3 步的 draft 設計要防的那個
partial `latest.json` 問題。只有在 CI 不可用（Actions 掛掉、或只需 mac 的緊急修補）時才用它，
且要確認沒有 CI run 正在跑同一個 tag。

此腳本只產出 macOS（universal），Windows／Linux 仍得靠 CI。

### 5. 確認 release

前往 [northstar Releases](https://github.com/larryjclai/northstar/releases)：

1. 確認該 tag 的 artifacts 都已上傳（`.dmg`、`.msi`、`.exe`、`.deb`、`.AppImage`、各 `.sig`、`latest.json`）
2. 確認它被標為 **Latest**（updater 靠 `releases/latest` 解析）
3. 驗證 updater feed：
   ```bash
   curl -sL https://github.com/larryjclai/northstar/releases/latest/download/latest.json | jq .version
   ```
   應印出剛發布的版本號。

> in-app updater 不需要手動 Publish——release 一建立就生效。

## 補位流程：手動重跑 GitHub Actions release

`Release` workflow 在 push `v*` tag 時已自動涵蓋所有四個平台，正常情況不需要手動觸發。
`workflow_dispatch` 保留下來只給兩種情況用：CI 建置失敗需要重跑，或想對已存在的舊 tag
重新建置。到 GitHub Actions 手動執行 `Release` workflow，輸入 tag（例如
`v0.1.0-alpha.7`）即可。

---

## GitHub Secrets 設定

Repository → Settings → Secrets and variables → Actions：

| Secret 名稱 | 說明 |
|-------------|------|
| `TAURI_SIGNING_PRIVATE_KEY` | minisign 私鑰（`.key` 檔的完整內容） |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 建立私鑰時設定的密碼（若無則留空） |
| `RELEASES_TOKEN` | **已淘汰**——曾用來把 release 推到 public `northstar-releases` mirror repo，mirror job 移除後已無 workflow 使用，應予刪除（operator 待辦，見 `plans/243-retire-releases-mirror-leftovers.md` Step 4） |

> **同步 endpoint 不在 secrets 裡**:它是 repository **variable** `NORTHSTAR_SYNC_WORKER_URL`
> （Settings → Secrets and variables → Actions → **Variables** 分頁),見第 0 步。
> URL 本身是公開資訊,不需要當 secret。

`GITHUB_TOKEN` 由 Actions 自動提供，對 **目前這個 repo** 有寫入權限，足以建立 release，
不需要額外的跨 repo token。

### 如何設定私鑰

1. 開啟你的 `.key` 檔（由 `cargo tauri signer generate` 產生）
2. 複製全部內容（含 `untrusted comment:` 開頭那幾行）
3. 貼到 `TAURI_SIGNING_PRIVATE_KEY` secret

---

## macOS 注意事項

目前**沒有** Apple Developer 帳號，所以 macOS 版本不會經過公證（notarization）。

使用者首次開啟時 macOS 會顯示「無法驗證開發者」警告，解法：
- 右鍵點擊 app → 選「開啟」→ 再次確認開啟
- 或在 Terminal 執行：`xattr -cr /Applications/Northstar.app`

In-app updater 仍可正常運作（更新簽章是 minisign，與 Apple 簽章無關）。

若未來取得 Apple Developer 帳號，在 workflow 加上以下 secrets 即可開啟公證：
`APPLE_CERTIFICATE`、`APPLE_CERTIFICATE_PASSWORD`、`APPLE_SIGNING_IDENTITY`、`APPLE_ID`、`APPLE_PASSWORD`、`APPLE_TEAM_ID`

---

## CI 建置時間估算

| 平台 | 約時 |
|------|------|
| macOS arm64 | ~15 分鐘 |
| macOS x64 | ~15 分鐘 |
| Linux | ~10 分鐘 |
| Windows | ~12 分鐘 |

四個平台**同時**跑，total wall time 約 15–20 分鐘。
