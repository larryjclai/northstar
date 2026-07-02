# Plan 100: Show the changelog in the in-app updater (populate latest.json `notes`)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If any
> STOP condition occurs, stop and report — do not improvise. When done, update
> the status row for this plan in `plans/README.md` — unless a reviewer
> dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat <planned-at SHA>..HEAD -- scripts/release-local.sh CHANGELOG.md`
> If either in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (release-tooling + docs; no app runtime code)
- **Depends on**: none (independent; ideally lands before the next release)
- **Category**: dx / bug (release tooling)
- **Planned at**: commit `afef92ef`, 2026-07-02

## Why this matters

The in-app updater ("設定 → 應用程式更新 → 檢查更新 → 更新內容") shows nothing
useful because the update manifest (`latest.json`) it reads carries a hardcoded
`notes` value — `"Northstar v0.1.0-alpha.NN"` — instead of the release's
changelog. The GitHub Release page shows the full 「Added / Changed / Fixed」
notes (via `--notes-file`), but the app never sees them. Users checking "更新內容"
in-app get only the version string. This plan makes the local release script put
the CHANGELOG body into `latest.json.notes` so the in-app updater displays the
same "what's new" the GitHub release does, and adds the `alpha.51` CHANGELOG
section so there is content to show for the next release.

## Current state

### The display side already works — do NOT change it

`src/routes/settings/ConnectSection.tsx` renders `found.body` (the manifest's
`notes`) with `white-space: pre-wrap`, so any text placed in `notes` shows up
verbatim with line breaks preserved:

- `ConnectSection.tsx:1287`: `const notes = found?.body?.trim();`
- `ConnectSection.tsx:1318-1320`: the "更新內容" toggle button renders only when `notes` is non-empty.
- `ConnectSection.tsx:1327-1330`: the panel — `<div ... style={{ ... whiteSpace: "pre-wrap", ... }}>{notes}</div>`.

**This file is OUT OF SCOPE.** The bug is that `notes` arrives empty/trivial,
not how it's rendered. (Markdown renders as plain text with visible `###`/`-`
markers — acceptable for now; see Maintenance notes.)

### The bug: `scripts/release-local.sh` hardcodes `notes`

`scripts/release-local.sh` is the **primary release path** (its own header says
so). It generates `latest.json` via an embedded Python heredoc. The current
`notes` line is hardcoded:

```python
VERSION="$VERSION" TAG="$TAG" ASSET_URL="$ASSET_URL" SIGNATURE="$SIGNATURE" \
python3 - "$STAGE/latest.json" <<'PY'
import json, os, sys, datetime
entry = {"signature": os.environ["SIGNATURE"], "url": os.environ["ASSET_URL"]}
doc = {
    "version": os.environ["VERSION"],
    "notes": f"Northstar {os.environ['TAG']}",       # ← hardcoded; the bug
    "pub_date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "platforms": {"darwin-aarch64": entry, "darwin-x86_64": entry},
}
json.dump(doc, open(sys.argv[1], "w"), ensure_ascii=False, indent=2)
print("  wrote", sys.argv[1])
PY
```

Just below it, the script already computes the GitHub release body from the
CHANGELOG (this is the content we want in `notes`, minus the install table):

```bash
echo "▶ Composing release notes from CHANGELOG.md …"
NOTES_FILE="$(mktemp)"
{
  node scripts/changelog-notes.mjs "$VERSION" || true
  printf '\n## 安裝方式\n\n| 平台 | 檔案 |\n...' "${DMG:+$(basename "$DMG")}"
} > "$NOTES_FILE"
```

