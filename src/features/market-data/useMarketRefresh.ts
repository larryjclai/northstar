import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../data/hooks";
import { getFinanceRepository } from "../../data/repositories";
import { YahooFinanceProvider } from "./yahooFinanceProvider";

export function useRefreshQuotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (symbols: string[]) => {
      const provider = new YahooFinanceProvider();
      const repository = await getFinanceRepository();
      const quotesBySymbol = await provider.fetchQuotes(symbols);
      const quotes = Object.values(quotesBySymbol);
      if (quotes.length === 0) throw new Error("Yahoo Finance 沒有回傳任何報價。");
      await repository.saveMarketQuotes(quotes, provider.sourceName);
      return quotes;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.quotes });
    },
  });
}
