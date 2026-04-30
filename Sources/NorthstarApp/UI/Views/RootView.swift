import SwiftUI
import SwiftData

struct RootView: View {
    @Environment(\.modelContext) private var modelContext
    @State private var priceStore = PriceStore()
    @AppStorage(IntentRoutingKeys.selectedTab) private var requestedTabRaw = NorthstarTab.dashboard.rawValue
    @AppStorage(IntentRoutingKeys.openAddTransaction) private var requestedAddTransaction = false
    @State private var selectedTab: NorthstarTab = .dashboard
    @State private var showAddTransactionSheet = false

    var body: some View {
        TabView(selection: $selectedTab) {
            DashboardView(priceStore: priceStore)
                .tabItem {
                    Label("總覽", systemImage: "chart.xyaxis.line")
                }
                .tag(NorthstarTab.dashboard)

            HoldingsView(priceStore: priceStore)
                .tabItem {
                    Label("持倉", systemImage: "briefcase.fill")
                }
                .tag(NorthstarTab.holdings)

            TransactionsView(showAddSheet: $showAddTransactionSheet)
                .tabItem {
                    Label("交易", systemImage: "list.bullet.rectangle")
                }
                .tag(NorthstarTab.transactions)
        }
        .task {
            try? SampleDataBootstrap.seedIfNeeded(context: modelContext)
        }
        .onAppear {
            applyRequestedTab()
            if requestedAddTransaction {
                selectedTab = .transactions
                showAddTransactionSheet = true
                requestedAddTransaction = false
            }
        }
        .onChange(of: requestedTabRaw) { _, _ in
            applyRequestedTab()
        }
        .onChange(of: requestedAddTransaction) { _, newValue in
            guard newValue else { return }
            selectedTab = .transactions
            showAddTransactionSheet = true
            requestedAddTransaction = false
        }
    }

    private func applyRequestedTab() {
        guard let tab = NorthstarTab(rawValue: requestedTabRaw) else { return }
        selectedTab = tab
    }
}
