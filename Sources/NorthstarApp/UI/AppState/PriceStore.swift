import Foundation

@Observable
final class PriceStore {
    var prices: [String: Double] = [
        "2330.TW": 865,
        "0050.TW": 172,
        "SPY": 518
    ]

    var benchmarks: [String: Double] = [
        "0050.TW": 12.4,
        "SPY": 8.7
    ]
}
