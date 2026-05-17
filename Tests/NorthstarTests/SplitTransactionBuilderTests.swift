import XCTest
@testable import Northstar_macOS

final class SplitTransactionBuilderTests: XCTestCase {
    private var account: Account!

    override func setUp() {
        super.setUp()
        account = Account(name: "Test", currency: "TWD", balance: 0)
    }

    override func tearDown() {
        account = nil
        super.tearDown()
    }

    func testBuildsRowsSharingGroupID() {
        let groupID = UUID()
        let rows = SplitTransactionBuilder.build(
            date: Date(),
            account: account,
            entryType: .expense,
            sharedNote: "家樂福",
            receipt: nil,
            groupID: groupID,
            lines: [
                .init(category: "伙食", magnitude: 1000),
                .init(category: "日用品", magnitude: 500)
            ]
        )
        XCTAssertEqual(rows?.count, 2)
        XCTAssertEqual(rows?.allSatisfy { $0.groupID == groupID }, true)
    }

    func testExpenseAppliesNegativeSign() {
        let rows = SplitTransactionBuilder.build(
            date: Date(),
            account: account,
            entryType: .expense,
            sharedNote: "",
            receipt: nil,
            groupID: UUID(),
            lines: [.init(category: "伙食", magnitude: 1000)]
        )
        XCTAssertEqual(rows?.first?.amount, -1000)
    }

    func testIncomeAppliesPositiveSign() {
        let rows = SplitTransactionBuilder.build(
            date: Date(),
            account: account,
            entryType: .income,
            sharedNote: "",
            receipt: nil,
            groupID: UUID(),
            lines: [.init(category: "薪水", magnitude: 50_000)]
        )
        XCTAssertEqual(rows?.first?.amount, 50_000)
    }

    func testReceiptAttachesToFirstRowOnly() {
        let data = Data([0x01, 0x02, 0x03])
        let rows = SplitTransactionBuilder.build(
            date: Date(),
            account: account,
            entryType: .expense,
            sharedNote: "",
            receipt: data,
            groupID: UUID(),
            lines: [
                .init(category: "伙食", magnitude: 1000),
                .init(category: "日用品", magnitude: 500)
            ]
        )
        XCTAssertEqual(rows?[0].receipt, data)
        XCTAssertNil(rows?[1].receipt)
    }

    func testReturnsNilWhenLinesEmpty() {
        XCTAssertNil(SplitTransactionBuilder.build(
            date: Date(),
            account: account,
            entryType: .expense,
            sharedNote: "",
            receipt: nil,
            groupID: UUID(),
            lines: []
        ))
    }

    func testReturnsNilForEmptyCategory() {
        XCTAssertNil(SplitTransactionBuilder.build(
            date: Date(),
            account: account,
            entryType: .expense,
            sharedNote: "",
            receipt: nil,
            groupID: UUID(),
            lines: [.init(category: "  ", magnitude: 100)]
        ))
    }

    func testReturnsNilForZeroOrNegativeMagnitude() {
        XCTAssertNil(SplitTransactionBuilder.build(
            date: Date(),
            account: account,
            entryType: .expense,
            sharedNote: "",
            receipt: nil,
            groupID: UUID(),
            lines: [.init(category: "伙食", magnitude: 0)]
        ))
        XCTAssertNil(SplitTransactionBuilder.build(
            date: Date(),
            account: account,
            entryType: .expense,
            sharedNote: "",
            receipt: nil,
            groupID: UUID(),
            lines: [.init(category: "伙食", magnitude: -100)]
        ))
    }

    func testCombinesSharedAndLineNotes() {
        let rows = SplitTransactionBuilder.build(
            date: Date(),
            account: account,
            entryType: .expense,
            sharedNote: "家樂福",
            receipt: nil,
            groupID: UUID(),
            lines: [
                .init(category: "伙食", magnitude: 1000, note: "海鮮"),
                .init(category: "日用品", magnitude: 500)
            ]
        )
        XCTAssertEqual(rows?[0].note, "家樂福 · 海鮮")
        XCTAssertEqual(rows?[1].note, "家樂福")
    }

    func testInheritsAccountCurrency() {
        account.currency = "USD"
        let rows = SplitTransactionBuilder.build(
            date: Date(),
            account: account,
            entryType: .expense,
            sharedNote: "",
            receipt: nil,
            groupID: UUID(),
            lines: [.init(category: "伙食", magnitude: 100)]
        )
        XCTAssertEqual(rows?.first?.currency, "USD")
    }
}
