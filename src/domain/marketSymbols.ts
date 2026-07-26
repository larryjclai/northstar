export interface QuoteSymbolLike {
  symbol: string;
}

export function normalizeMarketSymbol(symbol: string) {
  return symbol.trim().toUpperCase();
}

export function stripTaiwanMarketSuffix(symbol: string) {
  return normalizeMarketSymbol(symbol).replace(/\.(TW|TWO)$/i, "");
}

/** Taiwan-listed ticker: explicit .TW/.TWO suffix, or a bare 4–6 digit code
 *  (the same heuristic quoteLookupKeys has always used). */
export function isTaiwanListedTicker(symbol: string): boolean {
  const normalized = normalizeMarketSymbol(symbol);
  if (!normalized) return false;
  if (normalized !== stripTaiwanMarketSuffix(normalized)) return true; // had .TW/.TWO
  return /^\d{4,6}$/.test(normalized);
}

export function quoteLookupKeys(symbol: string) {
  const normalized = normalizeMarketSymbol(symbol);
  if (!normalized) return [];
  const stripped = stripTaiwanMarketSuffix(normalized);
  if (normalized === stripped && /^\d{4,6}$/.test(normalized))
    return [normalized, `${normalized}.TW`, `${normalized}.TWO`];
  return normalized === stripped ? [normalized] : [normalized, stripped];
}

export function buildQuoteLookup<T extends QuoteSymbolLike>(quotes: T[]) {
  const lookup = new Map<string, T>();
  for (const quote of quotes) {
    const [exact, ...aliases] = quoteLookupKeys(quote.symbol);
    if (exact) lookup.set(exact, quote);
    for (const alias of aliases) {
      if (!lookup.has(alias)) lookup.set(alias, quote);
    }
  }
  return lookup;
}

export function findQuoteForTicker<T extends QuoteSymbolLike>(
  lookup: Map<string, T>,
  ticker: string,
) {
  for (const key of quoteLookupKeys(ticker)) {
    const quote = lookup.get(key);
    if (quote) return quote;
  }
  return undefined;
}

export function expandMarketDataSymbols(symbols: string[]) {
  const expanded = new Set<string>();
  for (const symbol of symbols) {
    const normalized = normalizeMarketSymbol(symbol);
    if (!normalized) continue;
    expanded.add(normalized);
    if (/^\d{4,6}$/.test(normalized)) {
      expanded.add(`${normalized}.TW`);
      expanded.add(`${normalized}.TWO`);
    }
  }
  return [...expanded];
}

/**
 * Bare numeric tickers (2330, 0050, 0700) are ambiguous across markets —
 * .TW 上市 / .TWO 上櫃 / .HK 港股 all use digits. Entry points reject them so
 * the stored ticker always carries the market the user actually picked, and
 * quote lookups never have to guess (the .TW/.TWO expansion below remains
 * only as a fallback for legacy rows saved before this guard).
 */
export function assertExplicitMarketSuffix(ticker: string): void {
  const normalized = normalizeMarketSymbol(ticker);
  if (/^\d{4,6}$/.test(normalized)) {
    throw new Error(
      `「${normalized}」缺少市場後綴，無法分辨上市/上櫃/港股等市場。請從搜尋結果選擇正確市場（例如 ${normalized}.TW、${normalized}.TWO 或 ${normalized}.HK）。`,
    );
  }
}

export function tickerFromExchangeMic(symbol: string, exchangeMic: string | undefined) {
  const normalized = normalizeMarketSymbol(symbol);
  const mic = exchangeMic?.trim().toUpperCase();
  if (!/^\d{4,6}$/.test(normalized)) return normalized;
  if (mic === "XTAI") return `${normalized}.TW`;
  if (mic === "XTAI_OTC" || mic === "ROCO" || mic === "TPEX") return `${normalized}.TWO`;
  return normalized;
}
