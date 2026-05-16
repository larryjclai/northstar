import SwiftUI
import SwiftData

struct DashboardView: View {
    @Environment(\.modelContext) private var modelContext
    let priceStore: PriceStore
    let fxStore: FXRateStore

    @AppStorage(IntentRoutingKeys.baseCurrency) private var baseCurrency: String = BaseCurrencyDefaults.default
    @Query(sort: \PortfolioAsset.ticker) private var assets: [PortfolioAsset]
    @Query(sort: \InvestmentRecord.date, order: .reverse) private var records: [InvestmentRecord]
    @Query(sort: \Account.name) private var accounts: [Account]

    @State private var selectedRange: TimeRange = .month
    @State private var selectedBenchmark: String? = nil

    private var tickerSymbols: [String] {
        assets.map(\.ticker).sorted()
    }

    var holdings: [HoldingSnapshot] {
        PortfolioCalculator.holdings(assets: assets, prices: priceStore.prices)
    }

    var summary: PortfolioSummary {
        PortfolioCalculator.summary(from: holdings)
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

    private var holdingsValueBase: Double {
        holdings.reduce(0) { running, holding in
            let nativeCurrency = currency(for: holding.ticker)
            if let converted = fxStore.convert(holding.marketValue, from: nativeCurrency, to: baseCurrency) {
                return running + converted
            }
            return running
        }
    }

    private var holdingsCostBase: Double {
        holdings.reduce(0) { running, holding in
            let nativeCurrency = currency(for: holding.ticker)
            if let converted = fxStore.convert(holding.costBasis, from: nativeCurrency, to: baseCurrency) {
                return running + converted
            }
            return running
        }
    }

    private var cashBalanceBase: Double {
        accounts.reduce(0) { running, account in
            if let converted = fxStore.convert(account.balance, from: account.currency, to: baseCurrency) {
                return running + converted
            }
            return running
        }
    }

    private var netWorthBase: Double {
        holdingsValueBase + cashBalanceBase
    }

    private var portfolioReturnBase: Double {
        holdingsCostBase == 0 ? 0 : (holdingsValueBase - holdingsCostBase) / holdingsCostBase
    }

    private var portfolioPnLBase: Double {
        holdingsValueBase - holdingsCostBase
    }

    private var unconvertedCurrencies: [String] {
        var missing = Set<String>()
        let base = baseCurrency.uppercased()
        for holding in holdings {
            let c = currency(for: holding.ticker).uppercased()
            if c != base, fxStore.rate(from: c, to: baseCurrency) == nil {
                missing.insert(c)
            }
        }
        for account in accounts {
            let c = account.currency.uppercased()
            if c != base, fxStore.rate(from: c, to: baseCurrency) == nil {
                missing.insert(c)
            }
        }
        return missing.sorted()
    }

    var body: some View {
        let symbols = tickerSymbols
        let currencies = portfolioCurrencies

        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    fxWarningBanner
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 420), spacing: 28)], spacing: 28) {
                        heroCard
                        transactionsToReviewCard
                        recentTransactionsCard
                        allocationDashboardCard
                        accountsDashboardCard
                        holdingsDashboardCard
                    }
                }
                .padding(28)
            }
            .northstarScreenBackground()
            .navigationTitle("Dashboard")
            .platformLargeNavigationTitle()
            .toolbar {
                Button {
                    Task {
                        await priceStore.refresh(tickers: symbols, force: true)
                        await fxStore.refresh(currencies: currencies, base: baseCurrency, force: true)
                    }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .disabled((priceStore.isRefreshing || fxStore.isRefreshing) || (symbols.isEmpty && currencies.isEmpty))
                .accessibilityLabel("更新報價與匯率")
                .keyboardShortcut("r", modifiers: .command)
            }
            .task(id: symbols) {
                await priceStore.refresh(tickers: symbols)
            }
            .task(id: currencies.joined() + baseCurrency) {
                await fxStore.refresh(currencies: currencies, base: baseCurrency)
            }
            .refreshable {
                await priceStore.refresh(tickers: symbols, force: true)
                await fxStore.refresh(currencies: currencies, base: baseCurrency, force: true)
            }
        }
    }

    @ViewBuilder
    private var fxWarningBanner: some View {
        let missing = unconvertedCurrencies
        if missing.isEmpty == false || fxStore.lastError != nil {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(NorthstarTheme.warning)
                VStack(alignment: .leading, spacing: 4) {
                    if missing.isEmpty == false {
                        Text("有 \(missing.count) 種幣別未折算成 \(baseCurrency)：\(missing.joined(separator: ", "))")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(NorthstarTheme.primaryText)
                        Text("這些資產暫不計入淨資產總和。前往 Settings 立即更新匯率。")
                            .font(.caption)
                            .foregroundStyle(NorthstarTheme.secondaryText)
                    } else if let error = fxStore.lastError {
                        Text("匯率更新有問題")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(NorthstarTheme.primaryText)
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(NorthstarTheme.secondaryText)
                    }
                }
                Spacer()
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .northstarCardSurface()
        }
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("所有資產，一眼掌握")
                    .font(.title2.bold())
                    .foregroundStyle(NorthstarTheme.primaryText)
                Text(statusText)
                    .font(.subheadline)
                    .foregroundStyle(NorthstarTheme.secondaryText)
            }

            Spacer()

            if priceStore.isRefreshing {
                ProgressView()
                    .controlSize(.small)
            } else {
                Image(systemName: "sparkline")
                    .font(.title3)
                    .foregroundStyle(NorthstarTheme.netWorth)
            }
        }
    }

    private var heroCard: some View {
        let trend = currentPortfolioTrend
        let benchmark = currentBenchmarkSeries
        return DashboardChartCard(
            title: "Net Worth",
            actionTitle: "ACCOUNTS",
            value: CurrencyFormatters.money(netWorthBase, currencyCode: baseCurrency),
            detail: CurrencyFormatters.percent(portfolioReturnBase),
            detailPositive: portfolioPnLBase >= 0,
            values: trend.values,
            color: portfolioPnLBase >= 0 ? NorthstarTheme.growth : NorthstarTheme.risk,
            selectedRange: $selectedRange,
            selectedBenchmark: $selectedBenchmark,
            benchmarkValues: benchmark,
            benchmarkOptions: BenchmarkCatalog.symbols
        )
    }

    private var currentPortfolioTrend: PortfolioTrend {
        let full = PortfolioTrendBuilder.build(
            holdings: holdings,
            sparklines: priceStore.sparklines,
            sparklineDates: priceStore.sparklineDates
        )
        return PortfolioTrendBuilder.slice(values: full.values, dates: full.dates, range: selectedRange)
    }

    private var currentBenchmarkSeries: [Double] {
        guard let symbol = selectedBenchmark,
              let closes = priceStore.sparklines[symbol],
              closes.isEmpty == false else { return [] }
        let dates = priceStore.sparklineDates[symbol] ?? []
        let sliced = PortfolioTrendBuilder.slice(values: closes, dates: dates, range: selectedRange)
        return sliced.values
    }

    private var transactionsToReviewCard: some View {
        DashboardPanel(title: "Transactions To Review", actionTitle: "VIEW ALL") {
            VStack(spacing: 12) {
                let pending = records.filter { $0.isReviewed == false }
                if pending.isEmpty {
                    emptyState("沒有待審投資事件")
                } else {
                    ForEach(pending.prefix(5)) { record in
                        ReviewRecordRow(record: record) {
                            record.isReviewed = true
                            try? modelContext.save()
                        }
                    }

                    Divider()
                        .overlay(Color.nsBorder)
                        .padding(.top, 4)

                    Button {
                        pending.forEach { $0.isReviewed = true }
                        try? modelContext.save()
                    } label: {
                        Label("Mark all as reviewed", systemImage: "checkmark")
                            .font(.subheadline.weight(.semibold))
                    }
                    .buttonStyle(.bordered)
                    .tint(NorthstarTheme.secondaryText)
                    .frame(maxWidth: .infinity)
                }
            }
        }
    }

    private var recentTransactionsCard: some View {
        DashboardPanel(title: "Recent Investment Events", actionTitle: "TRANSACTIONS") {
            VStack(spacing: 14) {
                if records.isEmpty {
                    emptyState("新增交易後會顯示最近投資事件")
                } else {
                    ForEach(records.prefix(6)) { record in
                        CompactRecordRow(record: record)
                    }
                }
            }
        }
    }

    private var allocationDashboardCard: some View {
        DashboardPanel(title: "Allocation", actionTitle: "INVESTMENTS") {
            VStack(spacing: 14) {
                if holdings.isEmpty || holdingsValueBase == 0 {
                    emptyState("尚無配置資料")
                } else {
                    ForEach(holdings.prefix(6)) { holding in
                        let converted = fxStore.convert(holding.marketValue, from: currency(for: holding.ticker), to: baseCurrency) ?? 0
                        let ratio = converted / holdingsValueBase
                        AllocationSummaryRow(title: holding.ticker, ratio: ratio)
                    }
                }
            }
        }
    }

    private var accountsDashboardCard: some View {
        DashboardPanel(title: "Accounts", actionTitle: "ACCOUNTS") {
            VStack(spacing: 14) {
                if accounts.isEmpty {
                    emptyState("尚未建立現金帳戶")
                } else {
                    ForEach(accounts) { account in
                        AccountRow(
                            account: account,
                            baseCurrency: baseCurrency,
                            convertedAmount: fxStore.convert(account.balance, from: account.currency, to: baseCurrency)
                        )
                    }
                }
            }
        }
    }

    private var holdingsDashboardCard: some View {
        DashboardPanel(title: "Holdings", actionTitle: "LAST PRICE") {
            VStack(spacing: 14) {
                if holdings.isEmpty {
                    emptyState("尚無持倉")
                } else {
                    ForEach(holdings.prefix(6)) { holding in
                        HStack(spacing: 12) {
                            Text(holding.ticker)
                                .font(.subheadline.weight(.bold))
                                .foregroundStyle(NorthstarTheme.mutedText)
                                .frame(width: 72, alignment: .leading)
                            Text(displayName(for: holding.ticker))
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(NorthstarTheme.primaryText)
                                .lineLimit(1)
                            Spacer()
                            ChangePill(
                                text: CurrencyFormatters.percent(holding.unrealizedReturn),
                                positive: holding.unrealizedPnL >= 0
                            )
                            Text(CurrencyFormatters.price(holding.marketPrice, currencyCode: currency(for: holding.ticker)))
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(NorthstarTheme.primaryText)
                                .monospacedDigit()
                        }
                    }
                }
            }
        }
    }

    private var allocationCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Allocation")
                .font(.title3.bold())
                .foregroundStyle(NorthstarTheme.primaryText)

            if holdings.isEmpty || summary.totalMarketValue == 0 {
                emptyState("尚無配置資料")
            } else {
                VStack(spacing: 12) {
                    ForEach(holdings.prefix(5)) { holding in
                        let ratio = holding.marketValue / summary.totalMarketValue
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(holding.ticker)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(NorthstarTheme.primaryText)
                                Spacer()
                                Text(CurrencyFormatters.percent(ratio))
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(NorthstarTheme.secondaryText)
                            }

                            GeometryReader { proxy in
                                ZStack(alignment: .leading) {
                                    Capsule()
                                        .fill(Color.nsSecondarySurface)
                                    Capsule()
                                        .fill(NorthstarTheme.accent)
                                        .frame(width: max(8, proxy.size.width * ratio))
                                }
                            }
                            .frame(height: 8)
                        }
                    }
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, minHeight: 240, alignment: .topLeading)
        .northstarCardSurface()
    }

    private var holdingsCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("持倉摘要")
                .font(.title3.bold())
                .foregroundStyle(NorthstarTheme.primaryText)

            if holdings.isEmpty {
                emptyState("目前沒有持倉")
            } else {
                VStack(spacing: 14) {
                    ForEach(holdings.prefix(4)) { holding in
                        HStack(alignment: .center, spacing: 12) {
                            TickerAvatar(ticker: holding.ticker)

                            VStack(alignment: .leading, spacing: 3) {
                                Text(displayName(for: holding.ticker))
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(NorthstarTheme.primaryText)
                                    .lineLimit(1)
                                Text(holding.ticker)
                                    .font(.caption)
                                    .foregroundStyle(NorthstarTheme.secondaryText)
                            }

                            Spacer()

                            VStack(alignment: .trailing, spacing: 3) {
                                Text(CurrencyFormatters.money(holding.marketValue, currencyCode: currency(for: holding.ticker)))
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(NorthstarTheme.primaryText)
                                Text(CurrencyFormatters.percent(holding.unrealizedReturn))
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(holding.unrealizedPnL >= 0 ? NorthstarTheme.growth : NorthstarTheme.risk)
                            }
                        }
                    }
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, minHeight: 240, alignment: .topLeading)
        .northstarCardSurface()
    }

    private var statusText: String {
        if let lastError = priceStore.lastError {
            return "同步失敗：\(lastError)"
        }

        if let lastUpdated = priceStore.lastUpdated {
            return "Yahoo Finance 已同步 \(lastUpdated.formatted(date: .omitted, time: .shortened))"
        }

        return priceStore.isRefreshing ? "正在同步 Yahoo Finance 報價" : "等待 Yahoo Finance 報價"
    }

    private func displayName(for ticker: String) -> String {
        priceStore.quote(for: ticker)?.name ?? assets.first(where: { $0.ticker == ticker })?.name ?? ticker
    }

    private func currency(for ticker: String) -> String {
        priceStore.quote(for: ticker)?.currency ?? assets.first(where: { $0.ticker == ticker })?.currency ?? "TWD"
    }

    private func emptyState(_ text: String) -> some View {
        Text(text)
            .font(.subheadline)
            .foregroundStyle(NorthstarTheme.secondaryText)
            .frame(maxWidth: .infinity, minHeight: 84, alignment: .center)
    }
}

