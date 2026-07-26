# Plan 243: 清掉 northstar-releases 鏡像的遺留物(死 endpoint、過期文件、閒置 PAT)

> **Executor instructions**: Follow step by step; verify each. Do NOT update
> `plans/README.md`. **Step 4 is operator-only — do NOT attempt it yourself.**
>
> **Drift check**: `git diff --stat 16d5ed7c..HEAD -- src-tauri/tauri.conf.json RELEASING.md .github/workflows/release.yml`

## Status

- **Priority**: P3 · **Effort**: S · **Risk**: LOW-MED（動到 updater 設定;
  錯了會讓使用者收不到更新——見 STOP 條件）
- **Depends on**: none
- **Category**: tech-debt / docs / security hygiene
- **Planned at**: commit `16d5ed7c`, 2026-07-20

## Why this matters

2026-06-26 的 `d206e2cc`（"ci(release): drop obsolete northstar-releases mirror;
publish direct on public repo"）把鏡像機制移除了——因為 `larryjclai/northstar`
已轉為 **PUBLIC**，private repo 無法匿名下載的原始理由消失，release 直接發在本
repo 即可。那次清理只改了 `release.yml` 與 `RELEASING.md` 的一部分，**遺留三樣
東西**，在 2026-07-20 的 alpha.64 發布過程中被發現：

1. **`tauri.conf.json` 的第二個 updater endpoint 是死的** —— 指向
   `northstar-releases`，該 repo 最後更新停在 `2026-06-26`（alpha.44），比現在落後
   約 20 個版本。
2. **`RELEASING.md` 開頭整節「為什麼有兩個 repo？（重要）」已過期** —— 它仍宣稱
   「app 原始碼這個 repo 是 **private**」，並描述已不存在的 `mirror-to-public` job。
   任何照著這份文件操作的人（或 agent）都會被誤導。
3. **`RELEASES_TOKEN` secret 仍存在**（建立於 `2026-06-02`）—— 一個對
   `northstar-releases` 具 **Contents: Read and write** 權限的 fine-grained PAT，
   現在沒有任何 workflow 使用它。閒置且具寫入權的憑證是不必要的暴露面。

死 endpoint **今天沒有立即危害**（Tauri 依序嘗試，第一個就成功，永遠不會走到第二個;
且 Tauri 只在 feed 版本**較新**時才更新，所以就算 fallback 回傳 alpha.44 也不會把人
降版）。但它是個會誤導人的死參照，且在第一個 endpoint 暫時失效時，會讓舊版使用者拿到
alpha.44 而不是最新版。

## Current state

- `src-tauri/tauri.conf.json:61-64`：
  ```json
  "endpoints": [
    "https://github.com/larryjclai/northstar/releases/latest/download/latest.json",
    "https://github.com/larryjclai/northstar-releases/releases/latest/download/latest.json"
  ]
  ```
- `RELEASING.md:18-31`：整節「## 為什麼有兩個 repo？（重要）」，含
  「app 原始碼這個 repo 是 **private**」與 `mirror-to-public` job 的描述。
- `RELEASING.md` 另有「### 如何建立 `RELEASES_TOKEN`」一節（約 :149-155，用
  `grep -n 'RELEASES_TOKEN' RELEASING.md` 定位全部出現處）與「## GitHub Secrets
  設定」中的相關列。
- `.github/workflows/release.yml`：已無任何 `northstar-releases` / mirror 參照
  （`grep` 驗證過）——**不要動這個檔案**。
- 事實佐證（本計畫撰寫時實測）：`gh repo view larryjclai/northstar --json visibility`
  → `PUBLIC`；`gh release list` → 本 repo 的 `v0.1.0-alpha.64` 為 `Latest`；
  `gh repo view larryjclai/northstar-releases` → `PUBLIC`，`pushedAt 2026-06-26`。

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | 0 |
| Lint | `npm run lint` | 0 errors / 761 warnings |
| Tests | `npm test` | 1454 pass |
| Tauri config | `npm run check:tauri` | pass |

## Scope

**In scope**：`src-tauri/tauri.conf.json`（只動 `endpoints` 陣列）、`RELEASING.md`。
**Out of scope**：`.github/workflows/release.yml`（已乾淨）、`updater.pubkey`
（**絕對不要動**——換了簽章金鑰會讓所有現有安裝再也無法驗證更新）、
`northstar-releases` repo 本身（保留為歷史封存;不要刪、不要改）、
版本號與 CHANGELOG。

## Steps

### Step 1：移除死 endpoint

`src-tauri/tauri.conf.json` 的 `endpoints` 陣列改為只留第一個：

```json
"endpoints": [
  "https://github.com/larryjclai/northstar/releases/latest/download/latest.json"
]
```

**不要**改 `pubkey`、不要改陣列以外的任何欄位。

**Verify**：`npm run check:tauri` → pass;
`grep -c 'northstar-releases' src-tauri/tauri.conf.json` → `0`。

