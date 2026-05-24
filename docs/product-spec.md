# Northstar Product Spec

## Positioning

Northstar is a local-first, privacy-first, cross-platform personal and household finance system. It helps users track investments, cash accounts, spending, net worth, household assets, and long-term progress without storing readable financial data on a server.

## Users

- Taiwan-based and global-market investors tracking stocks, ETFs, funds, cash, FX, and dividends.
- Couples and households that need shared asset views while preserving private vaults.
- Privacy-sensitive users who do not want a SaaS provider to read balances, transactions, holdings, or performance.

## Plans

- Free: local-only, no account required, manual entry, CSV import/export, dashboard, holdings, cash flow.
- Connect Basic: single-user encrypted device sync.
- Connect Duo: household sharing with selected shared accounts.
- Connect Plus: broker sync, licensed market data, and AI-provider-included features.

## Core Rules

- Local-only mode never requires an account.
- Connect requires a confirmed Recovery Kit before sync, household sharing, cloud attachment backup, or broker sync.
- Account login identifies the user but does not decrypt finance data.
- New devices require trusted-device approval or Recovery Kit.
- Household sharing uses a separate Household Space Key.
- If all trusted devices and the Recovery Kit are lost, Northstar cannot decrypt the user's data.

## MVP Acceptance

- Tauri app shell runs locally.
- User can inspect seeded local accounts, holdings, transactions, cash flow, and settings.
- Domain tests cover the first ported calculation helpers.
- Yahoo Finance provider exists behind a replaceable interface.
- E2EE/Connect boundaries and product policies are encoded in modules and docs.

