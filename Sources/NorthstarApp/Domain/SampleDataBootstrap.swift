import SwiftData
import Foundation

enum SampleDataBootstrap {
    static func seedIfNeeded(context: ModelContext) throws {
        var descriptor = FetchDescriptor<PortfolioAsset>()
        descriptor.fetchLimit = 1
        let hasAsset = try context.fetch(descriptor).isEmpty == false
        if hasAsset { return }

        let cashAccount = Account(name: "Bank_A", currency: "TWD", balance: 500_000)
        context.insert(cashAccount)

        let tsmc = PortfolioAsset(ticker: "2330.TW", name: "台積電", currency: "TWD")
        let etf0050 = PortfolioAsset(ticker: "0050.TW", name: "元大台灣50", currency: "TWD")
        let spy = PortfolioAsset(ticker: "SPY", name: "SPDR S&P 500 ETF", currency: "USD")
        context.insert(tsmc)
        context.insert(etf0050)
        context.insert(spy)

        let records: [InvestmentRecord] = [
            InvestmentRecord(date: .now.addingTimeInterval(-86_400 * 40), action: .buy, price: 800, quantity: 100, fee: 20, note: "初始建倉", asset: tsmc, linkedAccount: cashAccount),
            InvestmentRecord(date: .now.addingTimeInterval(-86_400 * 28), action: .buy, price: 162, quantity: 300, fee: 15, note: "ETF 定期投入", asset: etf0050, linkedAccount: cashAccount),
            InvestmentRecord(date: .now.addingTimeInterval(-86_400 * 22), action: .buy, price: 505, quantity: 20, fee: 1.5, note: "美股配置", asset: spy, linkedAccount: cashAccount),
            InvestmentRecord(date: .now.addingTimeInterval(-86_400 * 12), action: .stockDividend, price: 0, quantity: 3, fee: 0, note: "股票股利", asset: tsmc, linkedAccount: cashAccount),
            InvestmentRecord(date: .now.addingTimeInterval(-86_400 * 8), action: .cashDividend, price: 2.8, quantity: 100, fee: 0, note: "現金股利", asset: etf0050, linkedAccount: cashAccount)
        ]

        for record in records {
            context.insert(record)
        }

        PortfolioCalculator.apply(records: tsmc.records, to: tsmc)
        PortfolioCalculator.apply(records: etf0050.records, to: etf0050)
        PortfolioCalculator.apply(records: spy.records, to: spy)

        try context.save()
    }
}
