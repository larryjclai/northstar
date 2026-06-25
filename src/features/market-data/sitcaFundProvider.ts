import { invoke } from "@tauri-apps/api/core";
import { parseCsvTable } from "../../data/csv";
import type { MarketQuote } from "./provider";

// Daily NAV for Taiwan domestic open-end mutual funds, sourced from the SITCA
// government open-data CSV (data.gov.tw #11109). One CSV holds all ~4,200 funds,
// so a single fetch covers every fund symbol we are asked about.
//
// Design notes + the operator-signed-off decisions live in
// docs/taiwan-fund-nav-plan.md. Key facts mirrored here:
//   - The file is UTF-8 WITH A BOM (EF BB BF), NOT BIG5 — strip the leading BOM
//     so the first column header (日期) is not corrupted; no charset conversion.
//   - A fund's ticker is `SITCA:<基金代號>`; NAV is stored in its native currency
//     (col 幣別) and the existing FX layer handles display.
export const SITCA_NAV_URL = "https://www.sitca.org.tw/MemberK0000/F/03/nav.csv";
export const SITCA_TICKER_PREFIX = "SITCA:";

// CSV header columns (comma-separated):
//   日期,會員代號,公司名稱,基金統編,基金代號,基金名稱,基金淨值,漲跌,漲跌幅,類型代號,幣別,受益憑證代號
const COL_DATE = "日期";
const COL_FUND_CODE = "基金代號";
const COL_FUND_NAME = "基金名稱";
const COL_NAV = "基金淨值";
const COL_CURRENCY = "幣別";

interface SitcaFund {
  code: string;
  nav: number;
  currency: string;
  name: string;
  date: string;
}

const cacheMaxAgeMs = 60 * 60 * 1000;
let fundCache: { updatedAt: number; byCode: Map<string, SitcaFund> } | null = null;

export class SitcaFundProvider {
  readonly sourceName = "SITCA";

  async fetchQuotes(symbols: string[]): Promise<Record<string, MarketQuote>> {
    const wanted = [...new Set(symbols.map(normalizeSymbol).filter(isFundSymbol))];
    if (wanted.length === 0) return {};

    const byCode = await fetchFunds();
    const result: Record<string, MarketQuote> = {};
    for (const symbol of wanted) {
      const code = symbol.slice(SITCA_TICKER_PREFIX.length);
      const fund = byCode.get(code);
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

async function fetchFunds(): Promise<Map<string, SitcaFund>> {
  if (fundCache && Date.now() - fundCache.updatedAt < cacheMaxAgeMs) return fundCache.byCode;
  const csv = await fetchMarketData(SITCA_NAV_URL);
  const byCode = parseSitcaNavCsv(csv);
  fundCache = { updatedAt: Date.now(), byCode };
  return byCode;
}

/**
 * Parse the SITCA NAV CSV into a `基金代號 → fund` map. Pure (no I/O) so the
 * parse test can feed a captured sample. Strips the UTF-8 BOM before parsing so
 * the first column header is intact.
 */
export function parseSitcaNavCsv(csv: string): Map<string, SitcaFund> {
  const table = parseCsvTable(stripBom(csv));
  const byCode = new Map<string, SitcaFund>();
  for (const row of table.rows) {
    const code = clean(row[COL_FUND_CODE]);
    const nav = Number(clean(row[COL_NAV]));
    if (!code || !Number.isFinite(nav)) continue;
    byCode.set(code, {
      code,
      nav,
      currency: clean(row[COL_CURRENCY]) || "TWD",
      name: clean(row[COL_FUND_NAME]),
      date: clean(row[COL_DATE]),
    });
  }
  return byCode;
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