`scripts/changelog-notes.mjs <bare-version>` prints the CHANGELOG.md section
body for that version (the 「Added / Changed / Fixed」 bullets) and exits 0 with
no output if the version has no section. That is exactly the text we want in
`latest.json.notes` — WITHOUT the install table (the install table is
GitHub-only; it's noise inside the app).

### CHANGELOG.md format

`CHANGELOG.md` (repo root) uses this shape (newest first):

```markdown
## [0.1.0-alpha.50] - 2026-07-02

### Added
- **通知中心**：…

### Changed
- **可搜尋台灣境內基金**：…

### Fixed
- **修復跨裝置同步崩潰**：…
```

There is currently **no `alpha.51` section**. The next release
(`0.1.0-alpha.51`) covers the fixes merged from plans 096–099.

### Conventions

- Shell: `set -euo pipefail`, `▶`-prefixed progress `echo`s, mktemp for temp
  files, comments explain *why*. Match this.
- CHANGELOG copy is zh-TW, user-facing, bold lead-in per bullet
  (`- **標題**：說明`). Match the alpha.50 entry's tone exactly.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Shell syntax check | `bash -n scripts/release-local.sh` | exit 0, no output |
| Changelog extractor (existing ver) | `node scripts/changelog-notes.mjs 0.1.0-alpha.50` | prints the alpha.50 「Added/Changed/Fixed」 body, non-empty |
| Changelog extractor (new ver) | `node scripts/changelog-notes.mjs 0.1.0-alpha.51` | prints the new alpha.51 body, non-empty (after Step 2) |
| notes-generation unit check | the Python snippet in Step 3's Verify | prints `NOTES_OK` |
| App still builds | `npm run build` | exit 0 (guards against an accidental app-code edit) |

There is no headless way to run a real signed release (needs the signing key +
a full `tauri build`); do NOT attempt one. Verification is syntax + the
notes-generation logic in isolation.

## Scope

**In scope**:
- `scripts/release-local.sh` (the `latest.json` `notes` population only)
- `CHANGELOG.md` (add the `[0.1.0-alpha.51]` section)

**Out of scope** (do NOT touch):
- `src/routes/settings/ConnectSection.tsx` — the display already works.
- `src-tauri/tauri.conf.json` — updater endpoints/pubkey are correct.
- `.github/workflows/release.yml` — the CI path uses `tauri-action`, which
  populates `latest.json.notes` from `releaseBody` itself. Making CI's notes
  match exactly (strip the install table) is a separate follow-up; do not widen
  this plan into the workflow.
- `scripts/version-bump.mjs`, `package.json`, `Cargo.toml` — the version bump
  is a separate operator step, not part of this plan.
- Any git commit/tag/release action — the operator drives releases.

## Git workflow

- Branch: `fix/ai-updater-changelog-notes` (`fix/ai-<name>` per `.agentrules`).
- Conventional commit, e.g. `fix(release): put CHANGELOG body into updater latest.json notes`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Feed the CHANGELOG body into `latest.json.notes`

In `scripts/release-local.sh`, BEFORE the Python heredoc that writes
`latest.json`, capture the changelog body into a shell variable (reuse
`changelog-notes.mjs`, no install table), then pass it into the heredoc via an
env var with a safe fallback:

```bash
# In-app updater "更新內容" reads latest.json.notes. Use the CHANGELOG body
# (no install table — that's GitHub-only) so the app shows the same "what's new"
# as the GitHub release. Fall back to the version string if there's no section.
UPDATER_NOTES="$(node scripts/changelog-notes.mjs "$VERSION" || true)"
[ -n "$UPDATER_NOTES" ] || UPDATER_NOTES="Northstar $TAG"
```

Then change the heredoc's env prefix and the `notes` line to read that var:

```bash
VERSION="$VERSION" TAG="$TAG" ASSET_URL="$ASSET_URL" SIGNATURE="$SIGNATURE" UPDATER_NOTES="$UPDATER_NOTES" \
python3 - "$STAGE/latest.json" <<'PY'
import json, os, sys, datetime
entry = {"signature": os.environ["SIGNATURE"], "url": os.environ["ASSET_URL"]}
doc = {
    "version": os.environ["VERSION"],
    "notes": os.environ.get("UPDATER_NOTES") or f"Northstar {os.environ['TAG']}",
    "pub_date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "platforms": {"darwin-aarch64": entry, "darwin-x86_64": entry},
}
json.dump(doc, open(sys.argv[1], "w"), ensure_ascii=False, indent=2)
print("  wrote", sys.argv[1])
PY
```

Place the `UPDATER_NOTES=` computation anywhere after `VERSION` is defined and
before the heredoc (defining it right above the `echo "▶ Generating latest.json …"`
line is cleanest). Do not remove the existing `NOTES_FILE` block that builds the
GitHub release body — that stays (it legitimately includes the install table for
the GitHub page).

**Verify**: `bash -n scripts/release-local.sh` → exit 0.

### Step 2: Add the `alpha.51` CHANGELOG section

At the top of `CHANGELOG.md`, immediately after the
`All notable changes …` intro line and before `## [0.1.0-alpha.50]`, insert:

```markdown
## [0.1.0-alpha.51] - 2026-07-02

### Changed
- **快速記帳分類篩選**：快速記帳（⌘N）的分類選單現在會依「支出 / 收入」只顯示對應分類（與記帳頁一致），不再一律列出全部分類。
- **投資交易摘要卡片連動篩選**：投資「交易紀錄」上方的總買入 / 總賣出 / 總股利 / 筆數，現在會隨券商、類型、搜尋等篩選條件即時連動，數字與下方清單一致。

### Fixed
- **修復匯入持倉影響券商餘額**：編輯「匯入現有持倉」的期初部位時，過去會誤記一筆交割現金流、改變券商帳戶餘額；現在期初部位維持不影響現金，並會在載入時自動修復先前受影響的餘額。（連帶：總買入不再把匯入部位計為買入。）
- **側邊欄與通知顯示修正（macOS）**：側邊欄的 logo 不再被視窗左上角的紅綠燈按鈕擠壓；點開通知面板時內容不再被邊界裁切。
- **更新內容說明**：應用程式內「檢查更新」的「更新內容」現在會顯示該版本完整的更新說明，先前只會顯示版本號。
```

**Verify**: `node scripts/changelog-notes.mjs 0.1.0-alpha.51` → prints the body
above (non-empty, starts with `### Changed`).

### Step 3: Confirm the notes-generation logic end-to-end (isolated)

Run this self-contained check (it mimics what the script does, without a build):

```bash
V=0.1.0-alpha.51; TAG=v$V
NOTES="$(node scripts/changelog-notes.mjs "$V" || true)"; [ -n "$NOTES" ] || NOTES="Northstar $TAG"
VERSION="$V" TAG="$TAG" ASSET_URL="http://x" SIGNATURE="sig" UPDATER_NOTES="$NOTES" python3 - <<'PY'
import json, os
doc = {"version": os.environ["VERSION"],
       "notes": os.environ.get("UPDATER_NOTES") or f"Northstar {os.environ['TAG']}"}
assert doc["notes"].strip() and doc["notes"] != f"Northstar {os.environ['TAG']}", "notes not populated from CHANGELOG"
assert "更新內容" in doc["notes"] or "###" in doc["notes"], "notes doesn't look like the changelog body"
print("NOTES_OK")
PY
```

**Verify**: prints `NOTES_OK`.

### Step 4: Guard against accidental app-code changes

**Verify**: `npm run build` → exit 0, and `git status --short` shows only
`scripts/release-local.sh` and `CHANGELOG.md` modified.

## Test plan

No unit tests — this is release tooling and a docs file, neither covered by
vitest. Verification is the syntax check + the isolated notes-generation check
in Step 3 (which proves `latest.json.notes` will carry the CHANGELOG body), plus
`npm run build` to prove no app code was touched. The real end-to-end proof is a
signed release, which only the operator can run (see STOP conditions).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bash -n scripts/release-local.sh` exits 0
- [ ] `node scripts/changelog-notes.mjs 0.1.0-alpha.51` prints a non-empty body
- [ ] The Step 3 snippet prints `NOTES_OK`
- [ ] `grep -n 'Northstar {os.environ' scripts/release-local.sh` still shows the value only as the FALLBACK (i.e. `or f"Northstar …"`), not the sole value
- [ ] `npm run build` exits 0
- [ ] `git status --short` shows only the two in-scope files modified
- [ ] `plans/README.md` status row updated (unless a reviewer says they maintain it)

## STOP conditions

Stop and report back (do not improvise) if:

- `scripts/release-local.sh` no longer contains the hardcoded
  `"notes": f"Northstar {os.environ['TAG']}"` line (it changed since planning).
- You are tempted to run `./scripts/release-local.sh` or any `gh release` /
  `git tag` command — do NOT; releases are the operator's job and require the
  signing key.
- Making the change appears to require editing `ConnectSection.tsx` or the CI
  workflow — it does not; re-read scope.

## Maintenance notes

- The in-app notes render as **plain text** (`white-space: pre-wrap`), so
  markdown syntax (`###`, `- **…**`) shows literally. If that reads poorly,
  a future polish could strip markdown before display in `ConnectSection.tsx`
  or render it — deliberately deferred here (the priority is showing the
  content at all).
- **CI parity follow-up**: `.github/workflows/release.yml` uses `tauri-action`,
  which sets `latest.json.notes` from `releaseBody` (that includes the install
  table). If CI ever becomes the primary release path, factor the changelog
  body out of the install table so the in-app notes stay clean there too.
- Every release now depends on a CHANGELOG.md section existing for the version;
  the script already falls back to `Northstar <tag>` when absent, so a missing
  entry degrades gracefully rather than breaking the release.
