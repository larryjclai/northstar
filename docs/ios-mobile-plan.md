# iOS 手機版開發計畫與操作 SOP

> 目標：用**免費 Apple ID**把 Northstar 跑在自己的 iPhone 上，逐步優化手機版 UI。
> 不需付費的 Apple Developer Program。

## 免費簽證的限制（先知道）

| 項目 | 限制 |
|---|---|
| 簽證有效期 | **7 天**，到期 app 無法開啟，需重新佈署重簽 |
| App ID 配額 | 每 7 天最多 10 個新 App ID；同一裝置最多 3 個自簽 app |
| iOS 16+ | 裝置須開啟「開發者模式」(設定 → 隱私權與安全性 → 開發者模式) |
| 首次安裝 | 須到 設定 → 一般 → VPN 與裝置管理 信任開發者憑證 |
| 拿不到 | Push 通知、iCloud 等付費 entitlement（Northstar 用不到） |

## 環境（Phase 0，已完成一次性設定）

- Xcode 26.5（完整版）
- CocoaPods 1.16.2（`brew install cocoapods`）
- Rust：**改用 rustup 單一來源**（已移除 Homebrew `rust`）。`cargo` → `~/.cargo/bin`，rustc 1.96
- iOS Rust targets：`aarch64-apple-ios`、`aarch64-apple-ios-sim`、`x86_64-apple-ios`
- iOS Xcode 專案已生成於 `src-tauri/gen/apple/`（bundle id：`app.northstar.finance`）
- `libimobiledevice`（Tauri 自動安裝，實機佈署用）

重建工具鏈（換機時）：
```bash
brew install cocoapods
rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios
npm run tauri ios init    # 若 gen/apple 不存在
```

## 程式碼現況

- **Rust 端已就緒**：`lib.rs` 的 updater 用 `#[cfg(desktop)]` 隔離、`mobile_entry_point` 已加；
  Cargo.toml 的 updater 依賴用 `cfg(not(ios/android))` 排除。
- **導覽 UI 已有手機骨架**：`AppShell.tsx` 已有底部 tab bar、FAB、「更多」sheet、
  `safe-area-inset`、`lg:` 斷點。
- **待處理**：plugin-sql / stronghold 在 iOS 沙盒路徑驗證；逐頁內容 RWD（表格/圖表/表單）。

## 一次性：Xcode 簽署設定（GUI，需手動）

1. 開啟專案：`open src-tauri/gen/apple/northstar.xcodeproj`
2. Xcode → Settings → Accounts → 用 Apple ID 登入（建立 Personal Team）
3. 左側選 `northstar_iOS` target → Signing & Capabilities
   - 勾「Automatically manage signing」
   - Team 選你的 Personal Team
   - Bundle Identifier 保持 `app.northstar.finance`（衝突時改成 `app.northstar.finance.dev`）
4. 裝置端：設定 → 隱私權與安全性 → 開啟「開發者模式」→ 重開機

## Phase 1：模擬器驗證（不需簽證）

```bash
npm run tauri ios dev 'iPhone 17'        # 啟動模擬器並跑
# 或只驗證編譯：
npm run tauri ios build -- --target aarch64-sim --debug
```
驗證重點：啟動成功、SQLite 建立、stronghold salt 建立、基本導覽。

## Phase 2：實機佈署

兩種模式，用途不同：

### A. Dev 模式（開發 UI 用，Mac 必須開著）
前端即時從 Mac 的 Vite dev server 載入，改 code 即時 HMR 到手機。
**那個終端機全程不能關**，關了手機 app 就連不到 → 報「local network」錯誤。
```bash
npm run tauri ios dev          # 終端機保持開著
```

### B. 獨立打包版（前端內嵌，Mac 關了也能跑）← 平常用這個
`tauri ios build` 只產生 IPA，**不會自動安裝**，要手動裝：
```bash
# 1. 打包（前端內嵌，首次 release build 約 10 分鐘）
npm run tauri ios build -- --export-method debugging
# 2. 找裝置 ID
xcrun devicectl list devices
# 3. 安裝（同 bundle id 會覆蓋舊版）
xcrun devicectl device install app --device <裝置ID> \
  src-tauri/gen/apple/build/arm64/Northstar.ipa
```

### 共通
- 首次安裝後：iPhone 設定 → 一般 → VPN 與裝置管理 → 信任憑證
- **7 天重簽**：免費簽證 7 天到期，app 會打不開；重跑對應模式的指令重裝即可
  （想免除這個麻煩 → 付費 Developer $99/年，簽證變 1 年）

## Phase 3：逐頁手機 RWD 優化

順序：Dashboard → 投資 → 現金流 → 帳戶 → 目標 → 設定
重點：表格橫向溢出、recharts 圖表縮放、Dialog 表單在小螢幕可用性、
touch target ≥ 44px、`env(safe-area-inset-*)` 全面套用。

## Phase 4：iOS 細節打磨

