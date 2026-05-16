import Foundation

struct HoldingSnapshot: Identifiable {
    let id: String
    let ticker: String
    let quantity: Double
    let averageCost: Double
    let marketPrice: Double
    let marketValue: Double
    let costBasis: Double
    let unrealizedPnL: Double
    let unrealizedReturn: Double
}

struct PortfolioSummary {
    let totalMarketValue: Double
    let totalCostBasis: Double
    let totalUnrealizedPnL: Double
    let totalUnrealizedReturn: Double
}

/// Realized P&L breakdown for a single asset's history.
///
/// `realizedFromSales` uses the average-cost method: each sell contributes
/// `(price − avg cost at time of sale) × quantity − fee`.
/// `dividendIncome` accumulates cash dividends net of fees.
/// Stock dividends and capital reductions do not produce realized cash.
struct RealizedSummary {
    let realizedFromSales: Double
    let dividendIncome: Double

    var total: Double { realizedFromSales + dividendIncome }
}

enum PortfolioCalculator {
    static func apply(records: [InvestmentRecord], to asset: PortfolioAsset) {
        let sorted = records.sorted(by: { $0.date < $1.date })
        var quantity = 0.0
        var avgCost = 0.0

        for record in sorted {
            switch record.action {
            case .buy:
                let oldCost = quantity * avgCost
                let newCost = record.quantity * record.price + record.fee
                let newQuantity = quantity + record.quantity
                if newQuantity > 0 {
                    avgCost = (oldCost + newCost) / newQuantity
                }
                quantity = newQuantity
            case .sell:
                quantity = max(0, quantity - record.quantity)
                if quantity == 0 {
                    avgCost = 0
                }
            case .cashDividend:
                continue
            case .stockDividend:
                let newQuantity = quantity + record.quantity
                if newQuantity > 0 {
                    avgCost = (quantity * avgCost) / newQuantity
                }
                quantity = newQuantity
            case .capitalReduction:
                let newQuantity = max(0, quantity - record.quantity)
                if quantity > 0 && newQuantity > 0 {
                    avgCost = (quantity * avgCost) / newQuantity
                } else if newQuantity == 0 {
                    avgCost = 0
                }
                quantity = newQuantity
            }
        }

        asset.totalQuantity = quantity
        asset.averageCost = avgCost
    }

    static func holdings(assets: [PortfolioAsset], prices: [String: Double]) -> [HoldingSnapshot] {
        assets
            .filter { $0.totalQuantity > 0 }
            .map { asset in
                let marketPrice = prices[asset.ticker] ?? asset.averageCost
                let marketValue = marketPrice * asset.totalQuantity
                let costBasis = asset.averageCost * asset.totalQuantity
                let unrealizedPnL = marketValue - costBasis
                let returnRate = costBasis == 0 ? 0 : unrealizedPnL / costBasis
                return HoldingSnapshot(
                    id: asset.ticker,
                    ticker: asset.ticker,
                    quantity: asset.totalQuantity,
                    averageCost: asset.averageCost,
                    marketPrice: marketPrice,
                    marketValue: marketValue,
                    costBasis: costBasis,
                    unrealizedPnL: unrealizedPnL,
                    unrealizedReturn: returnRate
                )
            }
            .sorted(by: { $0.marketValue > $1.marketValue })
    }

    /// Replays the record history with running average cost, computing realized cash gains.
    /// On `.sell`, realized = (price − running avg cost) × quantity − fee.
    /// On `.cashDividend`, dividend income = price × quantity − fee.
    /// Other actions contribute nothing to realized.
    static func realized(records: [InvestmentRecord]) -> RealizedSummary {
        let sorted = records.sorted(by: { $0.date < $1.date })
        var quantity = 0.0
        var avgCost = 0.0
        var sales = 0.0
        var dividends = 0.0

        for record in sorted {
            switch record.action {
            case .buy:
                let oldCost = quantity * avgCost
                let newCost = record.quantity * record.price + record.fee
                let newQuantity = quantity + record.quantity
                if newQuantity > 0 {
                    avgCost = (oldCost + newCost) / newQuantity
                }
                quantity = newQuantity
            case .sell:
                let soldQty = min(record.quantity, quantity)
                sales += (record.price - avgCost) * soldQty - record.fee
                quantity = max(0, quantity - record.quantity)
                if quantity == 0 {
                    avgCost = 0
                }
            case .cashDividend:
                dividends += record.price * record.quantity - record.fee
            case .stockDividend:
                let newQuantity = quantity + record.quantity
                if newQuantity > 0 {
                    avgCost = (quantity * avgCost) / newQuantity
                }
                quantity = newQuantity
            case .capitalReduction:
                let newQuantity = max(0, quantity - record.quantity)
                if quantity > 0 && newQuantity > 0 {
                    avgCost = (quantity * avgCost) / newQuantity
                } else if newQuantity == 0 {
                    avgCost = 0
                }
                quantity = newQuantity
            }
        }
        return RealizedSummary(realizedFromSales: sales, dividendIncome: dividends)
    }

    static func summary(from holdings: [HoldingSnapshot]) -> PortfolioSummary {
        let totalMarketValue = holdings.reduce(0) { $0 + $1.marketValue }
        let totalCostBasis = holdings.reduce(0) { $0 + $1.costBasis }
        let totalUnrealizedPnL = totalMarketValue - totalCostBasis
        let totalUnrealizedReturn = totalCostBasis == 0 ? 0 : totalUnrealizedPnL / totalCostBasis
        return PortfolioSummary(
            totalMarketValue: totalMarketValue,
            totalCostBasis: totalCostBasis,
            totalUnrealizedPnL: totalUnrealizedPnL,
            totalUnrealizedReturn: totalUnrealizedReturn
        )
    }
}
