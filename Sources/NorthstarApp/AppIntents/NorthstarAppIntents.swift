import AppIntents
import Foundation

enum NorthstarTabIntentOption: String, AppEnum {
    case dashboard
    case holdings
    case transactions

    static var typeDisplayRepresentation: TypeDisplayRepresentation {
        "頁面"
    }

    static var caseDisplayRepresentations: [NorthstarTabIntentOption: DisplayRepresentation] {
        [
            .dashboard: DisplayRepresentation(title: "總覽"),
            .holdings: DisplayRepresentation(title: "持倉"),
            .transactions: DisplayRepresentation(title: "交易")
        ]
    }

    var appTab: NorthstarTab {
        switch self {
        case .dashboard: .dashboard
        case .holdings: .holdings
        case .transactions: .transactions
        }
    }
}

struct OpenNorthstarTabIntent: AppIntent {
    static var title: LocalizedStringResource { "開啟 Northstar 頁面" }
    static var description: IntentDescription { IntentDescription("開啟指定頁面到 northstar。") }
    static var openAppWhenRun: Bool { true }

    @Parameter(title: "頁面", default: .dashboard)
    var tab: NorthstarTabIntentOption

    func perform() async throws -> some IntentResult {
        UserDefaults.standard.set(tab.appTab.rawValue, forKey: IntentRoutingKeys.selectedTab)
        return .result()
    }
}

struct AddInvestmentRecordIntent: AppIntent {
    static var title: LocalizedStringResource { "新增交易" }
    static var description: IntentDescription { IntentDescription("開啟 app 並進入新增交易。") }
    static var openAppWhenRun: Bool { true }

    func perform() async throws -> some IntentResult {
        UserDefaults.standard.set(NorthstarTab.transactions.rawValue, forKey: IntentRoutingKeys.selectedTab)
        UserDefaults.standard.set(true, forKey: IntentRoutingKeys.openAddTransaction)
        return .result()
    }
}

struct NorthstarShortcutsProvider: AppShortcutsProvider {
    @AppShortcutsBuilder
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: OpenNorthstarTabIntent(),
            phrases: [
                "Open \(.applicationName) page",
                "Show my investments in \(.applicationName)"
            ],
            shortTitle: "開啟頁面",
            systemImageName: "rectangle.stack"
        )
        AppShortcut(
            intent: AddInvestmentRecordIntent(),
            phrases: [
                "Add investment record in \(.applicationName)",
                "Create a new trade in \(.applicationName)"
            ],
            shortTitle: "新增交易",
            systemImageName: "plus.rectangle.on.rectangle"
        )
    }
}
