import {
  createFxConverter,
  type Account,
  type AppSettings,
  type DailyFxRate,
  type PortfolioAsset,
} from "../../domain";

/**
 * Compute net worth in `goalCurrency` by:
 *   1. Summing every cash balance + holding market value into the user's
 *      primary currency using the existing FX converter.
 *   2. If the goal currency differs from primary, re-running a fresh
 *      converter rooted at the goal currency to translate the primary-
 *      currency total once.
 *
 * Two-step approach keeps `createFxConverter` reusable and avoids us
 * baking a second FX lookup path. Returns 0 when settings haven't loaded
 * yet so the UI shows a sensible "loading" zero instead of NaN.
 */
export function computeNetWorthInCurrency(
  goalCurrency: string,
  accountRows: Account[],
  assetRows: PortfolioAsset[],
  quoteRows: Array<{ symbol: string; price: number; currency: string }>,
  appSettings: AppSettings | undefined,
  fxHistory: DailyFxRate[],
): number {
  if (!appSettings) return 0;
  const primaryConverter = createFxConverter(appSettings, fxHistory);
  const primary = appSettings.primaryCurrency;

  const cashInPrimary = accountRows.reduce(
    (sum, account) => sum + primaryConverter.toPrimary(account.balance, account.currency),
    0,
  );
  const holdingsInPrimary = assetRows.reduce((sum, asset) => {
    const quote = quoteRows.find((row) => row.symbol.toUpperCase() === asset.ticker.toUpperCase());
    const marketValue = (quote?.price ?? 0) * asset.totalQuantity;
    return sum + primaryConverter.toPrimary(marketValue, quote?.currency ?? asset.currency);
  }, 0);
  const netInPrimary = cashInPrimary + holdingsInPrimary;

  if (goalCurrency.toUpperCase() === primary.toUpperCase()) return netInPrimary;

  const goalConverter = createFxConverter(
    { ...appSettings, primaryCurrency: goalCurrency.toUpperCase() },
    fxHistory,
  );
  return goalConverter.toPrimary(netInPrimary, primary);
}

/**
 * Progress source for custom goals: the weighted sum of the balances of the
 * accounts the user bound to the goal (`accountShareMap`, weight 0–1),
 * converted into the goal currency. A goal with no bound accounts reports 0 —
 * the UI nudges the user to bind one instead of falling back to total net
 * worth, which would instantly "achieve" any savings-sized goal.
 */
export function computeLinkedAccountsValue(
  goalCurrency: string,
  accountShareMap: Record<string, number>,
  accountRows: Account[],
  appSettings: AppSettings | undefined,
  fxHistory: DailyFxRate[],
): number {
  if (!appSettings) return 0;
  const entries = Object.entries(accountShareMap ?? {}).filter(([, weight]) => weight > 0);
  if (entries.length === 0) return 0;
  const converter = createFxConverter(
    { ...appSettings, primaryCurrency: goalCurrency.toUpperCase() },
    fxHistory,
  );
  return entries.reduce((sum, [accountId, weight]) => {
    const account = accountRows.find((row) => row.id === accountId);
    if (!account) return sum;
    return sum + converter.toPrimary(account.balance, account.currency) * Math.min(1, weight);
  }, 0);
}
