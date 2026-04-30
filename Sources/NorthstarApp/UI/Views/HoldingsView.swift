import SwiftUI
import SwiftData

struct HoldingsView: View {
    let priceStore: PriceStore

    @Query(sort: \PortfolioAsset.ticker) private var assets: [PortfolioAsset]

    var body: some View {
        NavigationStack {
            List {
                ForEach(PortfolioCalculator.holdings(assets: assets, prices: priceStore.prices)) { holding in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(holding.ticker)
                                .font(.headline)
                            Spacer()
                            Text(CurrencyFormatters.money(holding.marketValue))
                                .font(.headline)
                        }
                        HStack {
                            Text("股數 \(holding.quantity, specifier: "%.2f")")
                            Spacer()
                            Text("均價 \(CurrencyFormatters.money(holding.averageCost))")
                        }
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        HStack {
                            Text(CurrencyFormatters.signedMoney(holding.unrealizedPnL))
                            Text("(\(CurrencyFormatters.percent(holding.unrealizedReturn)))")
                        }
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(holding.unrealizedPnL >= 0 ? NorthstarTheme.growth : NorthstarTheme.risk)
                    }
                    .padding(.vertical, 4)
                }
            }
            .navigationTitle("持倉")
        }
    }
}
