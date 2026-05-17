import Foundation

/// Ranks the user's recently-used ledger categories so the editor can surface them as
/// quick-pick chips. Ranking is frequency-first (with a recency tiebreaker) over a
/// trailing window of `windowDays`.
enum RecentCategorySuggester {
    static func topCategories(
        from transactions: [LedgerTransaction],
        type: LedgerEntryType,
        on referenceDate: Date = Date(),
        windowDays: Int = 30,
        limit: Int = 6
    ) -> [String] {
        let calendar = Calendar(identifier: .gregorian)
        guard let windowStart = calendar.date(byAdding: .day, value: -windowDays, to: referenceDate)
        else { return [] }

        struct Aggregate {
            var count: Int = 0
            var mostRecent: Date = .distantPast
        }
        var bag: [String: Aggregate] = [:]

        for txn in transactions {
            guard txn.date >= windowStart, txn.date <= referenceDate else { continue }
            let inferred = LedgerEntryType.infer(amount: txn.amount, category: txn.category)
            guard inferred == type else { continue }
            let raw = txn.category.trimmingCharacters(in: .whitespacesAndNewlines)
            guard raw.isEmpty == false else { continue }
            // Investment-linked categories are owned by the linkage system — not user input.
            guard LedgerCategoryCatalog.investmentLinkedCategories.contains(raw) == false else { continue }

            var agg = bag[raw] ?? Aggregate()
            agg.count += 1
            if txn.date > agg.mostRecent {
                agg.mostRecent = txn.date
            }
            bag[raw] = agg
        }

        let ranked = bag.sorted { lhs, rhs in
            if lhs.value.count != rhs.value.count { return lhs.value.count > rhs.value.count }
            return lhs.value.mostRecent > rhs.value.mostRecent
        }
        return Array(ranked.prefix(limit).map(\.key))
    }
}
