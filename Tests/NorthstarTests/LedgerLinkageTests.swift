import XCTest
@testable import Northstar_macOS

final class LedgerLinkageTests: XCTestCase {
    func testBuyDeductsGrossAndFee() {
        let impact = LedgerLinkage.cashImpact(
            action: .buy, price: 100, quantity: 10, fee: 5,
            assetCurrency: "TWD", accountCurrency: "TWD"
        )
        guard case .amount(let value) = impact else {
            XCTFail("expected amount, got \(impact)")
            return
        }
        XCTAssertEqual(value, -1005, accuracy: 0.0001)
    }

    func testSellAddsGrossMinusFee() {
        let impact = LedgerLinkage.cashImpact(
            action: .sell, price: 200, quantity: 5, fee: 10,
            assetCurrency: "USD", accountCurrency: "USD"
        )
        guard case .amount(let value) = impact else {
            XCTFail("expected amount")
            return
        }
        XCTAssertEqual(value, 990, accuracy: 0.0001)
    }

    func testCashDividendAddsGrossMinusFee() {
        let impact = LedgerLinkage.cashImpact(
            action: .cashDividend, price: 2, quantity: 100, fee: 0,
            assetCurrency: "TWD", accountCurrency: "TWD"
        )
        guard case .amount(let value) = impact else {
            XCTFail("expected amount")
            return
        }
        XCTAssertEqual(value, 200, accuracy: 0.0001)
    }

    func testStockDividendHasNoCashImpact() {
        let impact = LedgerLinkage.cashImpact(
            action: .stockDividend, price: 0, quantity: 100, fee: 0,
            assetCurrency: "TWD", accountCurrency: "TWD"
        )
        if case .none = impact { } else { XCTFail("expected .none, got \(impact)") }
    }

    func testCapitalReductionHasNoCashImpact() {
        let impact = LedgerLinkage.cashImpact(
            action: .capitalReduction, price: 0, quantity: 10, fee: 0,
            assetCurrency: "TWD", accountCurrency: "TWD"
        )
        if case .none = impact { } else { XCTFail("expected .none") }
    }

    func testCurrencyMismatchFlaggedAndNotAuto() {
        let impact = LedgerLinkage.cashImpact(
            action: .buy, price: 100, quantity: 10, fee: 5,
            assetCurrency: "USD", accountCurrency: "TWD"
        )
        if case .currencyMismatch = impact { } else { XCTFail("expected .currencyMismatch") }
    }

    func testMissingCurrencyReturnsNone() {
        let impact = LedgerLinkage.cashImpact(
            action: .buy, price: 100, quantity: 1, fee: 0,
            assetCurrency: nil, accountCurrency: "TWD"
        )
        if case .none = impact { } else { XCTFail("expected .none") }
    }
}
