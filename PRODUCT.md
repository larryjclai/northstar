# Product

## Register

product

## Users

northstar is for individual investors in Taiwan who want a calm, private, native way to track stocks, ETFs, mutual funds, cash positions, dividends, and long-term wealth progress across Apple devices. They are not day traders living inside broker terminals. They are salary earners, long-term investors, and self-directed planners who check their portfolio after market close, during commutes, or while reviewing monthly progress on iPad or Mac.

The first user workflow is investment tracking: record buys, sells, cash dividends, stock dividends, capital reductions, fees, currencies, and linked cash movements. Later workflows include daily ledger, budgeting, subscriptions, and broader personal finance, but the MVP should make portfolio truth reliable before expanding.

## Product Purpose

northstar is a privacy-first, local-first wealth operating system. It helps people understand where their assets are, how their investments are performing, and whether their financial life is moving toward the life they want.

The product exists because most finance apps split a user's reality across broker apps, spreadsheets, banking apps, and budget tools. northstar should consolidate that reality without feeling like a brokerage terminal or an ad-driven financial marketplace. Success means a user trusts the numbers, understands the trend, and wants to return because the app makes money feel legible rather than stressful.

## Brand Personality

Calm, trustworthy, directional.

The product should feel like a quiet navigation instrument for wealth: precise enough for real investment decisions, warm enough to revisit often, and opinionated enough to keep users focused on long-term progress. Copilot Money is the primary product reference for approachable financial clarity. Robinhood is a reference for native momentum, tactility, and the sense that checking financial progress can feel lightweight and rewarding.

## Anti-references

northstar must not look or feel like a traditional brokerage app: dense red-green tickers, overloaded tables, loud alerts, fragmented account screens, or UI that assumes the user is actively trading every minute.

It should also avoid spreadsheet-like portfolio trackers, crypto-dashboard neon, generic navy-and-gold fintech branding, promotional bank-app clutter, and interfaces that monetize attention through product offers or credit-card ads.

## Design Principles

1. Make wealth directional. Every major screen should help the user understand whether they are moving closer to their north star, not just expose raw account data.
2. Earn trust before delight. Calculations, source states, timestamps, currency conversion, and portfolio events must be explainable.
3. Prefer calm density. The product can show serious financial detail, but it should stage complexity progressively instead of flattening everything into broker-style tables.
4. Native first, portable later. SwiftUI, SwiftData, Apple platform behavior, Dynamic Type, and accessibility come first. Domain rules and sync formats should remain clean enough to later support Web.
5. Privacy is part of the interface. Local-first storage, E2EE sync, and no-ad economics should be visible through choices and copy, not buried in policy language.

## Accessibility & Inclusion

The first version should prioritize Traditional Chinese, with English-ready labels and data structures for future localization. The interface should meet WCAG AA contrast where applicable, support dark mode, support Dynamic Type, and avoid relying on red or green alone to communicate gain, loss, risk, or action state.

Motion should be purposeful and respect Reduce Motion. Financial values should use locale-aware formatting, readable tabular numbers, and clear currency symbols. Empty, loading, and error states should explain what happened and what the user can do next.
