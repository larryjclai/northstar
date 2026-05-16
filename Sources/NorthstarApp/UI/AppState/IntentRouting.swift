import Foundation

enum NorthstarTab: String, CaseIterable, Hashable {
    case dashboard
    case holdings
    case transactions
    case settings
}

enum IntentRoutingKeys {
    static let selectedTab = "northstar.intent.selectedTab"
    static let openAddTransaction = "northstar.intent.openAddTransaction"
    static let baseCurrency = "northstar.baseCurrency"
}

enum BaseCurrencyDefaults {
    static let `default` = "TWD"
    static let supported: [String] = ["TWD", "USD", "JPY", "EUR", "HKD", "CNY", "GBP", "AUD", "SGD", "KRW"]
}
