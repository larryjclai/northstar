# Plan 285: 修好 in-app updater 的空白「更新內容」（`latest.json.notes`）

> **Executor instructions**: 在 git worktree 的分支 `fix/ai-updater-notes` 上工作。
> **第一件事**：`pwd` 確認在 worktree；接著 `git checkout -b fix/ai-updater-notes main`，
> 然後 `git log --oneline -1` 的 SHA 必須是 `3d792dba`。對不上就 STOP 回報。
> **不要**動 `plans/`（advisor 維護）。遇到 STOP condition 就停下來回報，**不要自行發揮**。
>
> **這份計畫只改一個檔案：`.github/workflows/release.yml`。** 其他任何檔案都不在範圍內。
>
> **Drift check**：
> ```bash
> git diff --stat 3d792dba..HEAD -- .github/workflows/release.yml
> ```
> 空輸出才往下走。

## Status

- **Priority**: P2（使用者可見，但不影響更新功能本身）· **Effort**: S · **Risk**: MEDIUM
  （改的是發版流程 —— 錯了要等下一次發版才會知道）
- **Depends on**: 無
- **Category**: release engineering / regression
- **Planned at**: commit `3d792dba`, 2026-08-01
- **Requested by**: operator, 2026-08-01

## 問題：app 內按「更新」看不到任何更新說明

實測三個版本發布出去的 `latest.json`：

| 版本 | `notes` 長度 | 走哪條 workflow |
|---|---|---|
| `v0.2.0-beta.1` | 1423 字 | 舊版（每個 matrix job 各自帶 `tagName`） |
| `v0.2.0-beta.2` | 1332 字 | 舊版（tag 指在 `3f69a867`，早於重構） |
| **`v0.2.0-beta.3`** | **0 字** | **新版（`8c091a94` 之後）** |

`latest.json.notes` 就是 Tauri updater 對話框顯示的「更新內容」。beta.3 是空的。

驗證方式（任何人都能重跑）：

```bash
curl -sL https://github.com/larryjclai/northstar/releases/download/v0.2.0-beta.3/latest.json \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log((JSON.parse(s).notes||'').length))"
# → 0
```

**GitHub Release 頁面是好的**（1492 字），所以這不是 CHANGELOG 沒寫。四個平台鍵也都齊全，
更新功能本身正常 —— **只有更新說明是空白的**。

## 根因：修好 beta.2 的那次改動順手弄丟了它

`8c091a94`（"fix(ci): one release per tag, and refuse to publish a partial one"）把
release 的建立收斂到 `notes` job，然後把 `releaseId` 傳給 tauri-action。
**workflow 自己的註解就寫了後果**（`.github/workflows/release.yml:250-252`）：

```
# `releaseId` (instead of `tagName` + release metadata) is what stops
# the jobs from each creating their own same-tag draft — see the long
# note on the `release` step above. tauri-action ignores the
# tagName/releaseName/releaseBody/releaseDraft/prerelease inputs when
# releaseId is set: those only ever described a release to CREATE,
# and creation now happens exactly once, before the matrix starts.
```

**`latest.json.notes` 正是 tauri-action 從 `releaseBody` 填的。** `releaseBody` 被忽略之後，
它就永遠是空字串。

那次重構本身是對的（它修掉了 Apple Silicon 完全無法更新的事故），這只是一個沒被注意到的
副作用 —— 而且**要等下一次發版才會現形**，也就是現在。

## 修法：在 `publish` job 補回 notes，就在它已經抓下 `latest.json` 的地方

`publish` job 的第 3 步**已經**把 `latest.json` 下載成本地檔案來驗四個平台鍵
（`.github/workflows/release.yml:317-329`）。在那之後、把 draft 翻成 live 之前，
把 `notes` 補進去再重新上傳即可。

`publish` job 的 `needs: [notes, publish-tauri]`（第 267 行），而 `notes` job 已經
`outputs: body: ${{ steps.extract.outputs.body }}`（第 53 行）—— **所以 body 在 publish job
裡直接拿得到，不需要重新 checkout 或重跑 extractor。**

