import XCTest
@testable import Northstar_macOS

final class CurrencyFormattersTests: XCTestCase {
    func testUSDUsesEnUSConventions() {
        let result = CurrencyFormatters.money(1234.5, currencyCode: "USD")
        // Either "$1,234.50" or with non-breaking spaces; key thing: starts with $ not US$
        XCTAssertTrue(result.hasPrefix("$"), "expected $ prefix, got \(result)")
        XCTAssertTrue(result.contains("1,234"))
    }

    func testJPYHasNoDecimals() {
        let result = CurrencyFormatters.money(1234.99, currencyCode: "JPY")
        XCTAssertFalse(result.contains("."))
    }

    func testTWDStaysZeroDecimal() {
        let result = CurrencyFormatters.money(50000, currencyCode: "TWD")
        XCTAssertFalse(result.contains("."))
        XCTAssertTrue(result.contains("50,000"))
    }

    func testSignedMoneyPrefixes() {
        XCTAssertTrue(CurrencyFormatters.signedMoney(100, currencyCode: "USD").hasPrefix("+"))
        XCTAssertTrue(CurrencyFormatters.signedMoney(-100, currencyCode: "USD").hasPrefix("-"))
    }

    func testPercent() {
        XCTAssertEqual(CurrencyFormatters.percent(0.1234), "12.34%")
        XCTAssertEqual(CurrencyFormatters.percent(-0.05), "-5.00%")
    }
}
