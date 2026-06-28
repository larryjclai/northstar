import { useEffect, useState } from "react";
import type { SymbolSearchResult } from "./provider";
import { SitcaFundProvider } from "./sitcaFundProvider";
import { YahooFinanceProvider } from "./yahooFinanceProvider";
import { TaiwanMarketDataProvider } from "./taiwanMarketDataProvider";

const provider = new YahooFinanceProvider();
const twProvider = new TaiwanMarketDataProvider();
const sitcaProvider = new SitcaFundProvider();

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
    const timer = window.setTimeout(async () => {
      try {
        const [yahoo, funds] = await Promise.allSettled([
          provider.searchSymbols(trimmed),
          sitcaProvider.searchFunds(trimmed),
        ]);
        if (cancelled) return;

        const yahooItems = yahoo.status === "fulfilled" ? yahoo.value : [];
        const fundItems = funds.status === "fulfilled" ? funds.value : [];

        // Enrich Yahoo results with Taiwan asset profiles (best-effort).
        let enrichedYahoo = yahooItems;
        if (yahooItems.length > 0) {
          try {
            const symbols = yahooItems.map((i) => i.symbol);
            const profiles = await twProvider.fetchAssetProfiles(symbols);
            if (cancelled) return;
            enrichedYahoo = yahooItems.map((item) => {
              const tw = profiles[item.symbol];
              if (tw && tw.nameZh) {
                return { ...item, name: tw.nameZh };
              }
              return item;
            });
          } catch {
            // Profile enrichment failed; use raw Yahoo items.
          }
        }

        if (cancelled) return;

        // De-duplicate: if Yahoo already returned a symbol, skip the SITCA entry.
        const seen = new Set(enrichedYahoo.map((r) => r.symbol));
        const uniqueFunds = fundItems.filter((f) => !seen.has(f.symbol));

        setResults([...enrichedYahoo, ...uniqueFunds]);

        // Only show an error when Yahoo failed AND no fund results to fall back on.
        if (yahoo.status === "rejected" && uniqueFunds.length === 0) {
          const err = yahoo.reason;
          setError(err instanceof Error ? err.message : "搜尋 ticker 失敗。");
        }
      } catch (outerError: unknown) {
        if (cancelled) return;
        setResults([]);
        setError(outerError instanceof Error ? outerError.message : "搜尋 ticker 失敗。");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  return { results, isLoading, error };
}
