# Northstar

> 0.1.0-alpha.20 · **試用版**，介面與資料結構仍可能變動，正式發行前資料庫 schema 不保證向後相容。

Northstar 是一個 local-first、隱私優先的個人與家庭財務應用，給想要安靜追蹤投資與現金流、不想把可讀的財務資料交給雲端服務的人使用。

這個分支是 Tauri 重寫版。先前的 SwiftUI / SwiftData 實作保留在 GitHub 分支 `archive/swift-native-before-tauri`。

## 功能總覽

**資產與淨值**
- 多帳戶（銀行 / 現金 / 信用卡 / 貸款 / 投資 / 實體資產），多幣別，依交易當日匯率換算。
- 淨值採對帳式拆解：**資產 − 負債 = 淨值** 恆等，子項（現金、投資、實體資產、負債）為嚴格分拆。
- 主淨值為現金基礎，另列「調整後淨值（含應收應付）」。
- 淨值趨勢線涵蓋歷史投資部位（以當期成本回推），非僅現金。

**投資組合**
- 全程**移動平均成本**；買賣含手續費。
- **XIRR 資金加權年化報酬**（含買賣、配息、手續費），個股與組合層級皆有；另列累積總報酬。
- 已實現損益、配息追蹤。
- 完整交易類型：買 / 賣 / **現金股利** / **股票股利（配股）** / 拆股 / **減資**（現金減資與彌補虧損減資）。
- 報價與匯率透過 Yahoo Finance（Tauri Rust 代理）。

**現金流與對帳**
- 收支記帳、週期性收支與定期定額（定期定股）提醒。
- 信用卡依結帳日切分帳單週期，區分本期**毛消費**與**淨額（退款後）**。
- 應收 / 應付（AR/AP）追蹤。

**目標與 FIRE**
- 退休投影含通膨、費用、累積期/退休後報酬，today（實質）/ nominal（名目）雙模式。
- **三情境（悲觀 / 中性 / 樂觀）成功穩健度**。
- Coast / Lean / Regular / Fat FIRE 試算。
- 退休收入項（勞保 / 年金 / 被動收入），可逐項設定是否隨通膨調整。

**其他**
- local-first：資料存在本機 SQLite，不上雲。
- 隱私遮罩、深 / 淺 / 跟隨系統主題、繁中為主介面。

## 下載 Alpha 版本試用

