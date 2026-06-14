# Repository Cleanup Audit

這份文件整理公開 repo 前，哪些資料夾/檔案可以保留、移除、忽略，並記錄 release repo 是否應改回主專案。

## 結論

- 如果 `larryjclai/northstar` 會改成 public，release 應該可以回到主 repo，不再需要 `larryjclai/northstar-releases` 作為公開鏡像。
- 目前不要立刻改 updater endpoint，除非你已確認主 repo 已公開，且願意讓舊版本使用者手動安裝一次新 endpoint 版本。
- 最大的本機容量不是 Git 內容，而是 build/dependency 產物：`src-tauri/target/`、`node_modules/`、`worker/node_modules/`、`dist/`。
- 公開前最需要處理的已追蹤內容是：`scratch/`、`Design System/uploads/` 的兩張已追蹤截圖、`Design System/.design-canvas.state.json`。

## 不需要上傳 GitHub 的本機產物

這些已被 `.gitignore` 或子目錄 `.gitignore` 忽略，通常可在本機刪除來省空間，之後可重新產生：

| 路徑 | 狀態 | 建議 |
|---|---|---|
| `node_modules/` | ignored | 不上傳。需要時 `npm ci` 重建。 |
| `worker/node_modules/` | ignored | 不上傳。需要時在 `worker/` 內安裝。 |
| `dist/` | ignored | 不上傳。由 `npm run build` 產生。 |
| `src-tauri/target/` | ignored | 不上傳。Rust/Tauri build 產物，容量最大。 |
| `src-tauri/gen/apple/build/` | ignored by `src-tauri/gen/apple/.gitignore` | 不上傳。包含 app archive、provisioning、build 輸出。 |
| `test-results/` | ignored | 不上傳。Playwright/test output。 |
| `.env` | ignored | 不上傳。只保留本機 secrets。 |
| `.DS_Store` | ignored | 不上傳。macOS metadata。 |
| `.github/skills/`、`.claude/skills/` | ignored | 本機工具/skill，不上傳。 |

## 已追蹤但公開前建議移除或確認

| 路徑                                                           | 為什麼要處理                                                       | 建議                                                           | 決策                                                    |
|--------------------------------------------------------------|--------------------------------------------------------------|--------------------------------------------------------------|-------------------------------------------------------|
| `scratch/`                                                   | 暫存 patch/codemod/舊 route copy，沒有 active app reference。公開後會讓 repo 看起來雜，也可能混淆貢獻者。 | 建議從 Git 移除。若還想留參考，先搬到 repo 外的私人 archive。                     | 好的請移除，可以放到 archived 資料夾裡面並加入 ignore list 裡面。          |
| `Design System/uploads/CleanShot 2026-05-28 at 09.37.08@2x.jpg` | 已追蹤截圖，內容像財務交易介面。即使是 mock data，也容易被誤認為真實資料。                   | 建議從 Git 移除；若曾公開過且敏感，需考慮清 Git history。                        | 是假資料，可以從 Git 移除，但不用清 Git History                      |
| `Design System/uploads/CleanShot 2026-06-05 at 23.19.33@2x.jpg` | 已追蹤投資 dashboard 截圖。看起來比較像 mock，但仍應確認可公開。                     | 建議移除或改放正式、可公開的 product screenshot。                           | 是假資料，可以從 Git 移除，但不用清 Git History。                     |
| `Design System/.design-canvas.state.json`                    | 看起來像本機設計工具狀態，不是專案 source。                                    | 建議從 Git 移除並加入 ignore。                                        | 好的，請從 Git 移除並加入 ignore                                |
| `Design System/` 其他 prototype files                          | `DESIGN.md` 已註明早期 prototype 僅供歷史參考，且與實際 app 不同步。             | 若要公開專案乾淨，建議只保留仍被 docs 引用的少量設計稿，或整包移到 private/archive。        | 整包移到 archived 資料夾裡面，然後加入 ignore list。                 |
| `src-tauri/gen/apple/`                                       | iOS generated project 已被 `docs/ios-mobile-plan.md` 引用。不是垃圾，但屬於生成/平台實驗內容。 | 若 iOS 不是近期公開目標，可考慮不公開或移到分支；若要保留，確認沒有 provisioning/build output。 | 先不公開。                                                 |
| `public/bank/*.svg`                                          | 銀行/品牌 logo 可能有商標或素材授權問題。                                     | 公開前確認來源、使用權、商標展示方式；必要時改成使用者自備或簡化圖示。                          | 已改成 release-only private asset injection；公開 source 不追蹤 logo。 |
| `src-tauri/vendor/tauri-plugin-sql/`                         | vendored third-party code。已含 MIT/Apache 授權檔，但會增加維護責任。        | 若必須 patch vendor，可保留並保留 license；若可改回 package/crate dependency，公開 repo 會更乾淨。 | 依照你的建議。                                               |
| `src/features/connect/sync/client.ts` 的 worker URL           | 目前指到公開 Cloudflare Worker URL。                                | 開源前確認 endpoint 有 rate limit、auth、abuse protection，且不暴露私人環境。  | 已改成 build-time env；公開 source build 預設停用同步。               |

