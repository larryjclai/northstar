import { useEffect, useState } from "react";
import type { SymbolSearchResult } from "./provider";
import { YahooFinanceProvider } from "./yahooFinanceProvider";

const provider = new YahooFinanceProvider();

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
        .then((items) => {
          if (cancelled) return;
          setResults(items);
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
