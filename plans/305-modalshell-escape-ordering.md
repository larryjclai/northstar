# Plan 305: ModalShell Escape 事件排序修正 — 讓巢狀元件的 Esc 攔截生效(解鎖 plan 301)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat <planned-at SHA>..HEAD -- src/components/ModalShell.tsx src/components/SuggestInput.tsx src/components/ModalShell.test.tsx`

## Status

- **Priority**: P3(但擋住 301)
- **Effort**: S–M
- **Risk**: MED(ModalShell 是每個畫面都用的元件;鍵盤語意變化)
- **Depends on**: none;**301 依賴本計畫**
- **Category**: bug
- **Planned at**: 寫作時 origin/main 含 plans 287–300、299 的 ModalShell 改動;派工前 reviewer 重新標定 SHA

## Why this matters

Plan 301(QuickAdd 遷移 ModalShell)被以下實證缺陷 BLOCK(executor 以 vitest probe 直接量測):

ModalShell 的 Escape/Tab handler 以 `panel.addEventListener("keydown", …)` 綁在 **panel DOM 節點**(ModalShell.tsx:324 附近)。原生冒泡路徑上,panel 節點位於輸入框與 React root 容器之間——panel 的 native listener **先於** React root 的 synthetic dispatch 觸發。因此任何以 React `onKeyDown` + `stopPropagation` 實作「Esc 先關自己」的巢狀元件(具體受害者:`SuggestInput`,其 stopPropagation 是 synthetic 層的,panel native listener 根本收不到)在 ModalShell 內**完全失效**:下拉開著按 Esc,整個 dialog 直接關閉,使用者輸入丟失。

現行手刻 overlay(QuickAdd、CashFlow EntryDrawer)監聽 `window`——在 React dispatch **之後**——所以沒踩到;`SuggestInput.tsx` 的註解明文記載這個假設(「QuickAdd's overlay listens for Escape on window…」)。

**為什麼當初用 native listener**:ModalShell.tsx:102–111 的註解——React synthetic 事件沿 **React 樹**傳播,portal 到 body 的 Base UI popover(AppSelect/DatePicker/IconPicker)是 panel 的 React 子孫,若 panel 用 React `onKeyDown`,popover 內的 Esc 會經 React 樹冒泡回 trap——正是要避免的。所以**不能**簡單改成 React onKeyDown。

## 設計候選(執行時擇一,推薦 A)

**A(推薦,最小危險):panel 的 keydown handler 延後一拍執行。** native listener 收到 Escape 時不立即處理,改為 `setTimeout(0)`(或 `queueMicrotask` 後再 rAF——實測哪個穩定)後檢查 `event.defaultPrevented`;巢狀元件(SuggestInput)改為在攔截時呼叫 `event.preventDefault()`(synthetic 的 preventDefault 會反映到 native event 上,跨 dispatch 邊界可見——**這是本方案的關鍵機制,先寫最小 repro 驗證**)。SuggestInput 的 stopPropagation 保留(維持對 window-listener overlay 的既有行為),另加 preventDefault。portal popover 行為不變(native 冒泡不經 panel)。

**B(較大改動):ModalShell 提供 context 的 `claimEscape()` 註冊機制**,巢狀元件開啟時註冊、關閉時註銷;panel handler 發現有 claim 就跳過。乾淨但 API 面擴大,SuggestInput/AccountFilter 都要接。

先做 A 的機制驗證(synthetic preventDefault → native defaultPrevented 的可見性);成立就走 A,不成立走 B 並回報。

## Current state(執行時逐一重讀確認)

- `src/components/ModalShell.tsx`:panel-scoped keydown(`onKeyDown` 函式 + `panel.addEventListener("keydown", onKeyDown)`),內含 Escape → `requestClose()` 與 Tab trap。
- `src/components/SuggestInput.tsx:72–78` 附近:Escape 的 synthetic `stopPropagation` + `setOpen(false)`。
- 301 的 probe 手法可複用:ModalShell 包真實 SuggestInput、開下拉、fireEvent Escape、斷言 `onClose` 未被呼叫且 listbox 關閉;第二次 Escape 才關 dialog。

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm install` | exit 0 |
| Gate | `npm run build` / `npm test` / `npm run lint` / `npm run format:check` | 0 / all pass / 0 errors / pass |

## Scope

**In scope**:
- `src/components/ModalShell.tsx`(keydown 排序機制)
- `src/components/SuggestInput.tsx`(方案 A:+`event.preventDefault()`;方案 B:接 claim API)
- `src/components/ModalShell.test.tsx`(新增巢狀攔截案例——用 301 的 probe 形狀)

**Out of scope**:
- QuickAdd 遷移本身(301 在本計畫落地後重派;其未 commit 的 worktree 改動由 reviewer 處置)。
- Tab trap 邏輯(只動 Escape 路徑;Tab 維持原樣)。
- AccountFilter/AppSelect(portal popover 有自己的 Esc,不經 panel,不受影響——測試確認不回歸即可)。

## Steps(概要——方案 A)

1. 最小 repro 驗證 synthetic preventDefault → native `event.defaultPrevented` 可見性(vitest + 真瀏覽器 console 雙驗;不成立 → STOP 改走 B)。
2. ModalShell:Escape 分支改延後檢查 `defaultPrevented` 再 `requestClose()`;Tab 分支不動。
3. SuggestInput:Escape 攔截時加 `event.preventDefault()`(stopPropagation 保留)。
4. ModalShell.test.tsx:巢狀 SuggestInput 案例(第一次 Esc 關下拉不關 dialog;第二次關 dialog);既有 Escape 案例不回歸。
5. 全 gate + 手動:既有 ModalShell call site 抽查(分類管理、新增交易、編輯持倉)Esc 行為不變;portal popover(AppSelect)內 Esc 只關 popover。

## Done criteria

- [ ] 全 gate 綠;ModalShell.test.tsx 新案例通過
- [ ] 巢狀攔截:第一次 Esc 關下拉、第二次關 dialog(自動化測試)
- [ ] 既有 call site Esc 行為無回歸(抽查三處)
- [ ] `git status` 只有 in-scope 檔案

## STOP conditions

- Step 1 的機制驗證失敗且方案 B 的 API 設計出現超出三檔的漣漪。
- 任何既有 ModalShell 測試需要改斷言語意才能過。
- disableEscape 路徑與新機制衝突。

## Maintenance notes

- 落地後重派 301(其 worktree 有可參考的未 commit 遷移 diff 與桌機定位方案:variant="sheet" 自定位,pixel parity 已驗)。
- 新的巢狀「Esc 先關自己」元件一律用本計畫確立的機制,不再依賴 window-listener 時序巧合。
