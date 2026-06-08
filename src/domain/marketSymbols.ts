export interface QuoteSymbolLike {
  symbol: string;
}

export function normalizeMarketSymbol(symbol: string) {
  return symbol.trim().toUpperCase();
}

export function stripTaiwanMarketSuffix(symbol: string) {
  return normalizeMarketSymbol(symbol).replace(/\.(TW|TWO)$/i, "");
}

export function quoteLookupKeys(symbol: string) {
  const normalized = normalizeMarketSymbol(symbol);
  if (!normalized) return [];
  const stripped = stripTaiwanMarketSuffix(normalized);
  if (normalized === stripped && /^\d{4,6}$/.test(normalized)) return [normalized, `${normalized}.TW`, `${normalized}.TWO`];
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

export function findQuoteForTicker<T extends QuoteSymbolLike>(lookup: Map<string, T>, ticker: string) {
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

export function tickerFromExchangeMic(symbol: string, exchangeMic: string | undefined) {
  const normalized = normalizeMarketSymbol(symbol);
  const mic = exchangeMic?.trim().toUpperCase();
  if (!/^\d{4,6}$/.test(normalized)) return normalized;
  if (mic === "XTAI") return `${normalized}.TW`;
  if (mic === "XTAI_OTC" || mic === "ROCO" || mic === "TPEX") return `${normalized}.TWO`;
  return normalized;
}
