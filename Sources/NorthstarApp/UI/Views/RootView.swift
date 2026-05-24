import SwiftUI
import SwiftData

struct RootView: View {
    @Environment(\.modelContext) private var modelContext
    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    #endif
    @Query(sort: \Account.name) private var accounts: [Account]
    @Query(sort: \PortfolioAsset.ticker) private var assets: [PortfolioAsset]
    @Query(sort: \InvestmentRecord.date, order: .reverse) private var records: [InvestmentRecord]
    @Query(sort: \LedgerTransaction.date, order: .reverse) private var ledgerTransactions: [LedgerTransaction]
    @Query(sort: \RecurringTransaction.nextRunDate) private var recurringTransactions: [RecurringTransaction]
    @State private var priceStore = PriceStore()
    @State private var fxStore = FXRateStore()
    @AppStorage(IntentRoutingKeys.selectedTab) private var requestedTabRaw = NorthstarTab.dashboard.rawValue
    @AppStorage(IntentRoutingKeys.openAddKind) private var requestedAddKindRaw: String = ""
    @AppStorage(IntentRoutingKeys.baseCurrency) private var baseCurrency: String = BaseCurrencyDefaults.default
    @SceneStorage("northstar.scene.selectedTab") private var sceneTabRaw: String = NorthstarTab.dashboard.rawValue
    @State private var pendingAddKind: AddSheetKind?
    @State private var isPresentingSettings = false
    @State private var sidebarSearchText = ""

    private var selectedTab: NorthstarTab {
        NorthstarTab(rawValue: sceneTabRaw) ?? .dashboard
    }

    private var selectedContentTab: NorthstarTab {
        #if os(iOS)
        if isCompactIOS, selectedTab == .settings {
            return .accounts
        }
        #endif
        return selectedTab
    }

    private var selectedTabBinding: Binding<NorthstarTab> {
        Binding(
            get: { selectedContentTab },
            set: { sceneTabRaw = $0.rawValue }
        )
    }

    #if os(iOS)
    private var isCompactIOS: Bool {
        horizontalSizeClass == .compact
    }
    #endif

    var body: some View {
        #if os(macOS)
        desktopShell
            .sheet(item: $pendingAddKind, content: addSheetView)
        #else
        iosShell
            .sheet(item: $pendingAddKind, content: addSheetView)
            .sheet(isPresented: $isPresentingSettings) {
                SettingsView(fxStore: fxStore, priceStore: priceStore)
            }
        #endif
    }

    #if os(iOS)
    @ViewBuilder
    private var iosShell: some View {
        if isCompactIOS {
            compactTabShell
        } else {
            regularSplitShell
        }
    }

    private var compactTabShell: some View {
        TabView(selection: selectedTabBinding) {
            DashboardView(priceStore: priceStore, fxStore: fxStore, requestAdd: requestAdd)
                .tabItem {
                    Label("總覽", systemImage: "chart.xyaxis.line")
                }
                .tag(NorthstarTab.dashboard)

            HoldingsView(priceStore: priceStore, fxStore: fxStore, requestAdd: requestAdd)
                .tabItem {
                    Label("持倉", systemImage: "briefcase.fill")
                }
                .tag(NorthstarTab.holdings)

            TransactionsView(requestAdd: requestAdd)
                .tabItem {
                    Label("交易", systemImage: "list.bullet.rectangle")
                }
                .tag(NorthstarTab.transactions)

            CashFlowView(fxStore: fxStore, requestAdd: requestAdd)
                .tabItem {
                    Label("收支", systemImage: "arrow.left.arrow.right.circle")
                }
                .tag(NorthstarTab.cashFlow)

            AccountsView(fxStore: fxStore, settingsAction: presentSettings)
                .tabItem {
                    Label("帳戶", systemImage: "creditcard.fill")
                }
                .tag(NorthstarTab.accounts)
        }
        .tint(NorthstarTheme.accent)
        .modifier(RootLifecycleModifier(
            onAppear: handleLaunchRouting,
            onRequestedTabChange: applyRequestedTab,
            onRequestedAddKindChange: consumeRequestedAddKind
        ))
    }

