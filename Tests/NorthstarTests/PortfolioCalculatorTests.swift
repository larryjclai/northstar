import XCTest
import SwiftData
@testable import Northstar_macOS

@MainActor
final class PortfolioCalculatorTests: XCTestCase {
    private var container: ModelContainer!
    private var context: ModelContext!

    override func setUpWithError() throws {
        let schema = Schema([
            Account.self, LedgerTransaction.self,
            PortfolioAsset.self, InvestmentRecord.self
        ])
        let config = ModelConfiguration("PortfolioCalculatorTests", schema: schema, isStoredInMemoryOnly: true)
        container = try ModelContainer(for: schema, configurations: [config])
        context = ModelContext(container)
    }

    private func makeAsset(ticker: String = "T") -> PortfolioAsset {
        let asset = PortfolioAsset(ticker: ticker, name: ticker, currency: "TWD")
        context.insert(asset)
        return asset
    }

    private func record(_ action: InvestmentAction, _ price: Double, _ qty: Double, fee: Double = 0, day: Int = 1) -> InvestmentRecord {
        let date = Calendar(identifier: .gregorian).date(from: DateComponents(year: 2026, month: 1, day: day))!
        return InvestmentRecord(date: date, action: action, price: price, quantity: qty, fee: fee)
    }

    func testBuyComputesWeightedAverageCost() {
        let asset = makeAsset()
        let records = [
            record(.buy, 100, 10, day: 1),
            record(.buy, 120, 10, fee: 0, day: 2)
        ]
        PortfolioCalculator.apply(records: records, to: asset)
        XCTAssertEqual(asset.totalQuantity, 20)
        XCTAssertEqual(asset.averageCost, 110, accuracy: 0.0001)
    }

    func testBuyIncludesFeeInCost() {
        let asset = makeAsset()
        PortfolioCalculator.apply(
            records: [record(.buy, 100, 10, fee: 50, day: 1)],
            to: asset
        )
        XCTAssertEqual(asset.totalQuantity, 10)
        XCTAssertEqual(asset.averageCost, 105, accuracy: 0.0001)
    }

    func testSellReducesQuantity() {
        let asset = makeAsset()
        PortfolioCalculator.apply(
            records: [
                record(.buy, 100, 10, day: 1),
                record(.sell, 150, 4, day: 2)
            ],
            to: asset
        )
        XCTAssertEqual(asset.totalQuantity, 6)
        XCTAssertEqual(asset.averageCost, 100, accuracy: 0.0001)
    }

    func testSellAllResetsAvgCost() {
        let asset = makeAsset()
        PortfolioCalculator.apply(
            records: [
                record(.buy, 100, 10, day: 1),
                record(.sell, 150, 10, day: 2)
            ],
            to: asset
        )
        XCTAssertEqual(asset.totalQuantity, 0)
        XCTAssertEqual(asset.averageCost, 0)
    }

    func testStockDividendDilutesAvgCost() {
        let asset = makeAsset()
        PortfolioCalculator.apply(
            records: [
                record(.buy, 100, 10, day: 1),
                record(.stockDividend, 0, 2, day: 2)
            ],
            to: asset
        )
        XCTAssertEqual(asset.totalQuantity, 12)
        XCTAssertEqual(asset.averageCost, 1000.0 / 12.0, accuracy: 0.0001)
    }

    func testCapitalReductionLiftsAvgCost() {
        let asset = makeAsset()
        PortfolioCalculator.apply(
            records: [
                record(.buy, 100, 10, day: 1),
                record(.capitalReduction, 0, 2, day: 2)
            ],
            to: asset
        )
        XCTAssertEqual(asset.totalQuantity, 8)
        XCTAssertEqual(asset.averageCost, 1000.0 / 8.0, accuracy: 0.0001)
    }

    func testCashDividendDoesNotAffectQuantity() {
        let asset = makeAsset()
        PortfolioCalculator.apply(
            records: [
                record(.buy, 100, 10, day: 1),
                record(.cashDividend, 2, 10, day: 2)
            ],
            to: asset
        )
        XCTAssertEqual(asset.totalQuantity, 10)
        XCTAssertEqual(asset.averageCost, 100, accuracy: 0.0001)
    }

    func testRealizedFromSalesUsesAvgCostAtSaleTime() {
        // Buy 10 @ 100, then 10 @ 200 (avg cost 150). Sell 5 @ 250 with fee 10 → realized = (250-150)*5 - 10 = 490
        let summary = PortfolioCalculator.realized(records: [
            record(.buy, 100, 10, day: 1),
            record(.buy, 200, 10, day: 2),
            record(.sell, 250, 5, fee: 10, day: 3)
        ])
        XCTAssertEqual(summary.realizedFromSales, 490, accuracy: 0.0001)
        XCTAssertEqual(summary.dividendIncome, 0, accuracy: 0.0001)
    }

    func testRealizedHandlesPartialSellWithoutDrainingPosition() {
        // Buy 10 @ 100. Sell 4 @ 150. Sell remaining 6 @ 80 → realized = 4*(150-100) + 6*(80-100) = 200 - 120 = 80
        let summary = PortfolioCalculator.realized(records: [
            record(.buy, 100, 10, day: 1),
            record(.sell, 150, 4, day: 2),
            record(.sell, 80, 6, day: 3)
        ])
        XCTAssertEqual(summary.realizedFromSales, 80, accuracy: 0.0001)
    }

    func testDividendIncomeAccumulatesNetOfFee() {
        let summary = PortfolioCalculator.realized(records: [
            record(.buy, 100, 10, day: 1),
            record(.cashDividend, 2, 10, fee: 1, day: 2),
            record(.cashDividend, 3, 10, day: 3)
        ])
        XCTAssertEqual(summary.dividendIncome, 49, accuracy: 0.0001)
        XCTAssertEqual(summary.total, 49, accuracy: 0.0001)
    }

    func testRealizedIsZeroForBuyOnly() {
        let summary = PortfolioCalculator.realized(records: [
            record(.buy, 100, 10, fee: 5, day: 1)
        ])
        XCTAssertEqual(summary.realizedFromSales, 0)
        XCTAssertEqual(summary.dividendIncome, 0)
    }

    func testHoldingsExcludeZeroQuantityAssets() throws {
        let kept = makeAsset(ticker: "K")
        kept.totalQuantity = 5
        kept.averageCost = 50
        let dropped = makeAsset(ticker: "D")
        dropped.totalQuantity = 0
        dropped.averageCost = 50

        let snapshots = PortfolioCalculator.holdings(assets: [kept, dropped], prices: ["K": 60, "D": 50])
        XCTAssertEqual(snapshots.count, 1)
        let first = try XCTUnwrap(snapshots.first)
        XCTAssertEqual(first.ticker, "K")
        XCTAssertEqual(first.marketValue, 300, accuracy: 0.0001)
        XCTAssertEqual(first.unrealizedPnL, 50, accuracy: 0.0001)
        XCTAssertEqual(first.unrealizedReturn, 50.0 / 250.0, accuracy: 0.0001)
    }
}
