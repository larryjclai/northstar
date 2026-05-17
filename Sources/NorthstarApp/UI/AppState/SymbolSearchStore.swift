import Foundation

struct SymbolSuggestion: Identifiable, Hashable, Sendable {
    var id: String { symbol + "|" + exchange }
    let symbol: String
    let name: String
    let exchange: String
    let currency: String?
    let typeLabel: String
}

@MainActor
@Observable
final class SymbolSearchStore {
    var query: String = ""
    var results: [SymbolSuggestion] = []
    var isSearching: Bool = false
    var lastError: String?

    private let client: SymbolSearchClient
    private var task: Task<Void, Never>?

    init(client: SymbolSearchClient = SymbolSearchClient()) {
        self.client = client
    }

    func update(query newValue: String) {
        query = newValue
        let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
        task?.cancel()
        guard trimmed.count >= 1 else {
            results = []
            isSearching = false
            return
        }
        task = Task { [client] in
            try? await Task.sleep(nanoseconds: 250_000_000)
            if Task.isCancelled { return }
            await MainActor.run { self.isSearching = true }
            do {
                let fetched = try await client.search(query: trimmed)
                if Task.isCancelled { return }
                await MainActor.run {
                    self.results = fetched
                    self.isSearching = false
                    self.lastError = nil
                }
            } catch {
                if Task.isCancelled { return }
                await MainActor.run {
                    self.results = []
                    self.isSearching = false
                    self.lastError = error.localizedDescription
                }
            }
        }
    }

    func clear() {
        task?.cancel()
        query = ""
        results = []
        isSearching = false
    }
}

struct SymbolSearchClient: Sendable {
    func search(query: String) async throws -> [SymbolSuggestion] {
        var components = URLComponents(string: "https://query2.finance.yahoo.com/v1/finance/search")
        components?.queryItems = [
            URLQueryItem(name: "q", value: query),
            URLQueryItem(name: "quotesCount", value: "10"),
            URLQueryItem(name: "newsCount", value: "0"),
            URLQueryItem(name: "lang", value: "en-US")
        ]
        guard let url = components?.url else { return [] }

        var request = URLRequest(url: url)
        request.timeoutInterval = 8
        request.setValue("Mozilla/5.0", forHTTPHeaderField: "User-Agent")

        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse,
           (200..<300).contains(http.statusCode) == false {
            return []
        }

        let envelope = try JSONDecoder().decode(YahooSearchEnvelope.self, from: data)
        return envelope.quotes.compactMap { raw in
            guard let symbol = raw.symbol, symbol.isEmpty == false else { return nil }
            let allowed: Set<String> = ["EQUITY", "ETF", "MUTUALFUND", "INDEX", "CRYPTOCURRENCY", "CURRENCY"]
            if let t = raw.quoteType?.uppercased(), allowed.contains(t) == false { return nil }
            return SymbolSuggestion(
                symbol: symbol,
                name: raw.longname ?? raw.shortname ?? symbol,
                exchange: raw.exchDisp ?? raw.exchange ?? "—",
                currency: nil,
                typeLabel: raw.typeDisp ?? raw.quoteType ?? ""
            )
        }
    }
}

private struct YahooSearchEnvelope: Decodable {
    let quotes: [YahooSearchQuote]
}

private struct YahooSearchQuote: Decodable {
    let symbol: String?
    let shortname: String?
    let longname: String?
    let exchange: String?
    let exchDisp: String?
    let quoteType: String?
    let typeDisp: String?
}
