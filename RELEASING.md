# Release Process

> **注意（2026-06）**：repo 已轉為 **public（GPLv3）**，release 直接發布在
> `larryjclai/northstar`，`release.yml` 的 `mirror-to-public` job 與 `RELEASES_TOKEN`
> 已移除。以下提到 private repo、`northstar-releases` mirror、`RELEASES_TOKEN` 的段落為
> 過渡期歷史說明，待現有安裝完成遷移後再整併。

Northstar 目前以**本地 macOS release** 為主要發版流程；GitHub Actions release workflow 保留為**手動 fallback**，不再因為 push `v*` tag 自動觸發。

## 為什麼有兩個 repo？（重要）

app 原始碼這個 repo 是 **private**，而 private repo 的 release assets **無法匿名下載**——
in-app updater 在使用者電腦上沒有 GitHub 憑證，會拿到 404。

所以更新來源放在另一個 **public** repo：[`larryjclai/northstar-releases`](https://github.com/larryjclai/northstar-releases)。
CI 建置後，`mirror-to-public` job 會把 binaries 與 `latest.json` 複製過去，並把
`latest.json` 內的下載網址從 private repo 改寫成 public repo（簽章不變）。

- App 的 updater endpoint（`src-tauri/tauri.conf.json`）指向 public repo 的
  `releases/latest/download/latest.json`。
- 因此 **endpoint 改動只對「之後建置」的版本生效**。現有安裝（仍指向舊 endpoint）
  必須先**手動安裝一次**新 endpoint 的版本，之後才會開始自動更新。

## 版本號格式

採用 semver：`MAJOR.MINOR.PATCH[-PRERELEASE]`

| 範例 | 用途 |
|------|------|
| `0.1.0-alpha.7` | 早期測試版 |
| `0.1.0-beta.1` | 功能完整但待穩定 |
| `0.1.0` | 正式版 |

## 預設流程：本地 macOS release

### 0. 設定 release-only env / assets

公開 source build 預設不帶官方同步 endpoint，也不帶銀行 / 券商 logo。官方 release 前請在本機 `.env` 或 GitHub Actions env 設定：

```bash
VITE_NORTHSTAR_SYNC_WORKER_URL="https://northstar-sync.larrynote.workers.dev"
NORTHSTAR_PRIVATE_ASSETS_DIR="private-assets"
```

若 `NORTHSTAR_PRIVATE_ASSETS_DIR` 內有 `bank/` 資料夾，`npm run build` 會先執行 `scripts/inject-private-assets.mjs`，把 private logos 複製到 `public/bank/` 後再打包。這些檔案被 `.gitignore` 排除，不應 commit。

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

推上 source commit 與 tag 後，版本對應的原始碼就固定下來了；**不會**自動觸發 GitHub Actions release。

### 4. 執行本地 release 腳本

```bash
./scripts/release-local.sh v0.1.0-alpha.7
```

此腳本會：

1. 在本機建置並簽署 universal macOS 版本
2. 產生指向 public repo 的 `latest.json`
3. 建立或更新 public `northstar-releases` 上對應 tag 的 GitHub Release

### 5. 確認 public release

前往 [northstar-releases Releases](https://github.com/larryjclai/northstar-releases/releases)：

1. 確認該 tag 的 artifacts 都已上傳（`.dmg`、`.msi`、`.exe`、`.deb`、`.AppImage`、各 `.sig`、`latest.json`）
2. 確認它被標為 **Latest**（updater 靠 `releases/latest` 解析）
3. 驗證 updater feed：
   ```bash
   curl -sL https://github.com/larryjclai/northstar-releases/releases/latest/download/latest.json | jq .version
   ```
   應印出剛發布的版本號。

> in-app updater 不需要手動 Publish——release 一建立就生效。

## 補位流程：手動 GitHub Actions release

若需要 **Windows / Linux artifacts**，或想改由 CI 重新建置某個既有 tag，可到 GitHub Actions 手動執行 `Release` workflow，輸入 tag（例如 `v0.1.0-alpha.7`）。

- 這個 workflow 現在是 **manual-only**
- 它仍會建 private repo release，並把產物 mirror 到 public `northstar-releases`
- 建議只在真的需要跨平台 artifacts 或重跑既有 release 時使用

---

## GitHub Secrets 設定

Repository → Settings → Secrets and variables → Actions：

| Secret 名稱 | 說明 |
|-------------|------|
| `TAURI_SIGNING_PRIVATE_KEY` | minisign 私鑰（`.key` 檔的完整內容） |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 建立私鑰時設定的密碼（若無則留空） |
| `RELEASES_TOKEN` | 用來把 release 推到 public `northstar-releases` repo 的 token（見下） |
| `VITE_NORTHSTAR_SYNC_WORKER_URL` | 官方 release 使用的 Connect 同步 Worker endpoint；source build 可留空 |

`GITHUB_TOKEN` 由 Actions 自動提供，只對 **目前這個 repo** 有寫入權限，
無法跨 repo 發布，所以 mirror 需要額外的 `RELEASES_TOKEN`。

### 如何建立 `RELEASES_TOKEN`

1. GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → Generate new token
2. **Resource owner**：`larryjclai`；**Repository access**：Only select repositories → 勾選 `northstar-releases`
3. **Permissions** → Repository permissions → **Contents: Read and write**
4. 產生後複製 token，到 **本 repo** 的 Settings → Secrets and variables → Actions
   新增 secret，名稱 `RELEASES_TOKEN`，貼上 token
5. （fine-grained token 有有效期限，到期需重新產生並更新 secret）

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
