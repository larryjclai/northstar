import SwiftUI
import SwiftData

struct DashboardView: View {
    @Environment(\.modelContext) private var modelContext
    let priceStore: PriceStore

    @Query(sort: \PortfolioAsset.ticker) private var assets: [PortfolioAsset]
    @Query(sort: \InvestmentRecord.date, order: .reverse) private var records: [InvestmentRecord]
    @Query(sort: \Account.name) private var accounts: [Account]

    private var tickerSymbols: [String] {
        assets.map(\.ticker).sorted()
    }

    var holdings: [HoldingSnapshot] {
        PortfolioCalculator.holdings(assets: assets, prices: priceStore.prices)
    }

    var summary: PortfolioSummary {
        PortfolioCalculator.summary(from: holdings)
    }

    private var cashBalanceTotal: Double {
        accounts.reduce(0) { $0 + $1.balance }
    }

    private var netWorthTotal: Double {
        summary.totalMarketValue + cashBalanceTotal
    }

    var body: some View {
        let symbols = tickerSymbols

        NavigationStack {
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 420), spacing: 28)], spacing: 28) {
                    heroCard
                    transactionsToReviewCard
                    recentTransactionsCard
                    allocationDashboardCard
                    accountsDashboardCard
                    holdingsDashboardCard
                }
                .padding(28)
            }
            .northstarScreenBackground()
            .navigationTitle("Dashboard")
            .platformLargeNavigationTitle()
            .toolbar {
                Button {
                    Task { await priceStore.refresh(tickers: symbols, force: true) }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .disabled(priceStore.isRefreshing || symbols.isEmpty)
                .accessibilityLabel("更新 Yahoo Finance 報價")
                .keyboardShortcut("r", modifiers: .command)
            }
            .task(id: symbols) {
                await priceStore.refresh(tickers: symbols)
            }
            .refreshable {
                await priceStore.refresh(tickers: symbols, force: true)
            }
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
        DashboardChartCard(
            title: "Net Worth",
            actionTitle: "ACCOUNTS",
            value: CurrencyFormatters.money(netWorthTotal),
            detail: CurrencyFormatters.percent(summary.totalUnrealizedReturn),
            detailPositive: summary.totalUnrealizedPnL >= 0,
            values: portfolioTrend,
            color: summary.totalUnrealizedPnL >= 0 ? NorthstarTheme.growth : NorthstarTheme.risk
        )
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
                if holdings.isEmpty || summary.totalMarketValue == 0 {
                    emptyState("尚無配置資料")
                } else {
                    ForEach(holdings.prefix(6)) { holding in
                        let ratio = holding.marketValue / summary.totalMarketValue
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
                        HStack {
                            Text(account.name)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(NorthstarTheme.primaryText)
                            Spacer()
                            Text(CurrencyFormatters.money(account.balance, currencyCode: account.currency))
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(NorthstarTheme.primaryText)
                                .monospacedDigit()
                        }
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

    private var portfolioTrend: [Double] {
        let series = holdings.compactMap { holding -> [Double]? in
            guard let closes = priceStore.sparklines[holding.ticker], closes.isEmpty == false else {
                return nil
            }
            return closes.map { $0 * holding.quantity }
        }

        guard let count = series.map(\.count).min(), count > 1 else {
            return []
        }

        return (0..<count).map { index in
            series.reduce(0) { total, points in
                total + points[points.count - count + index]
            }
        }
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
    var secondaryColor: Color?

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

            SparklineView(values: values, color: color)
                .frame(height: 126)

            HStack(spacing: 22) {
                ForEach(["1W", "1M", "3M", "YTD", "1Y", "ALL"], id: \.self) { range in
                    Text(range)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(range == "1M" ? NorthstarTheme.primaryText : NorthstarTheme.mutedText)
                        .padding(.horizontal, range == "1M" ? 12 : 0)
                        .padding(.vertical, range == "1M" ? 7 : 0)
                        .background {
                            if range == "1M" {
                                Capsule()
                                    .fill(NorthstarTheme.accent.opacity(0.28))
                            }
                        }
                }
            }
            .frame(maxWidth: .infinity)
        }
        .padding(20)
        .frame(maxWidth: .infinity, minHeight: 296, alignment: .topLeading)
        .northstarCardSurface()
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

    var body: some View {
        GeometryReader { proxy in
            if values.count > 1 {
                let points = normalizedPoints(in: proxy.size)
                ZStack {
                    areaPath(points: points, size: proxy.size)
                        .fill(
                            LinearGradient(
                                colors: [color.opacity(0.22), color.opacity(0.02)],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )

                    linePath(points: points)
                        .stroke(color, style: StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))
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

    private func normalizedPoints(in size: CGSize) -> [CGPoint] {
        let minValue = values.min() ?? 0
        let maxValue = values.max() ?? 0
        let range = max(maxValue - minValue, 0.0001)
        let step = values.count > 1 ? size.width / CGFloat(values.count - 1) : 0

        return values.enumerated().map { index, value in
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
