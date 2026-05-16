import Foundation
import SwiftData

@MainActor
enum RecurringScheduler {
    struct Outcome: Equatable {
        var inserted: Int = 0
        var advanced: Int = 0
    }

    /// For each active template whose nextRunDate is on or before `asOf`,
    /// insert a LedgerTransaction at the scheduled date and advance the
    /// template's nextRunDate by one calendar month. Catches up missed
    /// occurrences when the app hasn't been opened for a while.
    @discardableResult
    static func runDue(
        templates: [RecurringTransaction],
        context: ModelContext,
        asOf: Date = Date(),
        calendar: Calendar = Calendar(identifier: .gregorian)
    ) -> Outcome {
        var outcome = Outcome()
        var affectedAccounts = Set<ObjectIdentifier>()
        var accountList: [Account] = []

        for template in templates where template.isActive {
            guard let account = template.account else { continue }

            while template.nextRunDate <= asOf {
                let txn = LedgerTransaction(
                    date: template.nextRunDate,
                    amount: template.amount,
                    currency: template.currency,
                    category: template.category,
                    note: template.note,
                    account: account
                )
                context.insert(txn)
                outcome.inserted += 1

                if let next = nextOccurrence(after: template.nextRunDate, calendar: calendar) {
                    template.nextRunDate = next
                    outcome.advanced += 1
                } else {
                    break
                }

                if affectedAccounts.insert(ObjectIdentifier(account)).inserted {
                    accountList.append(account)
                }
            }
        }

        if outcome.inserted > 0 {
            try? context.save()
            for account in accountList {
                account.recomputeBalance()
            }
            try? context.save()
        }

        return outcome
    }

    /// Advance one month, preserving the same day-of-month (clamped if the
    /// target month is shorter — e.g. Jan 31 → Feb 28).
    static func nextOccurrence(after date: Date, calendar: Calendar = Calendar(identifier: .gregorian)) -> Date? {
        calendar.date(byAdding: .month, value: 1, to: date)
    }

    /// Compute the first run date for a brand-new template, given its
    /// day-of-month. If today is past that day this month, schedule next
    /// month. Otherwise schedule it for this month.
    static func initialRunDate(
        dayOfMonth: Int,
        asOf: Date = Date(),
        calendar: Calendar = Calendar(identifier: .gregorian)
    ) -> Date {
        let day = max(1, min(31, dayOfMonth))
        var components = calendar.dateComponents([.year, .month], from: asOf)
        components.day = day
        let candidate = calendar.date(from: components) ?? asOf

        if candidate < calendar.startOfDay(for: asOf) {
            return calendar.date(byAdding: .month, value: 1, to: candidate) ?? candidate
        }
        return candidate
    }
}