我們已經開始在 GitHub Releases 提供 Alpha 版本的編譯檔，你可以前往 **[Releases 頁面](https://github.com/larryjclai/northstar/releases)** 下載最新的安裝檔：
- **macOS**: 下載 `.dmg` 檔案，開啟並拖曳至 Applications 即可。*(註：由於尚未經過 Apple 開發者公證，第一次開啟請到「系統設定 -> 隱私權與安全性」中點擊強制打開)*
- **Windows**: (即將支援) 下載 `.msi` 或 `.exe`。

## 技術棧

- Tauri 2（桌面 / 行動端打包）
- React 19 + TypeScript + Vite
- Tailwind CSS v4 · Base UI · Phosphor Icons
- TanStack Router / Query / Table
- Zustand · React Hook Form · Zod · Recharts
- SQLite（透過 `tauri-plugin-sql`）
- Stronghold（vault key 儲存）
- 匯率與報價：Yahoo Finance（透過 Tauri Rust 代理）

---

## 給試用者：本地端快速啟動

### 1. 安裝必備工具

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

### 2. clone & 安裝

```bash
git clone https://github.com/<你的帳號>/northstar.git
cd northstar
npm install
```

第一次 `npm run tauri dev` 會自動編譯 Rust 端，初次冷啟動約 3–8 分鐘，後續會變很快。

### 3. 啟動桌面 App

```bash
npm run tauri dev
```

這會同時啟動 Vite dev server（http://127.0.0.1:5173）與 Tauri 桌面外殼。**這是試用時應該用的指令**，因為只有桌面外殼會啟用 SQLite 與 Yahoo Finance 代理。

### 4. 只跑 Web 版（純前端 / 不寫入 SQLite）

```bash
npm run dev
```

在瀏覽器試用 UI 用的；資料寫入 `localStorage` 而非 SQLite，匯率代理也不可用。回報 bug 請註明你跑的是哪一種。

### 5. 打包桌面 App

```bash
npm run tauri build
```

產物會在 `src-tauri/target/release/bundle/` 下。各平台預設輸出：

- **macOS**：`.app` 與 `.dmg`（未簽章 / 未公證）
- **Windows**：`.msi`（WiX）與 `.exe`（NSIS）（未簽章）
- **Linux**：`.deb`、`.rpm`、`.AppImage`

---

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
```

---

## 資料位置（試用後想清乾淨）

- **桌面版（SQLite + Stronghold）**：`tauri-plugin-sql` 預設把 `northstar.db` 存在 macOS 的 `~/Library/Application Support/app.northstar.finance/`、Windows 的 `%APPDATA%\app.northstar.finance\`、Linux 的 `~/.local/share/app.northstar.finance/`。
- **純 Web 版**：寫在瀏覽器 `localStorage`，key 為 `northstar.browserRepository.v1`。

想重置就刪掉對應位置即可。

---

## 已知限制（alpha）

- Schema 還在演進，資料庫結構變更不保證 migration（必要時請刪掉 `northstar.db` 重來）。
- 匯率 / 報價透過 Yahoo Finance 公開 API，有可能短暫被限流。
- Connect（雲端同步、家庭共享、附件備份）尚未上線。
- 還未做應用簽章與公證：
  - macOS 第一次開啟 release 包要從「系統設定 → 隱私權與安全性」放行。
  - Windows 會跳 SmartScreen「未知發行者」警告，需點「其他資訊 → 仍要執行」。
- **Windows / Linux 支援為「程式碼層級相容」，尚未經過實機驗證**，詳見下方支援計畫。

---

## 平台支援狀態

| 平台 | 開發 (`tauri dev`) | 打包 (`tauri build`) | CI 驗證 | 簽章 |
|---|---|---|---|---|
| macOS (Apple Silicon) | ✅ 主力開發環境 | ✅ `.app` / `.dmg` | ❌ | ❌ |
| macOS (Intel) | ⚠️ 未驗證 | ⚠️ 未驗證 | ❌ | ❌ |
| **Windows 10/11 (x64)** | ⚠️ 未驗證 | ⚠️ 未驗證 | ❌ | ❌ |
| Linux (x64) | ⚠️ 未驗證 | ⚠️ 未驗證 | ❌ | — |
| iOS / Android | ❌ 尚未啟用 | ❌ | ❌ | ❌ |

---

## Windows 支援計畫

Northstar 的 Rust 依賴與前端棧都跨平台，**理論上在 Windows 可直接跑**，但 macOS 以外從未有人實際建置與測試。下面是讓 Windows 變成第一級支援平台的步驟。

### 階段 1 — 本機驗證（必要）

目的：證明在 Windows 機器上能 dev / build / 跑得起來。

1. 在 Windows 10/11 (x64) 機器準備環境：
   - [Node.js 20 LTS](https://nodejs.org/)
   - [Rust stable (rustup)](https://rustup.rs/)
   - **Microsoft Visual Studio Build Tools 2022**（勾選「使用 C++ 的桌面開發」）— Tauri Rust 編譯必備
   - **WebView2 Runtime**（Win11 內建；Win10 可能要手動裝 [Evergreen Bootstrapper](https://developer.microsoft.com/microsoft-edge/webview2/)）
   - 啟用 **Developer Mode**（避免 symlink 權限問題）
2. clone repo → `npm install` → `npm run tauri dev`
3. 驗收項目：
   - [ ] App 視窗能開
   - [ ] SQLite 寫到 `%APPDATA%\app.northstar.finance\northstar.db`
   - [ ] Stronghold vault 能初始化（Windows 上 `tauri-plugin-stronghold` 走 `%APPDATA%` 路徑，需確認權限）
   - [ ] Yahoo Finance 匯率 / 報價刷新成功（reqwest TLS）
   - [ ] CSV 匯入 / 匯出檔案對話框正常（路徑分隔字元）
   - [ ] `npm run tauri build` 產出 `.msi` 與 `.exe`，安裝後可開啟
4. 把過程踩到的 bug 開成 issue，標籤 `platform:windows`。

### 階段 2 — CI 自動建置

目的：避免後續開發在不知情下打破 Windows。

1. 新增 `.github/workflows/build.yml`，採用 [tauri-action](https://github.com/tauri-apps/tauri-action) 的 matrix：
   - `macos-latest`
   - `windows-latest`
   - `ubuntu-22.04`
2. PR 觸發：只跑 `npm run build` + `cargo check`（快）。
3. push 到 `main` / tag：完整 `tauri build`，把 artifact 上傳。
4. 加上 cache（`actions/cache` for `~/.cargo` 與 `src-tauri/target`），不然 Windows runner 會很慢。

### 階段 3 — Installer 選型與設定

Tauri 在 Windows 預設同時產出 MSI（WiX）與 NSIS。決策：

- **建議**：保留兩種，預設推 **NSIS**（檔案較小、升級行為較友善、可寫 per-user）；MSI 留給未來企業部署。
- 在 `tauri.conf.json` `bundle.windows` 加 NSIS 設定（安裝模式、language、installer icon）。
- 確認 `app.northstar.finance` 這個 identifier 作為 Windows AppUserModelID 沒問題。

### 階段 4 — Code Signing

未簽章的 Windows installer 會跳 SmartScreen 警告，alpha 階段可接受，但 0.2 之前要解決：

- 選項 A：買 **OV code signing 憑證**（~USD 200/年，要累積 reputation 才會繞過 SmartScreen）
- 選項 B：**EV code signing 憑證**（~USD 400/年，立刻被 SmartScreen 信任，但需要硬體 token / cloud HSM）
- 把簽章流程整進 CI（GitHub Actions secret + `signtool`），讓 release artifact 自動簽。

### 階段 5 — 發行通道

- 用 GitHub Releases 掛 Windows / macOS artifact，並透過 [tauri-plugin-updater](https://v2.tauri.app/plugin/updater/) 接 auto-update（需要再加一支簽章金鑰）。
- README 補上 Windows 下載連結與第一次執行的 SmartScreen 指引。

### 不在這個計畫內

- ARM64 Windows（等 0.3 再考慮）
- Microsoft Store 上架（要先做 MSIX 與 partner center 帳號）
- 自動 crash report（屬於整體 telemetry 規劃，不限 Windows）

---

## 回報問題

請開 GitHub Issue，盡量附上：
- 你跑的是 `npm run tauri dev` 還是 `npm run dev`
- 作業系統與版本
- 重現步驟、預期行為、實際行為
- 如果跟資料庫有關，附上 console 錯誤訊息

---

## 架構文件

- [Product spec](docs/product-spec.md)
- [Architecture](docs/architecture.md)
- [Roadmap](ROADMAP.md)
