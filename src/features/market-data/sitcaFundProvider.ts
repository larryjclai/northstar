import { invoke } from "@tauri-apps/api/core";
import { parseCsvTable } from "../../data/csv";
import type { MarketQuote, SymbolSearchResult } from "./provider";

// Daily NAV for Taiwan domestic open-end mutual funds, sourced from the SITCA
// government open-data CSV (data.gov.tw #11109). One CSV holds all ~4,200 funds,
// so a single fetch covers every fund symbol we are asked about.
//
// Design notes + the operator-signed-off decisions live in
// docs/taiwan-fund-nav-plan.md. Key facts mirrored here:
//   - The file is UTF-8 WITH A BOM (EF BB BF), NOT BIG5 — strip the leading BOM
//     so the first column header (日期) is not corrupted; no charset conversion.
//   - 基金代號 is NOT unique across fund companies (hundreds of codes repeat;
//     19 rows share `DIO04` alone), so the canonical ticker is
//     `SITCA:<受益憑證代號>` — unique file-wide and what bank statements show.
//     Legacy `SITCA:<基金代號>` tickers still price when the code maps to
//     exactly one fund; ambiguous codes are skipped rather than priced wrong.
//   - NAV is stored in its native currency (col 幣別) and the existing FX
//     layer handles display.
export const SITCA_NAV_URL = "https://www.sitca.org.tw/MemberK0000/F/03/nav.csv";
export const SITCA_TICKER_PREFIX = "SITCA:";

// CSV header columns (comma-separated):
//   日期,會員代號,公司名稱,基金統編,基金代號,基金名稱,基金淨值,漲跌,漲跌幅,類型代號,幣別,受益憑證代號
const COL_DATE = "日期";
const COL_COMPANY = "公司名稱";
const COL_FUND_CODE = "基金代號";
const COL_FUND_NAME = "基金名稱";
const COL_NAV = "基金淨值";
const COL_CURRENCY = "幣別";
const COL_CERT_CODE = "受益憑證代號";

interface SitcaFund {
  code: string;
  // Customer-facing certificate code (what bank/fund-platform statements
  // show, e.g. `T1605Y`) — distinct from the internal 基金代號 (e.g. `DIO04`).
  certCode: string;
  nav: number;
  currency: string;
  name: string;
  // 基金公司名稱, e.g. 群益投信 — searchable so a brand query finds the fund even
  // when the 基金名稱 spells the brand differently (滙豐投信 vs 匯豐…基金).
  company: string;
  date: string;
}

// Sanity floor before a fetched parse may replace the cache. The live file
// has held ~4,400 rows for years, but the SITCA server intermittently serves
// a truncated file (~37 rows / 4.5 KB observed 2026-07-11) — caching that for
// an hour empties fund search and stalls every held fund's NAV.
export const MIN_EXPECTED_FUND_COUNT = 1000;

/** Pure guard: does a parsed fund list look like the full SITCA universe? */
export function isPlausibleFundList(funds: SitcaFund[]): boolean {
  return funds.length >= MIN_EXPECTED_FUND_COUNT;
}

const cacheMaxAgeMs = 60 * 60 * 1000;
type FundCacheEntry = { updatedAt: number; funds: SitcaFund[]; bySuffix: Map<string, SitcaFund> };
let fundCache: FundCacheEntry | null = null;

export function resetSitcaFundCacheForTests(): void {
  fundCache = null;
}

export class SitcaFundProvider {
  readonly sourceName = "SITCA";

  /**
   * Ranked fund search. Returns the capped display list plus `total`, the
   * unfiltered match count, so the caller can tell the user when a broad query
   * (e.g. a bare fund-company name) matched far more funds than are shown.
   */
  async searchFunds(
    query: string,
    max = 20,
  ): Promise<{ items: SymbolSearchResult[]; total: number }> {
    if (query.trim().length < 2) return { items: [], total: 0 };
    try {
      const { funds } = await fetchFunds();
      return { items: filterFunds(funds, query, max), total: countFundMatches(funds, query) };
    } catch {
      return { items: [], total: 0 };
    }
  }

