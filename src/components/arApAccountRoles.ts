import type { LedgerTransaction } from "../domain";

export interface ArApAccountRoles {
  payLabel: string;
  payValue: string;
  receiveLabel: string;
  receiveValue: string;
}

/**
 * Resolve the 收款帳戶 / 付款帳戶 labels + values for a 代墊 (AR/AP) row.
 *
 * Returns null for non-代墊 rows (`counterAccountId == null`).
 *
 * Mapping per the data model (see `LedgerTransaction.counterAccountId`):
 *   - 應收 (AR): counterAccountId = 付款帳戶 (墊付, posted on creation),
 *     accountId = 收款帳戶 (lands on settle).
 *   - 應付 (AP): counterAccountId = 收款帳戶 (received on creation),
 *     accountId = 付款帳戶 (paid on settle).
 *
 * AR-vs-AP is keyed off the STABLE `entryType` (AR persists as income, AP as
 * expense), NOT the live `settlementStatus` — the latter flips to "settled"
 * after 結清, which previously reversed the labels for settled rows (Plan 062).
 */
export function arApAccountRoles(
  row: Pick<LedgerTransaction, "entryType" | "accountId" | "counterAccountId">,
  accountName: (id: string) => string,
): ArApAccountRoles | null {
  if (row.counterAccountId == null) return null;
  const isReceivable = row.entryType === "income"; // AR persists as income, AP as expense.
  const mainValue = row.accountId ? accountName(row.accountId) : "結清時指定";
  const counterValue = accountName(row.counterAccountId);
  if (isReceivable) {
    // AR: counter = 付款帳戶 (代墊), main = 收款帳戶.
    return {
      payLabel: "付款帳戶（代墊）",
      payValue: counterValue,
      receiveLabel: "收款帳戶",
      receiveValue: mainValue,
    };
  }
  // AP: counter = 收款帳戶 (代墊), main = 付款帳戶.
  return {
    payLabel: "付款帳戶",
    payValue: mainValue,
    receiveLabel: "收款帳戶（代墊）",
    receiveValue: counterValue,
  };
}
