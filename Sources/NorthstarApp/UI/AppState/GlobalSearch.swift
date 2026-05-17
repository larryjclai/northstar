import Foundation

/// Cross-tab search over accounts, holdings, investment records, and ledger transactions.
/// Returns ranked `Result` items with the tab a tap should jump to. Pure helper —
/// view layers (macOS sidebar, iOS Dashboard search bar) call this with their @Query data
/// so both surfaces stay in sync.
enum GlobalSearch {
    enum Kind {
        case account
        case holding
        case investment
        case ledger
    }

    struct Result: Identifiable {
        let id: String
        let kind: Kind
        let title: String
        let subtitle: String
        let icon: String
        let targetTab: NorthstarTab
    }

    /// Returns up to `limitPerKind` matches per category, in stable order
    /// (accounts → holdings → investments → ledger) to keep the UI predictable.
    static func search(
        query rawQuery: String,
        accounts: [Account],
        assets: [PortfolioAsset],
        records: [InvestmentRecord],
        ledger: [LedgerTransaction],
        holdings: [HoldingSnapshot],
        limitPerKind: Int = 5
    ) -> [Result] {
        let query = rawQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard query.isEmpty == false else { return [] }

        var results: [Result] = []

        let matchedAccounts = accounts
            .filter { $0.name.localizedCaseInsensitiveContains(query) }
            .prefix(limitPerKind)
        for account in matchedAccounts {
            results.append(.init(
                id: "account-\(account.id.uuidString)",
                kind: .account,
                title: account.name,
                subtitle: CurrencyFormatters.money(account.balance, currencyCode: account.currency),
                icon: "creditcard.fill",
                targetTab: .accounts
            ))
        }

        let matchedHoldings = holdings.filter { holding in
            holding.ticker.localizedCaseInsensitiveContains(query)
                || (assets.first(where: { $0.ticker == holding.ticker })?.name
                    .localizedCaseInsensitiveContains(query) ?? false)
        }
        .prefix(limitPerKind)
        for holding in matchedHoldings {
            let name = assets.first(where: { $0.ticker == holding.ticker })?.name ?? holding.ticker
            results.append(.init(
                id: "holding-\(holding.ticker)",
                kind: .holding,
                title: holding.ticker,
                subtitle: "\(name) · \(CurrencyFormatters.money(holding.marketValue))",
                icon: "chart.bar.fill",
                targetTab: .holdings
            ))
        }

        let matchedRecords = records.filter { record in
            (record.asset?.ticker.localizedCaseInsensitiveContains(query) ?? false)
                || (record.asset?.name.localizedCaseInsensitiveContains(query) ?? false)
                || record.action.displayTitle.localizedCaseInsensitiveContains(query)
                || record.note.localizedCaseInsensitiveContains(query)
        }
        .prefix(limitPerKind)
        for record in matchedRecords {
            results.append(.init(
                id: "investment-\(record.id.uuidString)",
                kind: .investment,
                title: record.asset?.ticker ?? record.action.displayTitle,
                subtitle: "\(record.action.displayTitle) · \(record.date.formatted(date: .abbreviated, time: .omitted))",
                icon: record.action.symbolName,
                targetTab: .transactions
            ))
        }

        let matchedLedger = ledger.filter { txn in
            txn.category.localizedCaseInsensitiveContains(query)
                || txn.note.localizedCaseInsensitiveContains(query)
                || (txn.account?.name.localizedCaseInsensitiveContains(query) ?? false)
        }
        .prefix(limitPerKind)
        for txn in matchedLedger {
            let category = txn.category.isEmpty ? "未分類" : txn.category
            let accountName = txn.account?.name ?? "—"
            let amount = CurrencyFormatters.signedMoney(txn.amount, currencyCode: txn.currency)
            results.append(.init(
                id: "ledger-\(txn.id.uuidString)",
                kind: .ledger,
                title: category,
                subtitle: "\(accountName) · \(amount) · \(txn.date.formatted(date: .abbreviated, time: .omitted))",
                icon: "arrow.left.arrow.right.circle.fill",
                targetTab: .cashFlow
            ))
        }

        return results
    }
}
