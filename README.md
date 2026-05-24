# Northstar

> 0.1.0-alpha.1 · **試用版**，介面與資料結構仍可能變動，正式發行前資料庫 schema 不保證向後相容。

Northstar 是一個 local-first、隱私優先的個人與家庭財務應用，給想要安靜追蹤投資與現金流、不想把可讀的財務資料交給雲端服務的人使用。

這個分支是 Tauri 重寫版。先前的 SwiftUI / SwiftData 實作保留在 GitHub 分支 `archive/swift-native-before-tauri`。

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
| Node.js | 20 LTS 以上 | 建議用 `nvm` 安裝 |
| npm | 隨 Node 安裝 | |
| Rust | stable 1.77+ | `rustup` 安裝即可，Tauri 需要 |
| Xcode CLT（macOS） | 最新 | `xcode-select --install` |
| WebView2（Windows） | 最新 | Win10/11 通常已內建 |
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

產物會在 `src-tauri/target/release/bundle/` 下。macOS 預設輸出 `.app` 與 `.dmg`，未簽章。

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
- 還未做應用簽章與公證，macOS 第一次開啟 release 包要從「系統設定 → 隱私權與安全性」放行。

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