private struct AccountRow: View {
    let account: Account
    let baseCurrency: String
    let convertedAmount: Double?

    private var isForeign: Bool {
        account.currency.uppercased() != baseCurrency.uppercased()
    }

    var body: some View {
        HStack(alignment: .center) {
            Text(account.name)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(NorthstarTheme.primaryText)
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(CurrencyFormatters.money(account.balance, currencyCode: account.currency))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(NorthstarTheme.primaryText)
                    .monospacedDigit()
                if isForeign {
                    if let convertedAmount {
                        Text("≈ \(CurrencyFormatters.money(convertedAmount, currencyCode: baseCurrency))")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(NorthstarTheme.secondaryText)
                            .monospacedDigit()
                    } else {
                        Text("匯率待更新")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(NorthstarTheme.warning)
                    }
                }
            }
        }
    }
}

private struct DashboardPanel<Content: View>: View {
    let title: String
    let actionTitle: String
    let content: Content

    init(title: String, actionTitle: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.actionTitle = actionTitle
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                Text(title)
                    .font(.headline.weight(.bold))
                    .foregroundStyle(NorthstarTheme.primaryText)
                Spacer()
                Text("\(actionTitle) ↗")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(NorthstarTheme.mutedText)
            }

            content
        }
        .padding(20)
        .frame(maxWidth: .infinity, minHeight: 230, alignment: .topLeading)
        .northstarCardSurface()
    }
}

