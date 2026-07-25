import { useEffect, useState } from "react";
import type { SymbolSearchResult } from "./provider";
import { SitcaFundProvider } from "./sitcaFundProvider";
import { YahooFinanceProvider } from "./yahooFinanceProvider";
import { TaiwanMarketDataProvider } from "./taiwanMarketDataProvider";

const provider = new YahooFinanceProvider();
const twProvider = new TaiwanMarketDataProvider();
const sitcaProvider = new SitcaFundProvider();

// Funds outnumber every other source (~4,400 rows in the SITCA file), so the
// dropdown shows more of them than the old 20 — paired with a "narrow your
// search" hint when even 50 is not the whole match set. The panel scrolls
// (TickerSearchField), so a long list does not run off-screen.
const MAX_FUND_RESULTS = 50;

export function useSymbolSearch(query: string) {
  const [results, setResults] = useState<SymbolSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fundOverflow, setFundOverflow] = useState<number>(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setIsLoading(false);
      setError(null);
      setFundOverflow(0);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    const timer = window.setTimeout(async () => {
      try {
        const [yahoo, funds, twLocal] = await Promise.allSettled([
          provider.searchSymbols(trimmed),
          sitcaProvider.searchFunds(trimmed, MAX_FUND_RESULTS),
          twProvider.searchSecurities(trimmed),
        ]);
        if (cancelled) return;

        const yahooItems = yahoo.status === "fulfilled" ? yahoo.value : [];
        const fundResult = funds.status === "fulfilled" ? funds.value : { items: [], total: 0 };
        const fundItems = fundResult.items;
        const twItems = twLocal.status === "fulfilled" ? twLocal.value : [];

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

        // De-duplicate: if Yahoo already returned a symbol, skip the local TW / SITCA entry.
        const seen = new Set(enrichedYahoo.map((r) => r.symbol));
        const uniqueTw = twItems.filter((r) => !seen.has(r.symbol));
        uniqueTw.forEach((r) => seen.add(r.symbol));
        const uniqueFunds = fundItems.filter((f) => !seen.has(f.symbol));

        setResults([...enrichedYahoo, ...uniqueTw, ...uniqueFunds]);
        setFundOverflow(Math.max(0, fundResult.total - uniqueFunds.length));

        // Only show an error when Yahoo failed AND no local/fund results to fall back on.
        if (yahoo.status === "rejected" && uniqueTw.length === 0 && uniqueFunds.length === 0) {
          const err = yahoo.reason;
          setError(err instanceof Error ? err.message : "搜尋 ticker 失敗。");
        }
      } catch (outerError: unknown) {
        if (cancelled) return;
        setResults([]);
        setFundOverflow(0);
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

  return { results, isLoading, error, fundOverflow };
}
