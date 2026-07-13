import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { getFinanceRepository, type FinanceRepository } from "./repositories";
import { noteLocalChange } from "../features/connect/sync/pushScheduler";

const keys = {
  repository: ["repository"] as const,
  accounts: ["accounts"] as const,
  ledger: ["ledger"] as const,
  assets: ["assets"] as const,
  investments: ["investments"] as const,
  recurring: ["recurring"] as const,
  recurringInvestments: ["recurringInvestments"] as const,
  quotes: ["quotes"] as const,
  settings: ["settings"] as const,
  dailyFxRates: ["dailyFxRates"] as const,
  dailyPrices: ["dailyPrices"] as const,
  financialGoals: ["financialGoals"] as const,
  manualPriceSnapshots: ["manualPriceSnapshots"] as const,
};

export function useRepository() {
  return useQuery({
    queryKey: keys.repository,
    queryFn: getFinanceRepository,
    staleTime: Infinity,
  });
}

export function useFinanceData() {
  const repository = useRepository();
  const enabled = Boolean(repository.data);
  const accounts = useQuery({
    queryKey: keys.accounts,
    queryFn: () => repository.data!.listAccounts(),
    enabled,
  });
  const ledger = useQuery({
    queryKey: keys.ledger,
    queryFn: () => repository.data!.listLedgerTransactions(),
    enabled,
  });
  const assets = useQuery({
    queryKey: keys.assets,
    queryFn: () => repository.data!.listPortfolioAssets(),
    enabled,
  });
  const investments = useQuery({
    queryKey: keys.investments,
    queryFn: () => repository.data!.listInvestmentRecords(),
    enabled,
  });
  const recurring = useQuery({
    queryKey: keys.recurring,
    queryFn: () => repository.data!.listRecurringTransactions(),
    enabled,
  });
  const recurringInvestments = useQuery({
    queryKey: keys.recurringInvestments,
    queryFn: () => repository.data!.listRecurringInvestments(),
    enabled,
  });
  const quotes = useQuery({
    queryKey: keys.quotes,
    queryFn: () => repository.data!.listMarketQuotes(),
    enabled,
  });
  const settings = useQuery({
    queryKey: keys.settings,
    queryFn: () => repository.data!.getAppSettings(),
    enabled,
  });
  const dailyFxRates = useQuery({
    queryKey: keys.dailyFxRates,
    queryFn: () => repository.data!.listDailyFxRates(),
    enabled,
  });
  const dailyPrices = useQuery({
    queryKey: keys.dailyPrices,
    queryFn: () => repository.data!.listDailyPrices(),
    enabled,
  });
  const financialGoals = useQuery({
    queryKey: keys.financialGoals,
    queryFn: () => repository.data!.listFinancialGoals(),
    enabled,
  });
  const manualPriceSnapshots = useQuery({
    queryKey: keys.manualPriceSnapshots,
    queryFn: () => repository.data!.listManualPriceSnapshots(),
    enabled,
  });

  const all = [
    repository,
    accounts,
    ledger,
    assets,
    investments,
    recurring,
    recurringInvestments,
    quotes,
    settings,
    dailyFxRates,
    dailyPrices,
    financialGoals,
    manualPriceSnapshots,
  ];
  const isInitialLoading = all.some((q) => q.isLoading);
  const isError = all.some((q) => q.isError);
  const error = all.find((q) => q.isError)?.error ?? null;
  const refetchAll = () => {
    all.forEach((q) => void q.refetch());
  };

  return {
    repository,
    accounts,
    ledger,
    assets,
    investments,
    recurring,
    recurringInvestments,
    quotes,
    settings,
    dailyFxRates,
    dailyPrices,
    financialGoals,
    manualPriceSnapshots,
    isInitialLoading,
    isError,
    error,
    refetchAll,
  };
}

/**
 * On first ready render, materialize any recurring rules whose nextRunDate has
 * already passed (catching up missed periods), then refresh affected queries.
 * Runs once per app session.
 */
export function usePostDueRecurring(today: string) {
  const queryClient = useQueryClient();
  const repository = useRepository();
  const ranRef = useRef(false);
  useEffect(() => {
    if (ranRef.current) return;
    if (!repository.data || !today) return;
    ranRef.current = true;
    void (async () => {
      try {
        const posted = await repository.data!.postDueRecurringTransactions(today);
        if (posted > 0) {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: keys.ledger }),
            queryClient.invalidateQueries({ queryKey: keys.accounts }),
            queryClient.invalidateQueries({ queryKey: keys.recurring }),
          ]);
          // Newly-posted recurring transactions are local writes — schedule a
          // debounced auto-push so the other device sees them without waiting
          // for a focus/manual sync.
          noteLocalChange();
        }
      } catch (error) {
        console.error("Failed to post due recurring transactions", error);
      }
    })();
  }, [repository.data, today, queryClient]);
}

export function useRepositoryMutation<TInput>(
  action: (repository: FinanceRepository, input: TInput) => Promise<void>,
  invalidate: Array<keyof typeof keys>,
) {
  const queryClient = useQueryClient();
  const repository = useRepository();
  return useMutation({
    mutationFn: async (input: TInput) => {
      if (!repository.data) throw new Error("Repository is not ready.");
      await action(repository.data, input);
    },
    onSuccess: async () => {
      await Promise.all(invalidate.map((key) => queryClient.invalidateQueries({ queryKey: keys[key] })));
      // A local finance write just landed — restart the debounced auto-push
      // timer so the change syncs after a quiet period.
      noteLocalChange();
    },
  });
}

export const queryKeys = keys;
