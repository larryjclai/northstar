import Foundation

enum NorthstarTab: String, CaseIterable, Hashable {
    case dashboard
    case holdings
    case transactions
    case cashFlow
    case accounts
    case settings
}

enum AddSheetKind: String, CaseIterable, Identifiable, Hashable {
    case investment
    case cashflow
    case transfer

    var id: String { rawValue }

    var titleKey: String {
        switch self {
        case .investment: return "投資紀錄"
        case .cashflow:   return "記帳"
        case .transfer:   return "轉帳"
        }
    }

    var subtitleKey: String {
        switch self {
        case .investment: return "買賣、股利、配股、減資"
        case .cashflow:   return "收入、支出"
        case .transfer:   return "帳戶之間移動資金"
        }
    }

    var systemImageName: String {
        switch self {
        case .investment: return "chart.line.uptrend.xyaxis"
        case .cashflow:   return "list.bullet.rectangle"
        case .transfer:   return "arrow.left.arrow.right.circle"
        }
    }

    var landingTab: NorthstarTab {
        switch self {
        case .investment: return .transactions
        case .cashflow:   return .cashFlow
        case .transfer:   return .cashFlow
        }
    }

    static func primary(for tab: NorthstarTab) -> AddSheetKind {
        switch tab {
        case .holdings, .transactions: return .investment
        case .cashFlow, .accounts:     return .cashflow
        case .dashboard, .settings:    return .cashflow
        }
    }
}

enum IntentRoutingKeys {
    static let selectedTab = "northstar.intent.selectedTab"
    /// String-valued; stores an `AddSheetKind.rawValue` when an Intent requests an add sheet.
    /// Empty string means "no pending request". Cleared by RootView after consumption.
    static let openAddKind = "northstar.intent.openAddKind"
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
