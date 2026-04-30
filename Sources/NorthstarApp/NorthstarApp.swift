import SwiftUI
import SwiftData

@main
struct NorthstarApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
        .modelContainer(for: [Account.self, PortfolioAsset.self, InvestmentRecord.self], isAutosaveEnabled: true)
    }
}
