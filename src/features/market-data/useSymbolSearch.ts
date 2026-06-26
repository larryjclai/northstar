import { useEffect, useState } from "react";
import type { SymbolSearchResult } from "./provider";
import { YahooFinanceProvider } from "./yahooFinanceProvider";
import { TaiwanMarketDataProvider } from "./taiwanMarketDataProvider";

const provider = new YahooFinanceProvider();
const twProvider = new TaiwanMarketDataProvider();

export function useSymbolSearch(query: string) {
  const [results, setResults] = useState<SymbolSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      provider.searchSymbols(trimmed)
        .then(async (items) => {
          if (cancelled) return;
          try {
            const symbols = items.map((i) => i.symbol);
            const profiles = await twProvider.fetchAssetProfiles(symbols);
            if (cancelled) return;
            const enriched = items.map((item) => {
              const tw = profiles[item.symbol];
              if (tw && tw.nameZh) {
                return { ...item, name: tw.nameZh };
              }
              return item;
            });
            setResults(enriched);
          } catch (err) {
            if (cancelled) return;
            setResults(items);
          }
        })
        .catch((searchError: unknown) => {
          if (cancelled) return;
          setResults([]);
          setError(searchError instanceof Error ? searchError.message : "搜尋 ticker 失敗。");
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  return { results, isLoading, error };
}
