import XCTest
@testable import Northstar_macOS

final class LedgerGroupClassifierTests: XCTestCase {
    private var accountA: Account!
    private var accountB: Account!

    override func setUp() {
        super.setUp()
        accountA = Account(name: "A", currency: "TWD", balance: 0)
        accountB = Account(name: "B", currency: "TWD", balance: 0)
    }

    override func tearDown() {
        accountA = nil
        accountB = nil
        super.tearDown()
    }

    func testEmptyIsUnknown() {
        XCTAssertEqual(LedgerGroupClassifier.classify([]), .unknown)
    }

    func testSingletonIsSingleton() {
        let one = LedgerTransaction(date: Date(), amount: -100, currency: "TWD", account: accountA)
        XCTAssertEqual(LedgerGroupClassifier.classify([one]), .singleton)
    }

    func testTwoSameAccountIsSplit() {
        let a = LedgerTransaction(date: Date(), amount: -100, currency: "TWD", account: accountA)
        let b = LedgerTransaction(date: Date(), amount: -200, currency: "TWD", account: accountA)
        XCTAssertEqual(LedgerGroupClassifier.classify([a, b]), .split)
    }

    func testTwoDifferentAccountsOppositeSignsIsTransfer() {
        let out = LedgerTransaction(date: Date(), amount: -1_000, currency: "TWD", account: accountA)
        let into = LedgerTransaction(date: Date(), amount: 1_000, currency: "TWD", account: accountB)
        XCTAssertEqual(LedgerGroupClassifier.classify([out, into]), .transfer)
    }

    func testTwoDifferentAccountsSameSignIsUnknown() {
        let a = LedgerTransaction(date: Date(), amount: 1_000, currency: "TWD", account: accountA)
        let b = LedgerTransaction(date: Date(), amount: 1_000, currency: "TWD", account: accountB)
        XCTAssertEqual(LedgerGroupClassifier.classify([a, b]), .unknown)
    }

    func testThreeMembersSameAccountIsSplit() {
        let a = LedgerTransaction(date: Date(), amount: -100, currency: "TWD", account: accountA)
        let b = LedgerTransaction(date: Date(), amount: -200, currency: "TWD", account: accountA)
        let c = LedgerTransaction(date: Date(), amount: -50, currency: "TWD", account: accountA)
        XCTAssertEqual(LedgerGroupClassifier.classify([a, b, c]), .split)
    }

    func testThreeMembersMixedAccountsIsUnknown() {
        let a = LedgerTransaction(date: Date(), amount: -100, currency: "TWD", account: accountA)
        let b = LedgerTransaction(date: Date(), amount: -200, currency: "TWD", account: accountB)
        let c = LedgerTransaction(date: Date(), amount: -50, currency: "TWD", account: accountA)
        XCTAssertEqual(LedgerGroupClassifier.classify([a, b, c]), .unknown)
    }

    func testSourceAndDestinationLegHelpers() {
        let out = LedgerTransaction(date: Date(), amount: -1_000, currency: "TWD", account: accountA)
        let into = LedgerTransaction(date: Date(), amount: 1_000, currency: "TWD", account: accountB)
        XCTAssertTrue(LedgerGroupClassifier.sourceLeg(of: [out, into]) === out)
        XCTAssertTrue(LedgerGroupClassifier.destinationLeg(of: [out, into]) === into)
    }

    func testLegHelpersReturnNilForNonTransfer() {
        let a = LedgerTransaction(date: Date(), amount: -100, currency: "TWD", account: accountA)
        let b = LedgerTransaction(date: Date(), amount: -200, currency: "TWD", account: accountA)
        XCTAssertNil(LedgerGroupClassifier.sourceLeg(of: [a, b]))
        XCTAssertNil(LedgerGroupClassifier.destinationLeg(of: [a, b]))
    }
}