private struct ReviewRecordRow: View {
    let record: InvestmentRecord
    let onReview: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onReview) {
                RoundedRectangle(cornerRadius: 3, style: .continuous)
                    .stroke(NorthstarTheme.accent.opacity(0.9), lineWidth: 1)
                    .frame(width: 13, height: 13)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("標記為已審核")

            Text(record.asset?.name ?? record.asset?.ticker ?? "未命名標的")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(NorthstarTheme.primaryText)
                .lineLimit(1)
            Spacer()
            Text(record.action.displayTitle)
                .font(.caption2.weight(.bold))
                .foregroundStyle(record.action.tint)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(record.action.tint.opacity(0.18), in: Capsule())
            Text(CurrencyFormatters.price(record.price * record.quantity, currencyCode: record.asset?.currency ?? record.linkedAccount?.currency ?? "TWD"))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(NorthstarTheme.primaryText)
                .monospacedDigit()
        }
    }
}

private struct CompactRecordRow: View {
    let record: InvestmentRecord

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: record.action.symbolName)
                .font(.caption.weight(.bold))
                .foregroundStyle(record.action.tint)
                .frame(width: 20)
            VStack(alignment: .leading, spacing: 2) {
                Text(record.asset?.ticker ?? "-")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(NorthstarTheme.primaryText)
                Text(record.date.formatted(date: .abbreviated, time: .omitted))
                    .font(.caption)
                    .foregroundStyle(NorthstarTheme.mutedText)
            }
            Spacer()
            Text(record.action.displayTitle)
                .font(.caption.weight(.semibold))
                .foregroundStyle(record.action.tint)
            Text(CurrencyFormatters.price(record.price * record.quantity, currencyCode: record.asset?.currency ?? record.linkedAccount?.currency ?? "TWD"))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(NorthstarTheme.primaryText)
                .monospacedDigit()
                .frame(width: 96, alignment: .trailing)
        }
    }
}

