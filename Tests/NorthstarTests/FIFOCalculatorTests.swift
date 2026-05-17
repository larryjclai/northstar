import XCTest
import SwiftData
@testable import Northstar_macOS

@MainActor
final class FIFOCalculatorTests: XCTestCase {
    private var container: ModelContainer!
    private var context: ModelContext!

    override func setUpWithError() throws {
        let schema = Schema([Account.self, PortfolioAsset.self, InvestmentRecord.self, LedgerTransaction.self])
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        container = try ModelContainer(for: schema, configurations: [config])
        context = ModelContext(container)
    }

    private func date(_ iso: String) -> Date {
        ISO8601DateFormatter().date(from: iso + "T00:00:00Z")!
    }

    private func makeRecord(
        date: Date,
        action: InvestmentAction,
        price: Double,
        quantity: Double,
        fee: Double = 0
    ) -> InvestmentRecord {
        let record = InvestmentRecord(
            date: date,
            action: action,
            price: price,
            quantity: quantity,
            fee: fee
        )
        context.insert(record)
        return record
    }

    func testSimpleBuyHasOneOpenLot() {
        let buy = makeRecord(date: date("2026-01-10"), action: .buy, price: 100, quantity: 10)
        let result = FIFOCalculator.replay(records: [buy])
        XCTAssertEqual(result.open.count, 1)
        XCTAssertEqual(result.open[0].quantity, 10)
        XCTAssertEqual(result.open[0].costPerShare, 100)
        XCTAssertEqual(result.realized.count, 0)
    }

    func testBuyAllocatesFeeIntoCostPerShare() {
        let buy = makeRecord(date: date("2026-01-10"), action: .buy, price: 100, quantity: 10, fee: 20)
        let result = FIFOCalculator.openLots(records: [buy])
        XCTAssertEqual(result[0].costPerShare, 102) // 100 + 20/10
        XCTAssertEqual(result[0].costBasis, 1_020)
    }

    func testFullSellRealizesOneLotAndLeavesNoneOpen() {
        let buy = makeRecord(date: date("2026-01-10"), action: .buy, price: 100, quantity: 10)
        let sell = makeRecord(date: date("2026-03-10"), action: .sell, price: 130, quantity: 10, fee: 5)
        let result = FIFOCalculator.replay(records: [buy, sell])
        XCTAssertEqual(result.open.count, 0)
        XCTAssertEqual(result.realized.count, 1)
        let lot = result.realized[0]
        XCTAssertEqual(lot.quantity, 10)
        XCTAssertEqual(lot.costPerShare, 100)
        XCTAssertEqual(lot.allocatedFee, 5)
        XCTAssertEqual(lot.realizedPnL, 1_300 - 1_000 - 5) // 295
    }

    func testPartialSellSpansTwoLotsInFIFOOrder() {
        let buy1 = makeRecord(date: date("2026-01-10"), action: .buy, price: 100, quantity: 10)
        let buy2 = makeRecord(date: date("2026-02-10"), action: .buy, price: 120, quantity: 10)
        let sell = makeRecord(date: date("2026-03-10"), action: .sell, price: 150, quantity: 15, fee: 30)

        let result = FIFOCalculator.replay(records: [buy1, buy2, sell])
        XCTAssertEqual(result.open.count, 1)
        XCTAssertEqual(result.open[0].quantity, 5)
        XCTAssertEqual(result.open[0].costPerShare, 120)
        XCTAssertEqual(result.realized.count, 2)

        // First realized: full 10 shares from the older lot.
        XCTAssertEqual(result.realized[0].quantity, 10)
        XCTAssertEqual(result.realized[0].costPerShare, 100)
        XCTAssertEqual(result.realized[0].allocatedFee, 30 * (10.0/15.0), accuracy: 0.0001)

        // Second realized: 5 shares from the newer lot.
        XCTAssertEqual(result.realized[1].quantity, 5)
        XCTAssertEqual(result.realized[1].costPerShare, 120)
        XCTAssertEqual(result.realized[1].allocatedFee, 30 * (5.0/15.0), accuracy: 0.0001)

        // Total realized P&L = (1500 - 1000) + (750 - 600) - 30 fee = 620
        let totalPnL = result.realized.reduce(0) { $0 + $1.realizedPnL }
        XCTAssertEqual(totalPnL, 620, accuracy: 0.0001)
    }

    func testStockDividendAppendsZeroCostLot() {
        let buy = makeRecord(date: date("2026-01-10"), action: .buy, price: 100, quantity: 10)
        let stockDiv = makeRecord(date: date("2026-04-10"), action: .stockDividend, price: 0, quantity: 1)
        let result = FIFOCalculator.openLots(records: [buy, stockDiv])
        XCTAssertEqual(result.count, 2)
        XCTAssertEqual(result[1].costPerShare, 0)
        XCTAssertEqual(result[1].quantity, 1)
    }

    func testCapitalReductionPreservesTotalCost() {
        let buy = makeRecord(date: date("2026-01-10"), action: .buy, price: 100, quantity: 10)
        let reduction = makeRecord(date: date("2026-05-10"), action: .capitalReduction, price: 0, quantity: 2)

        let result = FIFOCalculator.openLots(records: [buy, reduction])
        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result[0].quantity, 8, accuracy: 0.0001)
        // 10 shares × 100 = 1000 total; after reduction, total cost still 1000.
        XCTAssertEqual(result[0].costBasis, 1_000, accuracy: 0.0001)
        XCTAssertEqual(result[0].costPerShare, 125, accuracy: 0.0001) // 1000/8
    }

    func testCapitalReductionToZeroClearsLots() {
        let buy = makeRecord(date: date("2026-01-10"), action: .buy, price: 100, quantity: 10)
        let reduction = makeRecord(date: date("2026-05-10"), action: .capitalReduction, price: 0, quantity: 10)
        let result = FIFOCalculator.openLots(records: [buy, reduction])
        XCTAssertEqual(result.count, 0)
    }

    func testCashDividendDoesNotChangeLots() {
        let buy = makeRecord(date: date("2026-01-10"), action: .buy, price: 100, quantity: 10)
        let cashDiv = makeRecord(date: date("2026-04-10"), action: .cashDividend, price: 3, quantity: 10)
        let result = FIFOCalculator.openLots(records: [buy, cashDiv])
        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result[0].quantity, 10)
        XCTAssertEqual(result[0].costPerShare, 100)
    }

    func testHoldingDaysIsComputed() {
        let buy = makeRecord(date: date("2026-01-10"), action: .buy, price: 100, quantity: 10)
        let sell = makeRecord(date: date("2026-03-11"), action: .sell, price: 110, quantity: 10)
        let result = FIFOCalculator.realizedLots(records: [buy, sell])
        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result[0].holdingDays, 60)
    }
}
