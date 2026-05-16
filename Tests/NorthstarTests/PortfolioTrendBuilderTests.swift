import XCTest
@testable import Northstar_macOS

final class PortfolioTrendBuilderTests: XCTestCase {
    private func snapshot(ticker: String, qty: Double, price: Double = 100) -> HoldingSnapshot {
        HoldingSnapshot(
            id: ticker, ticker: ticker, quantity: qty,
            averageCost: 50, marketPrice: price,
            marketValue: qty * price, costBasis: qty * 50,
            unrealizedPnL: qty * (price - 50), unrealizedReturn: 0
        )
    }

    func testBuildSumsScaledClosesAlignedByTail() {
        let a = snapshot(ticker: "A", qty: 2)
        let b = snapshot(ticker: "B", qty: 3)
        let sparklines: [String: [Double]] = [
            "A": [10, 20, 30],
            "B": [100, 200]
        ]
        let trend = PortfolioTrendBuilder.build(
            holdings: [a, b],
            sparklines: sparklines,
            sparklineDates: [:]
        )
        // Aligned to min length 2, taking tail of A → [20, 30]
        // Combined: 20*2 + 100*3 = 340, 30*2 + 200*3 = 660
        XCTAssertEqual(trend.values, [340, 660])
    }

    func testBuildReturnsEmptyWhenNoSparklines() {
        let a = snapshot(ticker: "A", qty: 2)
        let trend = PortfolioTrendBuilder.build(holdings: [a], sparklines: [:], sparklineDates: [:])
        XCTAssertTrue(trend.values.isEmpty)
    }

    func testSliceByRangeWithEmptyDatesUsesTradingDays() {
        let values: [Double] = Array(0..<30).map(Double.init)
        let result = PortfolioTrendBuilder.slice(values: values, dates: [], range: .week)
        XCTAssertEqual(result.values.count, 5)
        XCTAssertEqual(result.values.first, 25)
        XCTAssertEqual(result.values.last, 29)
    }

    func testSliceAllKeepsEverything() {
        let values: [Double] = [1, 2, 3, 4]
        let result = PortfolioTrendBuilder.slice(values: values, dates: [], range: .all)
        XCTAssertEqual(result.values, values)
    }
}