private struct AllocationSummaryRow: View {
    let title: String
    let ratio: Double

    var body: some View {
        HStack(spacing: 14) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(NorthstarTheme.primaryText)
                .frame(width: 92, alignment: .leading)

            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.nsSecondarySurface)
                    Capsule()
                        .fill(Color(red: 0.42, green: 0.56, blue: 0.72))
                        .frame(width: proxy.size.width * ratio)
                }
            }
            .frame(height: 6)

            Text(CurrencyFormatters.percent(ratio))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(NorthstarTheme.primaryText)
                .monospacedDigit()
                .frame(width: 72, alignment: .trailing)
        }
    }
}

private struct DashboardChartCard: View {
    let title: String
    let actionTitle: String
    let value: String
    let detail: String
    let detailPositive: Bool
    let values: [Double]
    let color: Color
    @Binding var selectedRange: TimeRange
    @Binding var selectedBenchmark: String?
    var benchmarkValues: [Double] = []
    var benchmarkOptions: [String] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Spacer()
                Text(title)
                    .font(.headline.weight(.bold))
                    .foregroundStyle(NorthstarTheme.primaryText)
                Spacer()
                Text("\(actionTitle) ↗")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(NorthstarTheme.mutedText)
            }

            VStack(spacing: 6) {
                Text(value)
                    .font(.title2.weight(.bold))
                    .foregroundStyle(NorthstarTheme.primaryText)
                    .monospacedDigit()
                ChangePill(text: detail, positive: detailPositive, showsArrow: detail.contains("%"))
            }
            .frame(maxWidth: .infinity)

            SparklineView(
                values: values,
                color: color,
                comparison: benchmarkValues,
                comparisonColor: NorthstarTheme.accent.opacity(0.85),
                comparisonLabel: selectedBenchmark.map { BenchmarkCatalog.displayName(for: $0) }
            )
            .frame(height: 126)

            TimeRangeSelector(selected: $selectedRange)

            if benchmarkOptions.isEmpty == false {
                BenchmarkPicker(
                    options: benchmarkOptions,
                    selection: $selectedBenchmark
                )
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, minHeight: 296, alignment: .topLeading)
        .northstarCardSurface()
    }
}

