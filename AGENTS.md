# AGENTS.md — Northstar

> **Canonical agent guide.** This is the single source of truth for every AI agent
> (Claude Code, Codex, Gemini, Antigravity, and any subagent) working in this repo.
> `CLAUDE.md` imports this file, so edit guidance **here**, not in two places.

## What this project is

Northstar is a **local-first, privacy-first personal & household finance app**: it merges
cash-flow tracking (expenses) and an investment ledger into one net-worth picture. Data
lives in local SQLite on the user's own device; optional multi-device sync is end-to-end
encrypted. UI is **繁體中文 (zh-TW) first**, English partial.

- **Stack:** React + TypeScript front end, **Tauri 2** shell (desktop + mobile), Rust
  (`src-tauri/`), `plugin-sql` over SQLite. Vite + Vitest + Playwright.
  *(Ignore any "SwiftUI / Apple-native" wording in `.impeccable.md` — that file is stale;
  the real stack is React/TS + Tauri.)*
- **Repo:** https://github.com/larryjclai/northstar — status: **Alpha** (`0.1.0-alpha.x`),
  schema not guaranteed backward-compatible before GA.

## Doc map — read these, don't duplicate them

| Topic | File |
|---|---|
| Product overview / features (zh-TW) | [README.md](README.md) |
| Product principles & packaging | [PRODUCT.md](PRODUCT.md) |
| Design direction & aesthetic | [DESIGN.md](DESIGN.md) |
| Roadmap | [ROADMAP.md](ROADMAP.md) |
| Architecture | [docs/architecture.md](docs/architecture.md) |
| Product spec | [docs/product-spec.md](docs/product-spec.md) |
| Local build / test / package | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) |
| Contributing | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Security / disclosure | [SECURITY.md](SECURITY.md) |
| Release process | [RELEASING.md](RELEASING.md) |
| Git collaboration rules (**mandatory**) | [.agentrules](.agentrules) |

## Non-negotiable invariants

1. **Correctness first for finance.** Calculations must be explainable and testable.
   Decided semantics: moving-average cost, TWR/XIRR/price-return reported side by side,
   cash-basis net worth (+ adjusted net worth with receivables/payables), reconciliation
   identity `assets − liabilities = net worth`. Don't silently change financial math.
2. **Local-first & private.** No sending user financial data to the cloud. Sync is E2E
   encrypted; the server must never become a readable finance database.
3. **Market data providers are replaceable.** Quotes/FX via Yahoo Finance today — keep it
   behind an abstraction, don't hard-couple.
4. **Don't overwrite the Design System.** Never replace the custom Design System / vanilla
   CSS with a generic framework (e.g. Shadcn) without explicit permission. See `.agentrules`.

## Git workflow (summary — full rules in `.agentrules`)

- **Protect WIP:** check `git status` before destructive/branching actions. If the human
  has uncommitted work, ask or make a safe `wip:` commit. Never `stash` unless asked.
- **Always branch:** AI work goes on `feat/ai-<name>` or `fix/ai-<name>`, never directly
  on `main` unless explicitly told.
- **No destructive commands** (`reset --hard`, `push -f`) on shared branches without a
  backup branch first.
- **PRs:** push the branch, tell the user it's ready, let them decide the merge.

## Common commands

```bash
npm run dev          # Vite dev server
npm run build        # tsc + vite build (prebuild injects private assets)
npm test             # vitest run
npm run test:e2e     # playwright
npm run lint         # eslint src
npm run check:tauri  # cargo fmt --check && cargo check (in src-tauri/)
npm run tauri        # tauri CLI (dev/build the desktop/mobile app)
```

## Gotchas worth knowing

- `plugin-sql` pool serialization can cause `db-locked`; sync uses a localStorage pull
  cursor with `forceFullResync` recovery. No `window.confirm` in Tauri.
- UI copy is edited in `copy.csv` then round-tripped via `npm run copy:export/import` —
  don't hand-edit strings straight in `.tsx`.
- vitest jsdom has no `localStorage`; stub per-test with `vi.stubGlobal`.
- i18n is zh-TW default; header convention is English eyebrow + Chinese h1.
