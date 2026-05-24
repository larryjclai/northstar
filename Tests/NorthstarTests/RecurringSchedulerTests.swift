import XCTest
import SwiftData
@testable import Northstar_macOS

@MainActor
final class RecurringSchedulerTests: XCTestCase {
    private var container: ModelContainer!
    private var context: ModelContext!
    private var calendar: Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        return cal
    }

    override func setUpWithError() throws {
        let schema = Schema([
            Account.self,
            PortfolioAsset.self,
            InvestmentRecord.self,
            LedgerTransaction.self,
            RecurringTransaction.self
        ])
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        container = try ModelContainer(for: schema, configurations: [config])
        context = ModelContext(container)
    }

    private func makeAccount(currency: String = "TWD", balance: Double = 0) -> Account {
        let account = Account(name: "Test", currency: currency, balance: balance, openingBalance: balance)
        context.insert(account)
        return account
    }

    private func date(_ string: String) -> Date {
        ISO8601DateFormatter().date(from: string + "T00:00:00Z")!
    }

    func testInsertsNothingWhenAllFutureDated() {
        let account = makeAccount()
        let template = RecurringTransaction(
            amount: -1_000,
            currency: "TWD",
            category: "訂閱",
            dayOfMonth: 15,
            nextRunDate: date("2026-06-15"),
            account: account
        )
        context.insert(template)

        let outcome = RecurringScheduler.runDue(
            templates: [template],
            context: context,
            asOf: date("2026-05-16"),
            calendar: calendar
        )
        XCTAssertEqual(outcome.inserted, 0)
        XCTAssertEqual(template.nextRunDate, date("2026-06-15"))
    }

    func testInsertsOneWhenDueToday() {
        let account = makeAccount()
        let template = RecurringTransaction(
            amount: -1_000,
            currency: "TWD",
            category: "訂閱",
            dayOfMonth: 15,
            nextRunDate: date("2026-05-15"),
            account: account
        )
        context.insert(template)

        let outcome = RecurringScheduler.runDue(
            templates: [template],
            context: context,
            asOf: date("2026-05-16"),
            calendar: calendar
        )
        XCTAssertEqual(outcome.inserted, 1)
        XCTAssertEqual(template.nextRunDate, date("2026-06-15"))
        XCTAssertEqual(account.balance, -1_000)
    }

    func testCatchesUpMultipleMissedMonths() {
        let account = makeAccount()
        let template = RecurringTransaction(
            amount: -500,
            currency: "TWD",
            category: "訂閱",
            dayOfMonth: 10,
            nextRunDate: date("2026-02-10"),
            account: account
        )
        context.insert(template)

        let outcome = RecurringScheduler.runDue(
            templates: [template],
            context: context,
            asOf: date("2026-05-16"),
            calendar: calendar
        )
        XCTAssertEqual(outcome.inserted, 4) // Feb, Mar, Apr, May
        XCTAssertEqual(template.nextRunDate, date("2026-06-10"))
        XCTAssertEqual(account.balance, -2_000)
    }

    func testInactiveTemplateIsSkipped() {
        let account = makeAccount()
        let template = RecurringTransaction(
            amount: -1_000,
            currency: "TWD",
            category: "訂閱",
            dayOfMonth: 15,
            nextRunDate: date("2026-05-15"),
            isActive: false,
            account: account
        )
        context.insert(template)

        let outcome = RecurringScheduler.runDue(
            templates: [template],
            context: context,
            asOf: date("2026-05-16"),
            calendar: calendar
        )
        XCTAssertEqual(outcome.inserted, 0)
        XCTAssertEqual(template.nextRunDate, date("2026-05-15"))
    }

    func testTemplateWithoutAccountIsSkipped() {
        let template = RecurringTransaction(
            amount: -100,
            currency: "TWD",
            category: "訂閱",
            dayOfMonth: 15,
            nextRunDate: date("2026-05-15")
        )
        context.insert(template)

        let outcome = RecurringScheduler.runDue(
            templates: [template],
            context: context,
            asOf: date("2026-05-16"),
            calendar: calendar
        )
        XCTAssertEqual(outcome.inserted, 0)
    }

    func testDayOfMonthClampsToShortFebruary() {
        // Jan 31 -> Feb 28 (2026 is not a leap year)
        let next = RecurringScheduler.nextOccurrence(after: date("2026-01-31"), calendar: calendar)
        XCTAssertEqual(next, date("2026-02-28"))
    }

    func testInitialRunDateThisMonthIfNotPast() {
        let asOf = date("2026-05-10")
        let result = RecurringScheduler.initialRunDate(dayOfMonth: 15, asOf: asOf, calendar: calendar)
        XCTAssertEqual(result, date("2026-05-15"))
    }

    func testInitialRunDateNextMonthIfPast() {
        let asOf = date("2026-05-20")
        let result = RecurringScheduler.initialRunDate(dayOfMonth: 15, asOf: asOf, calendar: calendar)
        XCTAssertEqual(result, date("2026-06-15"))
    }

    func testRunNowInsertsAtAsOfAndAdvancesSchedule() throws {
        let account = makeAccount()
        let template = RecurringTransaction(
            amount: -1_500,
            currency: "TWD",
            category: "訂閱",
            dayOfMonth: 20,
            nextRunDate: date("2026-05-20"),
            account: account
        )
        context.insert(template)

        let runDay = date("2026-05-10")
        let ok = RecurringScheduler.runNow(
            template: template,
            context: context,
            asOf: runDay,
            calendar: calendar
        )

        XCTAssertTrue(ok)
        XCTAssertEqual(template.nextRunDate, date("2026-06-20"))
        XCTAssertEqual(account.balance, -1_500)

        let inserted = try context.fetch(FetchDescriptor<LedgerTransaction>())
        XCTAssertEqual(inserted.count, 1)
        XCTAssertEqual(inserted.first?.date, runDay)
        XCTAssertEqual(inserted.first?.amount, -1_500)
    }

    func testRunNowSkippedWhenTemplateHasNoAccount() throws {
        let template = RecurringTransaction(
            amount: -100,
            currency: "TWD",
            category: "訂閱",
            dayOfMonth: 20,
            nextRunDate: date("2026-05-20")
        )
        context.insert(template)

        let ok = RecurringScheduler.runNow(
            template: template,
            context: context,
            asOf: date("2026-05-10"),
            calendar: calendar
        )
        XCTAssertFalse(ok)
        XCTAssertEqual(template.nextRunDate, date("2026-05-20"))

        let inserted = try context.fetch(FetchDescriptor<LedgerTransaction>())
        XCTAssertTrue(inserted.isEmpty)
    }

    func testSkipNextAdvancesWithoutInserting() throws {
        let account = makeAccount(balance: 1_000)
        let template = RecurringTransaction(
            amount: -500,
            currency: "TWD",
            category: "訂閱",
            dayOfMonth: 15,
            nextRunDate: date("2026-05-15"),
            account: account
        )
        context.insert(template)

        let ok = RecurringScheduler.skipNext(template: template, calendar: calendar)
        XCTAssertTrue(ok)
        XCTAssertEqual(template.nextRunDate, date("2026-06-15"))
        XCTAssertEqual(account.balance, 1_000)

        let inserted = try context.fetch(FetchDescriptor<LedgerTransaction>())
        XCTAssertTrue(inserted.isEmpty)
    }
}
