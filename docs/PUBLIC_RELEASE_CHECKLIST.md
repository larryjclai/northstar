# Public Release Checklist

Use this before making the repository public or publishing a public beta release.

## Repository Privacy Review

- [ ] Confirm `.env` and all `.env.*` files are ignored and not tracked.
- [ ] Rotate any secret that has ever appeared in local files, screenshots, logs, chat, or terminal output.
- [ ] Check for API keys, signing keys, passwords, bearer tokens, GitHub tokens, private URLs, and private release credentials.
- [ ] Review screenshots and design uploads before committing them. Redact personal data, account names, balances, emails, and device identifiers.
- [ ] Confirm generated build outputs are ignored, especially app bundles, archives, `.ipa`, `.dmg`, `.mobileprovision`, and code signing artifacts.
- [ ] Review sample/demo data to ensure it is synthetic.
- [ ] Confirm third-party assets, fonts, icons, and vendored code have compatible licenses or clear permission.
- [x] Keep bank / broker logos out of the public source repo; official builds inject them from private release assets.
- [ ] Decide and add the project license before calling the repo open source.

## Files Expected Before Public Launch

- [x] `README.md`
- [ ] `LICENSE`
- [x] `CONTRIBUTING.md`
- [x] `SECURITY.md`
- [x] `.env.example`
- [x] `.gitignore`
- [x] GitHub issue templates

## Current Findings From Local Scan

- A local `.env` file existed with a real Tauri signing password. It is gitignored, but the password should be treated as exposed and rotated before public release.
- `.env.example` contains placeholder release variables only.
- No obvious GitHub PAT, OpenAI key, AWS key, Slack token, or JWT-shaped token was found by the basic text scan.
- GitHub Actions reference repository secrets for release signing and mirroring; verify these are stored only in GitHub Secrets.
- `Design System/uploads/` contains local screenshots and is now ignored for future files. Two existing screenshots in that folder are already tracked by Git and should be removed from tracking or explicitly reviewed/redacted before public release.
- iOS/macOS generated build output under `src-tauri/gen/apple/build/` is ignored by `src-tauri/gen/apple/.gitignore`; it contains generated app artifacts and provisioning files that should not be committed.
- `src-tauri/vendor/tauri-plugin-sql/` includes its own MIT/Apache license files. Keep those notices if the vendored copy remains.
- Connect sync no longer hardcodes the official Worker URL. Official builds can set `VITE_NORTHSTAR_SYNC_WORKER_URL`; public source builds leave sync disabled by default.
- Bank / broker logos are now release-only private assets. `npm run build` injects `private-assets/bank/` into `public/bank/` when present.
- See `docs/REPOSITORY_CLEANUP_AUDIT.md` for the broader folder-by-folder cleanup review and release repository migration notes.

## License Decision Notes

Based on the current project goals, permissive licenses such as MIT or Apache-2.0 may be too broad if the maintainer is uncomfortable with closed-source commercial forks.

Likely options:

- `AGPL-3.0`: strongest open-source fit if the project should stay open even when modified and offered as a network service.
- `GPL-3.0`: similar copyleft posture for a mostly local desktop app, without AGPL's network-service trigger.
- Source-available / non-commercial license: fits a stronger anti-commercial preference, but is not considered open source by the usual OSI definition and may reduce outside contributions.

Do not add a final `LICENSE` file until the maintainer has chosen one deliberately.
