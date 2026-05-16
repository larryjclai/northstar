import XCTest
@testable import Northstar_macOS

final class TimeRangeTests: XCTestCase {
    func testStartIndexWithEmptyDatesUsesTradingDayFallback() {
        XCTAssertEqual(TimeRange.week.startIndex(in: [], totalCount: 10), 5)
        XCTAssertEqual(TimeRange.month.startIndex(in: [], totalCount: 30), 8)
        XCTAssertEqual(TimeRange.threeMonth.startIndex(in: [], totalCount: 100), 34)
        XCTAssertEqual(TimeRange.year.startIndex(in: [], totalCount: 300), 48)
        XCTAssertEqual(TimeRange.all.startIndex(in: [], totalCount: 500), 0)
    }

    func testStartIndexWithDatesAlignsToThreshold() {
        let calendar = Calendar(identifier: .gregorian)
        let now = calendar.date(from: DateComponents(year: 2026, month: 5, day: 16))!
        let dates: [Date] = (0..<30).reversed().map {
            calendar.date(byAdding: .day, value: -$0, to: now)!
        }

        let weekIndex = TimeRange.week.startIndex(in: dates, totalCount: dates.count, now: now)
        XCTAssertEqual(weekIndex, 22) // dates[22] is 2026-05-09, the first >= now-7
    }

    func testStartIndexClampsToLastWhenAllOlder() {
        let calendar = Calendar(identifier: .gregorian)
        let now = calendar.date(from: DateComponents(year: 2026, month: 5, day: 16))!
        let dates = [calendar.date(byAdding: .year, value: -3, to: now)!]
        let index = TimeRange.week.startIndex(in: dates, totalCount: 1, now: now)
        XCTAssertEqual(index, 0)
    }

    func testStartIndexAllReturnsZero() {
        let now = Date()
        let dates: [Date] = (0..<5).map { _ in now }
        XCTAssertEqual(TimeRange.all.startIndex(in: dates, totalCount: 5, now: now), 0)
    }
}
