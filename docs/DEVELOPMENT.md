# Northstar — 開發文件

給想在本機建置、測試或打包 Northstar 的開發者。使用者導向的介紹請見 [README](../README.md)。

## 技術棧

- Tauri 2（桌面 / 行動端打包）
- React 19 + TypeScript + Vite
- Tailwind CSS v4 · Base UI · Phosphor Icons
- TanStack Router / Query
- Zustand · Recharts
- SQLite（透過 `tauri-plugin-sql`）
- Stronghold（機密儲存：vault key／裝置金鑰對／同步帳號；web shell 以 localStorage 備援，既有安裝首次存取時遷移）
- 匯率與報價：Yahoo Finance（透過 Tauri Rust 代理）

> 這個分支是 Tauri 重寫版。先前的 SwiftUI / SwiftData 實作保留在 GitHub 分支 `archive/swift-native-before-tauri`。

## 1. 安裝必備工具

| 工具 | 版本 | 備註 |
|---|---|---|
| Node.js | 20 LTS 以上 | 建議用 `nvm`（macOS/Linux）或 `nvm-windows` 安裝 |
| npm | 隨 Node 安裝 | |
| Rust | stable 1.77+ | `rustup` 安裝即可，Tauri 需要 |
| Xcode CLT（macOS） | 最新 | `xcode-select --install` |
| MSVC Build Tools（Windows） | 2022 | 安裝「使用 C++ 的桌面開發」工作負載 |
| WebView2（Windows） | 最新 | Win11 內建；Win10 可能要手動裝 Evergreen Bootstrapper |
| `libwebkit2gtk-4.1`（Linux） | 最新 | Tauri 2 需要 |

