import XCTest
@testable import Northstar_macOS

final class TransferBuilderTests: XCTestCase {
    private var twd: Account!
    private var usd: Account!

    override func setUp() {
        super.setUp()
        twd = Account(name: "TWD 帳戶", currency: "TWD", balance: 0)
        usd = Account(name: "USD 帳戶", currency: "USD", balance: 0)
    }

    override func tearDown() {
        twd = nil
        usd = nil
        super.tearDown()
    }

    func testSameCurrencyProducesMatchingLegs() {
        let twd2 = Account(name: "另一個 TWD", currency: "TWD", balance: 0)
        let rows = TransferBuilder.build(.init(
            date: Date(),
            sourceAccount: twd,
            destinationAccount: twd2,
            sourceMagnitude: 5_000,
            destinationMagnitude: nil,
            note: "月初轉",
            receipt: nil,
            groupID: UUID()
        ))
        XCTAssertEqual(rows?.count, 2)
        XCTAssertEqual(rows?[0].amount, -5_000)
        XCTAssertEqual(rows?[1].amount, 5_000)
        XCTAssertEqual(rows?[0].currency, "TWD")
        XCTAssertEqual(rows?[1].currency, "TWD")
        XCTAssertEqual(rows?[0].category, "轉帳")
        XCTAssertEqual(rows?[1].category, "轉帳")
    }

    func testCrossCurrencyUsesProvidedDestinationAmount() {
        let rows = TransferBuilder.build(.init(
            date: Date(),
            sourceAccount: twd,
            destinationAccount: usd,
            sourceMagnitude: 31_400,
            destinationMagnitude: 1_000,
            note: "換匯",
            receipt: nil,
            groupID: UUID()
        ))
        XCTAssertEqual(rows?[0].amount, -31_400)
        XCTAssertEqual(rows?[0].currency, "TWD")
        XCTAssertEqual(rows?[1].amount, 1_000)
        XCTAssertEqual(rows?[1].currency, "USD")
        XCTAssertEqual(rows?[0].category, "外幣兌換")
    }

    func testCrossCurrencyMissingDestinationReturnsNil() {
        XCTAssertNil(TransferBuilder.build(.init(
            date: Date(),
            sourceAccount: twd,
            destinationAccount: usd,
            sourceMagnitude: 31_400,
            destinationMagnitude: nil,
            note: "",
            receipt: nil,
            groupID: UUID()
        )))
    }

    func testSameAccountReturnsNil() {
        XCTAssertNil(TransferBuilder.build(.init(
            date: Date(),
            sourceAccount: twd,
            destinationAccount: twd,
            sourceMagnitude: 100,
            destinationMagnitude: nil,
            note: "",
            receipt: nil,
            groupID: UUID()
        )))
    }

    func testNonPositiveMagnitudeReturnsNil() {
        XCTAssertNil(TransferBuilder.build(.init(
            date: Date(),
            sourceAccount: twd,
            destinationAccount: usd,
            sourceMagnitude: 0,
            destinationMagnitude: 100,
            note: "",
            receipt: nil,
            groupID: UUID()
        )))
        XCTAssertNil(TransferBuilder.build(.init(
            date: Date(),
            sourceAccount: twd,
            destinationAccount: usd,
            sourceMagnitude: -100,
            destinationMagnitude: 100,
            note: "",
            receipt: nil,
            groupID: UUID()
        )))
    }

    func testSameCurrencyMismatchedDestinationReturnsNil() {
        let twd2 = Account(name: "另一個 TWD", currency: "TWD", balance: 0)
        XCTAssertNil(TransferBuilder.build(.init(
            date: Date(),
            sourceAccount: twd,
            destinationAccount: twd2,
            sourceMagnitude: 5_000,
            destinationMagnitude: 4_900,  // mismatch
            note: "",
            receipt: nil,
            groupID: UUID()
        )))
    }

    func testLegsShareGroupIDAndDate() {
        let groupID = UUID()
        let date = Date()
        let rows = TransferBuilder.build(.init(
            date: date,
            sourceAccount: twd,
            destinationAccount: usd,
            sourceMagnitude: 100,
            destinationMagnitude: 3.18,
            note: "",
            receipt: nil,
            groupID: groupID
        ))
        XCTAssertEqual(rows?[0].groupID, groupID)
        XCTAssertEqual(rows?[1].groupID, groupID)
        XCTAssertEqual(rows?[0].date, date)
        XCTAssertEqual(rows?[1].date, date)
    }

    func testReceiptAttachedToSourceLegOnly() {
        let data = Data([0x01, 0x02])
        let rows = TransferBuilder.build(.init(
            date: Date(),
            sourceAccount: twd,
            destinationAccount: usd,
            sourceMagnitude: 100,
            destinationMagnitude: 3.18,
            note: "",
            receipt: data,
            groupID: UUID()
        ))
        XCTAssertEqual(rows?[0].receipt, data)
        XCTAssertNil(rows?[1].receipt)
    }

    func testImplicitRateCalculation() {
        let rate = try? XCTUnwrap(TransferBuilder.implicitRate(
            sourceCurrency: "TWD",
            sourceMagnitude: 31_400,
            destinationCurrency: "USD",
            destinationMagnitude: 1_000
        ))
        XCTAssertEqual(rate ?? 0, 1_000 / 31_400, accuracy: 1e-10)
    }

    func testImplicitRateNilForSameCurrency() {
        XCTAssertNil(TransferBuilder.implicitRate(
            sourceCurrency: "TWD",
            sourceMagnitude: 100,
            destinationCurrency: "TWD",
            destinationMagnitude: 100
        ))
    }
}