    private var regularSplitShell: some View {
        NavigationSplitView {
            NorthstarSidebar(
                selectedTab: selectedTabBinding,
                searchText: $sidebarSearchText,
                accounts: accounts,
                assets: assets,
                records: records,
                ledgerTransactions: ledgerTransactions,
                priceStore: priceStore
            )
            .navigationSplitViewColumnWidth(min: 260, ideal: 300, max: 340)
            .background(Color.nsBackground)
        } detail: {
            selectedContent
                .background(Color.nsBackground)
        }
        .tint(NorthstarTheme.accent)
        .modifier(RootLifecycleModifier(
            onAppear: handleLaunchRouting,
            onRequestedTabChange: applyRequestedTab,
            onRequestedAddKindChange: consumeRequestedAddKind
        ))
    }
    #endif

    #if os(macOS)
    private var desktopShell: some View {
        NavigationSplitView {
            NorthstarSidebar(
                selectedTab: selectedTabBinding,
                searchText: $sidebarSearchText,
                accounts: accounts,
                assets: assets,
                records: records,
                ledgerTransactions: ledgerTransactions,
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
        .onChange(of: requestedAddKindRaw) { _, newValue in
            consumeRequestedAddKind(newValue)
        }
    }
    #endif

    @ViewBuilder
    private var selectedContent: some View {
        switch selectedContentTab {
        case .dashboard:
            DashboardView(priceStore: priceStore, fxStore: fxStore, requestAdd: requestAdd)
        case .holdings:
            HoldingsView(priceStore: priceStore, fxStore: fxStore, requestAdd: requestAdd)
        case .transactions:
            TransactionsView(requestAdd: requestAdd)
        case .cashFlow:
            CashFlowView(fxStore: fxStore, requestAdd: requestAdd)
        case .accounts:
            AccountsView(fxStore: fxStore, settingsAction: presentSettings)
        case .settings:
            SettingsView(fxStore: fxStore, priceStore: priceStore)
        }
    }

    @ViewBuilder
    private func addSheetView(for kind: AddSheetKind) -> some View {
        switch kind {
        case .investment:
            InvestmentRecordEditorView(editing: nil, assets: assets, accounts: accounts)
        case .cashflow:
            CashFlowEditorView(editing: nil, accounts: accounts, recentTransactions: ledgerTransactions)
        case .transfer:
            TransferEditorView(editing: nil, accounts: accounts, recentTransactions: ledgerTransactions)
        }
    }

    private func requestAdd(_ kind: AddSheetKind) {
        sceneTabRaw = kind.landingTab.rawValue
        pendingAddKind = kind
    }

    private func presentSettings() {
        #if os(iOS)
        if isCompactIOS {
            isPresentingSettings = true
            return
        }
        #endif
        sceneTabRaw = NorthstarTab.settings.rawValue
    }

    private var shortcutCommands: some View {
        Group {
            Button("Dashboard") { sceneTabRaw = NorthstarTab.dashboard.rawValue }
                .keyboardShortcut("1", modifiers: .command)
            Button("Transactions") { sceneTabRaw = NorthstarTab.transactions.rawValue }
                .keyboardShortcut("2", modifiers: .command)
            Button("Accounts") { sceneTabRaw = NorthstarTab.accounts.rawValue }
                .keyboardShortcut("3", modifiers: .command)
            Button("Investments") { sceneTabRaw = NorthstarTab.holdings.rawValue }
                .keyboardShortcut("4", modifiers: .command)
            Button("Cash Flow") { sceneTabRaw = NorthstarTab.cashFlow.rawValue }
                .keyboardShortcut("5", modifiers: .command)
            Button("Settings") { sceneTabRaw = NorthstarTab.settings.rawValue }
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
        consumeRequestedAddKind(requestedAddKindRaw)
        LedgerLinkage.backfillIfNeeded(context: modelContext)
        runDueRecurringTransactions()
        refreshNativeSurfaces()
    }

    private func runDueRecurringTransactions() {
        let descriptor = FetchDescriptor<RecurringTransaction>()
        guard let templates = try? modelContext.fetch(descriptor) else { return }
        _ = RecurringScheduler.runDue(templates: templates, context: modelContext)
    }

    private func refreshNativeSurfaces() {
        NativeSurfaceSync.refresh(
            accounts: accounts,
            assets: assets,
            records: records,
            ledgerTransactions: ledgerTransactions,
            recurringTemplates: recurringTransactions,
            holdings: PortfolioCalculator.holdings(assets: assets, prices: priceStore.prices),
            baseCurrency: baseCurrency,
            displayName: { ticker in
                priceStore.quote(for: ticker)?.name ?? assets.first(where: { $0.ticker == ticker })?.name ?? ticker
            },
            currency: { ticker in
                priceStore.quote(for: ticker)?.currency ?? assets.first(where: { $0.ticker == ticker })?.currency ?? "TWD"
            },
            convert: { amount, from, to in
                fxStore.convert(amount, from: from, to: to)
            }
        )
    }

    private func applyRequestedTab() {
        guard let tab = NorthstarTab(rawValue: requestedTabRaw) else { return }
        #if os(iOS)
        if isCompactIOS, tab == .settings {
            sceneTabRaw = NorthstarTab.accounts.rawValue
            isPresentingSettings = true
            return
        }
        #endif
        sceneTabRaw = tab.rawValue
    }

    private func consumeRequestedAddKind(_ raw: String) {
        guard raw.isEmpty == false, let kind = AddSheetKind(rawValue: raw) else { return }
        requestAdd(kind)
        requestedAddKindRaw = ""
    }
}

#if os(iOS)
private struct RootLifecycleModifier: ViewModifier {
    let onAppear: () -> Void
    let onRequestedTabChange: () -> Void
    let onRequestedAddKindChange: (String) -> Void

    @AppStorage(IntentRoutingKeys.selectedTab) private var requestedTabRaw = NorthstarTab.dashboard.rawValue
    @AppStorage(IntentRoutingKeys.openAddKind) private var requestedAddKindRaw: String = ""

    func body(content: Content) -> some View {
        content
            .onAppear(perform: onAppear)
            .onChange(of: requestedTabRaw) { _, _ in
                onRequestedTabChange()
            }
            .onChange(of: requestedAddKindRaw) { _, newValue in
                onRequestedAddKindChange(newValue)
            }
    }
}
#endif

#if os(macOS) || os(iOS)
private struct NorthstarSidebar: View {
    @Binding var selectedTab: NorthstarTab
    @Binding var searchText: String
    @FocusState private var searchFocused: Bool
    let accounts: [Account]
    let assets: [PortfolioAsset]
    let records: [InvestmentRecord]
    let ledgerTransactions: [LedgerTransaction]
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
            sidebarButton(.cashFlow, title: "Cash Flow", icon: "arrow.left.arrow.right.circle.fill")
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

            ForEach(AccountType.allCases) { kind in
                let group = accounts.filter { $0.type == kind }
                if group.isEmpty == false {
                    SidebarAccountGroup(
                        title: kind.displayTitle,
                        rows: group.map { account in
                            (
                                account.name,
                                CurrencyFormatters.money(account.balance, currencyCode: account.currency),
                                account.balance >= 0 ? NorthstarTheme.growth : NorthstarTheme.risk
                            )
                        }
                    )
                }
            }

            if holdings.isEmpty == false {
                SidebarAccountGroup(
                    title: "持倉",
                    rows: holdings.prefix(4).map {
                        ($0.ticker, CurrencyFormatters.money($0.marketValue), $0.unrealizedPnL >= 0 ? NorthstarTheme.growth : NorthstarTheme.risk)
                    }
                )
            }
        }
    }

    private var searchResults: some View {
        let results = GlobalSearch.search(
            query: searchQuery,
            accounts: accounts,
            assets: assets,
            records: records,
            ledger: ledgerTransactions,
            holdings: holdings
        )
        return VStack(alignment: .leading, spacing: 16) {
            Text("SEARCH RESULTS")
                .font(.caption.weight(.bold))
                .foregroundStyle(NorthstarTheme.mutedText)

            if results.isEmpty {
                Text("沒有符合的帳戶、持倉、投資紀錄或收支。")
                    .font(.subheadline)
                    .foregroundStyle(NorthstarTheme.secondaryText)
                    .padding(.horizontal, 12)
            } else {
                ForEach(results) { result in
                    searchResultButton(
                        title: result.title,
                        subtitle: result.subtitle,
                        icon: result.icon,
                        tab: result.targetTab
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
        let isSelected = selectedTab == tab
        return Button {
            selectedTab = tab
        } label: {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .frame(width: 18)
                Text(title)
                Spacer()
                if let badge {
                    Text(badge)
                        .foregroundStyle(isSelected ? Color.nsBackground : NorthstarTheme.accent)
                }
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(isSelected ? Color.nsBackground : NorthstarTheme.primaryText)
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .northstarSelectionSurface(isSelected: isSelected, cornerRadius: 8)
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
