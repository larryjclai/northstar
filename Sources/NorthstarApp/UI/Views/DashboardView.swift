import SwiftUI
import SwiftData

struct DashboardView: View {
    let priceStore: PriceStore

    @Query(sort: \PortfolioAsset.ticker) private var assets: [PortfolioAsset]
    @Environment(\.colorScheme) private var colorScheme

    var holdings: [HoldingSnapshot] {
        PortfolioCalculator.holdings(assets: assets, prices: priceStore.prices)
    }

    var summary: PortfolioSummary {
        PortfolioCalculator.summary(from: holdings)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    heroCard
                    benchmarkCard
                    holdingsPreviewCard
                }
                .padding(16)
            }
            .navigationTitle("northstar")
            .background(backgroundColor.ignoresSafeArea())
        }
    }

    private var heroCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("總資產")
                .font(.headline)
                .foregroundStyle(.secondary)
            Text(CurrencyFormatters.money(summary.totalMarketValue))
                .font(.system(size: 36, weight: .bold, design: .rounded))
            HStack(spacing: 8) {
                Text(CurrencyFormatters.signedMoney(summary.totalUnrealizedPnL))
                Text("(\(CurrencyFormatters.percent(summary.totalUnrealizedReturn)))")
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(summary.totalUnrealizedPnL >= 0 ? NorthstarTheme.growth : NorthstarTheme.risk)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(surfaceColor)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(borderColor.opacity(0.4), lineWidth: 1)
        )
    }

    private var benchmarkCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("績效對比")
                .font(.headline)
            ForEach(priceStore.benchmarks.keys.sorted(), id: \.self) { key in
                HStack {
                    Text(key)
                        .font(.subheadline)
                    Spacer()
                    let value = priceStore.benchmarks[key] ?? 0
                    Text(String(format: "%+.2f%%", value))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(value >= 0 ? NorthstarTheme.growth : NorthstarTheme.risk)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(surfaceColor)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(borderColor.opacity(0.35), lineWidth: 1)
        )
    }

    private var holdingsPreviewCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("持倉摘要")
                .font(.headline)
            ForEach(holdings.prefix(3)) { holding in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(holding.ticker)
                            .font(.subheadline.weight(.semibold))
                        Text("均價 \(CurrencyFormatters.money(holding.averageCost))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(CurrencyFormatters.money(holding.marketValue))
                            .font(.subheadline.weight(.semibold))
                        Text(CurrencyFormatters.percent(holding.unrealizedReturn))
                            .font(.caption)
                            .foregroundStyle(holding.unrealizedPnL >= 0 ? NorthstarTheme.growth : NorthstarTheme.risk)
                    }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(surfaceColor)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(borderColor.opacity(0.35), lineWidth: 1)
        )
    }

    private var backgroundColor: Color {
        colorScheme == .dark ? Color(red: 0.07, green: 0.09, blue: 0.10) : Color(red: 0.97, green: 0.98, blue: 0.97)
    }

    private var surfaceColor: Color {
        colorScheme == .dark ? Color(red: 0.10, green: 0.13, blue: 0.15) : .white
    }

    private var borderColor: Color {
        colorScheme == .dark ? Color(red: 0.20, green: 0.25, blue: 0.28) : Color(red: 0.84, green: 0.88, blue: 0.87)
    }
}
