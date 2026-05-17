import XCTest
@testable import Northstar_macOS

final class AmountExpressionTests: XCTestCase {
    func testPlainIntegerReturnsValue() {
        XCTAssertEqual(AmountExpression.evaluate("120"), 120)
    }

    func testPlainDecimalReturnsValue() {
        XCTAssertEqual(AmountExpression.evaluate("12.5"), 12.5)
    }

    func testAdditionSums() {
        XCTAssertEqual(AmountExpression.evaluate("120+85+30"), 235)
    }

    func testSubtractionWorks() {
        XCTAssertEqual(AmountExpression.evaluate("500-120"), 380)
    }

    func testMixedOperatorsRespectPrecedence() {
        XCTAssertEqual(AmountExpression.evaluate("10+5*2"), 20)
    }

    func testParenthesesOverridePrecedence() {
        XCTAssertEqual(AmountExpression.evaluate("(10+5)*2"), 30)
    }

    func testDecimalAddition() {
        XCTAssertEqual(AmountExpression.evaluate("12.5+7.5"), 20)
    }

    func testWhitespaceIsTolerated() {
        XCTAssertEqual(AmountExpression.evaluate(" 12 + 8 "), 20)
    }

    func testCommaIsTreatedAsDecimal() {
        XCTAssertEqual(AmountExpression.evaluate("12,5+7,5"), 20)
    }

    func testEmptyReturnsNil() {
        XCTAssertNil(AmountExpression.evaluate(""))
        XCTAssertNil(AmountExpression.evaluate("   "))
    }

    func testInvalidCharactersReturnNil() {
        XCTAssertNil(AmountExpression.evaluate("12+abc"))
        XCTAssertNil(AmountExpression.evaluate("rm -rf /"))
        XCTAssertNil(AmountExpression.evaluate("SUM(1, 2)"))
    }

    func testMalformedExpressionReturnsNil() {
        XCTAssertNil(AmountExpression.evaluate("("))
        XCTAssertNil(AmountExpression.evaluate("12+"))
        XCTAssertNil(AmountExpression.evaluate(".."))
    }

    func testDivideByZeroReturnsNil() {
        XCTAssertNil(AmountExpression.evaluate("10/0"))
    }

    func testTooLongInputReturnsNil() {
        let long = String(repeating: "1+", count: 50) + "1"
        XCTAssertNil(AmountExpression.evaluate(long))
    }
}
