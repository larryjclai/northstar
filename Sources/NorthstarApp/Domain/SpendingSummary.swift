import Foundation
import SwiftData

struct SpendingCategoryBreakdown: Equatable {
    let category: String
    let amount: Double
}

struct SpendingSummary: Equatable {
    let totalIncome: Double
    let totalExpense: Double
    let transactionCount: Int
    let topExpenseCategories: [SpendingCategoryBreakdown]

    var net: Double { totalIncome - totalExpense }

    static let empty = SpendingSummary(
        totalIncome: 0,
        totalExpense: 0,
        transactionCount: 0,
        topExpenseCategories: []
    )
}

enum SpendingSummaryBuilder {
    /// Build a base-currency summary for the calendar month containing `referenceDate`.
    /// Investment-linked rows are excluded so the card reflects everyday cash flow only.
    static func build(
        transactions: [LedgerTransaction],
        baseCurrency: String,
        referenceDate: Date,
        topCount: Int = 3,
        convert: (Double, String, String) -> Double?
    ) -> SpendingSummary {
        let calendar = Calendar(identifier: .gregorian)
        let components = calendar.dateComponents([.year, .month], from: referenceDate)
        guard let start = calendar.date(from: components),
              let end = calendar.date(byAdding: .month, value: 1, to: start)
        else {
            return .empty
        }

        var income: Double = 0
        var expense: Double = 0
        var perCategory: [String: Double] = [:]
        var count = 0

        for txn in transactions {
            guard txn.linkedInvestmentRecordID == nil else { continue }
            // Transfers / FX-exchange rows are internal money movements — counting them
            // would fabricate income on the destination leg and expense on the source.
            guard LedgerCategoryCatalog.excludedFromCashFlowTotals.contains(txn.category) == false else { continue }
            guard txn.date >= start && txn.date < end else { continue }
            guard let converted = convert(txn.amount, txn.currency, baseCurrency) else { continue }
            count += 1

            if converted >= 0 {
                income += converted
            } else {
                let magnitude = -converted
                expense += magnitude
                let key = txn.category.isEmpty ? "未分類" : txn.category
                perCategory[key, default: 0] += magnitude
            }
        }

        let sorted = perCategory
            .map { SpendingCategoryBreakdown(category: $0.key, amount: $0.value) }
            .sorted { lhs, rhs in
                if lhs.amount == rhs.amount { return lhs.category < rhs.category }
                return lhs.amount > rhs.amount
            }
        let top = Array(sorted.prefix(topCount))

        return SpendingSummary(
            totalIncome: income,
            totalExpense: expense,
            transactionCount: count,
            topExpenseCategories: top
        )
    }
}
