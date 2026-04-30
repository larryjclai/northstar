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
