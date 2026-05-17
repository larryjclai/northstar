import AppIntents
import Foundation

enum NorthstarTabIntentOption: String, AppEnum {
    case dashboard
    case holdings
    case transactions
    case cashFlow
    case accounts

    static var typeDisplayRepresentation: TypeDisplayRepresentation {
        "頁面"
    }

    static var caseDisplayRepresentations: [NorthstarTabIntentOption: DisplayRepresentation] {
        [
            .dashboard:    DisplayRepresentation(title: "總覽"),
            .holdings:     DisplayRepresentation(title: "持倉"),
            .transactions: DisplayRepresentation(title: "交易"),
            .cashFlow:     DisplayRepresentation(title: "收支"),
            .accounts:     DisplayRepresentation(title: "帳戶")
        ]
    }

    var appTab: NorthstarTab {
        switch self {
        case .dashboard:    .dashboard
        case .holdings:     .holdings
        case .transactions: .transactions
        case .cashFlow:     .cashFlow
        case .accounts:     .accounts
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

private func requestAdd(_ kind: AddSheetKind) {
    UserDefaults.standard.set(kind.landingTab.rawValue, forKey: IntentRoutingKeys.selectedTab)
    UserDefaults.standard.set(kind.rawValue, forKey: IntentRoutingKeys.openAddKind)
}

struct AddInvestmentRecordIntent: AppIntent {
    static var title: LocalizedStringResource { "新增投資紀錄" }
    static var description: IntentDescription {
        IntentDescription("開啟 app 並進入新增買賣、股利、配股或減資紀錄的畫面。")
    }
    static var openAppWhenRun: Bool { true }

    func perform() async throws -> some IntentResult {
        requestAdd(.investment)
        return .result()
    }
}

struct AddCashTransactionIntent: AppIntent {
    static var title: LocalizedStringResource { "新增記帳" }
    static var description: IntentDescription {
        IntentDescription("開啟 app 並進入新增收入或支出的畫面。")
    }
    static var openAppWhenRun: Bool { true }

    func perform() async throws -> some IntentResult {
        requestAdd(.cashflow)
        return .result()
    }
}

struct AddTransferIntent: AppIntent {
    static var title: LocalizedStringResource { "新增轉帳" }
    static var description: IntentDescription {
        IntentDescription("開啟 app 並進入新增帳戶之間轉帳的畫面。")
    }
    static var openAppWhenRun: Bool { true }

    func perform() async throws -> some IntentResult {
        requestAdd(.transfer)
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
            shortTitle: "新增投資紀錄",
            systemImageName: "chart.line.uptrend.xyaxis"
        )
        AppShortcut(
            intent: AddCashTransactionIntent(),
            phrases: [
                "Add cash transaction in \(.applicationName)",
                "Log a new expense in \(.applicationName)"
            ],
            shortTitle: "新增記帳",
            systemImageName: "list.bullet.rectangle"
        )
        AppShortcut(
            intent: AddTransferIntent(),
            phrases: [
                "Add transfer in \(.applicationName)",
                "Move money between accounts in \(.applicationName)"
            ],
            shortTitle: "新增轉帳",
            systemImageName: "arrow.left.arrow.right.circle"
        )
    }
}