### 決定：`notes` 只放 CHANGELOG 段落，**不含安裝表格**

beta.1 / beta.2 的 `notes` 是含安裝表格的（實測 `includes 安裝方式: true`）。
這份計畫**刻意不還原那個行為**：

- 使用者看到那個對話框時**已經裝好了**，正在原地更新。
  「| macOS (Apple Silicon) | `Northstar_*_aarch64.dmg` |」對他毫無意義。
- GitHub Release 頁面仍然含安裝表格（那裡才是給要下載的人看的），**不要動那段**。

所以：Release body = CHANGELOG 段落 + 安裝表格（維持現狀）；
`latest.json.notes` = **只有 CHANGELOG 段落**。

若你認為這個決定不對，照做並在回報裡說明理由，**不要自行改成含安裝表格**。

## Files in scope

- `.github/workflows/release.yml` — **唯一可改的檔案**

## Files explicitly OUT of scope

| 檔案 | 為什麼不碰 |
|---|---|
| `scripts/changelog-notes.mjs` | 它運作正常（Release body 有 1492 字就是證據）。不需要改 |
| `scripts/release-local.sh` | 本地 fallback 腳本，它自己已經正確處理 notes（第 109 行起），**與這個 bug 無關** |
| `CHANGELOG.md` | 內容沒問題 |
| `src-tauri/tauri.conf.json` | updater endpoint 沒問題 |
| `notes` job 的 release body 產生邏輯（第 108-133 行） | Release 頁面現況正確，改它會弄壞已經好的東西 |

## 專案慣例

1. **這個 workflow 的註解密度很高，而且都在解釋「為什麼」**——每一段防呆都連著一次真實事故
   （v0.1.0-alpha.54 的半寫入 latest.json、v0.2.0-beta.2 的 split release）。
   **你加的步驟也要照這個風格寫註解**：說明它修的是什麼、以及為什麼放在這個位置。
2. `set -euo pipefail` 是這個 job 既有的開頭，保持。
3. 錯誤用 `echo "::error::…"` 並 `exit 1`，與既有步驟一致。

---

## Step 1 — 在 publish job 補上 notes 修補

`.github/workflows/release.yml` 的 `publish` job，在**第 3 步（平台鍵驗證）之後、
第 4 步（`draft=false`）之前**插入新的一步。

現況（第 317-336 行，供對照）：

```yaml
          # 3. The updater feed must name every platform. ...
          asset_id=$(gh api "repos/${GITHUB_REPOSITORY}/releases/${RELEASE_ID}/assets" --paginate \
            --jq '.[] | select(.name == "latest.json") | .id')
          gh api -H "Accept: application/octet-stream" \
            "repos/${GITHUB_REPOSITORY}/releases/assets/${asset_id}" > latest.json
          echo "latest.json platforms:"
          jq -r '.platforms | keys[]' latest.json | sed 's/^/  /'
          for platform in darwin-aarch64 darwin-x86_64 linux-x86_64 windows-x86_64; do
            jq -e --arg p "$platform" '.platforms | has($p)' latest.json >/dev/null \
              || { echo "::error::latest.json has no \"$platform\" entry — updaters on that platform would fail."; exit 1; }
          done
          jq -e --arg v "${TAG#v}" '.version == $v' latest.json >/dev/null \
            || { echo "::error::latest.json version does not match $TAG."; exit 1; }

          # 4. Only now make it the release users resolve to.
```

要做的事：

1. **把 body 帶進這個 step 的 env**。該 step 現有的 `env:` 區塊（第 285-289 行附近）加一項：
   ```yaml
           NOTES_BODY: ${{ needs.notes.outputs.body }}
   ```
   （`publish` 已經 `needs: notes`，所以這個 output 直接可用。）