  async fetchQuotes(symbols: string[]): Promise<Record<string, MarketQuote>> {
    const wanted = [...new Set(symbols.map(normalizeSymbol).filter(isFundSymbol))];
    if (wanted.length === 0) return {};

    const { bySuffix } = await fetchFunds();
    const result: Record<string, MarketQuote> = {};
    for (const symbol of wanted) {
      const suffix = symbol.slice(SITCA_TICKER_PREFIX.length);
      const fund = bySuffix.get(suffix);
      if (!fund) continue;
      result[symbol] = {
        symbol,
        name: fund.name || symbol,
        nameZh: fund.name || null,
        nameEn: null,
        currency: fund.currency || "TWD",
        price: fund.nav,
        change: 0,
        changePercent: 0,
        marketTime: fund.date || null,
      };
    }
    return result;
  }
}

/**
 * Fold a fund name / code / query to a comparable form. Taiwanese fund names are
 * written inconsistently across the SITCA file, fund-company sites, and bank
 * statements, so a raw `includes` misses obvious matches:
 *   - 群益 writes 「群益新興金鑽基金-新臺幣」; its own site titles the same fund
 *     「群益新興金鑽基金 - 新臺幣」 (spaces around the hyphen) → zero hits.
 *   - 767 live fund names use 臺 and 874 use 台; 滙豐投信's funds are named 匯豐….
 * Folding: NFKC (full-width → half-width), lowercase, drop whitespace and
 * separator punctuation, and unify the 臺/台 and 滙/匯 variants. `\s` already
 * covers 全形空白 U+3000, so no literal ideographic space is needed in the class.
 */
export function normalizeFundQuery(text: string): string {
  return (text ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/[-‐‑–—－ー_()（）[\]【】{}.,，、·・/／|｜]/g, "")
    .replace(/臺/g, "台")
    .replace(/滙/g, "匯");
}

/** Canonical ticker for a fund: 受益憑證代號 when present, 基金代號 as fallback. */
export function fundSymbol(fund: Pick<SitcaFund, "code" | "certCode">): string {
  return `${SITCA_TICKER_PREFIX}${(fund.certCode || fund.code).toUpperCase()}`;
}

// Lower score = better match. Ties keep the file's original order (stable sort),
// so a query that matches hundreds of funds is at least deterministic.
const SCORE_EXACT_CODE = 0; // query === 受益憑證代號 or === 基金代號
const SCORE_CODE_PREFIX = 1; // code / certCode starts with the query
const SCORE_NAME_EXACT = 2; // 基金名稱 === query
const SCORE_NAME_PREFIX = 3; // 基金名稱 starts with the query
const SCORE_NAME_SUBSTR = 4; // 基金名稱 contains the query
const SCORE_CODE_SUBSTR = 5; // code / certCode contains the query
const SCORE_COMPANY = 6; // only 公司名稱 matched
const NO_MATCH = Number.POSITIVE_INFINITY;

/** Score one fund against an already-normalized query. `NO_MATCH` = filtered out. */
function scoreFund(fund: SitcaFund, q: string): number {
  const code = normalizeFundQuery(fund.code);
  const certCode = normalizeFundQuery(fund.certCode ?? "");
  const name = normalizeFundQuery(fund.name ?? "");
  const company = normalizeFundQuery(fund.company ?? "");

  if (code === q || certCode === q) return SCORE_EXACT_CODE;
  if ((code && code.startsWith(q)) || (certCode && certCode.startsWith(q)))
    return SCORE_CODE_PREFIX;
  if (name === q) return SCORE_NAME_EXACT;
  if (name.startsWith(q)) return SCORE_NAME_PREFIX;
  if (name.includes(q)) return SCORE_NAME_SUBSTR;
  if (code.includes(q) || certCode.includes(q)) return SCORE_CODE_SUBSTR;
  if (company.includes(q)) return SCORE_COMPANY;
  return NO_MATCH;
}

/**
 * Ranked filter: match funds by 基金代號, name, 受益憑證代號, or 公司名稱 against a
 * query string, scoring every fund and returning the best `max` matches
 * (exact code → code prefix → name exact → name prefix → name substring →
 * code substring → company-only), not the first `max` found in file order.
 * No I/O — testable standalone.
 */
export function filterFunds(funds: SitcaFund[], query: string, max = 20): SymbolSearchResult[] {
  const q = normalizeFundQuery(query);
  if (!q) return [];
  const scored: Array<{ fund: SitcaFund; score: number; index: number }> = [];
  funds.forEach((fund, index) => {
    const score = scoreFund(fund, q);
    if (score !== NO_MATCH) scored.push({ fund, score, index });
  });
  scored.sort((a, b) => a.score - b.score || a.index - b.index);
  return scored.slice(0, max).map(({ fund }) => ({
    symbol: fundSymbol(fund),
    name: fund.name || fundSymbol(fund),
    currency: fund.currency || "TWD",
    exchange: "SITCA",
    assetType: "mutual_fund" as const,
  }));
}

