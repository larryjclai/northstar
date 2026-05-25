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

  const goalConverter = createFxConverter({ ...appSettings, primaryCurrency: goalCurrency.toUpperCase() }, fxHistory);
  return goalConverter.toPrimary(netInPrimary, primary);
}
