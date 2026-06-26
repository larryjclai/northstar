<!--
  感謝你的貢獻！請用中文或英文填寫即可。
  Thanks for contributing! Fill this in (Chinese or English is fine).
-->

## 摘要 / Summary

<!-- 這個 PR 做了什麼、為什麼？ / What does this PR do, and why? -->



## 相關 Issue / Linked issue

<!-- 例如 / e.g. Closes #123（重大變更請先開 issue 討論方向 / open an issue first for large changes） -->



## 檢查清單 / Checklist

- [ ] 已簽署 CLA / Signed the CLA（首次開 PR 時 bot 會留言提示 / the bot will prompt on your first PR）
- [ ] `npm test` 通過、`npm run lint` 無錯、`npx tsc --noEmit` 無錯、（碰到 Rust 時）`npm run check:tauri` 通過 / `npm test`, `npm run lint`, `npx tsc --noEmit` pass; `npm run check:tauri` when touching Rust
- [ ] UI 文案經 `copy.csv` round-trip（`npm run copy:export` / `npm run copy:import`），未直接改 `.tsx` 字串 / UI copy went through the `copy.csv` round-trip, not hand-edited in `.tsx`
- [ ] 無非預期的金融計算語意變更（correctness-first）；必要時附測試 / No unintended changes to financial-calculation semantics (correctness-first); add tests when relevant
- [ ] 未提交機密 / 個人財務資料 / 未遮蔽截圖 / No secrets, personal finance data, or unredacted screenshots committed

<!--
  若某項檢查無法在本機執行，請在「摘要」中說明。
  If a check can't be run locally, please note it in the Summary.
-->
