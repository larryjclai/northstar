import XCTest
import SwiftData
@testable import Northstar_macOS

@MainActor
final class SpendingSummaryBuilderTests: XCTestCase {
    private var container: ModelContainer!
    private var context: ModelContext!

    override func setUpWithError() throws {
        let schema = Schema([
            Account.self,
            PortfolioAsset.self,
            InvestmentRecord.self,
            LedgerTransaction.self
        ])
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        container = try ModelContainer(for: schema, configurations: [config])
        context = ModelContext(container)
    }

    private func makeTxn(
        date: Date,
        amount: Double,
        currency: String = "TWD",
        category: String = "",
        linked: UUID? = nil
    ) -> LedgerTransaction {
        let txn = LedgerTransaction(
            date: date,
            amount: amount,
            currency: currency,
            category: category,
            note: "",
            account: nil,
            linkedInvestmentRecordID: linked
        )
        context.insert(txn)
        return txn
    }

    private let identityConvert: (Double, String, String) -> Double? = { value, _, _ in value }

    func testEmptyTransactionsYieldsEmpty() {
        let summary = SpendingSummaryBuilder.build(
            transactions: [],
            baseCurrency: "TWD",
            referenceDate: Date(),
            convert: identityConvert
        )
        XCTAssertEqual(summary, .empty)
    }

    func testIncomeAndExpenseTotalsAndNet() {
        let ref = ISO8601DateFormatter().date(from: "2026-05-15T00:00:00Z")!
        let txns = [
            makeTxn(date: ref, amount: 1_000, category: "薪水"),
            makeTxn(date: ref, amount: -200, category: "伙食"),
            makeTxn(date: ref, amount: -50, category: "交通")
        ]
        let summary = SpendingSummaryBuilder.build(
            transactions: txns,
            baseCurrency: "TWD",
            referenceDate: ref,
            convert: identityConvert
        )
        XCTAssertEqual(summary.totalIncome, 1_000)
        XCTAssertEqual(summary.totalExpense, 250)
        XCTAssertEqual(summary.net, 750)
        XCTAssertEqual(summary.transactionCount, 3)
    }

    func testExcludesInvestmentLinkedRows() {
        let ref = ISO8601DateFormatter().date(from: "2026-05-15T00:00:00Z")!
        let txns = [
            makeTxn(date: ref, amount: -500, category: "投資扣款", linked: UUID()),
            makeTxn(date: ref, amount: -100, category: "伙食")
        ]
        let summary = SpendingSummaryBuilder.build(
            transactions: txns,
            baseCurrency: "TWD",
            referenceDate: ref,
            convert: identityConvert
        )
        XCTAssertEqual(summary.totalExpense, 100)
        XCTAssertEqual(summary.transactionCount, 1)
    }

    func testExcludesOutsideOfMonth() {
        let inside = ISO8601DateFormatter().date(from: "2026-05-15T00:00:00Z")!
        let outsidePast = ISO8601DateFormatter().date(from: "2026-04-30T00:00:00Z")!
        let outsideFuture = ISO8601DateFormatter().date(from: "2026-06-01T00:00:00Z")!
        let txns = [
            makeTxn(date: inside, amount: -100, category: "伙食"),
            makeTxn(date: outsidePast, amount: -999, category: "伙食"),
            makeTxn(date: outsideFuture, amount: -999, category: "伙食")
        ]
        let summary = SpendingSummaryBuilder.build(
            transactions: txns,
            baseCurrency: "TWD",
            referenceDate: inside,
            convert: identityConvert
        )
        XCTAssertEqual(summary.totalExpense, 100)
        XCTAssertEqual(summary.transactionCount, 1)
    }

    func testTopCategoriesAreSortedAndCapped() {
        let ref = ISO8601DateFormatter().date(from: "2026-05-15T00:00:00Z")!
        let txns = [
            makeTxn(date: ref, amount: -300, category: "伙食"),
            makeTxn(date: ref, amount: -200, category: "交通"),
            makeTxn(date: ref, amount: -150, category: "娛樂"),
            makeTxn(date: ref, amount: -50, category: "醫療"),
            makeTxn(date: ref, amount: -100, category: "伙食")
        ]
        let summary = SpendingSummaryBuilder.build(
            transactions: txns,
            baseCurrency: "TWD",
            referenceDate: ref,
            topCount: 3,
            convert: identityConvert
        )
        XCTAssertEqual(summary.topExpenseCategories.count, 3)
        XCTAssertEqual(summary.topExpenseCategories[0], SpendingCategoryBreakdown(category: "伙食", amount: 400))
        XCTAssertEqual(summary.topExpenseCategories[1], SpendingCategoryBreakdown(category: "交通", amount: 200))
        XCTAssertEqual(summary.topExpenseCategories[2], SpendingCategoryBreakdown(category: "娛樂", amount: 150))
    }

    func testFXConversionIsApplied() {
        let ref = ISO8601DateFormatter().date(from: "2026-05-15T00:00:00Z")!
        let txns = [
            makeTxn(date: ref, amount: -100, currency: "USD", category: "訂閱")
        ]
        let convert: (Double, String, String) -> Double? = { amount, from, to in
            if from == "USD" && to == "TWD" { return amount * 32 }
            return amount
        }
        let summary = SpendingSummaryBuilder.build(
            transactions: txns,
            baseCurrency: "TWD",
            referenceDate: ref,
            convert: convert
        )
        XCTAssertEqual(summary.totalExpense, 3_200)
        XCTAssertEqual(summary.topExpenseCategories.first?.amount, 3_200)
    }

    func testRowsWithMissingFXAreSkipped() {
        let ref = ISO8601DateFormatter().date(from: "2026-05-15T00:00:00Z")!
        let txns = [
            makeTxn(date: ref, amount: -100, currency: "JPY", category: "旅遊"),
            makeTxn(date: ref, amount: -50, currency: "TWD", category: "伙食")
        ]
        let convert: (Double, String, String) -> Double? = { amount, from, _ in
            from == "TWD" ? amount : nil
        }
        let summary = SpendingSummaryBuilder.build(
            transactions: txns,
            baseCurrency: "TWD",
            referenceDate: ref,
            convert: convert
        )
        XCTAssertEqual(summary.totalExpense, 50)
        XCTAssertEqual(summary.transactionCount, 1)
    }

    func testEmptyCategoryFallsBackToUncategorized() {
        let ref = ISO8601DateFormatter().date(from: "2026-05-15T00:00:00Z")!
        let txns = [
            makeTxn(date: ref, amount: -100, category: "")
        ]
        let summary = SpendingSummaryBuilder.build(
            transactions: txns,
            baseCurrency: "TWD",
            referenceDate: ref,
            convert: identityConvert
        )
        XCTAssertEqual(summary.topExpenseCategories.first?.category, "未分類")
    }
}
