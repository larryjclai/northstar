/**
 * 待辦 row (plan 164): a single date-sorted merge of upcoming bills,
 * credit-card payments due, and outstanding AR/AP — no new financial math,
 * just re-tagging the three existing sources for one combined list.
 *
 * Extracted (plan 223) from `DashboardRoute.tsx`'s `todoRows` memo so the
 * merge can be reused uncapped (the dashboard card still slices to 6; the
 * 查看全部 modal renders the full `buildTodoRows` output). Structurally typed
 * against the three source shapes — no imports from `data/` or React.
 */
export type TodoRow = {
  key: string;
  type: "bill" | "card" | "recv" | "pay" | "income" | "dca";
  name: string;
  sub: string;
  /** "MM-DD" for display. */
  date: string;
  /** Full ISO date used for sorting. */
  iso: string;
  /** Signed, primary-currency amount; negative = 待付. */
  amt: number;
  /** Present for "card" rows — links to the account's reconcile route. */
  linkAccountId?: string;
  /** Present for "recv"/"pay" rows — links to the cash-flow ledger entry. */
  linkTxId?: string;
};

export interface TodoRowSources {
  bills: Array<{
    id: string;
    entryType: string;
    merchant: string;
    category: string;
    accountId: string;
    nextRunDate: string;
    amount: number;
  }>;
  cards: Array<{
    accountId: string;
    name: string;
    dueDate: string;
    daysUntilDue: number;
    outstanding: number;
  }>;
  settleItems: Array<{
    id: string;
    kind: string;
    counterparty: string;
    name: string;
    date: string;
    amount: number;
    currency: string;
  }>;
  dcaRules: Array<{
    id: string;
    name: string;
    ticker: string;
    accountId: string;
    nextRunDate: string;
    perPeriodCash: number;
  }>;
}

/** Full date-sorted merge — NO caps. Callers slice for the compact card. */
export function buildTodoRows(
  sources: TodoRowSources,
  accountName: (accountId: string) => string,
  toPrimary: (amount: number, currency: string) => number | null,
): TodoRow[] {
  const rows: TodoRow[] = [];
  for (const b of sources.bills) {
    const isIncome = b.entryType === "income";
    rows.push({
      key: `bill-${b.id}`,
      type: isIncome ? "income" : "bill",
      name: b.merchant || b.category,
      sub: accountName(b.accountId),
      date: b.nextRunDate.slice(5),
      iso: b.nextRunDate,
      amt: isIncome ? Math.abs(b.amount) : -Math.abs(b.amount),
    });
  }
  for (const r of sources.cards) {
    rows.push({
      key: `card-${r.accountId}`,
      type: "card",
      name: r.name,
      sub: `繳款日 ${r.dueDate.slice(5)} · 還有 ${r.daysUntilDue} 天`,
      date: r.dueDate.slice(5),
      iso: r.dueDate,
      amt: -r.outstanding,
      linkAccountId: r.accountId,
    });
  }
  for (const item of sources.settleItems) {
    const isRecv = item.kind === "receivable";
    const amount = toPrimary(item.amount, item.currency) ?? item.amount;
    rows.push({
      key: `settle-${item.id}`,
      type: isRecv ? "recv" : "pay",
      name: item.counterparty || item.name,
      sub: "",
      date: item.date.slice(5, 10),
      iso: item.date.slice(0, 10),
      amt: isRecv ? amount : -amount,
      linkTxId: item.id,
    });
  }
  for (const d of sources.dcaRules) {
    rows.push({
      key: `dca-${d.id}`,
      type: "dca",
      name: d.name || d.ticker,
      sub: `定期定額 · ${accountName(d.accountId)}`,
      date: d.nextRunDate.slice(5),
      iso: d.nextRunDate,
      amt: -Math.abs(d.perPeriodCash),
      linkAccountId: d.accountId, // reused only for keying; the row links to the DCA tab in the UI
    });
  }
  return rows.sort((a, b) => a.iso.localeCompare(b.iso));
}
