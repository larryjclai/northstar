import Foundation

@MainActor
@Observable
final class FXRateStore {
    private static let storageKey = "northstar.fxRates.v1"

    private(set) var rates: [String: Double] = [:]
    private(set) var rateTimestamps: [String: Date] = [:]
    private(set) var lastUpdated: Date?
    private(set) var lastError: String?
    private(set) var isRefreshing = false

    private let quoteClient: YahooFinanceClient

    init(quoteClient: YahooFinanceClient = YahooFinanceClient()) {
        self.quoteClient = quoteClient
        loadCache()
    }

    static func key(from: String, to: String) -> String {
        "\(from.uppercased())\(to.uppercased())"
    }

    func rate(from: String, to: String) -> Double? {
        let f = from.uppercased()
        let t = to.uppercased()
        if f == t { return 1.0 }

        if let direct = rates[Self.key(from: f, to: t)] {
            return direct
        }
        if let inverse = rates[Self.key(from: t, to: f)], inverse > 0 {
            return 1.0 / inverse
        }
        return nil
    }

    func convert(_ amount: Double, from: String, to: String) -> Double? {
        guard let rate = rate(from: from, to: to) else { return nil }
        return amount * rate
    }

    func timestamp(from: String, to: String) -> Date? {
        rateTimestamps[Self.key(from: from, to: to)]
            ?? rateTimestamps[Self.key(from: to, to: from)]
    }

    func refresh(currencies: [String], base: String, force: Bool = false) async {
        let normalizedBase = base.uppercased()
        let unique = Set(currencies.map { $0.uppercased() })
            .filter { $0 != normalizedBase && $0.isEmpty == false }

        guard unique.isEmpty == false else { return }

        if force == false,
           let lastUpdated,
           Date().timeIntervalSince(lastUpdated) < 300,
           unique.allSatisfy({ rates[Self.key(from: $0, to: normalizedBase)] != nil }) {
            return
        }

        isRefreshing = true
        defer { isRefreshing = false }

        let symbols = unique.map { "\($0)\(normalizedBase)=X" }

        do {
            let data = try await quoteClient.fetchMarketData(symbols: symbols)
            var missing: [String] = []

            for currency in unique {
                let pairKey = Self.key(from: currency, to: normalizedBase)
                let target = pairKey
                let quote = data.quotes.first(where: { quote in
                    let cleaned = quote.symbol.uppercased().replacingOccurrences(of: "=X", with: "")
                    return cleaned == target
                })

                if let quote, quote.regularMarketPrice > 0 {
                    rates[pairKey] = quote.regularMarketPrice
                    rateTimestamps[pairKey] = Date()
                } else {
                    missing.append(currency)
                }
            }

            lastUpdated = Date()
            saveCache()
            lastError = missing.isEmpty
                ? nil
                : "部分匯率無法更新（\(missing.joined(separator: ", "))），仍顯示最近成功的快取。"
        } catch {
            lastError = "匯率更新失敗：\(error.localizedDescription)"
        }
    }

    private struct CachedRate: Codable {
        let pair: String
        let rate: Double
        let timestamp: Date
    }

    private func loadCache() {
        guard let data = UserDefaults.standard.data(forKey: Self.storageKey),
              let cached = try? JSONDecoder().decode([CachedRate].self, from: data) else {
            return
        }
        for entry in cached where entry.rate > 0 {
            rates[entry.pair] = entry.rate
            rateTimestamps[entry.pair] = entry.timestamp
        }
    }

    private func saveCache() {
        let entries = rates.map { pair, rate in
            CachedRate(pair: pair, rate: rate, timestamp: rateTimestamps[pair] ?? Date())
        }
        if let data = try? JSONEncoder().encode(entries) {
            UserDefaults.standard.set(data, forKey: Self.storageKey)
        }
    }
}
