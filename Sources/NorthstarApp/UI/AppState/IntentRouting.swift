import Foundation

enum NorthstarTab: String, CaseIterable, Hashable {
    case dashboard
    case holdings
    case transactions
}

enum IntentRoutingKeys {
    static let selectedTab = "northstar.intent.selectedTab"
    static let openAddTransaction = "northstar.intent.openAddTransaction"
}
