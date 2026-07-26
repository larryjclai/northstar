// Pure helpers for the 交易紀錄 type badge / total cell. Kept in their own module
// (no React / coss-UI imports) so they can be unit-tested without pulling in the
// heavy TransactionsRoute component graph.

export const actionShortLabels: Record<string, string> = {
  buy: "買",
  sell: "賣",
  cashDividend: "息",
  stockDividend: "股",
  capitalReduction: "減",
  stockSplit: "拆",
  deposit: "入",
  withdraw: "出",
};

const IMPORT_SHORT_LABEL = "匯入";

/** A cashless opening-balance lot (manual-import baseline) — show as 「匯入」, not 「買」. */
export function isImportOpeningLot(record: {
  cashless?: boolean;
  id: string;
  assetId: string;
}): boolean {
  return record.cashless === true || record.id === `inv_open_${record.assetId}`;
}

/** Type-badge label: a cashless opening lot reads 「匯入」; everything else keeps its short label. */
export function txTypeLabel(tx: { actionKey: string; isOpeningLot: boolean }): string {
  if (tx.isOpeningLot) return IMPORT_SHORT_LABEL;
  return actionShortLabels[tx.actionKey] ?? tx.actionKey;
}
