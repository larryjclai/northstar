import Foundation

/// Classifies a set of `LedgerTransaction` rows sharing a `groupID`.
///
/// We deliberately don't add a `kind` column to the model — the shape of the rows is
/// enough to tell us what the user meant:
///   - A split: ≥2 rows, all on the same account.
///   - A transfer: exactly 2 rows, on different accounts, with opposite signs.
///   - A singleton: a single row carrying a group id (effectively a regular row).
///   - Otherwise: malformed / unknown.
enum LedgerGroupKind: Equatable {
    case singleton
    case split
    case transfer
    case unknown
}

enum LedgerGroupClassifier {
    static func classify(_ members: [LedgerTransaction]) -> LedgerGroupKind {
        guard members.isEmpty == false else { return .unknown }
        if members.count == 1 { return .singleton }

        let accounts = Set(members.compactMap { $0.account?.id })
        if members.count == 2, accounts.count == 2 {
            // Opposite signs → a real transfer, not "two random rows that share a group".
            let signs = members.map { $0.amount > 0 ? 1 : ($0.amount < 0 ? -1 : 0) }
            if signs.contains(1), signs.contains(-1) {
                return .transfer
            }
            return .unknown
        }
        if accounts.count <= 1 {
            return .split
        }
        return .unknown
    }

    /// Convenience: returns the leg whose amount is negative (the source / "from" account)
    /// for a transfer group, or `nil` if not a transfer.
    static func sourceLeg(of members: [LedgerTransaction]) -> LedgerTransaction? {
        guard classify(members) == .transfer else { return nil }
        return members.first { $0.amount < 0 }
    }

    /// Convenience: returns the destination ("to" account) leg of a transfer.
    static func destinationLeg(of members: [LedgerTransaction]) -> LedgerTransaction? {
        guard classify(members) == .transfer else { return nil }
        return members.first { $0.amount > 0 }
    }
}
