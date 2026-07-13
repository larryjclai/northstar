# App Store Submission Dossier — Northstar (iOS)

> **Purpose.** Everything an executor can prepare *before* an operator buys the paid Apple
> Developer Program ($99/yr). The day the operator enrolls, this dossier turns the path to
> TestFlight from weeks into hours. Companion to [`ios-mobile-plan.md`](ios-mobile-plan.md)
> (the free-provisioning dev SOP).
>
> **Two-phase split.**
> - **Phase A (this dossier's prep — DONE by executor):** metadata/ASO copy, App Privacy
>   answers with code evidence, export-compliance declaration, capability audit, review
>   notes, and the Phase B runbook.
> - **Phase B (OPERATOR-ONLY):** anything touching an Apple ID, certificate, signing, App
>   Store Connect, or the $99 payment. Enumerated in the runbook at the end. **The executor
>   must not perform any Phase B step.**
>
> **Conventions.**
> - `OPERATOR-PROVIDE` — a value only the operator can supply (URLs they host, legal text).
> - `OPERATOR-CONFIRM` — a factual/legal reading the operator must ratify before submission.
> - **Re-audit before every submission** — this dossier goes stale whenever a feature adds a
>   permission or a data flow (see the Maintenance section).

Key facts pulled from config (verify against source before submitting):

| Field | Value | Source |
|---|---|---|
| Bundle identifier | `app.northstar.finance` | `src-tauri/tauri.conf.json` → `identifier`; `gen/apple/project.yml` → `PRODUCT_BUNDLE_IDENTIFIER` |
| Product name | Northstar | `tauri.conf.json` → `productName` |
| Marketing version | `0.1.0` (app is `0.1.0-alpha.59`) | `tauri.conf.json` → `version`; `Info.plist` → `CFBundleShortVersionString` |
| App Store category | Finance | `tauri.conf.json` → `bundle.category` |
| Min iOS deployment target | iOS 14.0 | `gen/apple/project.yml` → `deploymentTarget.iOS` |
| Devices | iPhone + iPad (orientations for both declared) | `Info.plist` → `UISupportedInterfaceOrientations*` |
| Sync server (only network peer for user data) | `https://northstar-sync.larrynote.workers.dev` | `tauri.conf.json` → CSP `connect-src` |

---

## Step 1 — Metadata + ASO draft

Ready-to-paste. zh-TW (繁體中文) is the **primary** App Store localization; en (English) is
secondary. Character limits are Apple's App Store Connect maxima.

### App name (≤ 30 chars)

| Locale | Candidate | Len |
|---|---|---|
| zh-TW | `Northstar 北極星理財` | 15 |
| zh-TW (alt) | `Northstar 記帳與投資` | 15 |
| en | `Northstar: Money & Invest` | 25 |

> App name must be unique on the store. If `Northstar` alone is taken, the subtitle-style
> suffix above disambiguates. Final choice: OPERATOR-CONFIRM against name availability in
> App Store Connect.

### Subtitle (≤ 30 chars)

| Locale | Text | Len |
|---|---|---|
| zh-TW | `記帳、投資、淨值一次看清` | 12 |
| en | `Track spending, wealth & FIRE` | 29 |

### Promotional text (≤ 170 chars — editable without a new build)

| Locale | Text |
|---|---|
| zh-TW | `把流水帳和股票帳合在一起，看到完整資產全貌。資料全存在你自己的裝置上，隱私優先。跟大盤比較投資績效，用 FIRE 計算機看清離目標還有多遠。` |
| en | `Your spending and your portfolio in one net-worth picture. Local-first and private — your data stays on your device. Compare returns to a benchmark and plan your FIRE.` |

### Keywords (≤ 100 chars, comma-separated, no spaces after commas — derived from the app's real nouns)

zh-TW:
```
記帳,理財,資產,淨值,投資,股票,ETF,FIRE,退休,預算,儲蓄率,現金流,隱私,本地優先,報酬率
```
en:
```
finance,budget,networth,investing,stocks,ETF,FIRE,retirement,expenses,cashflow,privacy,portfolio,savings
```
> Do not repeat words already in the app name/subtitle — Apple indexes those separately.
> Trim to fit 100 chars per locale; the lists above are within budget. OPERATOR-CONFIRM final trim.

### Description (from README feature list, rewritten for store tone)

**zh-TW (primary):**
```
Northstar 是一個 local-first、隱私優先的個人與家庭財務 App。它把流水帳（你的開支）和
股票帳（你的投資）合在一起，讓你看到完整的資產全貌——資料全部存在你自己的裝置裡，
你隨時可以匯出 JSON / CSV。

■ 資產與淨值
・多帳戶（銀行／現金／信用卡／貸款／投資／實體資產）、多幣別，依交易當日匯率換算。
・對帳式淨值：資產 − 負債 = 淨值 恆等；另列含應收應付的「調整後淨值」。
・淨值趨勢涵蓋歷史投資部位，不只是現金。

■ 流水帳與儲蓄率
・收支記帳、轉帳、週期性收支自動入帳；一句話快速記帳。
・分期、退款沖銷、應收／應付（含代墊）、商家自動分類。
・現金流圖表（收入／支出對照＋累積淨額），可切日／週／月／年。

■ 投資組合與分析
・移動平均成本；完整交易類型（買／賣／現金股利／股票股利／拆股／減資）。
・三種報酬口徑並列：TWR、XIRR、期間價格報酬。
・個股貢獻、殖利率、幣別曝險、風險指標（波動、Sharpe、Sortino、最大回撤）。
・與 Benchmark 對比 ＋ Alpha。

■ 目標與 FIRE
・退休投影含通膨與費用，實質／名目雙模式。
・三情境穩健度、Coast／Lean／Regular／Fat FIRE 試算。

■ 隱私與資料
・Local-first：資料存在本機，不儲存在雲端。
・選用的多裝置同步採端對端加密，伺服器看不到你的財務內容。
・深／淺／跟隨系統主題、繁體中文介面、隱私遮罩。

Northstar 不構成投資／理財建議。本 App 依現狀提供。
```

**en (secondary):**
```
Northstar is a local-first, privacy-first personal and household finance app. It merges
your cash-flow (spending) and your investment ledger into one complete net-worth picture —
all data lives on your own device, and you can export JSON / CSV anytime.

Assets & net worth
- Multi-account, multi-currency, converted at each transaction's daily FX rate.
- Reconciliation identity: assets − liabilities = net worth, plus an adjusted net worth
  that includes receivables/payables.
- Net-worth trend covers historical investment positions, not just cash.

Spending & savings rate
- Expense tracking, transfers, recurring entries; one-line quick add.
- Installments, refunds, receivables/payables, automatic merchant categorization.
- Cash-flow chart (income vs. expense + cumulative net), by day/week/month/year.

Portfolio & analytics
- Moving-average cost; full transaction types (buy/sell/cash & stock dividend/split/reduction).
- Three return measures side by side: TWR, XIRR, price return.
- Per-holding contribution, yield, currency exposure, risk metrics (volatility, Sharpe,
  Sortino, max drawdown), benchmark comparison + alpha.

Goals & FIRE
- Retirement projection with inflation and fees, real/nominal modes.
- Three-scenario robustness, Coast/Lean/Regular/Fat FIRE.

Privacy & data
- Local-first: data stays on device, never stored in the cloud.
- Optional multi-device sync is end-to-end encrypted; the server never sees your finances.

Northstar is not investment or financial advice. Provided "as is".
```

### Store URLs & category

| Field | Value |
|---|---|
| Category (primary) | **Finance** |
| Category (secondary) | Productivity (optional) |
| Support URL | OPERATOR-PROVIDE (e.g. `https://github.com/larryjclai/northstar/issues` or a dedicated support page) |
| Marketing URL (optional) | OPERATOR-PROVIDE |
| Privacy Policy URL | OPERATOR-PROVIDE — **required** for a Finance app; must be a live, reachable page describing the local-first / E2E-encrypted posture before submission |
| Copyright | `© 2026 賴瑞晟 LAI Jui Cheng` |

### Age rating questionnaire (App Store Connect)

App has no objectionable content → expected rating **4+**. Answers to the questionnaire:

| Question | Answer |
|---|---|
| Cartoon or Fantasy Violence | None |
| Realistic Violence | None |
| Sexual Content or Nudity | None |
| Profanity or Crude Humor | None |
| Alcohol, Tobacco, or Drug Use or References | None |
| Simulated Gambling | None |
| Horror/Fear Themes | None |
| Medical/Treatment Information | None |
| Contests | None |
| Unrestricted Web Access | **No** (app has no in-app browser to arbitrary URLs; WebView loads only the bundled front end — see CSP in `tauri.conf.json`) |
| Gambling and Contests | No |
| Made for Kids | **No** (finance app for adults; do not enable the Kids Category) |

> Expected result: **4+**. OPERATOR-CONFIRM in the live questionnaire.

---

## Step 2 — App Privacy ("nutrition label") answers

Apple's "App Privacy" section asks, per data type, whether the **developer** collects it and
whether it's linked to the user / used for tracking. Northstar's honest answer is **"Data Not
Collected"** for the developer — with the reasoning and code evidence below.

### Code evidence: no analytics / tracking SDKs

Grep run at dossier time (paste of actual tool output):

```
$ grep -rniE "analytics|sentry|firebase|posthog|mixpanel|amplitude|segment|google-analytics|gtag" package.json src/
# → only FALSE POSITIVES, no tracking SDK:
#   - src/**/*Analytics*  → "investment analytics" product feature (risk metrics), not telemetry
#   - src/data/demoData.ts:228  "amplitude" = a price-wobble MATH variable in synthetic demo data
#   - src/components/SegmentedControl.tsx etc. → "segment" = a UI control, not Segment.io

$ grep -iE "\"(@sentry|@amplitude|posthog|firebase|mixpanel|@segment|analytics|react-ga|gtag)" package.json
NO TRACKING SDK DEPENDENCIES

$ grep -rniE "from ['\"](@sentry|@amplitude|posthog|firebase|mixpanel|@segment/|react-ga)" src/
NO TRACKING SDK IMPORTS IN src/
```

**Conclusion: the app ships no analytics, crash-reporting, or tracking SDK.** This is the
factual basis for answering "Data Not Collected" / "No Tracking" on the label.

### Data-type mapping table

| Apple data category | Collected by developer? | Reality / evidence |
|---|---|---|
| Financial Info (transactions, holdings, net worth) | **No** | Stored on-device only in local SQLite (`plugin-sql`); never sent to a developer-controlled analytics endpoint. Optional sync transmits **E2E-encrypted** blobs the server cannot decrypt (`src/features/connect/crypto/vault.ts` — AES-GCM-256). |
| Contact Info (name, email, phone) | **No** | App requires **no account, no sign-up, no login.** No email/phone field feeds a server. |
| Identifiers (user ID, device ID) | **No** | No advertising ID, no analytics user ID. Sync uses locally-generated key material, not an account identifier tied to the user's identity by the developer. |
| Usage Data / Product Interaction | **No** | No telemetry SDK (grep above). |
| Diagnostics / Crash Data | **No** | No Sentry/Crashlytics/etc. (grep above). |
| Location | **No** | No location APIs used. |
| Browsing History | **No** | No in-app browser to arbitrary URLs. |

### Market-data requests — the one nuance to declare honestly

The app fetches quotes/FX and reference data from **third-party** hosts (not the developer):

- Yahoo Finance — `src/features/market-data/yahooFinanceProvider.ts`
- TWSE OpenAPI — `openapi.twse.com.tw`, `mopsfin.twse.com.tw` (`taiwanMarketDataProvider.ts`)
- SITCA fund NAV — `www.sitca.org.tw` (`sitcaFundProvider.ts`)

These requests expose the **ticker symbols the user holds** and the device **IP address** to
those third parties (inherent to any HTTP request). Reasoning for the label:

- This is **not** collection *by the developer* — Northstar operates no server that logs it,
  and the developer receives none of it.
- Tickers are financial reference symbols, not the user's identity; nothing links them to a
  named user on the developer's side.
- Recommended label treatment: keep the developer answer **"Data Not Collected"**, and cover
  the third-party exposure in the **Privacy Policy** text (name Yahoo/TWSE/SITCA and note
  their own privacy policies govern those requests). In **demo mode** even these requests are
  skipped — synthetic prices are used (`useMarketRefresh.ts` → `isDemoMode()` guard,
  `DEMO_MARKET_MESSAGE`).

> **OPERATOR-CONFIRM (legal reading):** Apple's "collect" = transmit off-device *and* use it
> in specified ways by you or your third-party partners. Because the developer neither
> receives nor uses this data, "Data Not Collected" is the intended answer — but the operator
> should ratify this against the current [App privacy details](https://developer.apple.com/app-store/app-privacy-details/)
> guidance at submission time, and ensure the privacy policy discloses the third-party market-data calls.

---

## Step 3 — Icons + version alignment

### App icon — already generated, verified present

- Source master: `src-tauri/icons/source.png` — verified **1024 × 1024, 8-bit RGBA** (`file`
  output). This is the required App Store icon master (Apple wants a 1024² for the store
  listing; the bundled set below is the in-app icon).
- iOS AppIcon set is **already generated and populated**:
  - `src-tauri/icons/ios/` — full size ladder present.
  - `src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset/` — **18 PNGs + `Contents.json`**
    (20/29/40/60/76/83.5 @1x/2x/3x + `AppIcon-512@2x.png`).
- **Regeneration command** (operator or executor, requires `node_modules` + the Tauri CLI):
  ```bash
  npm run tauri icon src-tauri/icons/source.png
  ```
  This regenerates desktop + iOS + Android icon sets from the 1024² master. It was **not
  re-run in this worktree** because (a) the set is already complete and (b) `node_modules`
  was absent (fresh worktree) — recorded here as an OPERATOR-RUN step if the master art
  changes. No icon change was needed for submission.

### Version / build-number alignment

- Marketing version is single-sourced from `src-tauri/tauri.conf.json` → `"version"`
  (currently `0.1.0-alpha.59`). Tauri writes `CFBundleShortVersionString` into the iOS
  `Info.plist` at build time. **Note the pre-release suffix:** the App Store's
  `CFBundleShortVersionString` must be a plain `X.Y.Z` (no `-alpha.NN`). The generated
  `Info.plist`/`project.yml` currently carry `0.1.0` (Tauri strips the suffix), which is
  App-Store-valid. OPERATOR-CONFIRM the marketing version shown to reviewers is the intended
  public number.
- **Build number** (`CFBundleVersion`) must be **unique and monotonically increasing per
  TestFlight/App Store upload**. Current generated value: `0.1.0.27` (`Info.plist`) /
  `0.1.0.23` (`project.yml` — regenerated on each `tauri ios build`). Because `gen/apple` is
  regenerated by Tauri, do **not** hand-edit `CFBundleVersion` there; bump the source version
  or pass Tauri's build-number mechanism. Practical rule for the operator: **increment the
  build number on every upload** (App Store Connect rejects a re-used build number for the
  same marketing version). Document each uploaded build number in `RELEASING.md` when the
  pipeline is set up.

### Build verification

- `npm run tauri ios build -- --target aarch64-sim --debug` — **NOT run in this worktree.**
  `node_modules` is absent in the fresh worktree (would require `npm install`, minutes) and a
  full iOS sim build is ~10 min. Recorded as an **OPERATOR-RUN / CI step**. The Xcode project
  at `src-tauri/gen/apple/` already exists and builds per `ios-mobile-plan.md` Phase 1; the
  toolchain (Xcode 26.6, CocoaPods 1.16.2, rustup iOS targets) is documented there and was
  confirmed present on the build host at dossier time.

---

## Step 4 — Export compliance + capability audit

### Export compliance (`ITSAppUsesNonExemptEncryption`)

Northstar uses only **standard, well-known encryption**:

- AES-GCM-256 for sync envelopes (`src/features/connect/crypto/vault.ts`).
- ECDH P-256 key agreement for device pairing; PBKDF2 + SHA-256 for pairing-code key
  derivation (`src/features/connect/crypto/pairing.ts`).
- All via the platform **Web Crypto** (`crypto.subtle`) — no custom/proprietary cryptography.

This falls under the U.S. EAR **exemption** for apps using standard encryption to protect the
user's own data (not a cryptographic product in its own right). The correct declaration:

- **Set `ITSAppUsesNonExemptEncryption` = `false`** in the iOS `Info.plist` (i.e. "uses only
  exempt encryption"). This suppresses the per-upload export-compliance prompt in App Store
  Connect / TestFlight.
- **Where to set it:** the `Info.plist` lives at `src-tauri/gen/apple/northstar_iOS/Info.plist`,
  which is **regenerated by Tauri**. Tauri does not currently expose an `Info.plist` key for
  this in `tauri.conf.json`, so the key must be added to the generated plist (or to
  `gen/apple/project.yml` → the target's `info.properties`, which is also generated). **This
  is an edit inside `gen/apple/` — see the "re-apply after regeneration" list below.**
  Alternatively the operator can answer the export-compliance question **once in App Store
  Connect** (select "uses standard encryption / exempt") instead of editing the plist.

> **This dossier does NOT edit `gen/apple/` files** (they are regenerated and the plan scopes
> config edits narrowly). The recommendation is recorded here for the operator to apply at
> build/submit time, plus flagged in the re-apply list.
>
> **OPERATOR-CONFIRM:** the exemption reading, and note the operator's **annual
> self-classification report** duty to the U.S. BIS/ENC (a paperwork obligation that comes
> with claiming the exemption — the app config is correct either way).

#### "Re-apply after regeneration" list (edits inside generated `gen/apple/` that Tauri may overwrite)

| Item | File | Why it can be lost |
|---|---|---|
| `ITSAppUsesNonExemptEncryption = false` | `gen/apple/northstar_iOS/Info.plist` (or `project.yml` info.properties) | `tauri ios init` / regeneration rewrites these from templates |
| Any manual `Info.plist` key (e.g. localized display name) | same | same |

> Nothing in this list has been applied by the executor; it is the operator's re-apply
> checklist if/when they choose the plist route over the App Store Connect prompt.

### Capability / plugin audit for the iOS build

Capabilities are split so desktop-only plugins don't leak into iOS (verified in source):

| Capability file | Platforms | Permissions | iOS verdict |
|---|---|---|---|
| `capabilities/default.json` | all (windows: main) | `core:default`, `sql:default`, `sql:allow-execute`, `stronghold:default`, `process:default`, `fs:allow-applocaldata-*`, `notification:default` | **Ships on iOS.** All fine (see per-plugin below). |
| `capabilities/desktop.json` | macOS/windows/linux ONLY | `updater:default`, `window-state:default`, `core:window:allow-start-dragging` | **Correctly excluded from iOS.** `platforms` gate + `#[cfg(desktop)]` in `lib.rs` (updater registered only under `#[cfg(desktop)]`, lines ~305–311). App Store forbids self-update — **satisfied.** |
| `capabilities/mobile.json` | android/iOS ONLY | `haptics:allow-*` | iOS-only; haptics is `#[cfg(mobile)]` in `lib.rs` (line ~289). Fine for the store. |

Per-plugin store-review implication (plugins the iOS build compiles):

| Plugin | iOS role | Store implication |
|---|---|---|
| `plugin-sql` (SQLite) | Local finance DB on-device | Fine — user's own data, no network. |
| `stronghold` (argon2) | Encrypted secret storage; salt at app-local-data | Fine — standard on-device encryption (also relevant to export-compliance above). |
| `fs` (app-local-data only) | Local backups / export files scoped to app sandbox | Fine — `applocaldata` scope only; no arbitrary FS access. Powers the "export backup" feature. |
| `notification` | Local notifications | Fine — no push/APNs entitlement requested; entitlements file is an empty `<dict/>` (`gen/apple/northstar_iOS/northstar_iOS.entitlements`). |
| `process` | App lifecycle | Fine. |
| `haptics` (mobile) | Taptic feedback | Fine — no permission prompt, no privacy string needed. |
| `updater` (desktop) | **Excluded on iOS** | Correctly gated out — no in-app self-update on iOS. |

> **No desktop-only permission leaks into the iOS build.** Entitlements are empty (no
> iCloud, no push, no App Groups) — the free-provisioning-friendly, minimal-entitlement
> posture from `ios-mobile-plan.md` carries into submission.

### `check:tauri` result

`npm run check:tauri` (= `cd src-tauri && cargo fmt --check && cargo check`) was **run in this
worktree and passed — exit 0** (`Finished dev profile … in ~51s`). The Rust shell (desktop
feature set incl. the `#[cfg(desktop)]` updater path) compiles cleanly and is `rustfmt`-clean.

---

## Step 5 — Notes for App Review + Phase B runbook

### Notes for App Review (paste into App Store Connect → App Review Information → Notes)

**zh-TW / EN bilingual:**
```
Northstar is a local-first personal finance app. NO ACCOUNT OR LOGIN IS REQUIRED — you can
use every feature immediately on first launch.

To evaluate quickly, please use the built-in DEMO MODE (示範模式): it loads realistic sample
data (about a year of transactions, holdings, and prices) without affecting any real data, so
you can see the dashboard, investment analytics, cash-flow, and FIRE calculators fully
populated right away.

Data handling for review:
- All financial data is stored locally on the device (SQLite). Nothing is sent to a server
  operated by the developer.
- The app has no user accounts and collects no analytics or tracking data.
- Optional multi-device sync (not required to use the app) transmits only end-to-end
  encrypted data to a relay server that cannot read the contents.
- Market quotes/FX are fetched read-only from public third-party sources (Yahoo Finance,
  TWSE, SITCA). In demo mode these are skipped and synthetic prices are used.

No special hardware or configuration is needed. Primary language is Traditional Chinese
(zh-TW); English is partially localized.
```

**Local-network note (why the release build does NOT request it):** The "local network"
permission surfaces only in the **dev workflow** (`tauri ios dev`), where the app loads the
front end from a Vite dev server on the Mac's LAN (`ios-mobile-plan.md` → "本地網路權限"). A
**release/TestFlight build embeds the front end** (`frontendDist: "../dist"`), so it makes no
LAN connection and requests no local-network permission. Verified: the release `Info.plist`
(`gen/apple/northstar_iOS/Info.plist`) contains **no `NSLocalNetworkUsageDescription` and no
`NSBonjourServices`** key. Nothing to justify to the reviewer.

### Phase B runbook — OPERATOR-ONLY (executor must not perform any of these)

Numbered checklist; each step one line + an official-doc pointer.

1. **Enroll in the Apple Developer Program ($99/yr).** → developer.apple.com/programs/enroll
2. **Sign agreements + tax + banking** (Paid Apps agreement in App Store Connect → Agreements,
   Tax, and Banking; the free-app agreement is auto-accepted, but complete tax/banking so a
   future paid tier isn't blocked). → appstoreconnect.apple.com/agreements
3. **Create the App ID / app record** with bundle id **`app.northstar.finance`** (must match
   `tauri.conf.json`). → App Store Connect → My Apps → "+" → New App.
4. **Switch signing from Personal Team to the paid Team** in Xcode (`open
   src-tauri/gen/apple/northstar.xcodeproj` → target `northstar_iOS` → Signing & Capabilities
   → select the paid Team; keep "Automatically manage signing"). → `ios-mobile-plan.md`
   "一次性：Xcode 簽署設定".
5. **Set export compliance** — either add `ITSAppUsesNonExemptEncryption=false` to the plist
   (re-apply list above) or answer "uses exempt/standard encryption" once in App Store
   Connect. → developer.apple.com/documentation/security/complying-with-encryption-export-regulations
6. **Build an archive for release** and upload:
   ```bash
   npm run tauri ios build            # produces the IPA / archive (~10 min first run)
   ```
   then upload via Xcode Organizer or Transporter. → developer.apple.com/ios/submit
7. **TestFlight internal testing** — add internal testers (your own Apple ID), install via
   TestFlight, verify SQLite init, stronghold salt, demo mode, sync pairing on a real device.
   → App Store Connect → TestFlight.
8. **Capture screenshots** on the required device sizes (App Store Connect mandates at least):
   - **6.9"** iPhone (e.g. iPhone 16 Pro Max) — required.
   - **6.5"** iPhone — accepted fallback if 6.9" not provided.
   - **iPad 13"** (12.9") — required **only if** the app remains iPad-enabled (it is;
     `UISupportedInterfaceOrientations~ipad` is declared). Consider making it **iPhone-only**
     to skip iPad screenshots if the RWD pass (`ios-mobile-plan.md` Phase 3) isn't done.
   Screenshots need a signed device/sim build and final UI → do the RWD pass first.
9. **Fill App Privacy** answers from Step 2, **age rating** from Step 1, **metadata/ASO** from
   Step 1, and **Notes for App Review** from Step 5. → App Store Connect → App Information.
10. **Submit for review.** → App Store Connect → "Add for Review" → Submit.

**Roadmap coupling:** the same paid Apple Developer account also unblocks **macOS 公證
(notarization)** — the README currently warns macOS users the app is unsigned/un-notarized
(Gatekeeper "無法驗證開發者"). Notarization is a separate pipeline (own plan) but shares this
account, so enrolling clears two roadmap items at once.

---

## Maintenance notes

- **Re-audit Steps 2 & 4 before every real submission.** The privacy label and capability
  audit go stale the moment a feature adds a permission, a network host, or a data flow.
  Re-run the Step 2 greps and re-diff `capabilities/*.json` + `Info.plist`.
- **Screenshots + final ASO polish** depend on the touch-first RWD pass
  (`ios-mobile-plan.md` Phase 3) being done first — otherwise screenshots show desktop-ish
  layouts on phone sizes.
- **7-day free-provisioning friction** (re-sign every 7 days) disappears the day Phase B
  starts (paid signing → 1-year validity).
- **Privacy Policy URL** is a hard blocker for a Finance app — it must be live before
  submission (OPERATOR-PROVIDE).
