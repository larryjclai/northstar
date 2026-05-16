import SwiftUI
import SwiftData

struct RootView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \Account.name) private var accounts: [Account]
    @Query(sort: \PortfolioAsset.ticker) private var assets: [PortfolioAsset]
    @Query(sort: \InvestmentRecord.date, order: .reverse) private var records: [InvestmentRecord]
    @State private var priceStore = PriceStore()
    @State private var fxStore = FXRateStore()
    @AppStorage(IntentRoutingKeys.selectedTab) private var requestedTabRaw = NorthstarTab.dashboard.rawValue
    @AppStorage(IntentRoutingKeys.openAddTransaction) private var requestedAddTransaction = false
    @AppStorage(IntentRoutingKeys.baseCurrency) private var baseCurrency: String = BaseCurrencyDefaults.default
    @State private var selectedTab: NorthstarTab = .dashboard
    @State private var showAddTransactionSheet = false
    @State private var sidebarSearchText = ""

    var body: some View {
        #if os(macOS)
        desktopShell
        #else
        TabView(selection: $selectedTab) {
            DashboardView(priceStore: priceStore, fxStore: fxStore)
                .tabItem {
                    Label("總覽", systemImage: "chart.xyaxis.line")
                }
                .tag(NorthstarTab.dashboard)

            HoldingsView(priceStore: priceStore, fxStore: fxStore)
                .tabItem {
                    Label("持倉", systemImage: "briefcase.fill")
                }
                .tag(NorthstarTab.holdings)

            TransactionsView(showAddSheet: $showAddTransactionSheet)
                .tabItem {
                    Label("交易", systemImage: "list.bullet.rectangle")
                }
                .tag(NorthstarTab.transactions)

            AccountsView(fxStore: fxStore)
                .tabItem {
                    Label("帳戶", systemImage: "creditcard.fill")
                }
                .tag(NorthstarTab.accounts)

            SettingsView(fxStore: fxStore, priceStore: priceStore)
                .tabItem {
                    Label("設定", systemImage: "gearshape")
                }
                .tag(NorthstarTab.settings)
        }
        .tint(NorthstarTheme.accent)
        .onAppear(perform: handleLaunchRouting)
        .onChange(of: requestedTabRaw) { _, _ in
            applyRequestedTab()
        }
        .onChange(of: requestedAddTransaction) { _, newValue in
            guard newValue else { return }
            openAddTransaction()
        }
        #endif
    }

    #if os(macOS)
    private var desktopShell: some View {
        NavigationSplitView {
            NorthstarSidebar(
                selectedTab: $selectedTab,
                searchText: $sidebarSearchText,
                accounts: accounts,
                assets: assets,
                records: records,
                priceStore: priceStore
            )
            .navigationSplitViewColumnWidth(min: 260, ideal: 300, max: 340)
            .background(Color.nsBackground)
        } detail: {
            selectedContent
                .background(Color.nsBackground)
        }
        .tint(NorthstarTheme.accent)
        .overlay {
            shortcutCommands
                .frame(width: 0, height: 0)
                .opacity(0)
        }
        .onAppear(perform: handleLaunchRouting)
        .onChange(of: requestedTabRaw) { _, _ in
            applyRequestedTab()
        }
        .onChange(of: requestedAddTransaction) { _, newValue in
            guard newValue else { return }
            openAddTransaction()
        }
    }

    @ViewBuilder
    private var selectedContent: some View {
        switch selectedTab {
        case .dashboard:
            DashboardView(priceStore: priceStore, fxStore: fxStore)
        case .holdings:
            HoldingsView(priceStore: priceStore, fxStore: fxStore)
        case .transactions:
            TransactionsView(showAddSheet: $showAddTransactionSheet)
        case .accounts:
            AccountsView(fxStore: fxStore)
        case .settings:
            SettingsView(fxStore: fxStore, priceStore: priceStore)
        }
    }
    #endif

    private var shortcutCommands: some View {
        Group {
            Button("Dashboard") { selectedTab = .dashboard }
                .keyboardShortcut("1", modifiers: .command)
            Button("Transactions") { selectedTab = .transactions }
                .keyboardShortcut("2", modifiers: .command)
            Button("Accounts") { selectedTab = .accounts }
                .keyboardShortcut("3", modifiers: .command)
            Button("Investments") { selectedTab = .holdings }
                .keyboardShortcut("4", modifiers: .command)
            Button("Settings") { selectedTab = .settings }
                .keyboardShortcut(",", modifiers: .command)
            Button("Refresh") {
                Task {
                    await priceStore.refresh(tickers: assets.map(\.ticker), force: true)
                    await fxStore.refresh(
                        currencies: portfolioCurrencies,
                        base: baseCurrency,
                        force: true
                    )
                }
            }
            .keyboardShortcut("r", modifiers: .command)
        }
    }

    private var portfolioCurrencies: [String] {
        var seen = Set<String>()
        var ordered: [String] = []
        for currency in assets.map(\.currency) + accounts.map(\.currency) {
            let upper = currency.uppercased()
            guard upper.isEmpty == false, seen.insert(upper).inserted else { continue }
            ordered.append(upper)
        }
        return ordered
    }

    private func handleLaunchRouting() {
        applyRequestedTab()
        if requestedAddTransaction {
            openAddTransaction()
        }
        LedgerLinkage.backfillIfNeeded(context: modelContext)
    }

    private func applyRequestedTab() {
        guard let tab = NorthstarTab(rawValue: requestedTabRaw) else { return }
        selectedTab = tab
    }

    private func openAddTransaction() {
        selectedTab = .transactions
        showAddTransactionSheet = true
        requestedAddTransaction = false
    }
}

