import SwiftUI
import SwiftData

struct HoldingsView: View {
    let priceStore: PriceStore
    let fxStore: FXRateStore

    @AppStorage(IntentRoutingKeys.baseCurrency) private var baseCurrency: String = BaseCurrencyDefaults.default
    @Query(sort: \PortfolioAsset.ticker) private var assets: [PortfolioAsset]

    @State private var selectedRange: TimeRange = .month
    @State private var selectedBenchmark: String? = nil

    private var tickerSymbols: [String] {
        assets.map(\.ticker).sorted()
    }

    private var holdings: [HoldingSnapshot] {
        PortfolioCalculator.holdings(assets: assets, prices: priceStore.prices)
    }

    private var summary: PortfolioSummary {
        PortfolioCalculator.summary(from: holdings)
    }

    private var portfolioCurrencies: [String] {
        Array(Set(assets.map { $0.currency.uppercased() }))
            .filter { $0.isEmpty == false }
            .sorted()
    }

    private var holdingsValueBase: Double {
        holdings.reduce(0) { running, holding in
            let native = currency(for: holding.ticker)
            if let converted = fxStore.convert(holding.marketValue, from: native, to: baseCurrency) {
                return running + converted
            }
            return running
        }
    }

    private var holdingsCostBase: Double {
        holdings.reduce(0) { running, holding in
            let native = currency(for: holding.ticker)
            if let converted = fxStore.convert(holding.costBasis, from: native, to: baseCurrency) {
                return running + converted
            }
            return running
        }
    }

    private var holdingsReturnBase: Double {
        holdingsCostBase == 0 ? 0 : (holdingsValueBase - holdingsCostBase) / holdingsCostBase
    }

    private var holdingsPnLBase: Double {
        holdingsValueBase - holdingsCostBase
    }