### 決策確認

- `scratch/`：可以移到 repo 內的 `archived/` 並加入 ignore，也可以移到 repo 外的私人資料夾。若放在 repo 內且 ignore，GitHub 不會看到；但本機仍會保留。公開 repo 最乾淨的做法是移到 repo 外。
- 兩張 `Design System/uploads/` 截圖：既然確認是假資料，可以只從 Git 移除，不需要清 Git history。公開前仍建議不要把它們留在 tracked files。
- `Design System/.design-canvas.state.json`：可以從 Git 移除並加入 ignore。
- `Design System/`：整包 archived/ignored 可以，但要同步更新或移除引用它的文件，例如 `DESIGN.md` 和 `docs/dashboard-analytics-plan.md`。
- `src-tauri/gen/apple/`：可以先不公開；但 `docs/ios-mobile-plan.md` 目前引用這個資料夾。若移除，文件也要改成「iOS plan 暫不公開」或搬到 private archive。
- `public/bank/*.svg`：已改成 release-only private asset injection。公開 source 不追蹤 logo 檔，`npm run build` 會在 `private-assets/bank/` 存在時複製到 `public/bank/`；沒有 private assets 時，app 退回 generic account markers。
- `src-tauri/vendor/tauri-plugin-sql/`：目前 `src-tauri/Cargo.toml` 有明確 patch 原因，是為了 SQLite single-connection 行為；在改回 upstream dependency 前，建議先保留 vendor，並保留 MIT/Apache notices。
- Worker URL：已改成 `VITE_NORTHSTAR_SYNC_WORKER_URL` build-time env。公開 source build 預設不設定 endpoint，Connect 同步會停用；官方 release 可設定你的 endpoint，自行 build 也可填自己的 endpoint。URL 仍不應被視為秘密，因為它會出現在 official app binary / network request。

## 建議保留

| 路徑 | 理由 |
|---|---|
| `src/` | 主要 app source。 |
| `src-tauri/src/`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` | Tauri app source/config。 |
| `worker/src/`、`worker/migrations/`、`worker/wrangler.jsonc` | 如果要公開同步設計，這些是重要 source；公開前確認環境名稱和 endpoint 策略。 |
| `docs/` | 對開源/公開 beta 有幫助。可刪掉過時 plan，但不急。 |
| `scripts/` | release/version/copy 工具仍被 docs 和 workflow 使用。 |
| `public/bank/` | release-only generated assets。source repo 不追蹤；官方 build 可由 `private-assets/bank/` 注入。 |
| `package-lock.json`、`src-tauri/Cargo.lock`、`worker/package-lock.json` | app lockfiles，建議保留以重現 build。 |

## Release 是否改回 `larryjclai/northstar`

### 現況

目前 release 設計是為了 private source repo：

- `.github/workflows/release.yml` 先在 `larryjclai/northstar` 建 release。
- `mirror-to-public` job 再把 artifacts 複製到 `larryjclai/northstar-releases`。
- `src-tauri/tauri.conf.json` 的 updater endpoint 指向 `northstar-releases`。
- `RELEASING.md` 和 `scripts/release-local.sh` 也都假設 public release repo 是 `northstar-releases`。

### 如果主 repo 會公開

建議改回主 repo release，理由：

- 使用者信任比較直覺：source、tag、release artifact 在同一個 repo。
- 不需要額外 `RELEASES_TOKEN`。
- CI workflow 變簡單，少一個 mirror job 和 URL rewrite。
- issue、release note、checksum、source tag 對得起來。

### 什麼時候改

建議順序：

1. 先清理公開前風險：secrets、tracked screenshots、`scratch/`、license。
2. 把 `larryjclai/northstar` 設為 public。
3. 確認 GitHub release assets 可以匿名下載。
4. 修改 updater endpoint 到主 repo：
   `https://github.com/larryjclai/northstar/releases/latest/download/latest.json`
5. 移除 workflow 的 `mirror-to-public` job、`RELEASES_TOKEN` 文件與 URL rewrite。
6. 發布一版「endpoint migration」release。

重要：Tauri updater endpoint 是打包進 app 的。已安裝舊版的使用者仍會去 `northstar-releases` 找更新。若你關掉 `northstar-releases`，舊版會收不到更新。因此至少要保留 `northstar-releases` 到舊版使用者升級完成，或在那邊也放一個過渡 release。

## 建議清理階段

### Phase 1：公開前必做

- [ ] 決定 `LICENSE`。
- [ ] 輪換曾出現在 `.env` 的 signing password/key。
- [ ] 移除或確認兩張已追蹤 screenshot。
- [ ] 移除 `scratch/` 或移到 private archive。
- [ ] 移除/ignore `Design System/.design-canvas.state.json`。
- [x] 銀行 logo 改為 release-only private asset injection。
- [ ] 確認 vendor license。

### Phase 2：公開後再做

- [ ] 把 release endpoint 改回主 repo。
- [ ] 簡化 GitHub Actions release workflow。
- [ ] 更新 `RELEASING.md` 和 `scripts/release-local.sh`。
- [ ] 保留 `northstar-releases` 一段過渡期，避免舊 app updater 斷掉。
