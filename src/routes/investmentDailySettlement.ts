// Pure day-grouping + 小計 subtotal for the 交易紀錄 「日結」 mode. Groups rows
// (assumed newest-first) by calendar day; each day carries per-currency
// subtotals that reconcile against a broker's daily 成交回報 (應收付金額 小計).
// Net (應收付) uses each row's `signed` — the same value the ledger posts — so
// the subtotal ties out to the account movement. Opening lots are cashless
// import baselines: shown as rows but excluded from every subtotal.

export interface DailySettlementRow {
  date: string; // ISO datetime or date; day key is date.slice(0, 10)
  currency: string;
  actionKey: string; // InvestmentAction | "deposit" | "withdraw"
  price: number;
  quantity: number;
  fee: number;
  signed: number; // net cash flow: + inflow, − outflow
  isOpeningLot: boolean;
}

export interface DailySubtotal {
  currency: string;
  gross: number; // Σ price×quantity over buy/sell (成交金額)
  fee: number; // Σ fee over trades (手續費)
  net: number; // Σ signed over all rows (應收付)
}

export interface DailySettlementGroup<T extends DailySettlementRow> {
  date: string; // YYYY-MM-DD
  rows: T[];
  subtotals: DailySubtotal[]; // one per currency present (excl. opening lots)
}

export function groupByDayWithSubtotals<T extends DailySettlementRow>(
  rows: T[],
): DailySettlementGroup<T>[] {
  const groups: DailySettlementGroup<T>[] = [];
  let current: DailySettlementGroup<T> | null = null;

  for (const row of rows) {
    const day = row.date.slice(0, 10);
    if (!current || current.date !== day) {
      current = { date: day, rows: [], subtotals: [] };
      groups.push(current);
    }
    current.rows.push(row);
  }

  for (const group of groups) {
    const byCurrency = new Map<string, DailySubtotal>();
    for (const row of group.rows) {
      if (row.isOpeningLot) continue;
      let sub = byCurrency.get(row.currency);
      if (!sub) {
        sub = { currency: row.currency, gross: 0, fee: 0, net: 0 };
        byCurrency.set(row.currency, sub);
      }
      if (row.actionKey === "buy" || row.actionKey === "sell") {
        sub.gross += row.price * row.quantity;
        sub.fee += row.fee;
      }
      sub.net += row.signed;
    }
    group.subtotals = [...byCurrency.values()];
  }

  return groups;
}
