import Foundation

struct OpenLot: Identifiable, Equatable {
    let id: UUID
    let acquiredDate: Date
    let quantity: Double
    let costPerShare: Double

    var costBasis: Double { quantity * costPerShare }
}

struct RealizedLot: Identifiable, Equatable {
    let id: UUID
    let acquiredDate: Date
    let soldDate: Date
    let quantity: Double
    let costPerShare: Double
    let salePrice: Double
    /// Sell-side fee allocated to this lot in proportion to its share of the sell.
    let allocatedFee: Double

    var costBasis: Double { quantity * costPerShare }
    var grossProceeds: Double { quantity * salePrice }
    var netProceeds: Double { grossProceeds - allocatedFee }
    var realizedPnL: Double { netProceeds - costBasis }
    var holdingDays: Int {
        Calendar(identifier: .gregorian).dateComponents([.day], from: acquiredDate, to: soldDate).day ?? 0
    }
}

/// FIFO lot replay over a record history. Buys append a lot; sells consume the
/// oldest lots first and emit a `RealizedLot` per matched portion. Stock
/// dividends arrive as zero-cost lots dated on the dividend record. Capital
/// reductions scale every open lot's quantity proportionally while preserving
/// the lot's total cost (per-share cost rises to compensate). Cash dividends
/// do not affect lots.
enum FIFOCalculator {
    static func openLots(records: [InvestmentRecord]) -> [OpenLot] {
        replay(records: records).open
    }

    static func realizedLots(records: [InvestmentRecord]) -> [RealizedLot] {
        replay(records: records).realized
    }

    static func replay(records: [InvestmentRecord]) -> (open: [OpenLot], realized: [RealizedLot]) {
        let sorted = records.sorted(by: { $0.date < $1.date })
        var lots: [MutableLot] = []
        var realized: [RealizedLot] = []

        for record in sorted {
            switch record.action {
            case .buy:
                guard record.quantity > 0 else { continue }
                let cps = record.price + (record.fee / record.quantity)
                lots.append(MutableLot(
                    acquiredDate: record.date,
                    quantity: record.quantity,
                    costPerShare: cps
                ))

            case .sell:
                guard record.quantity > 0 else { continue }
                let totalSold = record.quantity
                var remaining = record.quantity

                while remaining > 0, lots.isEmpty == false {
                    let consumed = min(lots[0].quantity, remaining)
                    let feeShare = totalSold > 0 ? record.fee * (consumed / totalSold) : 0
                    realized.append(RealizedLot(
                        id: UUID(),
                        acquiredDate: lots[0].acquiredDate,
                        soldDate: record.date,
                        quantity: consumed,
                        costPerShare: lots[0].costPerShare,
                        salePrice: record.price,
                        allocatedFee: feeShare
                    ))
                    lots[0].quantity -= consumed
                    if lots[0].quantity <= 0 {
                        lots.removeFirst()
                    }
                    remaining -= consumed
                }

            case .cashDividend:
                continue

            case .stockDividend:
                guard record.quantity > 0 else { continue }
                lots.append(MutableLot(
                    acquiredDate: record.date,
                    quantity: record.quantity,
                    costPerShare: 0
                ))

            case .capitalReduction:
                guard record.quantity > 0 else { continue }
                let total = lots.reduce(0.0) { $0 + $1.quantity }
                guard total > 0 else { continue }
                let remainingTotal = max(0, total - record.quantity)
                if remainingTotal == 0 {
                    lots.removeAll()
                } else {
                    let scale = remainingTotal / total
                    for index in lots.indices {
                        let originalCost = lots[index].quantity * lots[index].costPerShare
                        lots[index].quantity *= scale
                        lots[index].costPerShare = lots[index].quantity > 0
                            ? originalCost / lots[index].quantity
                            : 0
                    }
                }
            }
        }

        let open = lots.map { lot in
            OpenLot(
                id: UUID(),
                acquiredDate: lot.acquiredDate,
                quantity: lot.quantity,
                costPerShare: lot.costPerShare
            )
        }
        return (open, realized)
    }

    private struct MutableLot {
        let acquiredDate: Date
        var quantity: Double
        var costPerShare: Double
    }
}