### Step 2：改寫 RELEASING.md 的過期段落

把「## 為什麼有兩個 repo？（重要）」整節替換為一段簡短的現況說明，語氣與檔案其餘
部分一致（zh-TW）。內容要點：

- 本 repo（`larryjclai/northstar`）是 **public**，release assets 可匿名下載，
  in-app updater 直接讀本 repo 的 `releases/latest/download/latest.json`。
- 歷史註記：曾經因為原始碼 repo 是 private 而需要 `northstar-releases` 這個公開
  鏡像;`d206e2cc`（2026-06-26）已移除鏡像 job，`243`（2026-07-20）移除最後的死
  endpoint。**`northstar-releases` 保留為歷史封存，不再更新**。
- 保留原節末尾那條仍然有效的警告：**endpoint 改動只對「之後建置」的版本生效**;
  現有安裝需先手動安裝一次新 endpoint 的版本。

同時刪除／改寫所有 `RELEASES_TOKEN` 相關內容（用
`grep -n 'RELEASES_TOKEN' RELEASING.md` 找出全部）：那個 secret 已不被任何
workflow 使用。在「GitHub Secrets 設定」處改為一行說明：此 secret 已淘汰，應予刪除
（見 Step 4，由 operator 執行）。

**Verify**：`grep -c 'private' RELEASING.md` 不再出現在描述本 repo 的語句中
（人工確認）;`grep -n 'RELEASES_TOKEN' RELEASING.md` 僅剩「已淘汰」那一處說明。

### Step 3：全庫掃描剩餘參照

`grep -rn 'northstar-releases' . --include='*.md' --include='*.json' --include='*.yml' --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v '^./plans/'`

把命中處逐一判斷：文件裡的**歷史敘述**可以保留（並標明已淘汰），但任何**指示讀者
去用它**的內容都要改掉。`plans/` 底下的歷史紀錄不要動。

**Verify**：把最終命中清單貼進報告。

### Step 4（**OPERATOR-ONLY — 執行者不要碰**）

刪除 `RELEASES_TOKEN` secret，並在 GitHub 撤銷該 PAT：

> **進度 2026-07-26**：**repo secret 已由 advisor 依 operator 明確指示刪除**
> （`gh secret delete RELEASES_TOKEN`，已複驗 `gh secret list` 不再列出）。
> 刪除前確認全 repo 零引用：`git grep -in RELEASES_TOKEN` 僅剩文件/計畫中描述其
> 「已淘汰」的段落，mirror job 本身在 `cef86a32` 已移除。
>
> **⚠️ PAT 本身仍未撤銷 —— 這才是有安全意義的那一半。**
> 刪掉 repo secret 只是移除「repo 裡存的那份副本」，token 在 GitHub 帳號上
> 依然存在且仍具其原有 scope。任何持有該值的人仍可使用它。
> 撤銷必須由 operator 在帳號設定頁執行（agent 無法、也不應代勞）。
- Repo → Settings → Secrets and variables → Actions → 刪除 `RELEASES_TOKEN`
- GitHub → Settings → Developer settings → Fine-grained personal access tokens
  → 撤銷對應的 token

執行者只需在報告中提醒 operator 這一步尚未完成。**不要用 `gh secret delete`
自行執行**——撤銷憑證是 operator 的決定。

## Test plan

無新增測試（設定與文件變更）。既有 gates 必須全綠。

## Done criteria

- [ ] `npx tsc --noEmit` 0 · `npm run lint` 0 errors / 761 warnings · `npm test` 1454 · `npm run check:tauri` pass
- [ ] `grep -c 'northstar-releases' src-tauri/tauri.conf.json` → 0
- [ ] `endpoints` 陣列剩一項，且 `pubkey` **完全未變**（用 `git diff` 確認）
- [ ] RELEASING.md 不再宣稱本 repo 是 private，不再指示建立 `RELEASES_TOKEN`
- [ ] 未修改 `.github/workflows/release.yml`
- [ ] 報告中提醒 operator Step 4 待辦

## STOP conditions

- `git diff src-tauri/tauri.conf.json` 顯示 `pubkey` 有任何變動 → 立刻停止並回報
  （簽章金鑰一旦更動，所有現有安裝將無法驗證更新）。
- `release.yml` 中出現任何 `northstar-releases` 參照（表示鏡像其實還活著，本計畫
  的前提錯誤）→ 停止回報。
- `gh repo view larryjclai/northstar --json visibility` 不是 `PUBLIC`
  → 前提崩塌，死 endpoint 其實是唯一可用的 endpoint，**絕對不要移除**。

## Maintenance notes

- 這次變更**只對之後建置的版本生效**。已安裝 alpha.64 或更早版本的使用者，其
  binary 內仍烘焙著兩個 endpoint;因為第一個一直有效，實務上無差別。
- 若未來原始碼 repo 又轉回 private，必須同時恢復鏡像 job **與** fallback endpoint
  ——兩者是一組的，只做一半會讓 updater 全面失效。