struct TimeRangeSelector: View {
    @Binding var selected: TimeRange

    var body: some View {
        HStack(spacing: 8) {
            ForEach(TimeRange.allCases) { range in
                Button {
                    selected = range
                } label: {
                    Text(range.label)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(range == selected ? NorthstarTheme.primaryText : NorthstarTheme.mutedText)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background {
                            if range == selected {
                                Capsule().fill(NorthstarTheme.accent.opacity(0.28))
                            }
                        }
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity)
    }
}

struct BenchmarkPicker: View {
    let options: [String]
    @Binding var selection: String?

    var body: some View {
        HStack(spacing: 8) {
            Text("BENCHMARK")
                .font(.caption2.weight(.bold))
                .foregroundStyle(NorthstarTheme.mutedText)

            Button {
                selection = nil
            } label: {
                Text("None")
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background {
                        Capsule()
                            .fill(selection == nil ? NorthstarTheme.accent.opacity(0.28) : Color.nsSecondarySurface)
                    }
                    .foregroundStyle(selection == nil ? NorthstarTheme.primaryText : NorthstarTheme.mutedText)
            }
            .buttonStyle(.plain)

            ForEach(options, id: \.self) { symbol in
                Button {
                    selection = symbol
                } label: {
                    Text(symbol)
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background {
                            Capsule()
                                .fill(selection == symbol ? NorthstarTheme.accent.opacity(0.28) : Color.nsSecondarySurface)
                        }
                        .foregroundStyle(selection == symbol ? NorthstarTheme.primaryText : NorthstarTheme.mutedText)
                }
                .buttonStyle(.plain)
            }
            Spacer()
        }
    }
}

private struct QuoteCard: View {
    let ticker: String
    let name: String
    let price: Double
    let currency: String
    let changePercent: Double?
    let sparkline: [Double]
    let isLoading: Bool

    private var positive: Bool {
        (changePercent ?? 0) >= 0
    }

    private var lineColor: Color {
        positive ? NorthstarTheme.growth : NorthstarTheme.risk
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(ticker)
                    .font(.headline)
                    .foregroundStyle(NorthstarTheme.primaryText)
                    .lineLimit(1)
                Text(name)
                    .font(.subheadline)
                    .foregroundStyle(NorthstarTheme.secondaryText)
                    .lineLimit(1)
            }

            SparklineView(values: sparkline, color: lineColor)
                .frame(height: 58)

            HStack(alignment: .center) {
                Text(isLoading ? "更新中" : CurrencyFormatters.price(price, currencyCode: currency))
                    .font(.subheadline.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(NorthstarTheme.primaryText)
                    .contentTransition(.numericText())

                Spacer()

                if let changePercent {
                    ChangePill(text: String(format: "%+.2f%%", changePercent), positive: positive)
                }
            }
        }
        .padding(16)
        .frame(width: 184, height: 188, alignment: .topLeading)
        .northstarCardSurface()
    }
}

struct TickerAvatar: View {
    let ticker: String

