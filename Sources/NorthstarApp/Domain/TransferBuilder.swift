import Foundation

/// Builds the two `LedgerTransaction` legs that represent a single user-facing transfer.
///
/// One row is created on the source account (negative amount in source currency) and one
/// on the destination account (positive amount in destination currency). Both share the
/// same `groupID` and `date` so the editor and list can collapse them back into a single
/// entry. For cross-currency transfers the caller supplies an explicit destination
/// magnitude — the implicit FX rate is then `destination / source`.
enum TransferBuilder {
    struct Input {
        let date: Date
        let sourceAccount: Account
        let destinationAccount: Account
        /// Positive, in `sourceAccount.currency`.
        let sourceMagnitude: Double
        /// Positive, in `destinationAccount.currency`. Required when currencies differ.
        /// For same-currency transfers, pass `nil` (the source magnitude is used) or
        /// a value equal to `sourceMagnitude`.
        let destinationMagnitude: Double?
        let note: String
        let receipt: Data?
        let groupID: UUID
    }

    static func build(_ input: Input) -> [LedgerTransaction]? {
        guard input.sourceAccount.id != input.destinationAccount.id else { return nil }
        guard input.sourceMagnitude > 0, input.sourceMagnitude.isFinite else { return nil }

        let sameCurrency = input.sourceAccount.currency == input.destinationAccount.currency
        let destinationMagnitude: Double
        if sameCurrency {
            // Same-currency transfer always moves identical amounts. Accept nil (default
            // to source) or a value matching source — reject otherwise.
            if let provided = input.destinationMagnitude {
                guard provided == input.sourceMagnitude else { return nil }
                destinationMagnitude = provided
            } else {
                destinationMagnitude = input.sourceMagnitude
            }
        } else {
            guard let provided = input.destinationMagnitude,
                  provided > 0,
                  provided.isFinite else { return nil }
            destinationMagnitude = provided
        }

        let category = sameCurrency ? "轉帳" : "外幣兌換"
        let trimmedNote = input.note.trimmingCharacters(in: .whitespacesAndNewlines)

        let outLeg = LedgerTransaction(
            date: input.date,
            amount: -input.sourceMagnitude,
            currency: input.sourceAccount.currency,
            category: category,
            note: trimmedNote,
            account: input.sourceAccount,
            groupID: input.groupID,
            receipt: input.receipt
        )
        let inLeg = LedgerTransaction(
            date: input.date,
            amount: destinationMagnitude,
            currency: input.destinationAccount.currency,
            category: category,
            note: trimmedNote,
            account: input.destinationAccount,
            groupID: input.groupID,
            receipt: nil
        )
        return [outLeg, inLeg]
    }

    /// Implicit FX rate of a cross-currency transfer: how many units of the destination
    /// currency one unit of the source currency bought in this transfer. Returns `nil`
    /// when the source magnitude is zero or the currencies match.
    static func implicitRate(
        sourceCurrency: String,
        sourceMagnitude: Double,
        destinationCurrency: String,
        destinationMagnitude: Double
    ) -> Double? {
        guard sourceCurrency != destinationCurrency else { return nil }
        guard sourceMagnitude > 0 else { return nil }
        return destinationMagnitude / sourceMagnitude
    }
}
