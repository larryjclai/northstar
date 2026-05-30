# Release Process

Northstar 使用 GitHub Actions 自動發布多平台桌面版本。觸發條件是 push 一個 `v*` tag。

## 版本號格式

採用 semver：`MAJOR.MINOR.PATCH[-PRERELEASE]`

| 範例 | 用途 |
|------|------|
| `0.1.0-alpha.7` | 早期測試版 |
| `0.1.0-beta.1` | 功能完整但待穩定 |
| `0.1.0` | 正式版 |

## 發布步驟

### 1. 確認版本號

三個檔案必須始終保持一致，否則 updater 行為不可預測：

| 檔案 | 欄位 |
|------|------|
| `package.json` | `"version"` |
| `src-tauri/tauri.conf.json` | `"version"` |
| `src-tauri/Cargo.toml` | `version = "..."` |

### 2. 更新版本號（三檔同步）

```bash
npm run version 0.1.0-alpha.7
```

腳本會同時更新三個檔案並印出下一步指令。

### 3. Commit + Tag + Push

```bash
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "chore: bump version to 0.1.0-alpha.7"
git tag v0.1.0-alpha.7
git push && git push --tags
```

Push tag 後，GitHub Actions 會自動在 macOS (arm64 + x64)、Windows、Linux 四個環境各 build 一次，完成後建立一個 **Draft Release**。

### 4. 確認 Draft Release

前往 [GitHub Releases](https://github.com/larryjclai/northstar/releases)：

1. 確認 artifacts 都已上傳（`.dmg`、`.msi`、`.exe`、`.deb`、`.AppImage`、`latest.json`）
2. 視需要編輯 release notes
3. 點擊 **Publish release**（發布後 in-app updater 才能偵測到新版本）

---

## GitHub Secrets 設定

Repository → Settings → Secrets and variables → Actions：

| Secret 名稱 | 說明 |
|-------------|------|
| `TAURI_SIGNING_PRIVATE_KEY` | minisign 私鑰（`.key` 檔的完整內容） |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 建立私鑰時設定的密碼（若無則留空） |

`GITHUB_TOKEN` 由 Actions 自動提供，不需手動設定。

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
