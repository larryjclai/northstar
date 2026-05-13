import SwiftUI
import SwiftData
import AppIntents
#if os(macOS)
import AppKit
#endif

@main
struct NorthstarApp: App {
    init() {
        #if os(macOS)
        let application = NSApplication.shared
        application.setActivationPolicy(.regular)
        DispatchQueue.main.async {
            application.activate(ignoringOtherApps: true)
        }
        #endif

        if Bundle.main.bundleURL.pathExtension == "app" {
            NorthstarShortcutsProvider.updateAppShortcutParameters()
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView()
        }
        .modelContainer(for: [Account.self, PortfolioAsset.self, InvestmentRecord.self], isAutosaveEnabled: true)
    }
}
