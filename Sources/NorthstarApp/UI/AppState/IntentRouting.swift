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
    static let privacyMode = "northstar.privacyMode.enabled"
    static let preferredNameLocale = "northstar.preferredNameLocale"
}

enum NameLocalePreference {
    static let auto = "auto"
    static let zhHant = "zh-Hant"
    static let en = "en"
    static let supported: [String] = [auto, zhHant, en]
}

enum BaseCurrencyDefaults {
    static let `default` = "TWD"
    static let supported: [String] = ["TWD", "USD", "JPY", "EUR", "HKD", "CNY", "GBP", "AUD", "SGD", "KRW"]
}