    var body: some View {
        ZStack {
            Circle()
                .fill(NorthstarTheme.accent.opacity(0.18))
            Text(String(ticker.prefix(1)))
                .font(.headline.bold())
                .foregroundStyle(NorthstarTheme.accent)
        }
        .frame(width: 40, height: 40)
    }
}

struct ChangePill: View {
    let text: String
    let positive: Bool
    var showsArrow = true

    var body: some View {
        HStack(spacing: 5) {
            if showsArrow {
                Image(systemName: positive ? "arrow.up.right" : "arrow.down.right")
                    .font(.caption.bold())
            }
            Text(text)
                .font(.caption.weight(.bold))
                .lineLimit(1)
        }
        .foregroundStyle(positive ? NorthstarTheme.growth : NorthstarTheme.risk)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background((positive ? NorthstarTheme.growth : NorthstarTheme.risk).opacity(0.14), in: Capsule())
    }
}

struct SparklineView: View {
    let values: [Double]
    let color: Color
    var comparison: [Double] = []
    var comparisonColor: Color = NorthstarTheme.mutedText
    var comparisonLabel: String? = nil

    var body: some View {
        GeometryReader { proxy in
            if values.count > 1 {
                let primaryNormalized = normalize(values)
                let comparisonNormalized: [Double] = comparison.count > 1
                    ? rebase(comparison, toCount: primaryNormalized.count)
                    : []

                let combined = primaryNormalized + comparisonNormalized
                let minValue = combined.min() ?? 0
                let maxValue = combined.max() ?? 0
                let range = max(maxValue - minValue, 0.0001)

                let primaryPoints = points(for: primaryNormalized, in: proxy.size, min: minValue, range: range)
                let comparisonPoints = points(for: comparisonNormalized, in: proxy.size, min: minValue, range: range)

                ZStack(alignment: .topLeading) {
                    areaPath(points: primaryPoints, size: proxy.size)
                        .fill(
                            LinearGradient(
                                colors: [color.opacity(0.22), color.opacity(0.02)],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )

                    if comparisonPoints.isEmpty == false {
                        linePath(points: comparisonPoints)
                            .stroke(
                                comparisonColor,
                                style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round, dash: [4, 4])
                            )
                    }

                    linePath(points: primaryPoints)
                        .stroke(color, style: StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))

                    if let comparisonLabel, comparisonPoints.isEmpty == false {
                        HStack(spacing: 6) {
                            Capsule()
                                .fill(comparisonColor)
                                .frame(width: 16, height: 2)
                            Text(comparisonLabel)
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(comparisonColor)
                        }
                        .padding(6)
                    }
                }
            } else {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Color.nsSecondarySurface)
                    .overlay {
                        Text("等待走勢")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
            }
        }
    }

    private func normalize(_ series: [Double]) -> [Double] {
        guard let first = series.first, abs(first) > 0.000001 else { return series }
        return series.map { $0 / first }
    }

    private func rebase(_ series: [Double], toCount count: Int) -> [Double] {
        let tail = Array(series.suffix(count))
        guard let first = tail.first, abs(first) > 0.000001 else { return tail }
        return tail.map { $0 / first }
    }

    private func points(for series: [Double], in size: CGSize, min minValue: Double, range: Double) -> [CGPoint] {
        guard series.count > 1 else { return [] }
        let step = size.width / CGFloat(series.count - 1)
        return series.enumerated().map { index, value in
            let x = CGFloat(index) * step
            let y = size.height - (CGFloat((value - minValue) / range) * size.height)
            return CGPoint(x: x, y: y)
        }
    }

    private func linePath(points: [CGPoint]) -> Path {
        Path { path in
            guard let first = points.first else { return }
            path.move(to: first)
            for point in points.dropFirst() {
                path.addLine(to: point)
            }
        }
    }

    private func areaPath(points: [CGPoint], size: CGSize) -> Path {
        Path { path in
            guard let first = points.first, let last = points.last else { return }
            path.move(to: CGPoint(x: first.x, y: size.height))
            path.addLine(to: first)
            for point in points.dropFirst() {
                path.addLine(to: point)
            }
            path.addLine(to: CGPoint(x: last.x, y: size.height))
            path.closeSubpath()
        }
    }
}
