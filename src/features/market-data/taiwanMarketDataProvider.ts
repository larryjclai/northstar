import { invoke } from "@tauri-apps/api/core";
import { parseCsvTable } from "../../data/csv";
import type { AssetProfile, SymbolSearchResult } from "./provider";

interface TaiwanOpenDataRow {
  "公司代號"?: string;
  "公司名稱"?: string;
  "公司簡稱"?: string;
  "產業別"?: string;
}

type TaiwanMarket = "TWSE" | "TPEx";

export interface TaiwanCompany {
  code: string;
  symbol: string;
  nameZh: string;
  nameShort: string | null;
  industry: string | null;
  market: TaiwanMarket;
}

const DATASETS: Array<{ market: TaiwanMarket; jsonUrl: string; csvUrl: string; suffix: ".TW" | ".TWO" }> = [
  {
    market: "TWSE",
    jsonUrl: "https://openapi.twse.com.tw/v1/opendata/t187ap03_L",
    csvUrl: "https://mopsfin.twse.com.tw/opendata/t187ap03_L.csv",
    suffix: ".TW",
  },
  {
    market: "TPEx",
    jsonUrl: "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O",
    csvUrl: "https://mopsfin.twse.com.tw/opendata/t187ap03_O.csv",
    suffix: ".TWO",
  },
];

// ── STOCK_DAY_ALL: all TWSE securities (incl. ETFs) with Chinese names ──
const STOCK_DAY_ALL_URL = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL";

interface TwseSecurityRow {
  Code?: string;
  Name?: string;
}

let companyCache: { updatedAt: number; companies: TaiwanCompany[] } | null = null;
let securityNamesCache: { updatedAt: number; names: Map<string, string> } | null = null;
const cacheMaxAgeMs = 24 * 60 * 60 * 1000;

export class TaiwanMarketDataProvider {
  readonly sourceName = "TWSE/TPEx Open Data";

  async fetchAssetProfiles(symbols: string[]): Promise<Record<string, AssetProfile>> {
    const wanted = [...new Set(symbols.map(normalizeSymbol).filter(isTaiwanCandidate))];
    if (wanted.length === 0) return {};

    const companies = await fetchCompanies();
    const byKey = buildCompanyMap(companies);
    let securityNames: Map<string, string>;
    try {
      securityNames = await fetchSecurityNames();
    } catch {
      securityNames = new Map();
    }
    const result: Record<string, AssetProfile> = {};

    for (const symbol of wanted) {
      const company = byKey.get(symbol) ?? byKey.get(stripMarketSuffix(symbol));
      if (company) {
        result[symbol] = {
          symbol,
          nameZh: company.nameZh,
          nameEn: null,
          assetType: "equity",
          sector: company.industry,
          industry: company.industry,
        };
        continue;
      }

      // Fallback: STOCK_DAY_ALL covers all TWSE securities incl. ETFs
      const nameZh = securityNames.get(symbol) ?? securityNames.get(stripMarketSuffix(symbol));
      if (nameZh) {
        result[symbol] = {
          symbol,
          nameZh,
          nameEn: null,
          assetType: "etf",
          sector: null,
          industry: null,
        };
      }
    }

    return result;
  }

  async searchSecurities(query: string, max = 10): Promise<SymbolSearchResult[]> {
    if (query.trim().length < 2) return [];
    try {
      const companies = await fetchCompanies();
      let names: Map<string, string>;
      try {
        names = await fetchSecurityNames();
      } catch {
        names = new Map();
      }
      return filterTaiwanSecurities(companies, names, query, max);
    } catch {
      return [];
    }
  }
}

async function fetchCompanies(): Promise<TaiwanCompany[]> {
  if (companyCache && Date.now() - companyCache.updatedAt < cacheMaxAgeMs) return companyCache.companies;

  const settled = await Promise.allSettled(DATASETS.map(fetchDataset));
  const companies = settled.flatMap((item) => (item.status === "fulfilled" ? item.value : []));
  companyCache = { updatedAt: Date.now(), companies };
  return companies;
}

/**
 * Parse TWSE STOCK_DAY_ALL rows into a map of code → Chinese name.
 * Keys both the bare code ("00878") and the suffixed form ("00878.TW").
 */
export function parseSecurityNames(rows: TwseSecurityRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const code = clean(row.Code);
    const name = clean(row.Name);
    if (!code || !name) continue;
    map.set(`${code}.TW`, name);
    map.set(code, name);
  }
  return map;
}

