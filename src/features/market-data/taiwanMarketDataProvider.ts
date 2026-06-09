import { invoke } from "@tauri-apps/api/core";
import { parseCsvTable } from "../../data/csv";
import type { AssetProfile } from "./provider";

interface TaiwanOpenDataRow {
  "公司代號"?: string;
  "公司名稱"?: string;
  "公司簡稱"?: string;
  "產業別"?: string;
}

type TaiwanMarket = "TWSE" | "TPEx";

interface TaiwanCompany {
  code: string;
  symbol: string;
  nameZh: string;
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

let companyCache: { updatedAt: number; companies: TaiwanCompany[] } | null = null;
const cacheMaxAgeMs = 24 * 60 * 60 * 1000;

export class TaiwanMarketDataProvider {
  readonly sourceName = "TWSE/TPEx Open Data";

  async fetchAssetProfiles(symbols: string[]): Promise<Record<string, AssetProfile>> {
    const wanted = [...new Set(symbols.map(normalizeSymbol).filter(isTaiwanCandidate))];
    if (wanted.length === 0) return {};

    const companies = await fetchCompanies();
    const byKey = buildCompanyMap(companies);
    const result: Record<string, AssetProfile> = {};

    for (const symbol of wanted) {
      const company = byKey.get(symbol) ?? byKey.get(stripMarketSuffix(symbol));
      if (!company) continue;
      result[symbol] = {
        symbol,
        nameZh: company.nameZh,
        nameEn: null,
        assetType: "equity",
        sector: company.industry,
        industry: company.industry,
      };
    }

    return result;
  }
}

async function fetchCompanies(): Promise<TaiwanCompany[]> {
  if (companyCache && Date.now() - companyCache.updatedAt < cacheMaxAgeMs) return companyCache.companies;

  const settled = await Promise.allSettled(DATASETS.map(fetchDataset));
  const companies = settled.flatMap((item) => (item.status === "fulfilled" ? item.value : []));
  companyCache = { updatedAt: Date.now(), companies };
  return companies;
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
  const industry = clean(row["產業別"]);
  return {
    code,
    symbol: `${code}${dataset.suffix}`,
    nameZh,
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
