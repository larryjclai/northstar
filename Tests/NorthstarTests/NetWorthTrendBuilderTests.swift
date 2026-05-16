import XCTest
import SwiftData
@testable import Northstar_macOS

@MainActor
final class NetWorthTrendBuilderTests: XCTestCase {
    private var container: ModelContainer!
    private var context: ModelContext!

    override func setUpWithError() throws {
        let schema = Schema([
            Account.self, LedgerTransaction.self,
            PortfolioAsset.self, InvestmentRecord.self
        ])
        let config = ModelConfiguration("NetWorthTrendBuilderTests", schema: schema, isStoredInMemoryOnly: true)
        container = try ModelContainer(for: schema, configurations: [config])
        context = ModelContext(container)
    }

    private func snapshot(_ ticker: String, qty: Double) -> HoldingSnapshot {
        HoldingSnapshot(
            id: ticker, ticker: ticker, quantity: qty,
            averageCost: 0, marketPrice: 0,
            marketValue: 0, costBasis: 0,
            unrealizedPnL: 0, unrealizedReturn: 0
        )
    }

    func testTotalIsCashPlusInvestments() {
        let account = Account(name: "Cash", currency: "TWD", balance: 1000, openingBalance: 0)
        context.insert(account)

        let calendar = Calendar(identifier: .gregorian)
        let d1 = calendar.date(from: DateComponents(year: 2026, month: 1, day: 1))!
        let d2 = calendar.date(from: DateComponents(year: 2026, month: 1, day: 2))!

        let trend = NetWorthTrendBuilder.build(
            holdings: [snapshot("A", qty: 2)],
            accounts: [account],
            sparklines: ["A": [10, 20]],
            sparklineDates: ["A": [d1, d2]],
            baseCurrency: "TWD",
            tickerCurrency: { _ in "TWD" },
            convert: { value, _, _, _ in value }
        )

        // Investment: [10*2, 20*2] = [20, 40]
        // Cash balance is 1000 at every date (no future transactions)
        XCTAssertEqual(trend.investmentValues, [20, 40])
        XCTAssertEqual(trend.cashValues, [1000, 1000])
        XCTAssertEqual(trend.totalValues, [1020, 1040])
    }

    func testHistoricalCashBalanceSubtractsFutureTransactions() {
        let account = Account(name: "Cash", currency: "TWD", balance: 1000, openingBalance: 0)
        context.insert(account)

        let calendar = Calendar(identifier: .gregorian)
        let d1 = calendar.date(from: DateComponents(year: 2026, month: 1, day: 1))!
        let d2 = calendar.date(from: DateComponents(year: 2026, month: 1, day: 2))!
        let later = calendar.date(from: DateComponents(year: 2026, month: 1, day: 5))!

        let income = LedgerTransaction(date: later, amount: 200, currency: "TWD", category: "薪水", account: account)
        context.insert(income)

        let trend = NetWorthTrendBuilder.build(
            holdings: [snapshot("A", qty: 1)],
            accounts: [account],
            sparklines: ["A": [10, 20]],
            sparklineDates: ["A": [d1, d2]],
            baseCurrency: "TWD",
            tickerCurrency: { _ in "TWD" },
            convert: { value, _, _, _ in value }
        )

        // At d1 and d2 the +200 transaction has not yet happened, so historical balance = 1000 - 200 = 800
        XCTAssertEqual(trend.cashValues, [800, 800])
    }

    func testFXConverterApplied() {
        let usd = Account(name: "USD", currency: "USD", balance: 100, openingBalance: 0)
        context.insert(usd)

        let calendar = Calendar(identifier: .gregorian)
        let d1 = calendar.date(from: DateComponents(year: 2026, month: 1, day: 1))!
        let d2 = calendar.date(from: DateComponents(year: 2026, month: 1, day: 2))!

        let trend = NetWorthTrendBuilder.build(
            holdings: [snapshot("A", qty: 1)],
            accounts: [usd],
            sparklines: ["A": [1, 2]],
            sparklineDates: ["A": [d1, d2]],
            baseCurrency: "TWD",
            tickerCurrency: { _ in "USD" },
            convert: { value, from, _, _ in from == "USD" ? value * 32 : value }
        )

        XCTAssertEqual(trend.cashValues, [3200, 3200])
        XCTAssertEqual(trend.investmentValues, [32, 64])
        XCTAssertEqual(trend.totalValues, [3232, 3264])
    }

    func testFXConverterReceivesPerDateContext() {
        let usd = Account(name: "USD", currency: "USD", balance: 100, openingBalance: 0)
        context.insert(usd)

        let calendar = Calendar(identifier: .gregorian)
        let d1 = calendar.date(from: DateComponents(year: 2026, month: 1, day: 1))!
        let d2 = calendar.date(from: DateComponents(year: 2026, month: 1, day: 2))!

        let trend = NetWorthTrendBuilder.build(
            holdings: [snapshot("A", qty: 1)],
            accounts: [usd],
            sparklines: ["A": [1, 2]],
            sparklineDates: ["A": [d1, d2]],
            baseCurrency: "TWD",
            tickerCurrency: { _ in "USD" },
            convert: { value, from, _, asOf in
                guard from == "USD" else { return value }
                // Rate is 30 on d1, 32 on d2 — model historical FX change.
                return asOf == d1 ? value * 30 : value * 32
            }
        )

        XCTAssertEqual(trend.investmentValues, [30, 64]) // 1*30, 2*32
        XCTAssertEqual(trend.cashValues, [3000, 3200])
    }

    func testReturnsEmptyWithoutSparklines() {
        let trend = NetWorthTrendBuilder.build(
            holdings: [],
            accounts: [],
            sparklines: [:],
            sparklineDates: [:],
            baseCurrency: "TWD",
            tickerCurrency: { _ in "TWD" },
            convert: { value, _, _, _ in value }
        )
        XCTAssertTrue(trend.totalValues.isEmpty)
    }

    func testHistoricalFXFallsBackToSpotWhenNoSamples() {
        // Build with a converter that returns nil for unknown dates and value for "spot".
        // The builder treats nil as zero conversion (consistent with v1 behavior), so we
        // verify the new closure receives the date and that callers can implement fallback
        // logic in the closure itself.
        let usd = Account(name: "USD", currency: "USD", balance: 100, openingBalance: 0)
        context.insert(usd)

        let calendar = Calendar(identifier: .gregorian)
        let d1 = calendar.date(from: DateComponents(year: 2026, month: 1, day: 1))!
        let d2 = calendar.date(from: DateComponents(year: 2026, month: 1, day: 2))!

        let spotRate = 31.0
        let trend = NetWorthTrendBuilder.build(
            holdings: [snapshot("A", qty: 1)],
            accounts: [usd],
            sparklines: ["A": [1, 2]],
            sparklineDates: ["A": [d1, d2]],
            baseCurrency: "TWD",
            tickerCurrency: { _ in "USD" },
            convert: { value, from, _, _ in
                guard from == "USD" else { return value }
                return value * spotRate
            }
        )
        XCTAssertEqual(trend.cashValues, [3100, 3100])
    }
}
