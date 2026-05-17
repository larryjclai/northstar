import XCTest
@testable import Northstar_macOS

final class RecentCategorySuggesterTests: XCTestCase {
    private let reference = Date(timeIntervalSince1970: 1_715_000_000)  // fixed reference

    func testReturnsEmptyForNoTransactions() {
        XCTAssertEqual(
            RecentCategorySuggester.topCategories(from: [], type: .expense, on: reference),
            []
        )
    }

    func testRanksByFrequencyDescending() {
        let txns = [
            txn(category: "伙食", amount: -100, daysAgo: 1),
            txn(category: "伙食", amount: -100, daysAgo: 2),
            txn(category: "交通", amount: -50, daysAgo: 3)
        ]
        let result = RecentCategorySuggester.topCategories(from: txns, type: .expense, on: reference)
        XCTAssertEqual(result, ["伙食", "交通"])
    }

    func testRecencyBreaksTies() {
        let txns = [
            txn(category: "A", amount: -100, daysAgo: 10),
            txn(category: "B", amount: -100, daysAgo: 2)
        ]
        let result = RecentCategorySuggester.topCategories(from: txns, type: .expense, on: reference)
        XCTAssertEqual(result, ["B", "A"])
    }

    func testFiltersByEntryType() {
        let txns = [
            txn(category: "薪水", amount: 50_000, daysAgo: 1),
            txn(category: "伙食", amount: -100, daysAgo: 1)
        ]
        let income = RecentCategorySuggester.topCategories(from: txns, type: .income, on: reference)
        let expense = RecentCategorySuggester.topCategories(from: txns, type: .expense, on: reference)
        XCTAssertEqual(income, ["薪水"])
        XCTAssertEqual(expense, ["伙食"])
    }

    func testIgnoresOutsideWindow() {
        let txns = [
            txn(category: "伙食", amount: -100, daysAgo: 1),
            txn(category: "外面", amount: -100, daysAgo: 45)
        ]
        let result = RecentCategorySuggester.topCategories(from: txns, type: .expense, on: reference, windowDays: 30)
        XCTAssertEqual(result, ["伙食"])
    }

    func testExcludesInvestmentLinkedCategories() {
        let txns = [
            txn(category: "投資扣款", amount: -10_000, daysAgo: 1),
            txn(category: "股利", amount: 500, daysAgo: 2),
            txn(category: "伙食", amount: -100, daysAgo: 3)
        ]
        let result = RecentCategorySuggester.topCategories(from: txns, type: .expense, on: reference)
        XCTAssertEqual(result, ["伙食"])
    }

    func testIgnoresBlankCategories() {
        let txns = [
            txn(category: "  ", amount: -100, daysAgo: 1),
            txn(category: "伙食", amount: -100, daysAgo: 2)
        ]
        let result = RecentCategorySuggester.topCategories(from: txns, type: .expense, on: reference)
        XCTAssertEqual(result, ["伙食"])
    }

    func testRespectsLimit() {
        let txns = (0..<10).map { i in
            txn(category: "C\(i)", amount: -100, daysAgo: i + 1)
        }
        let result = RecentCategorySuggester.topCategories(from: txns, type: .expense, on: reference, limit: 3)
        XCTAssertEqual(result.count, 3)
    }

    // MARK: - helpers

    private func txn(category: String, amount: Double, daysAgo: Int) -> LedgerTransaction {
        let date = Calendar(identifier: .gregorian)
            .date(byAdding: .day, value: -daysAgo, to: reference) ?? reference
        return LedgerTransaction(
            date: date,
            amount: amount,
            currency: "TWD",
            category: category,
            note: ""
        )
    }
}
