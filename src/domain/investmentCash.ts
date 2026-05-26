import type { InvestmentAction, InvestmentRecord } from "./types";

const epsilon = 0.000001;

export interface InvestmentCashInput {
  action: InvestmentAction;
  price: number;
  quantity: number;
  fee: number;
}

export function calculateInvestmentCashDelta(input: InvestmentCashInput) {
  const price = Math.max(0, Number(input.price) || 0);
  const quantity = Math.max(0, Number(input.quantity) || 0);
  const gross = price * quantity;
  const fee = Math.max(0, Number(input.fee) || 0);
  if (input.action === "buy") return -(gross + fee);
  if (input.action === "sell") return gross - fee;
  if (input.action === "cashDividend") {
    // Backward-compatible:
    // - legacy rows used "每股股利 × 股數"
    // - new rows can store total dividend amount directly with quantity = 0
    const dividend = quantity > 0 ? gross : price;
    return dividend - fee;
  }
  if (input.action === "capitalReduction") return gross;
  return 0;
}

export function calculateInvestmentAccountQuantity(
  records: InvestmentRecord[],
  assetId: string,
  accountId: string,
  excludeRecordId?: string,
) {
  let quantity = 0;
  const sorted = records
    .filter((record) =>
      record.deletedAt === null &&
      record.assetId === assetId &&
      record.linkedAccountId === accountId &&
      record.id !== excludeRecordId
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const record of sorted) {
    if (record.action === "buy" || record.action === "stockDividend") {
      quantity += record.quantity;
    } else if (record.action === "sell") {
      quantity -= record.quantity;
    } else if (record.action === "stockSplit" && record.quantity > 0) {
      quantity *= record.quantity;
    }
  }

  return Math.max(0, quantity);
}

export function isEffectivelyNegative(value: number) {
  return value < -epsilon;
}
