import type { InvestmentRecord, Lot, RealizedLot } from "./types";

export interface FifoResult {
  openLots: Lot[];
  realizedLots: RealizedLot[];
}

export function calculateFifo(records: InvestmentRecord[]): FifoResult {
  const sorted = [...records]
    .filter((record) => record.deletedAt === null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const openLots: Lot[] = [];
  const realizedLots: RealizedLot[] = [];

  for (const record of sorted) {
    if (record.action === "buy" || record.action === "stockDividend") {
      const totalCost = record.action === "stockDividend" ? 0 : record.price * record.quantity + record.fee;
      openLots.push({
        id: `${record.id}:lot`,
        recordId: record.id,
        openedAt: record.date,
        quantity: record.quantity,
        costPerShare: record.quantity === 0 ? 0 : totalCost / record.quantity,
      });
      continue;
    }

    if (record.action === "sell") {
      let remaining = record.quantity;
      const proceedsPerShare = record.price;

      while (remaining > 0 && openLots.length > 0) {
        const lot = openLots[0];
        const matched = Math.min(remaining, lot.quantity);
        const costBasis = matched * lot.costPerShare;
        const grossProceeds = matched * proceedsPerShare;
        const feeShare = record.quantity === 0 ? 0 : record.fee * (matched / record.quantity);
        const proceeds = grossProceeds - feeShare;

        realizedLots.push({
          sourceRecordId: lot.recordId,
          sellRecordId: record.id,
          quantity: matched,
          costBasis,
          proceeds,
          realizedGain: proceeds - costBasis,
        });

        lot.quantity -= matched;
        remaining -= matched;
        if (lot.quantity <= 0.0000001) {
          openLots.shift();
        }
      }
      continue;
    }

    if (record.action === "stockSplit" && record.quantity > 0) {
      for (const lot of openLots) {
        lot.quantity *= record.quantity;
        lot.costPerShare /= record.quantity;
      }
      continue;
    }

    if (record.action === "capitalReduction") {
      for (const lot of openLots) {
        lot.costPerShare = Math.max(0, lot.costPerShare - record.price);
      }
    }
  }

  return { openLots, realizedLots };
}