/**
 * How many funds match `query` in total, ignoring the display cap. The ticker
 * dropdown uses this to tell the user their query matched more funds than it
 * can show, instead of silently truncating (the failure that hid
 * 「群益新興金鑽基金-新臺幣」 — 151st of 259 「群益」 matches).
 */
export function countFundMatches(funds: SitcaFund[], query: string): number {
  const q = normalizeFundQuery(query);
  if (!q) return 0;
  let total = 0;
  for (const fund of funds) if (scoreFund(fund, q) !== NO_MATCH) total += 1;
  return total;
}

async function fetchFunds(): Promise<{ funds: SitcaFund[]; bySuffix: Map<string, SitcaFund> }> {
  if (fundCache && Date.now() - fundCache.updatedAt < cacheMaxAgeMs) return fundCache;
  const csv = await fetchMarketData(SITCA_NAV_URL);
  const funds = parseSitcaNavCsv(csv);
  if (!isPlausibleFundList(funds)) {
    // Truncated download — a stale full universe beats a fresh sliver, and a
    // sliver must never be pinned for an hour: serve it uncached so the next
    // call retries.
    if (fundCache) return fundCache;
    return { funds, bySuffix: buildFundSymbolIndex(funds) };
  }
  fundCache = { updatedAt: Date.now(), funds, bySuffix: buildFundSymbolIndex(funds) };
  return fundCache;
}

/**
 * Parse the SITCA NAV CSV into a fund list. Keeps every valid row — 基金代號
 * repeats across fund companies, so rows must NOT be collapsed by code (a
 * code-keyed map silently dropped ~3,600 of ~4,400 funds). Pure (no I/O) so
 * the parse test can feed a captured sample. Strips the UTF-8 BOM before
 * parsing so the first column header is intact.
 */
export function parseSitcaNavCsv(csv: string): SitcaFund[] {
  const table = parseCsvTable(stripBom(csv));
  const funds: SitcaFund[] = [];
  for (const row of table.rows) {
    const code = clean(row[COL_FUND_CODE]);
    const nav = Number(clean(row[COL_NAV]));
    if (!code || !Number.isFinite(nav)) continue;
    funds.push({
      code,
      certCode: clean(row[COL_CERT_CODE]),
      nav,
      currency: clean(row[COL_CURRENCY]) || "TWD",
      name: clean(row[COL_FUND_NAME]),
      company: clean(row[COL_COMPANY]),
      date: clean(row[COL_DATE]),
    });
  }
  return funds;
}

/**
 * Index funds by ticker suffix (the part after `SITCA:`), uppercase.
 * 受益憑證代號 is the canonical key; legacy 基金代號 keys are kept only when the
 * code maps to exactly one fund — an ambiguous code must not price a holding
 * off an arbitrary fund's NAV. Cert entries win key conflicts.
 */
export function buildFundSymbolIndex(funds: SitcaFund[]): Map<string, SitcaFund> {
  const codeCounts = new Map<string, number>();
  for (const fund of funds) {
    const key = fund.code.toUpperCase();
    codeCounts.set(key, (codeCounts.get(key) ?? 0) + 1);
  }
  const bySuffix = new Map<string, SitcaFund>();
  for (const fund of funds) {
    const key = fund.code.toUpperCase();
    if (codeCounts.get(key) === 1) bySuffix.set(key, fund);
  }
  for (const fund of funds) {
    if (fund.certCode) bySuffix.set(fund.certCode.toUpperCase(), fund);
  }
  return bySuffix;
}

/** Strip a single leading UTF-8 BOM (`﻿`) if present. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function isFundSymbol(symbol: string): boolean {
  return symbol.startsWith(SITCA_TICKER_PREFIX) && symbol.length > SITCA_TICKER_PREFIX.length;
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

async function fetchMarketData(url: string): Promise<string> {
  if (isTauriRuntime()) {
    return invoke<string>("fetch_market_data", { url, responseType: "text" });
  }
  const response = await fetch(`/api/market-data?url=${encodeURIComponent(url)}&responseType=text`);
  if (!response.ok) throw new Error(`Market data returned HTTP ${response.status}.`);
  return response.text();
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
