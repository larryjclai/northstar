import SwiftUI
import SwiftData

struct HoldingDetailView: View {
    let ticker: String
    let priceStore: PriceStore
    let fxStore: FXRateStore

    @AppStorage(IntentRoutingKeys.baseCurrency) private var baseCurrency: String = BaseCurrencyDefaults.default
    @Query(sort: \PortfolioAsset.ticker) private var assets: [PortfolioAsset]
    @Query(sort: \InvestmentRecord.date, order: .reverse) private var allRecords: [InvestmentRecord]

    @AppStorage(IntentRoutingKeys.holdingDetailTimeRange) private var selectedRange: TimeRange = .threeMonth
    @State private var editingRecord: InvestmentRecord?

    private var asset: PortfolioAsset? {
        assets.first(where: { $0.ticker == ticker })
    }

    private var records: [InvestmentRecord] {
        allRecords.filter { $0.asset?.ticker == ticker }
    }

    private var snapshot: HoldingSnapshot? {
        guard let asset, asset.totalQuantity > 0 else { return nil }
        let marketPrice = priceStore.prices[ticker] ?? asset.averageCost
        let marketValue = marketPrice * asset.totalQuantity
        let costBasis = asset.averageCost * asset.totalQuantity
        let unrealizedPnL = marketValue - costBasis
        let returnRate = costBasis == 0 ? 0 : unrealizedPnL / costBasis
        return HoldingSnapshot(
            id: ticker,
            ticker: ticker,
            quantity: asset.totalQuantity,
            averageCost: asset.averageCost,
            marketPrice: marketPrice,
            marketValue: marketValue,
            costBasis: costBasis,
            unrealizedPnL: unrealizedPnL,
            unrealizedReturn: returnRate
        )
    }

    private var nativeCurrency: String {
        priceStore.quote(for: ticker)?.currency ?? asset?.currency ?? "TWD"
    }

    private var displayName: String {
        priceStore.quote(for: ticker)?.name ?? asset?.name ?? ticker
    }

    private var slicedSparkline: [Double] {
        let closes = priceStore.sparklines[ticker] ?? []
        let dates = priceStore.sparklineDates[ticker] ?? []
        let sliced = PortfolioTrendBuilder.slice(values: closes, dates: dates, range: selectedRange)
        return sliced.values
    }

    private var realized: RealizedSummary {
        PortfolioCalculator.realized(records: records)
    }

