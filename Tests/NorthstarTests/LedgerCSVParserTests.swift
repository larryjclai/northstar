import XCTest
@testable import Northstar_macOS

final class LedgerCSVParserTests: XCTestCase {

    func testParsesValidRowsWithHeader() {
        let csv = """
        id,Date,Amount,Currency,Category,Note,Account
        ,2026-05-01,-120.5,TWD,伙食,午餐,日常戶
        ,2026-05-02,45000,TWD,薪水,五月薪資,日常戶
        """

        let rows = LedgerCSVParser.parse(csv, existingIDs: [])
        XCTAssertEqual(rows.count, 2)
        XCTAssertEqual(rows[0].lineNumber, 2)
        XCTAssertEqual(rows[0].amount, -120.5)
        XCTAssertEqual(rows[0].currency, "TWD")
        XCTAssertEqual(rows[0].category, "伙食")
        XCTAssertEqual(rows[0].accountName, "日常戶")
        XCTAssertEqual(rows[0].status, .new)
        XCTAssertEqual(rows[1].amount, 45000)
        XCTAssertEqual(rows[1].status, .new)
    }

    func testParsesWithoutHeader() {
        let csv = ",2026-05-01,-50,TWD,伙食,,主帳戶"
        let rows = LedgerCSVParser.parse(csv, existingIDs: [])
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows[0].lineNumber, 1)
        XCTAssertEqual(rows[0].status, .new)
    }

    func testDuplicateIDIsFlagged() {
        let existing = UUID()
        let csv = """
        id,Date,Amount,Currency,Category,Note,Account
        \(existing.uuidString),2026-05-01,-50,TWD,伙食,,日常戶
        """
        let rows = LedgerCSVParser.parse(csv, existingIDs: [existing])
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows[0].status, .duplicate)
    }

    func testInvalidUUIDIsFlagged() {
        let csv = """
        id,Date,Amount,Currency,Category,Note,Account
        not-a-uuid,2026-05-01,-50,TWD,伙食,,日常戶
        """
        let rows = LedgerCSVParser.parse(csv, existingIDs: [])
        XCTAssertEqual(rows.count, 1)
        if case .invalid(let reason) = rows[0].status {
            XCTAssertTrue(reason.contains("UUID"))
        } else {
            XCTFail("expected invalid status")
        }
    }

    func testMissingDateIsFlagged() {
        let csv = """
        id,Date,Amount,Currency,Category,Note,Account
        ,not-a-date,-50,TWD,伙食,,日常戶
        """
        let rows = LedgerCSVParser.parse(csv, existingIDs: [])
        if case .invalid(let reason) = rows[0].status {
            XCTAssertTrue(reason.contains("日期"))
        } else {
            XCTFail("expected invalid status")
        }
    }

    func testMissingAmountIsFlagged() {
        let csv = """
        id,Date,Amount,Currency,Category,Note,Account
        ,2026-05-01,abc,TWD,伙食,,日常戶
        """
        let rows = LedgerCSVParser.parse(csv, existingIDs: [])
        if case .invalid(let reason) = rows[0].status {
            XCTAssertTrue(reason.contains("Amount"))
        } else {
            XCTFail("expected invalid status")
        }
    }

    func testMissingAccountIsFlagged() {
        let csv = """
        id,Date,Amount,Currency,Category,Note,Account
        ,2026-05-01,-50,TWD,伙食,,
        """
        let rows = LedgerCSVParser.parse(csv, existingIDs: [])
        if case .invalid(let reason) = rows[0].status {
            XCTAssertTrue(reason.contains("Account"))
        } else {
            XCTFail("expected invalid status")
        }
    }

    func testCurrencyDefaultsToTWDWhenBlank() {
        let csv = """
        id,Date,Amount,Currency,Category,Note,Account
        ,2026-05-01,-50,,伙食,,日常戶
        """
        let rows = LedgerCSVParser.parse(csv, existingIDs: [])
        XCTAssertEqual(rows[0].currency, "TWD")
        XCTAssertEqual(rows[0].status, .new)
    }

    func testQuotedFieldsWithCommasAreParsed() {
        let csv = """
        id,Date,Amount,Currency,Category,Note,Account
        ,2026-05-01,-50,TWD,伙食,"早餐, 午餐",日常戶
        """
        let rows = LedgerCSVParser.parse(csv, existingIDs: [])
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows[0].note, "早餐, 午餐")
        XCTAssertEqual(rows[0].status, .new)
    }
}
