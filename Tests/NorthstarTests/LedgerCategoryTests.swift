import XCTest
@testable import Northstar_macOS

final class LedgerCategoryTests: XCTestCase {
    func testSignedAmountSignsByType() {
        XCTAssertEqual(LedgerEntryType.income.signedAmount(magnitude: 100), 100)
        XCTAssertEqual(LedgerEntryType.income.signedAmount(magnitude: -100), 100)
        XCTAssertEqual(LedgerEntryType.expense.signedAmount(magnitude: 100), -100)
        XCTAssertEqual(LedgerEntryType.expense.signedAmount(magnitude: -100), -100)
        XCTAssertEqual(LedgerEntryType.transfer.signedAmount(magnitude: 100), 100)
        XCTAssertEqual(LedgerEntryType.transfer.signedAmount(magnitude: -100), -100)
    }

    func testInferTreatsInvestmentLinkedAsTransfer() {
        XCTAssertEqual(LedgerEntryType.infer(amount: -1000, category: "投資扣款"), .transfer)
        XCTAssertEqual(LedgerEntryType.infer(amount: 500, category: "股利"), .transfer)
        XCTAssertEqual(LedgerEntryType.infer(amount: -50, category: "對帳調整"), .transfer)
    }

    func testInferFallsBackToSign() {
        XCTAssertEqual(LedgerEntryType.infer(amount: 500, category: "薪水"), .income)
        XCTAssertEqual(LedgerEntryType.infer(amount: -200, category: "伙食"), .expense)
        XCTAssertEqual(LedgerEntryType.infer(amount: 0, category: "其他"), .income)
    }

    func testSuggestionsAreNonEmptyForEachType() {
        for type in LedgerEntryType.allCases {
            XCTAssertFalse(LedgerCategoryCatalog.suggestions(for: type).isEmpty)
        }
    }
}
