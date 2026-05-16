import Foundation
import SwiftData

enum LedgerLinkage {
    /// Bump this when the linkage rules change so a one-time re-sync runs on next launch.
    static let currentBackfillVersion = 1
    private static let backfillVersionKey = "northstar.ledgerLinkageBackfillVersion"

    enum CashImpact {
        case none
        case currencyMismatch
        case amount(Double)
    }

    static func cashImpact(for record: InvestmentRecord) -> CashImpact {
        guard let account = record.linkedAccount else { return .none }
        guard let asset = record.asset else { return .none }
        return cashImpact(
            action: record.action,
            price: record.price,
            quantity: record.quantity,
            fee: record.fee,
            assetCurrency: asset.currency,
            accountCurrency: account.currency
        )
    }

    static func cashImpact(
        action: InvestmentAction,
        price: Double,
        quantity: Double,
        fee: Double,
        assetCurrency: String?,
        accountCurrency: String?
    ) -> CashImpact {
        guard let assetCurrency, let accountCurrency else { return .none }

        switch action {
        case .stockDividend, .capitalReduction:
            return .none
        case .buy, .sell, .cashDividend:
            break
        }

        if assetCurrency.uppercased() != accountCurrency.uppercased() {
            return .currencyMismatch
        }

        let gross = price * quantity
        let signedAmount: Double
        switch action {
        case .buy: signedAmount = -(gross + fee)
        case .sell: signedAmount = gross - fee
        case .cashDividend: signedAmount = gross - fee
        case .stockDividend, .capitalReduction: signedAmount = 0
        }

        return signedAmount == 0 ? .none : .amount(signedAmount)
    }

    @MainActor
    static func syncLedger(for record: InvestmentRecord, context: ModelContext) {
        removeExistingLedger(for: record, context: context)

        guard case .amount(let amount) = cashImpact(for: record),
              let account = record.linkedAccount else {
            record.linkedAccount?.recomputeBalance()
            return
        }

        let ledger = LedgerTransaction(
            date: record.date,
            amount: amount,
            currency: account.currency,
            category: category(for: record.action),
            note: noteFor(record: record),
            account: account,
            linkedInvestmentRecordID: record.id
        )
        context.insert(ledger)
        record.linkedLedgerTransactionID = ledger.id
        account.recomputeBalance()
    }

    @MainActor
    static func removeLedger(for record: InvestmentRecord, context: ModelContext) {
        let account = record.linkedAccount
        removeExistingLedger(for: record, context: context)
        account?.recomputeBalance()
    }

    @MainActor
    static func backfillIfNeeded(context: ModelContext) {
        let storedVersion = UserDefaults.standard.integer(forKey: backfillVersionKey)
        if storedVersion >= currentBackfillVersion {
            return
        }

        let descriptor = FetchDescriptor<InvestmentRecord>()
        guard let records = try? context.fetch(descriptor) else { return }
        let pending = records.filter { $0.linkedLedgerTransactionID == nil && $0.linkedAccount != nil }
        for record in pending {
            syncLedger(for: record, context: context)
        }
        if pending.isEmpty == false {
            try? context.save()
        }
        UserDefaults.standard.set(currentBackfillVersion, forKey: backfillVersionKey)
    }

    @MainActor
    private static func removeExistingLedger(for record: InvestmentRecord, context: ModelContext) {
        let recordID = record.id
        var descriptor = FetchDescriptor<LedgerTransaction>(
            predicate: #Predicate { $0.linkedInvestmentRecordID == recordID }
        )
        descriptor.fetchLimit = 16
        if let matches = try? context.fetch(descriptor) {
            for match in matches {
                context.delete(match)
            }
        }
        record.linkedLedgerTransactionID = nil
    }

    private static func category(for action: InvestmentAction) -> String {
        switch action {
        case .buy: return "投資扣款"
        case .sell: return "投資入帳"
        case .cashDividend: return "股利"
        case .stockDividend: return "配股"
        case .capitalReduction: return "減資"
        }
    }

    private static func noteFor(record: InvestmentRecord) -> String {
        let ticker = record.asset?.ticker ?? "—"
        let actionTitle: String
        switch record.action {
        case .buy: actionTitle = "買入"
        case .sell: actionTitle = "賣出"
        case .cashDividend: actionTitle = "現金股利"
        case .stockDividend: actionTitle = "股票股利"
        case .capitalReduction: actionTitle = "減資"
        }
        return "\(ticker) \(actionTitle)"
    }
}
