import Foundation
import SwiftData
#if canImport(CoreSpotlight)
@preconcurrency import CoreSpotlight
import UniformTypeIdentifiers
#endif
#if canImport(UserNotifications)
import UserNotifications
#endif
#if canImport(WidgetKit)
import WidgetKit
#endif

@MainActor
enum NativeSurfaceSync {
    static func refresh(
        accounts: [Account],
        assets: [PortfolioAsset],
        records: [InvestmentRecord],
        ledgerTransactions: [LedgerTransaction],
        recurringTemplates: [RecurringTransaction],
        holdings: [HoldingSnapshot],
        baseCurrency: String,
        displayName: (String) -> String,
        currency: (String) -> String,
        convert: (Double, String, String) -> Double?
    ) {
        writeWidgetSnapshot(
            accounts: accounts,
            ledgerTransactions: ledgerTransactions,
            holdings: holdings,
            baseCurrency: baseCurrency,
            displayName: displayName,
            currency: currency,
            convert: convert
        )
        indexSpotlightItems(records: records, ledgerTransactions: ledgerTransactions)
        scheduleLocalNotifications(recurringTemplates: recurringTemplates)
    }

    private static func writeWidgetSnapshot(
        accounts: [Account],
        ledgerTransactions: [LedgerTransaction],
        holdings: [HoldingSnapshot],
        baseCurrency: String,
        displayName: (String) -> String,
        currency: (String) -> String,
        convert: (Double, String, String) -> Double?
    ) {
        let cash = accounts.reduce(0.0) { running, account in
            running + (convert(account.balance, account.currency, baseCurrency) ?? 0)
        }
        let holdingsValue = holdings.reduce(0.0) { running, holding in
            running + (convert(holding.marketValue, currency(holding.ticker), baseCurrency) ?? 0)
        }
        let spending = SpendingSummaryBuilder.build(
            transactions: ledgerTransactions,
            baseCurrency: baseCurrency,
            referenceDate: Date(),
            convert: convert
        )
        let featured = holdings
            .max { lhs, rhs in
                let left = convert(lhs.marketValue, currency(lhs.ticker), baseCurrency) ?? 0
                let right = convert(rhs.marketValue, currency(rhs.ticker), baseCurrency) ?? 0
                return left < right
            }
            .map { holding in
                NativeSurfaceSnapshot.Holding(
                    ticker: holding.ticker,
                    name: displayName(holding.ticker),
                    marketValue: holding.marketValue,
                    currency: currency(holding.ticker),
                    returnRate: holding.unrealizedReturn
                )
            }

        NativeSurfaceSnapshot(
            updatedAt: Date(),
            netWorth: NativeSurfaceSnapshot.NetWorth(amount: cash + holdingsValue, currency: baseCurrency),
            monthlyCashFlow: NativeSurfaceSnapshot.MonthlyCashFlow(
                income: spending.totalIncome,
                expense: spending.totalExpense,
                net: spending.net,
                currency: baseCurrency
            ),
            featuredHolding: featured
        )
        .save()

        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadAllTimelines()
        #endif
    }

    private static func scheduleLocalNotifications(recurringTemplates: [RecurringTransaction]) {
        #if canImport(UserNotifications)
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
        let recurringIDs = recurringTemplates.map { "northstar.recurring-\($0.id.uuidString)" }
        center.removePendingNotificationRequests(withIdentifiers: ["northstar.monthly-summary"] + recurringIDs)
        center.add(monthlySummaryRequest())

        for template in recurringTemplates where template.isActive {
            if let request = recurringRequest(for: template) {
                center.add(request)
            }
        }
        #endif
    }

