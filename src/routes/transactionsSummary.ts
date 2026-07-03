// Pure aggregation for the 交易紀錄 summary cards. Computed over the SAME
// filtered rows the list renders, so the cards always agree with what the user
// sees. Opening lots (匯入持倉 baselines) are excluded from 買入 — they record
// an already-held position, not a purchase.

export interface SummaryTxRow {
  kind: "investment" | "cash";
  actionKey: string;
  quantity: number;
  price: number;
  currency: string;
  date: string;
  isOpeningLot: boolean;
}

export interface TxSummaryTotals {
  count: number; // rows shown in the list (investment + cash rows)
  bought: number; // primary-currency Σ of buy gross, excl. opening lots
  sold: number; // primary-currency Σ of sell gross
  dividends: number; // primary-currency Σ of cash dividends
}

export function summarizeTransactions(
  rows: SummaryTxRow[],
  toPrimary: (amount: number, currency: string, date: string) => number,
): TxSummaryTotals {
  let bought = 0,
    sold = 0,
    dividends = 0;
  for (const row of rows) {
    if (row.kind !== "investment" || row.isOpeningLot) continue;
    if (row.actionKey === "buy") bought += toPrimary(row.price * row.quantity, row.currency, row.date);
    else if (row.actionKey === "sell") sold += toPrimary(row.price * row.quantity, row.currency, row.date);
    else if (row.actionKey === "cashDividend") dividends += toPrimary(row.price, row.currency, row.date);
  }
  return { count: rows.length, bought, sold, dividends };
}
