import Foundation

/// Builds an array of `LedgerTransaction` rows from a list of split lines that all share
/// the same date, account, entryType, currency, and group identity.
///
/// Pure: takes plain input, returns plain `LedgerTransaction` instances. The caller is
/// responsible for inserting them into a `ModelContext` and recomputing account balance.
enum SplitTransactionBuilder {
    struct Line: Equatable {
        let category: String
        /// Positive magnitude. The builder applies the sign based on `entryType`.
        let magnitude: Double
        let note: String

        init(category: String, magnitude: Double, note: String = "") {
            self.category = category
            self.magnitude = magnitude
            self.note = note
        }
    }

    /// Returns the built rows, or `nil` if validation fails.
    /// - The first row carries the optional `receipt` and the shared `note`.
    /// - Every row carries the supplied `groupID`.
    /// - Each row's amount has the sign applied via `entryType.signedAmount(magnitude:)`.
    static func build(
        date: Date,
        account: Account,
        entryType: LedgerEntryType,
        sharedNote: String,
        receipt: Data?,
        groupID: UUID,
        lines: [Line]
    ) -> [LedgerTransaction]? {
        guard lines.isEmpty == false else { return nil }
        for line in lines {
            let trimmedCategory = line.category.trimmingCharacters(in: .whitespacesAndNewlines)
            guard trimmedCategory.isEmpty == false else { return nil }
            guard line.magnitude > 0, line.magnitude.isFinite else { return nil }
        }

        let trimmedShared = sharedNote.trimmingCharacters(in: .whitespacesAndNewlines)
        return lines.enumerated().map { index, line in
            let trimmedLineNote = line.note.trimmingCharacters(in: .whitespacesAndNewlines)
            let combinedNote: String
            if trimmedLineNote.isEmpty {
                combinedNote = trimmedShared
            } else if trimmedShared.isEmpty {
                combinedNote = trimmedLineNote
            } else {
                combinedNote = trimmedShared + " · " + trimmedLineNote
            }
            return LedgerTransaction(
                date: date,
                amount: entryType.signedAmount(magnitude: line.magnitude),
                currency: account.currency,
                category: line.category.trimmingCharacters(in: .whitespacesAndNewlines),
                note: combinedNote,
                account: account,
                linkedInvestmentRecordID: nil,
                groupID: groupID,
                receipt: index == 0 ? receipt : nil
            )
        }
    }
}
