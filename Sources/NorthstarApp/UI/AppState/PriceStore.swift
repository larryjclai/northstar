import Foundation

struct MarketQuote: Identifiable, Equatable, Sendable {
    var id: String { symbol }

    let symbol: String
    let name: String
    let currency: String
    let regularMarketPrice: Double
    let regularMarketChange: Double
    let regularMarketChangePercent: Double
    let regularMarketTime: Date?
}

@MainActor
@Observable
final class PriceStore {
    var prices: [String: Double] = [:]
    var quotes: [String: MarketQuote] = [:]
    var sparklines: [String: [Double]] = [:]
    var benchmarks: [String: Double] = [:]
    var isRefreshing = false
    var lastUpdated: Date?
    var lastError: String?

    private let quoteClient: YahooFinanceClient

    init(quoteClient: YahooFinanceClient = YahooFinanceClient()) {
        self.quoteClient = quoteClient
    }

    func quote(for ticker: String) -> MarketQuote? {
        quotes[Self.normalized(ticker)]
    }

    func refresh(tickers: [String], force: Bool = false) async {
        let symbols = Self.normalizedSymbols(tickers)
        guard symbols.isEmpty == false else { return }

        if force == false,
           let lastUpdated,
           Date().timeIntervalSince(lastUpdated) < 60,
           Set(symbols).isSubset(of: Set(quotes.keys)) {
            return
        }

        isRefreshing = true
        lastError = nil
        defer { isRefreshing = false }

        do {
            let marketData = try await quoteClient.fetchMarketData(symbols: symbols)
            var nextQuotes = quotes
            var nextPrices = prices
            var nextBenchmarks = benchmarks
            var nextSparklines = sparklines

            for quote in marketData.quotes {
                nextQuotes[quote.symbol] = quote
                nextPrices[quote.symbol] = quote.regularMarketPrice
                nextBenchmarks[quote.symbol] = quote.regularMarketChangePercent
            }

            for (symbol, points) in marketData.sparklines where points.isEmpty == false {
                nextSparklines[symbol] = points
            }

            quotes = nextQuotes
            prices = nextPrices
            benchmarks = nextBenchmarks
            sparklines = nextSparklines
            lastUpdated = .now
        } catch {
            lastError = error.localizedDescription
        }
    }

    private static func normalizedSymbols(_ tickers: [String]) -> [String] {
        Array(Set(tickers.map(normalized).filter { $0.isEmpty == false })).sorted()
    }

    private static func normalized(_ ticker: String) -> String {
        ticker.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    }
}

struct YahooMarketData: Sendable {
    let quotes: [MarketQuote]
    let sparklines: [String: [Double]]
}

struct YahooFinanceClient: Sendable {
    func fetchMarketData(symbols: [String]) async throws -> YahooMarketData {
        let chartData = await fetchChartData(symbols: symbols)
        let quotes = chartData.map(\.quote)
        guard quotes.isEmpty == false else {
            throw YahooFinanceError.noQuotes
        }

        return YahooMarketData(
            quotes: quotes,
            sparklines: chartData.reduce(into: [:]) { result, item in
                result[item.quote.symbol] = item.closes
            }
        )
    }

    private func fetchChartData(symbols: [String]) async -> [YahooChartMarketData] {
        await withTaskGroup(of: YahooChartMarketData?.self, returning: [YahooChartMarketData].self) { group in
            for symbol in symbols {
                group.addTask {
                    try? await self.fetchChartData(symbol: symbol)
                }
            }

            var results: [YahooChartMarketData] = []
            for await result in group {
                if let result {
                    results.append(result)
                }
            }
            return results.sorted { $0.quote.symbol < $1.quote.symbol }
        }
    }

    private func fetchChartData(symbol: String) async throws -> YahooChartMarketData {
        let encodedSymbol = symbol.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? symbol
        var components = URLComponents(string: "https://query1.finance.yahoo.com/v8/finance/chart/\(encodedSymbol)")
        components?.queryItems = [
            URLQueryItem(name: "range", value: "1d"),
            URLQueryItem(name: "interval", value: "5m")
        ]

        guard let url = components?.url else {
            throw YahooFinanceError.invalidURL
        }

        let envelope = try await decode(YahooChartEnvelope.self, from: url)
        guard let result = envelope.chart.result?.first else {
            throw YahooFinanceError.noQuote(symbol)
        }

        let closes = result.indicators.quote.first?.close.compactMap { $0 }.filter { $0 > 0 } ?? []
        guard let price = result.meta.regularMarketPrice ?? closes.last else {
            throw YahooFinanceError.noQuote(symbol)
        }

        let previousClose = result.meta.previousClose
            ?? result.meta.chartPreviousClose
            ?? closes.dropLast().last
            ?? price
        let change = price - previousClose
        let changePercent = previousClose == 0 ? 0 : (change / previousClose) * 100
        let quote = MarketQuote(
            symbol: result.meta.symbol ?? symbol,
            name: result.meta.shortName ?? result.meta.longName ?? result.meta.symbol ?? symbol,
            currency: result.meta.currency ?? "USD",
            regularMarketPrice: price,
            regularMarketChange: change,
            regularMarketChangePercent: changePercent,
            regularMarketTime: result.meta.regularMarketTime.map { Date(timeIntervalSince1970: TimeInterval($0)) }
        )

        return YahooChartMarketData(quote: quote, closes: closes)
    }

    private func decode<T: Decodable>(_ type: T.Type, from url: URL) async throws -> T {
        var request = URLRequest(url: url)
        request.timeoutInterval = 12
        request.setValue("Mozilla/5.0", forHTTPHeaderField: "User-Agent")

        let (data, response) = try await URLSession.shared.data(for: request)
        if let httpResponse = response as? HTTPURLResponse,
           (200..<300).contains(httpResponse.statusCode) == false {
            throw YahooFinanceError.httpStatus(httpResponse.statusCode)
        }

        return try JSONDecoder().decode(T.self, from: data)
    }
}

private enum YahooFinanceError: LocalizedError {
    case invalidURL
    case httpStatus(Int)
    case noQuote(String)
    case noQuotes

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Yahoo Finance URL 無效。"
        case .httpStatus(let statusCode):
            return "Yahoo Finance 回傳 HTTP \(statusCode)。"
        case .noQuote(let symbol):
            return "Yahoo Finance 沒有回傳 \(symbol) 的報價。"
        case .noQuotes:
            return "Yahoo Finance 沒有回傳任何可用報價。"
        }
    }
}

private struct YahooChartMarketData: Sendable {
    let quote: MarketQuote
    let closes: [Double]
}

private struct YahooChartEnvelope: Decodable {
    let chart: YahooChartResponse
}

private struct YahooChartResponse: Decodable {
    let result: [YahooChartResult]?
}

private struct YahooChartResult: Decodable {
    let meta: YahooChartMeta
    let indicators: YahooChartIndicators
}

private struct YahooChartMeta: Decodable {
    let currency: String?
    let symbol: String?
    let regularMarketPrice: Double?
    let regularMarketTime: Int?
    let previousClose: Double?
    let chartPreviousClose: Double?
    let shortName: String?
    let longName: String?
}

private struct YahooChartIndicators: Decodable {
    let quote: [YahooChartQuote]
}

private struct YahooChartQuote: Decodable {
    let close: [Double?]
}