App 圖示、LaunchScreen、狀態列樣式、鍵盤遮擋輸入框、捲動慣性、暗色模式。

## 實機 dev 的固定關卡

`tauri ios dev` 連的是 Mac 區網上的 Vite dev server，iOS 會逐一擋下，依序處理：
1. **dev server host**：`vite.config.ts` 已綁 `TAURI_DEV_HOST`（mobile 用區網 IP）。
   桌面維持 localhost。`package.json` 的 `dev` 不可再寫死 `--host`。
2. **本地網路權限**：首次開 app 會問「本地網路」；若沒給，會報
   `did you grant local network permissions?`。到 iPhone 設定 → 隱私權與安全性 →
   本地網路 → 開啟 Northstar，完全關閉 app 再開。
3. **App icon**：iOS icon 與桌面分開。用 `npm run tauri icon src-tauri/icons/source.png`
   （1024² 來源）生成 iOS AppIcon set，下次 build 生效。

## 排錯

**`ld: symbol(s) not found for architecture arm64`（Swift 原生橋接）**
`gen/apple/northstar.xcodeproj` 是 XcodeGen 依 `project.yml` 生成後 **commit 進 repo 的產物**，
之後不會自動重生。所以新增到 `Sources/` 的 Swift 檔（例如 `@_cdecl` 橋接）**不會自己進 Xcode
target**——`project.yml` 雖然寫 `sources: - path: Sources`（重生時會收），但沒人重生。
`FoundationModels.swift` 就是這樣加了兩次、從沒接線，iOS build 壞了一個多月（PR #34 修）。

新增 Swift 檔時，要嘛重跑 XcodeGen，要嘛手動補 `project.pbxproj` 四處：
`PBXFileReference`、`PBXBuildFile`、group 的 `children`、`PBXSourcesBuildPhase` 的 `files`。

兩個連帶陷阱：
- `[lib] crate-type` 含 `cdylib`，而 cdylib 必須在連結當下解析所有符號、等不到 Xcode 的最終
  app link → `build.rs` 對 iOS 加 `-Wl,-undefined,dynamic_lookup`（Xcode 真正吃的是 staticlib，
  那顆 cdylib 是用不到的副產物）。
- iOS 26+ 才有的框架（FoundationModels）在 deployment target 14.0 下必須 weak-link，否則舊系統
  開不起來。設定寫在 `project.yml` 的 `settings.base`（`OTHER_LDFLAGS` / `OTHER_SWIFT_FLAGS`），
  重生 Xcode 專案時才不會掉。

**回歸防護**：`ci.yml` 的 `ios` job 每個 PR 跑 `tauri ios build --target aarch64-sim --debug`。
模擬器 target 走同一條 xcodebuild 連結路徑，但不需簽證/Apple 帳號。當初就是因為所有 CI job 都在
Linux、沒有任何一個碰 Xcode，這個 bug 才會躲一個多月。

**`failed to rename app ... Directory not empty (os error 66)`**
`gen/apple/build/` 有上次的殘留產物（該目錄已 gitignore，CI 從乾淨狀態開始不會遇到）。
`rm -rf src-tauri/gen/apple/build` 後重跑。

**`failed to run 'cargo metadata' ... No such file or directory`**
cargo 不在 PATH，或 rustup proxy（`~/.cargo/bin/rustup`）遺失導致 cargo/rustc 等 shim 連結斷掉。
先確認 `cargo --version`；若失敗但 `~/.rustup/toolchains/` 仍在，補回 proxy 即可（不會重抓 toolchain）：
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path --default-toolchain none
cargo --version   # 應為 1.96.x
```
PATH 由 `~/.zshenv` 的 `. "$HOME/.cargo/env"` 提供；新開終端機即生效。

## 更新策略（待定）

桌面用 updater；iOS 因 7 天重簽本來就會重佈署，暫不需 in-app 更新。
未來若要正式上架再評估 TestFlight / 付費帳號。

## 上架（App Store 送審）

正式上架的準備工作已整理成獨立的送審 dossier：
**[docs/app-store-submission.md](app-store-submission.md)**。

該文件把工作拆成兩階段：

- **Phase A（可先備妥，已完成）**：App Store metadata / ASO 文案（zh-TW 主 + en 次）、
  App Privacy「營養標籤」答案（含無追蹤 SDK 的 grep 佐證）、出口加密合規宣告
  （`ITSAppUsesNonExemptEncryption`）、capability / plugin 稽核（確認 updater 已於 iOS 排除）、
  審查備註（示範模式、release build 不索取本地網路權限）。
- **Phase B（需付費帳號，操作者專屬）**：$99 註冊 → 協議/稅務/銀行 → 建立 app 紀錄
  （bundle id `app.northstar.finance`）→ 從 Personal Team 切換簽署 → TestFlight → 截圖 → 送審。
  同一付費帳號也解鎖 macOS 公證。詳見 dossier 末的 Phase B runbook。