#if os(macOS)
private struct NorthstarSidebar: View {
    @Binding var selectedTab: NorthstarTab
    @Binding var searchText: String
    @FocusState private var searchFocused: Bool
    let accounts: [Account]
    let assets: [PortfolioAsset]
    let records: [InvestmentRecord]
    let priceStore: PriceStore

    private var holdings: [HoldingSnapshot] {
        PortfolioCalculator.holdings(assets: assets, prices: priceStore.prices)
    }

    private var pendingReviewCount: Int {
        records.filter { $0.isReviewed == false }.count
    }

    private var searchQuery: String {
        searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var isSearching: Bool {
        searchQuery.isEmpty == false
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            trafficLights
            searchBox
            if isSearching {
                searchResults
            } else {
                navigationItems
                accountsList
            }
            Spacer()
            privacyNote
        }
        .padding(18)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color.nsBackground)
        .overlay {
            Button("Focus Search") {
                searchFocused = true
            }
            .keyboardShortcut("f", modifiers: .command)
            .frame(width: 0, height: 0)
            .opacity(0)
        }
    }

    private var trafficLights: some View {
        HStack(spacing: 8) {
            Circle().fill(Color.red).frame(width: 12, height: 12)
            Circle().fill(Color.yellow).frame(width: 12, height: 12)
            Circle().fill(Color.green).frame(width: 12, height: 12)
            Spacer()
            Image(systemName: "arrow.clockwise")
            Image(systemName: "chevron.left")
            Image(systemName: "chevron.right")
        }
        .font(.caption.weight(.bold))
        .foregroundStyle(NorthstarTheme.mutedText)
    }

    private var searchBox: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
            TextField("Search", text: $searchText)
                .textFieldStyle(.plain)
                .focused($searchFocused)
        }
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(NorthstarTheme.mutedText)
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .overlay {
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .stroke(NorthstarTheme.accent.opacity(0.45), lineWidth: 1)
        }
    }

    private var navigationItems: some View {
        VStack(spacing: 8) {
            sidebarButton(.dashboard, title: "Dashboard", icon: "paperplane.fill")
            sidebarButton(.transactions, title: "Transactions", icon: "square.stack.3d.up.fill", badge: pendingReviewCount == 0 ? nil : "\(pendingReviewCount)")
            sidebarButton(.accounts, title: "Accounts", icon: "creditcard.fill")
            sidebarButton(.holdings, title: "Investments", icon: "chart.bar.fill")
            sidebarButton(.settings, title: "Settings", icon: "gearshape.fill")
        }
    }

    private var accountsList: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("MY ACCOUNTS")
                .font(.caption.weight(.bold))
                .foregroundStyle(NorthstarTheme.mutedText)

            SidebarAccountGroup(
                title: "Depository",
                rows: accounts.map { ($0.name, CurrencyFormatters.money($0.balance, currencyCode: $0.currency), NorthstarTheme.risk) }
            )

            SidebarAccountGroup(
                title: "Investment",
                rows: holdings.prefix(4).map {
                    ($0.ticker, CurrencyFormatters.money($0.marketValue), $0.unrealizedPnL >= 0 ? NorthstarTheme.growth : NorthstarTheme.risk)
                }
            )
        }
    }

    private var searchResults: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("SEARCH RESULTS")
                .font(.caption.weight(.bold))
                .foregroundStyle(NorthstarTheme.mutedText)

            let matchingAccounts = accounts.filter { $0.name.localizedCaseInsensitiveContains(searchQuery) }
            let matchingHoldings = holdings.filter { holding in
                holding.ticker.localizedCaseInsensitiveContains(searchQuery)
                    || (assets.first(where: { $0.ticker == holding.ticker })?.name.localizedCaseInsensitiveContains(searchQuery) ?? false)
            }
            let matchingRecords = records.filter { record in
                (record.asset?.ticker.localizedCaseInsensitiveContains(searchQuery) ?? false)
                    || (record.asset?.name.localizedCaseInsensitiveContains(searchQuery) ?? false)
                    || record.action.displayTitle.localizedCaseInsensitiveContains(searchQuery)
                    || record.note.localizedCaseInsensitiveContains(searchQuery)
            }

            if matchingAccounts.isEmpty && matchingHoldings.isEmpty && matchingRecords.isEmpty {
                Text("沒有符合的帳戶、持倉或交易。")
                    .font(.subheadline)
                    .foregroundStyle(NorthstarTheme.secondaryText)
                    .padding(.horizontal, 12)
            } else {
                ForEach(matchingAccounts.prefix(4)) { account in
                    searchResultButton(
                        title: account.name,
                        subtitle: CurrencyFormatters.money(account.balance, currencyCode: account.currency),
                        icon: "creditcard.fill",
                        tab: .dashboard
                    )
                }

                ForEach(matchingHoldings.prefix(5)) { holding in
                    searchResultButton(
                        title: holding.ticker,
                        subtitle: CurrencyFormatters.money(holding.marketValue),
                        icon: "chart.bar.fill",
                        tab: .holdings
                    )
                }

                ForEach(matchingRecords.prefix(5)) { record in
                    searchResultButton(
                        title: record.asset?.ticker ?? record.action.displayTitle,
                        subtitle: "\(record.action.displayTitle) · \(record.date.formatted(date: .abbreviated, time: .omitted))",
                        icon: record.action.symbolName,
                        tab: .transactions
                    )
                }
            }
        }
    }

    private var privacyNote: some View {
        HStack(spacing: 10) {
            Image(systemName: "lock.fill")
            VStack(alignment: .leading, spacing: 2) {
                Text("Local-first")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(NorthstarTheme.primaryText)
                Text("資料儲存在這台裝置")
                    .font(.caption2)
                    .foregroundStyle(NorthstarTheme.mutedText)
            }
        }
        .padding(.horizontal, 12)
        .foregroundStyle(NorthstarTheme.mutedText)
    }

    private func sidebarButton(_ tab: NorthstarTab, title: String, icon: String, badge: String? = nil) -> some View {
        Button {
            selectedTab = tab
        } label: {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .frame(width: 18)
                Text(title)
                Spacer()
                if let badge {
                    Text(badge)
                        .foregroundStyle(selectedTab == tab ? Color.nsBackground : NorthstarTheme.accent)
                }
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(selectedTab == tab ? Color.nsBackground : NorthstarTheme.primaryText)
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background {
                if selectedTab == tab {
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(Color(red: 0.38, green: 0.62, blue: 1.00))
                }
            }
        }
        .buttonStyle(.plain)
    }

    private func searchResultButton(title: String, subtitle: String, icon: String, tab: NorthstarTab) -> some View {
        Button {
            selectedTab = tab
        } label: {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .foregroundStyle(NorthstarTheme.accent)
                    .frame(width: 18)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.primaryText)
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(NorthstarTheme.mutedText)
                }
                Spacer()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
        }
        .buttonStyle(.plain)
    }
}

private struct SidebarAccountGroup: View {
    let title: String
    let rows: [(String, String, Color)]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("\(title) ▾")
                .font(.caption.weight(.bold))
                .foregroundStyle(NorthstarTheme.mutedText)

            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack(spacing: 9) {
                    Circle()
                        .fill(row.2)
                        .frame(width: 7, height: 7)
                    Text(row.0)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.primaryText)
                        .lineLimit(1)
                    Spacer()
                    Text(row.1)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.mutedText)
                        .monospacedDigit()
                }
            }
        }
        .padding(.horizontal, 12)
    }
}
#endif