    var body: some View {
        let symbols = tickerSymbols
        let snapshots = holdings
        let currencies = portfolioCurrencies

        NavigationStack {
            GeometryReader { proxy in
                if proxy.size.width >= 920 {
                    HStack(spacing: 0) {
                        investmentsColumn(snapshots)
                            .frame(maxWidth: proxy.size.width * 0.52)

                        Divider()
                            .overlay(Color.nsBorder)

                        brokerageDetail(snapshots.first)
                            .frame(maxWidth: .infinity)
                    }
                } else {
                    investmentsColumn(snapshots)
                }
            }
            .northstarScreenBackground()
            .navigationTitle("Investments")
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

    private func investmentsColumn(_ snapshots: [HoldingSnapshot]) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 24) {
                investmentsHero
                statusBanner

                if snapshots.isEmpty {
                    emptyState
                } else {
                    investmentAccountsSection(snapshots)
                    allocationSection(snapshots)
                    holdingsTableSection(snapshots)
                }
            }
            .padding(28)
        }
    }

    private var investmentsHero: some View {
        let trend = currentPortfolioTrend
        let benchmark = currentBenchmarkSeries
        return VStack(alignment: .center, spacing: 14) {
            HStack {
                Spacer()
                Text(CurrencyFormatters.percent(holdingsReturnBase))
                    .font(.caption.weight(.bold))
                    .foregroundStyle(holdingsPnLBase >= 0 ? NorthstarTheme.growth : NorthstarTheme.risk)
                Image(systemName: "gearshape")
                    .font(.headline)
                    .foregroundStyle(NorthstarTheme.mutedText)
            }

            Text(CurrencyFormatters.money(holdingsValueBase, currencyCode: baseCurrency))
                .font(.system(size: 32, weight: .bold))
                .foregroundStyle(NorthstarTheme.primaryText)
                .monospacedDigit()

            Text("\(baseCurrency) 折算後估值")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(NorthstarTheme.mutedText)

            SparklineView(
                values: trend.values,
                color: holdingsPnLBase >= 0 ? NorthstarTheme.growth : NorthstarTheme.risk,
                comparison: benchmark,
                comparisonColor: NorthstarTheme.accent.opacity(0.85),
                comparisonLabel: selectedBenchmark.map { BenchmarkCatalog.displayName(for: $0) }
            )
            .frame(height: 134)

            TimeRangeSelector(selected: $selectedRange)
            BenchmarkPicker(options: BenchmarkCatalog.symbols, selection: $selectedBenchmark)
        }
        .padding(18)
        .frame(maxWidth: .infinity)
        .northstarCardSurface()
    }

    private var rangeSelector: some View {
        TimeRangeSelector(selected: $selectedRange)
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

    private func investmentAccountsSection(_ snapshots: [HoldingSnapshot]) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeader(title: "Accounts", trailing: "1M BALANCE CHANGE")

            ForEach(snapshots.prefix(3)) { holding in
                NavigationLink {
                    HoldingDetailView(ticker: holding.ticker, priceStore: priceStore, fxStore: fxStore)
                } label: {
                    InvestmentAccountRow(
                        holding: holding,
                        name: displayName(for: holding.ticker),
                        currency: currency(for: holding.ticker),
                        sparkline: priceStore.sparklines[holding.ticker] ?? [],
                        updatedText: updatedText(for: holding.ticker)
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func allocationSection(_ snapshots: [HoldingSnapshot]) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeader(title: "Allocation", trailing: "BY PERCENTAGE")

            ForEach(snapshots.prefix(4)) { holding in
                let ratio = summary.totalMarketValue == 0 ? 0 : holding.marketValue / summary.totalMarketValue
                HStack(spacing: 14) {
                    Text(assetType(for: holding.ticker))
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
    }

    private func holdingsTableSection(_ snapshots: [HoldingSnapshot]) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeader(title: "Holdings", trailing: "LAST PRICE")

            ForEach(snapshots) { holding in
                NavigationLink {
                    HoldingDetailView(ticker: holding.ticker, priceStore: priceStore, fxStore: fxStore)
                } label: {
                    HoldingTableRow(
                        holding: holding,
                        name: displayName(for: holding.ticker),
                        currency: currency(for: holding.ticker),
                        sparkline: priceStore.sparklines[holding.ticker] ?? [],
                        type: assetType(for: holding.ticker)
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func brokerageDetail(_ selected: HoldingSnapshot?) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                HStack {
                    Text("Brokerage")
                        .font(.headline.weight(.bold))
                        .foregroundStyle(NorthstarTheme.primaryText)
                    Spacer()
                    Image(systemName: "ellipsis")
                        .font(.headline)
                        .foregroundStyle(NorthstarTheme.mutedText)
                        .padding(8)
                        .northstarCardSurface()
                }

                if let selected {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            TickerAvatar(ticker: selected.ticker)
                            Text("\(selected.ticker) · \(updatedText(for: selected.ticker))")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(NorthstarTheme.mutedText)
                            Spacer()
                            ChangePill(
                                text: CurrencyFormatters.percent(selected.unrealizedReturn),
                                positive: selected.unrealizedPnL >= 0
                            )
                        }

                        HStack(alignment: .firstTextBaseline) {
                            Text(displayName(for: selected.ticker))
                                .font(.system(size: 28, weight: .bold))
                                .foregroundStyle(NorthstarTheme.primaryText)
                            Spacer()
                            Text(CurrencyFormatters.money(selected.marketValue, currencyCode: currency(for: selected.ticker)))
                                .font(.title2.weight(.bold))
                                .foregroundStyle(NorthstarTheme.primaryText)
                                .monospacedDigit()
                        }

                        SparklineView(
                            values: priceStore.sparklines[selected.ticker] ?? currentPortfolioTrend.values,
                            color: selected.unrealizedPnL >= 0 ? NorthstarTheme.growth : NorthstarTheme.risk
                        )
                        .frame(height: 150)

                        rangeSelector
                    }
                }

                Divider().overlay(Color.nsBorder)
                allocationSection(Array(holdings.prefix(5)))
                Divider().overlay(Color.nsBorder)
                holdingsTableSection(Array(holdings.prefix(7)))
            }
            .padding(28)
        }
    }

    private func assetType(for ticker: String) -> String {
        if ticker.contains("0050") || ticker.uppercased().contains("ETF") || ticker == "SPY" {
            return "ETF"
        }
        return "Equity"
    }

    private func holdingsHero(_ snapshots: [HoldingSnapshot]) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("持倉配置")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.secondaryText)
                    Text("\(snapshots.count) 個標的")
                        .font(.system(size: 34, weight: .semibold))
                        .foregroundStyle(NorthstarTheme.primaryText)
                        .monospacedDigit()
                }

                Spacer()

                ChangePill(
                    text: CurrencyFormatters.percent(summary.totalUnrealizedReturn),
                    positive: summary.totalUnrealizedPnL >= 0
                )
            }

            VStack(alignment: .leading, spacing: 7) {
                Text("未實現損益")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(NorthstarTheme.secondaryText)
                Text(CurrencyFormatters.signedMoney(summary.totalUnrealizedPnL))
                    .font(.title3.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(summary.totalUnrealizedPnL >= 0 ? NorthstarTheme.growth : NorthstarTheme.risk)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .northstarCardSurface()
    }

    @ViewBuilder
    private var statusBanner: some View {
        if priceStore.isRefreshing {
            Label {
                Text("正在同步 Yahoo Finance 報價")
            } icon: {
                ProgressView()
                    .controlSize(.small)
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(NorthstarTheme.secondaryText)
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .northstarCardSurface()
        } else if let lastError = priceStore.lastError {
            Label(lastError, systemImage: "exclamationmark.triangle.fill")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(NorthstarTheme.warning)
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .northstarCardSurface()
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("目前沒有持倉")
                .font(.headline)
                .foregroundStyle(NorthstarTheme.primaryText)
            Text("新增第一筆買入紀錄後，northstar 會把股數、均價、市值與未實現損益整理成可追蹤的配置。")
                .font(.subheadline)
                .foregroundStyle(NorthstarTheme.secondaryText)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .northstarCardSurface()
    }

    private func currency(for ticker: String) -> String {
        priceStore.quote(for: ticker)?.currency ?? assets.first(where: { $0.ticker == ticker })?.currency ?? "TWD"
    }

    private func displayName(for ticker: String) -> String {
        priceStore.quote(for: ticker)?.name ?? assets.first(where: { $0.ticker == ticker })?.name ?? ticker
    }

    private func updatedText(for ticker: String) -> String {
        if let marketTime = priceStore.quote(for: ticker)?.regularMarketTime {
            return "Updated \(marketTime.formatted(date: .abbreviated, time: .shortened))"
        }

        if let lastUpdated = priceStore.lastUpdated {
            return "Updated \(lastUpdated.formatted(date: .omitted, time: .shortened))"
        }

        return "Waiting for market data"
    }
}

private struct SectionHeader: View {
    let title: String
    let trailing: String

    var body: some View {
        HStack {
            Text(title)
                .font(.title3.weight(.bold))
                .foregroundStyle(NorthstarTheme.primaryText)
            Spacer()
            Text(trailing)
                .font(.caption.weight(.bold))
                .foregroundStyle(NorthstarTheme.mutedText)
        }
    }
}

private struct InvestmentAccountRow: View {
    let holding: HoldingSnapshot
    let name: String
    let currency: String
    let sparkline: [Double]
    let updatedText: String

    private var positive: Bool {
        holding.unrealizedPnL >= 0
    }

    var body: some View {
        HStack(spacing: 14) {
            TickerAvatar(ticker: holding.ticker)

            VStack(alignment: .leading, spacing: 3) {
                Text(name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(NorthstarTheme.primaryText)
                    .lineLimit(1)
                Text(updatedText)
                    .font(.caption)
                    .foregroundStyle(NorthstarTheme.mutedText)
            }

            Spacer()

            SparklineView(values: sparkline, color: positive ? NorthstarTheme.growth : NorthstarTheme.risk)
                .frame(width: 90, height: 34)

            ChangePill(text: CurrencyFormatters.signedMoney(holding.unrealizedPnL, currencyCode: currency), positive: positive)

            Text(CurrencyFormatters.money(holding.marketValue, currencyCode: currency))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(NorthstarTheme.primaryText)
                .monospacedDigit()
                .frame(width: 92, alignment: .trailing)
        }
    }
}

private struct HoldingTableRow: View {
    let holding: HoldingSnapshot
    let name: String
    let currency: String
    let sparkline: [Double]
    let type: String

    private var positive: Bool {
        holding.unrealizedPnL >= 0
    }

    var body: some View {
        HStack(spacing: 14) {
            Text(holding.ticker)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(NorthstarTheme.mutedText)
                .frame(width: 68, alignment: .leading)
            Text(name)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(NorthstarTheme.primaryText)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(type)
                .font(.caption.weight(.semibold))
                .foregroundStyle(NorthstarTheme.mutedText)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .overlay {
                    RoundedRectangle(cornerRadius: 5, style: .continuous)
                        .stroke(Color.nsBorder, lineWidth: 1)
                }
            SparklineView(values: sparkline, color: positive ? NorthstarTheme.growth : NorthstarTheme.risk)
                .frame(width: 82, height: 30)
            ChangePill(text: CurrencyFormatters.percent(holding.unrealizedReturn), positive: positive)
            Text(CurrencyFormatters.price(holding.marketPrice, currencyCode: currency))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(NorthstarTheme.primaryText)
                .monospacedDigit()
                .frame(width: 86, alignment: .trailing)
        }
    }
}

private struct HoldingPositionCard: View {
    let holding: HoldingSnapshot
    let name: String
    let currency: String
    let share: Double

    private var positive: Bool {
        holding.unrealizedPnL >= 0
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                TickerAvatar(ticker: holding.ticker)

                VStack(alignment: .leading, spacing: 3) {
                    Text(name)
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.primaryText)
                        .lineLimit(1)
                    Text(holding.ticker)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.secondaryText)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 4) {
                    Text(CurrencyFormatters.money(holding.marketValue, currencyCode: currency))
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.primaryText)
                        .monospacedDigit()
                    Text(CurrencyFormatters.percent(share))
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.mutedText)
                }
            }

            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color.nsSecondarySurface)
                    Capsule()
                        .fill(NorthstarTheme.netWorth)
                        .frame(width: max(8, proxy.size.width * share))
                }
            }
            .frame(height: 7)

            HStack(spacing: 16) {
                positionMetric("現價", CurrencyFormatters.price(holding.marketPrice, currencyCode: currency))
                positionMetric("股數", String(format: "%.2f", holding.quantity))
                positionMetric("均價", CurrencyFormatters.price(holding.averageCost, currencyCode: currency))
                Spacer(minLength: 0)
                VStack(alignment: .trailing, spacing: 3) {
                    Text(CurrencyFormatters.signedMoney(holding.unrealizedPnL, currencyCode: currency))
                    Text(CurrencyFormatters.percent(holding.unrealizedReturn))
                }
                .font(.caption.weight(.bold))
                .monospacedDigit()
                .foregroundStyle(positive ? NorthstarTheme.growth : NorthstarTheme.risk)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .northstarCardSurface()
    }

    private func positionMetric(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(NorthstarTheme.secondaryText)
            Text(value)
                .font(.caption.weight(.semibold))
                .foregroundStyle(NorthstarTheme.primaryText)
                .monospacedDigit()
                .lineLimit(1)
        }
    }
}
