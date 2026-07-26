export interface DayChangeCloseInput {
  date: string;
  close: number;
}

export interface DayChangeQuoteInput {
  price: number;
  marketTime?: string | null;
  updatedAt?: string | null;
}

export interface DayChangeResult {
  current: number;
  refClose: number;
  changeAbs: number;
  changePercent: number;
  /** quantity × changeAbs, in the asset's own currency (no FX applied). */
  impact: number;
  /** Best-known timestamp/date for `current` — a full ISO string when it came
   *  from a live quote, or a plain YYYY-MM-DD when it came from a close. */
  asOf: string | null;
}

/**
 * Today's price move for a single holding: current price vs. the prior
 * *recorded* session's close. Mirrors dayChangeMovers's reference-selection
 * rule (see `domain/portfolioAnalytics.ts`) exactly, so this band's % always
 * agrees with the Overview 今日漲跌 movers list for the same ticker — never
 * a live quote's `previousClose` (which the app doesn't store and which is
 * unreliable post-spinoff).
 *
 * `closes` must be this ticker's full daily-close history, sorted ascending
 * by date — NOT range-filtered by the chart's selected window, since a short
 * window could otherwise drop the prior session's close and desync from the
 * movers list.
 *
 * Returns null when there isn't enough data to compute a meaningful change
 * (the band hides in that case): no live quote and fewer than two closes, or
 * a live quote with no recorded close at all.
 */
export function computeDayChange(
  closes: DayChangeCloseInput[],
  quote: DayChangeQuoteInput | null | undefined,
  quantity: number,
): DayChangeResult | null {
  const lastClose = closes.length ? closes[closes.length - 1] : null;
  const prevClose = closes.length >= 2 ? closes[closes.length - 2] : null;
  const hasQuote = Boolean(quote && Number.isFinite(quote.price) && quote.price > 0);

  let current: number | null = null;
  let refClose: number | null = null;
  let asOf: string | null = null;

  if (hasQuote && quote && lastClose) {
    current = quote.price;
    // Quote dated after the last recorded close → that close is the prior
    // session. Otherwise the quote is (or predates) the latest recorded
    // session → step back one more close.
    const quoteDate = quote.marketTime ? quote.marketTime.slice(0, 10) : null;
    refClose =
      quoteDate && quoteDate > lastClose.date ? lastClose.close : (prevClose?.close ?? null);
    asOf = quote.updatedAt ?? quote.marketTime ?? lastClose.date;
  } else if (lastClose && prevClose) {
    current = lastClose.close;
    refClose = prevClose.close;
    asOf = lastClose.date;
  }

  if (current == null || refClose == null || refClose <= 0) return null;

  const changeAbs = current - refClose;
  return {
    current,
    refClose,
    changeAbs,
    changePercent: (changeAbs / refClose) * 100,
    impact: changeAbs * quantity,
    asOf,
  };
}
