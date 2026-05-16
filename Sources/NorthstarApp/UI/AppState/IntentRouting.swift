import Foundation

enum NorthstarTab: String, CaseIterable, Hashable {
    case dashboard
    case holdings
    case transactions
    case cashFlow
    case accounts
    case settings
}

enum IntentRoutingKeys {
    static let selectedTab = "northstar.intent.selectedTab"
    static let openAddTransaction = "northstar.intent.openAddTransaction"
    static let baseCurrency = "northstar.baseCurrency"

    static let dashboardTimeRange = "northstar.view.dashboard.timeRange"
    static let dashboardBenchmark = "northstar.view.dashboard.benchmark"
    static let holdingsTimeRange = "northstar.view.holdings.timeRange"
    static let holdingsBenchmark = "northstar.view.holdings.benchmark"
    static let holdingDetailTimeRange = "northstar.view.holdingDetail.timeRange"
}

enum BaseCurrencyDefaults {
    static let `default` = "TWD"
    static let supported: [String] = ["TWD", "USD", "JPY", "EUR", "HKD", "CNY", "GBP", "AUD", "SGD", "KRW"]
}