    #if canImport(UserNotifications)
    private static func monthlySummaryRequest(calendar: Calendar = Calendar(identifier: .gregorian)) -> UNNotificationRequest {
        let startOfMonth = calendar.date(from: calendar.dateComponents([.year, .month], from: Date())) ?? Date()
        let nextMonth = calendar.date(byAdding: .month, value: 1, to: startOfMonth) ?? Date()
        var components = calendar.dateComponents([.year, .month, .day], from: nextMonth)
        components.hour = 9
        components.minute = 0

        let content = UNMutableNotificationContent()
        content.title = "Northstar 月初回顧"
        content.body = "上個月的收支已經可以回顧了，打開 Dashboard 看看現金流方向。"
        content.sound = .default

        return UNNotificationRequest(
            identifier: "northstar.monthly-summary",
            content: content,
            trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
        )
    }

    private static func recurringRequest(
        for template: RecurringTransaction,
        calendar: Calendar = Calendar(identifier: .gregorian)
    ) -> UNNotificationRequest? {
        guard template.nextRunDate >= calendar.startOfDay(for: Date()) else { return nil }

        var components = calendar.dateComponents([.year, .month, .day], from: template.nextRunDate)
        components.hour = 9
        components.minute = 0

        let amount = CurrencyFormatters.signedMoney(template.amount, currencyCode: template.currency)
        let category = template.category.isEmpty ? "定期交易" : template.category
        let account = template.account?.name ?? "帳戶"

        let content = UNMutableNotificationContent()
        content.title = "今天有一筆\(category)"
        content.body = "\(account) · \(amount)。打開 Northstar 確認或調整這筆定期交易。"
        content.sound = .default

        return UNNotificationRequest(
            identifier: "northstar.recurring-\(template.id.uuidString)",
            content: content,
            trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
        )
    }
    #endif

    private static func indexSpotlightItems(records: [InvestmentRecord], ledgerTransactions: [LedgerTransaction]) {
        #if canImport(CoreSpotlight)
        let investmentItems = records.prefix(200).map { record in
            let ticker = record.asset?.ticker ?? "Investment"
            let title = "\(ticker) \(record.action.displayTitle)"
            let subtitle = "\(record.date.formatted(date: .abbreviated, time: .omitted)) · \(CurrencyFormatters.price(record.price * record.quantity, currencyCode: record.asset?.currency ?? "TWD"))"
            return spotlightItem(
                uniqueIdentifier: "investment-\(record.id.uuidString)",
                domain: "northstar.investment-records",
                title: title,
                subtitle: subtitle,
                keywords: [ticker, record.asset?.name, record.action.displayTitle, record.note]
            )
        }

        let ledgerItems = ledgerTransactions.prefix(300).map { transaction in
            let category = transaction.category.isEmpty ? "未分類" : transaction.category
            let account = transaction.account?.name ?? "帳戶"
            let subtitle = "\(account) · \(transaction.date.formatted(date: .abbreviated, time: .omitted)) · \(CurrencyFormatters.signedMoney(transaction.amount, currencyCode: transaction.currency))"
            return spotlightItem(
                uniqueIdentifier: "ledger-\(transaction.id.uuidString)",
                domain: "northstar.ledger-transactions",
                title: category,
                subtitle: subtitle,
                keywords: [category, account, transaction.note]
            )
        }

        CSSearchableIndex.default().deleteSearchableItems(
            withDomainIdentifiers: ["northstar.investment-records", "northstar.ledger-transactions"]
        ) { _ in
            CSSearchableIndex.default().indexSearchableItems(investmentItems + ledgerItems)
        }
        #endif
    }

    #if canImport(CoreSpotlight)
    private static func spotlightItem(
        uniqueIdentifier: String,
        domain: String,
        title: String,
        subtitle: String,
        keywords: [String?]
    ) -> CSSearchableItem {
        let attributes = CSSearchableItemAttributeSet(contentType: .text)
        attributes.title = title
        attributes.contentDescription = subtitle
        attributes.keywords = keywords.compactMap { value in
            let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed?.isEmpty == false ? trimmed : nil
        }

        return CSSearchableItem(
            uniqueIdentifier: uniqueIdentifier,
            domainIdentifier: domain,
            attributeSet: attributes
        )
    }
    #endif
}