詳見 [Tauri 環境需求](https://v2.tauri.app/start/prerequisites/)。

## 2. clone & 安裝

```bash
git clone https://github.com/<你的帳號>/northstar.git
cd northstar
npm install
```

第一次 `npm run tauri dev` 會自動編譯 Rust 端，初次冷啟動約 3–8 分鐘，後續會變很快。

## 3. 啟動桌面 App（推薦）

```bash
npm run tauri dev
```

這會同時啟動 Vite dev server（http://127.0.0.1:5173）與 Tauri 桌面外殼。**開發時應該用這個指令**，因為只有桌面外殼會啟用 SQLite 與 Yahoo Finance 代理。

## 4. 只跑 Web 版（純前端 / 不寫入 SQLite）

```bash
npm run dev
```

在瀏覽器試用 UI 用的；資料寫入 `localStorage` 而非 SQLite，匯率代理也不可用。回報 bug 請註明你跑的是哪一種。

## 5. 打包桌面 App

```bash
npm run tauri build
```

產物會在 `src-tauri/target/release/bundle/` 下。各平台預設輸出：

- **macOS**：`.app` 與 `.dmg`（未簽章 / 未公證）
- **Windows**：`.msi`（WiX）與 `.exe`（NSIS）（未簽章）
- **Linux**：`.deb`、`.rpm`、`.AppImage`

## 常用指令

```bash
npm run dev              # 純前端 dev server
npm run build            # tsc + vite build（前端產物到 dist/）
npm test                 # 跑 Vitest 單元測試
npm run test:watch       # watch 模式
npm run test:e2e         # Playwright e2e（需要先 npm run dev）
npm run check:tauri      # cargo fmt --check + cargo check
npm run tauri dev        # 啟動 Tauri 桌面 App（推薦）
npm run tauri build      # 打包桌面 App
npm run copy:export      # 匯出 UI 文案到 copy.csv（翻譯用）
npm run copy:import      # 把 copy.csv 匯回 translation.json
```

### Release-only assets and sync endpoint

Public source builds intentionally do not include the official Connect sync endpoint or bundled bank / broker logo assets.

- Set `VITE_NORTHSTAR_SYNC_WORKER_URL` at build time to enable Connect sync for an official build.
- Put private logo files in `private-assets/bank/` before `npm run build` if the official build should bundle bank logos.
- `npm run build` runs `scripts/inject-private-assets.mjs` first. If no private assets are present, the build continues and the app falls back to generic account markers.

## 發行流程

版本號集中在三個檔案（`package.json` / `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml`），用腳本一次更新：

```bash
npm run version 0.1.0-alpha.29        # 同步三個檔案的版本號
# 在 CHANGELOG.md 增加該版本的 What's new
git add -A && git commit -m "chore(release): v0.1.0-alpha.29"
git tag v0.1.0-alpha.29
git push && git push --tags           # tag push 觸發 .github/workflows/release.yml
```

`release.yml` 會在各平台 `tauri build`，直接在本 repo（public）建立 Release，產物（含簽章與
`latest.json`）供 App 內自動更新抓取——不再鏡像到 `northstar-releases`（該 repo 已淘汰，見
`RELEASING.md`）。

## 資料位置（清除測試資料）

- **桌面版（SQLite + Stronghold）**：`tauri-plugin-sql` 預設把 `northstar.db` 存在 macOS 的 `~/Library/Application Support/app.northstar.finance/`、Windows 的 `%APPDATA%\app.northstar.finance\`、Linux 的 `~/.local/share/app.northstar.finance/`。
- **純 Web 版**：寫在瀏覽器 `localStorage`，key 為 `northstar.browserRepository.v1`。

想重置就刪掉對應位置即可。

## 平台支援狀態

| 平台 | 開發 (`tauri dev`) | 打包 (`tauri build`) | CI 驗證 | 簽章 |
|---|---|---|---|---|
| macOS (Apple Silicon) | ✅ 主力開發環境 | ✅ `.app` / `.dmg` | ✅ | ❌ |
| macOS (Intel) | ⚠️ 未驗證 | ✅ CI | ✅ | ❌ |
| Windows 10/11 (x64) | ⚠️ 未驗證 | ✅ CI | ✅ | ❌ |
| Linux (x64) | ⚠️ 未驗證 | ✅ CI | ✅ | — |
| iOS / Android | ⚠️ 實驗 | ⚠️ | ❌ | ❌ |

> **兩條 CI pipeline 別混淆：**
> - **日常把關 `ci.yml`**（每次 push / PR 觸發，Linux runner）：**lint → `tsc` → 單元測試（Vitest）→ 前端 `npm run build` → `cargo check`（`check:tauri`）→ worker 測試 → Playwright e2e**。這是每次改動的關卡，但**不做**跨平台 `tauri build` 打包。
> - **`release.yml`**（tag push 觸發）：對 macOS（arm64 / x64）、Windows、Linux 做 **matrix `tauri build` 打包**；但 macOS 以外尚未經過完整實機功能驗證。
>
> 下表「CI 驗證」欄指的是 `release.yml` 的打包矩陣（能否在該平台 build 出安裝檔），與日常 `ci.yml` 的程式碼把關是不同的 pipeline。Windows 第一級支援的逐步計畫（本機驗證 → CI → installer 選型 → code signing → 發行通道）見下。

## Windows 第一級支援計畫

Northstar 的 Rust 依賴與前端棧都跨平台，理論上在 Windows 可直接跑，但 macOS 以外尚未有人實際完整驗證。

### 階段 1 — 本機驗證
在 Windows 10/11 (x64) 準備環境（Node 20 LTS、Rust stable、VS Build Tools 2022「使用 C++ 的桌面開發」、WebView2、啟用 Developer Mode），`npm install` → `npm run tauri dev`，逐項驗收：
- [ ] App 視窗能開
- [ ] SQLite 寫到 `%APPDATA%\app.northstar.finance\northstar.db`
- [ ] Stronghold vault 能初始化
- [ ] Yahoo Finance 匯率 / 報價刷新成功
- [ ] CSV 匯入 / 匯出檔案對話框正常
- [ ] `npm run tauri build` 產出 `.msi` 與 `.exe`，安裝後可開啟

### 階段 2 — Installer 選型
Tauri 在 Windows 預設同時產出 MSI（WiX）與 NSIS。建議保留兩種，預設推 NSIS（檔案較小、升級友善、可寫 per-user）；MSI 留給未來企業部署。

### 階段 3 — Code Signing
未簽章的 Windows installer 會跳 SmartScreen 警告。0.2 之前要解決：
- 選項 A：OV code signing 憑證（~USD 200/年，需累積 reputation）
- 選項 B：EV code signing 憑證（~USD 400/年，立即被信任，需硬體 token / cloud HSM）
- 把簽章流程整進 CI。

### 不在此計畫內
ARM64 Windows、Microsoft Store（MSIX）、自動 crash report（屬整體 telemetry 規劃）。
```