2. **在第 3 步與第 4 步之間插入新的一步 3b**，做三件事：
   - 把 `$NOTES_BODY` 寫進一個檔案（**不要**用 `jq --arg "$NOTES_BODY"` 直接吃變數——
     內容是多行、含引號與中文，走檔案最穩），用 `jq --rawfile` 塞進 `.notes`。
   - 舊的 `latest.json` asset **必須先刪除再上傳**（GitHub 不支援原地覆寫 asset 內容）。
   - 上傳要用 **release id**，不可以用 `gh release upload <tag>` ——
     此刻 release 還是 **draft**，而 **draft 不與 tag 綁定**（這正是 beta.2 事故的核心成因，
     見第 78-86 行的註解）。用 uploads API 帶 `RELEASE_ID`。

   實作骨架（可依需要調整，但上面三條約束不可違反）：

   ```bash
          # 3b. Restore the updater's release notes.
          #
          # tauri-action fills latest.json's `notes` from its `releaseBody`
          # input, and that input is IGNORED when `releaseId` is set (see the
          # note on the publish-tauri step). Since v0.2.0-beta.3 — the first
          # release built after that change — every published latest.json has
          # carried an empty `notes`, so the in-app updater dialog showed no
          # "更新內容" at all. The GitHub Release body was unaffected, which is
          # why it went unnoticed until someone opened the updater.
          #
          # Patch it here rather than in publish-tauri: this is where the file
          # is already downloaded and verified, and it is still a draft, so no
          # updater can observe the intermediate state.
          #
          # The install table deliberately does NOT go in: the reader of this
          # text is already installed and updating in place. It stays in the
          # GitHub Release body, which is where people who need to download go.
          printf '%s' "$NOTES_BODY" > updater-notes.md
          if [ -s updater-notes.md ]; then
            jq --rawfile notes updater-notes.md '.notes = $notes' latest.json > latest.patched.json
            mv latest.patched.json latest.json
            gh api -X DELETE "repos/${GITHUB_REPOSITORY}/releases/assets/${asset_id}"
            gh api --method POST \
              -H "Content-Type: application/json" \
              "https://uploads.github.com/repos/${GITHUB_REPOSITORY}/releases/${RELEASE_ID}/assets?name=latest.json" \
              --input latest.json >/dev/null
            echo "Patched latest.json notes ($(wc -c < updater-notes.md) bytes)."
          else
            echo "::warning::No CHANGELOG section for ${TAG#v} — latest.json notes left empty."
          fi
   ```

3. **加一條驗收**：重新下載剛上傳的 asset，斷言 `notes` 非空且 `platforms` 仍然完整
   （確認上傳沒有把檔案弄壞）。這條**必須在 `draft=false` 之前**，失敗就 `exit 1`。
   注意重新下載時 asset id 已經變了，要重新查一次。

**Verify（在改完 YAML 之後、還沒有真的發版之前）**：

```bash
# YAML 語法
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release.yml')); print('YAML OK')"
```

若機器上有 `actionlint` 就再跑一次；沒有不用特地安裝。

**STOP condition**：若你發現 `needs.notes.outputs.body` 在 `publish` job 裡拿不到
（例如 GitHub 對 job output 有大小限制而 body 被截斷），**STOP 回報** ——
替代方案是在 `publish` job 重新 checkout tag 並重跑 `scripts/changelog-notes.mjs`，
但那要 advisor 決定，不要自己改。

---

## Step 2 — 本地演練修補邏輯（不發版也要驗）

這個 bug 的教訓就是「要等下一次發版才會現形」，所以**不准只靠讀 YAML 就說做完了**。
用真實資料在本地把 jq 那段跑一次：