    private var totalInvested: Double {
        records
            .filter { $0.action == .buy }
            .reduce(0.0) { running, record in
                running + record.price * record.quantity + record.fee
            }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 18) {
                heroCard
                positionMetrics
                transactionsSection
            }
            .padding(20)
        }
        .northstarScreenBackground()
        .navigationTitle(displayName)
        .platformInlineNavigationTitle()
        .toolbar {
            ToolbarItem {
                Button {
                    Task {
                        await priceStore.refresh(tickers: [ticker], force: true)
                    }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .disabled(priceStore.isRefreshing)
                .accessibilityLabel("更新報價")
            }
        }
        .sheet(item: $editingRecord) { record in
            InvestmentRecordEditorView(editing: record, assets: assets, accounts: linkedAccountsForEditor)
        }
    }

    private var linkedAccountsForEditor: [Account] {
        var seen = Set<UUID>()
        var ordered: [Account] = []
        for record in records {
            if let account = record.linkedAccount, seen.insert(account.id).inserted {
                ordered.append(account)
            }
        }
        return ordered
    }

    private var heroCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                TickerAvatar(ticker: ticker)
                VStack(alignment: .leading, spacing: 3) {
                    Text(ticker)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(NorthstarTheme.mutedText)
                    Text(displayName)
                        .font(.title2.weight(.bold))
                        .foregroundStyle(NorthstarTheme.primaryText)
                        .lineLimit(2)
                }
                Spacer()
                if let snapshot {
                    ChangePill(
                        text: CurrencyFormatters.percent(snapshot.unrealizedReturn),
                        positive: snapshot.unrealizedPnL >= 0
                    )
                }
            }

            HStack(alignment: .firstTextBaseline) {
                if let snapshot {
                    Text(CurrencyFormatters.money(snapshot.marketValue, currencyCode: nativeCurrency))
                        .font(.system(size: 32, weight: .bold))
                        .foregroundStyle(NorthstarTheme.primaryText)
                        .monospacedDigit()
                } else {
                    Text("無持倉")
                        .font(.system(size: 24, weight: .semibold))
                        .foregroundStyle(NorthstarTheme.secondaryText)
                }
                Spacer()
                if let snapshot {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("未實現損益")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(NorthstarTheme.secondaryText)
                        Text(CurrencyFormatters.signedMoney(snapshot.unrealizedPnL, currencyCode: nativeCurrency))
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(snapshot.unrealizedPnL >= 0 ? NorthstarTheme.growth : NorthstarTheme.risk)
                            .monospacedDigit()
                    }
                }
            }

            SparklineView(
                values: slicedSparkline,
                color: (snapshot?.unrealizedPnL ?? 0) >= 0 ? NorthstarTheme.growth : NorthstarTheme.risk,
                interactive: true
            )
            .frame(height: 134)

            TimeRangeSelector(selected: $selectedRange)

            if let updated = priceStore.quote(for: ticker)?.regularMarketTime {
                Text("Updated \(updated.formatted(date: .abbreviated, time: .shortened))")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(NorthstarTheme.mutedText)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .northstarCardSurface()
    }

    private var positionMetrics: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("部位")
                .font(.headline.weight(.bold))
                .foregroundStyle(NorthstarTheme.primaryText)

            VStack(alignment: .leading, spacing: 10) {
                metricRow("現價", CurrencyFormatters.price(snapshot?.marketPrice ?? asset?.averageCost ?? 0, currencyCode: nativeCurrency))
                metricRow("均價", CurrencyFormatters.price(asset?.averageCost ?? 0, currencyCode: nativeCurrency))
                metricRow("持有股數", String(format: "%.4f", asset?.totalQuantity ?? 0))
                metricRow("成本", CurrencyFormatters.money(snapshot?.costBasis ?? 0, currencyCode: nativeCurrency))
                metricRow("市值", CurrencyFormatters.money(snapshot?.marketValue ?? 0, currencyCode: nativeCurrency))
                Divider().overlay(Color.nsBorder)
                metricRow("累積買入", CurrencyFormatters.money(totalInvested, currencyCode: nativeCurrency))
                let r = realized
                metricRow("已實現賣出損益",
                          CurrencyFormatters.signedMoney(r.realizedFromSales, currencyCode: nativeCurrency),
                          tint: r.realizedFromSales >= 0 ? NorthstarTheme.growth : NorthstarTheme.risk)
                metricRow("股利收入",
                          CurrencyFormatters.signedMoney(r.dividendIncome, currencyCode: nativeCurrency),
                          tint: r.dividendIncome >= 0 ? NorthstarTheme.growth : NorthstarTheme.risk)
                metricRow("已實現合計",
                          CurrencyFormatters.signedMoney(r.total, currencyCode: nativeCurrency),
                          tint: r.total >= 0 ? NorthstarTheme.growth : NorthstarTheme.risk)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .northstarCardSurface()
    }

    private func metricRow(_ label: String, _ value: String, tint: Color = NorthstarTheme.primaryText) -> some View {
        HStack {
            Text(label)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(NorthstarTheme.secondaryText)
            Spacer()
            Text(value)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(tint)
                .monospacedDigit()
        }
    }

    private var transactionsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("交易紀錄（\(records.count)）")
                .font(.headline.weight(.bold))
                .foregroundStyle(NorthstarTheme.primaryText)

            if records.isEmpty {
                Text("還沒有交易紀錄。")
                    .font(.subheadline)
                    .foregroundStyle(NorthstarTheme.secondaryText)
                    .padding(.vertical, 8)
            } else {
                ForEach(records) { record in
                    Button {
                        editingRecord = record
                    } label: {
                        HoldingTransactionRow(record: record, currency: nativeCurrency)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .northstarCardSurface()
    }
}

private struct HoldingTransactionRow: View {
    let record: InvestmentRecord
    let currency: String

    private var gross: Double {
        record.price * record.quantity
    }

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(record.action.tint.opacity(0.16))
                Image(systemName: record.action.symbolName)
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(record.action.tint)
            }
            .frame(width: 38, height: 38)

            VStack(alignment: .leading, spacing: 3) {
                Text(record.action.displayTitle)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(NorthstarTheme.primaryText)
                Text(record.date.formatted(date: .abbreviated, time: .omitted))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(NorthstarTheme.secondaryText)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 3) {
                Text("\(String(format: "%.2f", record.quantity)) × \(CurrencyFormatters.price(record.price, currencyCode: currency))")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(NorthstarTheme.secondaryText)
                    .monospacedDigit()
                Text(CurrencyFormatters.money(gross, currencyCode: currency))
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(NorthstarTheme.primaryText)
                    .monospacedDigit()
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(Color.nsBorder, lineWidth: 1)
        }
    }
}