async function fetchSecurityNames(): Promise<Map<string, string>> {
  if (securityNamesCache && Date.now() - securityNamesCache.updatedAt < cacheMaxAgeMs) {
    return securityNamesCache.names;
  }

  try {
    const response = await fetchMarketData(STOCK_DAY_ALL_URL, "json");
    const rows = JSON.parse(response) as TwseSecurityRow[];
    const names = parseSecurityNames(rows);
    securityNamesCache = { updatedAt: Date.now(), names };
    return names;
  } catch (error) {
    console.warn("[market] TWSE STOCK_DAY_ALL unavailable; ETF Chinese names will be missing.", error);
    return new Map();
  }
}

/**
 * Local name/code search over cached TWSE/TPEx company directories and the
 * TWSE STOCK_DAY_ALL security list (covers ETFs). Companies match first
 * (by code, short name, or full name); the security-name list fills in
 * ETFs and other non-company securities not already matched.
 */
export function filterTaiwanSecurities(
  companies: TaiwanCompany[],
  securityNames: Map<string, string>,
  query: string,
  max = 10,
): SymbolSearchResult[] {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const needle = trimmed.toLowerCase();

  const results: SymbolSearchResult[] = [];
  const matchedSymbols = new Set<string>();

  for (const company of companies) {
    if (matchedSymbols.has(company.symbol)) continue;
    const haystacks = [company.code, company.nameShort, company.nameZh];
    const isMatch = haystacks.some((value) => value && value.toLowerCase().includes(needle));
    if (!isMatch) continue;
    results.push({
      symbol: company.symbol,
      name: company.nameShort ?? company.nameZh,
      exchange: company.market,
      typeLabel: "股票",
      assetType: "equity",
      currency: "TWD",
    });
    matchedSymbols.add(company.symbol);
    if (results.length >= max) return results;
  }

  for (const [key, name] of securityNames) {
    if (!key.endsWith(".TW")) continue;
    if (matchedSymbols.has(key)) continue;
    if (!name.toLowerCase().includes(needle)) continue;
    results.push({
      symbol: key,
      name,
      exchange: "TWSE",
      typeLabel: "ETF/證券",
      assetType: "etf",
      currency: "TWD",
    });
    matchedSymbols.add(key);
    if (results.length >= max) return results;
  }

  return results;
}

async function fetchDataset(dataset: (typeof DATASETS)[number]): Promise<TaiwanCompany[]> {
  try {
    const rows = await fetchJsonRows(dataset.jsonUrl);
    const parsed = rows.map((row) => rowToCompany(row, dataset)).filter((row): row is TaiwanCompany => Boolean(row));
    if (parsed.length) return parsed;
  } catch (error) {
    console.warn(`[market] ${dataset.market} JSON company profile unavailable; falling back to CSV.`, error);
  }

  const csv = await fetchText(dataset.csvUrl);
  const table = parseCsvTable(csv);
  return table.rows.map((row) => rowToCompany(row as TaiwanOpenDataRow, dataset)).filter((row): row is TaiwanCompany => Boolean(row));
}

async function fetchJsonRows(url: string): Promise<TaiwanOpenDataRow[]> {
  const response = await fetchMarketData(url, "json");
  return JSON.parse(response) as TaiwanOpenDataRow[];
}

async function fetchText(url: string): Promise<string> {
  return fetchMarketData(url, "text");
}

async function fetchMarketData(url: string, responseType: "json" | "text"): Promise<string> {
  if (isTauriRuntime()) {
    return invoke<string>("fetch_market_data", { url, responseType });
  }

  const response = await fetch(`/api/market-data?url=${encodeURIComponent(url)}&responseType=${responseType}`);
  if (!response.ok) throw new Error(`Market data returned HTTP ${response.status}.`);
  return response.text();
}

function rowToCompany(row: TaiwanOpenDataRow, dataset: (typeof DATASETS)[number]): TaiwanCompany | null {
  const code = clean(row["公司代號"]);
  const nameZh = clean(row["公司名稱"]) ?? clean(row["公司簡稱"]);
  if (!code || !nameZh) return null;
  const nameShort = clean(row["公司簡稱"]);
  const industry = clean(row["產業別"]);
  return {
    code,
    symbol: `${code}${dataset.suffix}`,
    nameZh,
    nameShort,
    industry,
    market: dataset.market,
  };
}

function buildCompanyMap(companies: TaiwanCompany[]) {
  const map = new Map<string, TaiwanCompany>();
  for (const company of companies) {
    map.set(company.code, company);
    map.set(company.symbol, company);
    if (company.market === "TWSE") map.set(`${company.code}.TW`, company);
    if (company.market === "TPEx") map.set(`${company.code}.TWO`, company);
  }
  return map;
}

function isTaiwanCandidate(symbol: string) {
  return /^\d{4,6}$/.test(symbol) || /^\d{4,6}\.(TW|TWO)$/.test(symbol);
}

function stripMarketSuffix(symbol: string) {
  return symbol.replace(/\.(TW|TWO)$/i, "");
}

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase();
}

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