```bash
# 取一份真實的、notes 為空的 latest.json
curl -sL https://github.com/larryjclai/northstar/releases/download/v0.2.0-beta.3/latest.json -o /tmp/l.json
node -e "console.log('before notes len:', (require('/tmp/l.json').notes||'').length)"

# 取真實的 CHANGELOG 段落
node scripts/changelog-notes.mjs 0.2.0-beta.3 > /tmp/n.md
wc -c < /tmp/n.md

# 跑你寫進 workflow 的同一段 jq
jq --rawfile notes /tmp/n.md '.notes = $notes' /tmp/l.json > /tmp/l2.json
node -e "
const a=require('/tmp/l.json'), b=require('/tmp/l2.json');
console.log('after notes len:', b.notes.length);
console.log('platforms preserved:', JSON.stringify(Object.keys(a.platforms)) === JSON.stringify(Object.keys(b.platforms)));
console.log('version preserved:', a.version === b.version);
console.log('signatures untouched:', JSON.stringify(a.platforms) === JSON.stringify(b.platforms));
"
```

**通過判準**：`after notes len` > 1000、`platforms preserved` / `version preserved` /
`signatures untouched` **三個都是 true**。把實際輸出貼進回報。

> ⚠️ `signatures untouched` 是這一步最重要的斷言。`latest.json` 裡有每個平台的
> **簽章**；如果 jq 的寫法不小心動到 `platforms`，更新會直接驗章失敗 ——
> 那比空白 notes 嚴重得多。

**STOP condition**：三個 preserved 判準只要有一個是 false，**STOP 回報**，不要調整 jq 硬湊。

---

## Done criteria（機器可驗）

```bash
# 1. 只動了一個檔案
git diff --name-only 3d792dba..HEAD          # 期望只有 .github/workflows/release.yml

# 2. YAML 合法
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml')); print('OK')"

# 3. 新步驟存在，且在 draft=false 之前
grep -n "NOTES_BODY\|updater-notes.md\|make_latest" .github/workflows/release.yml
#   → NOTES_BODY 與 updater-notes.md 的行號都必須小於 make_latest 的行號

# 4. 上傳走的是 RELEASE_ID，不是 tag
grep -n "uploads.github.com" .github/workflows/release.yml   # 必須含 ${RELEASE_ID}
grep -c "gh release upload" .github/workflows/release.yml    # 期望 0

# 5. 沒有動到不該動的
git diff 3d792dba..HEAD -- scripts/ CHANGELOG.md src-tauri/   # 期望空輸出
```

## 這份計畫**無法**在合併前完整驗證 —— 這點要誠實面對

Workflow 的改動只有真的跑一次發版才知道成不成立。Step 2 的本地演練驗掉了最危險的部分
（jq 會不會弄壞簽章），但「job output 傳得到嗎」「asset 刪除再上傳會不會有權限問題」
只能在真實 run 裡看到。

**所以下一次發版時必須做這件事**：release workflow 跑完之後、宣布之前，執行

```bash
curl -sL https://github.com/larryjclai/northstar/releases/download/vX.Y.Z/latest.json \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);
      console.log('notes:', (j.notes||'').length, 'chars');
      console.log('platforms:', Object.keys(j.platforms).length);})"
```

`notes` 必須 > 1000、`platforms` 必須是 9。**這條要寫進 `RELEASING.md` 的驗收清單**——
但**不是這份計畫做**（本計畫只准動 workflow）。advisor 會另外處理。

## Maintenance note

- **`releaseId` 與 tauri-action 的關係是這個 workflow 最容易再次踩到的地方。**
  它會忽略 `tagName` / `releaseName` / `releaseBody` / `releaseDraft` / `prerelease`。
  日後任何「為什麼 release 的某個欄位沒生效」的問題，先回來看這一條。
- **`latest.json` 是 tauri-action 從四個 matrix job merge 出來的**，所以任何對它的修補
  都必須發生在**四個 job 都跑完之後**（也就是 `publish` job），不能放在 `publish-tauri` 裡，
  否則會被後續 job 的 merge 蓋掉。
- **draft 不與 tag 綁定**。任何在 publish 之前操作 release 的程式碼都必須用 `RELEASE_ID`。
  用 tag 定址是 beta.2 事故的根因。
