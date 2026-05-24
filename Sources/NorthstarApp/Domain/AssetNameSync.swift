import Foundation
import SwiftData

@MainActor
enum AssetNameSync {
    static func sync(assets: [PortfolioAsset], quotes: [String: MarketQuote], context: ModelContext) {
        var changed = false
        for asset in assets {
            let key = asset.ticker.uppercased()
            guard let quote = quotes[key] else { continue }
            if let zh = quote.nameZh, zh.isEmpty == false, asset.nameZh != zh {
                asset.nameZh = zh
                changed = true
            }
            if let en = quote.nameEn, en.isEmpty == false, asset.nameEn != en {
                asset.nameEn = en
                changed = true
            }
            if asset.name == asset.ticker, let preferred = quote.nameZh ?? quote.nameEn, asset.name != preferred {
                asset.name = preferred
                changed = true
            }
        }
        if changed { try? context.save() }
    }

    static func resolve(asset: PortfolioAsset?, fallbackTicker: String, preference: String) -> String {
        guard let asset else { return fallbackTicker }
        return asset.localizedName(preference: preference)
    }
}
