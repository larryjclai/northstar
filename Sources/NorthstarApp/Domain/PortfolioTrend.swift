import Foundation

struct PortfolioTrend {
    let values: [Double]
    let dates: [Date]
}

enum PortfolioTrendBuilder {
    /// Build a portfolio value trend by aligning each holding's historical close series by tail.
    /// Quantity is assumed constant (current holdings × historical price) — fine for v1.
    static func build(
        holdings: [HoldingSnapshot],
        sparklines: [String: [Double]],
        sparklineDates: [String: [Date]]
    ) -> PortfolioTrend {
        let series: [(values: [Double], dates: [Date])] = holdings.compactMap { holding in
            guard let closes = sparklines[holding.ticker], closes.isEmpty == false else { return nil }
            let scaled = closes.map { $0 * holding.quantity }
            let dates = sparklineDates[holding.ticker] ?? []
            return (scaled, dates)
        }

        guard series.isEmpty == false else {
            return PortfolioTrend(values: [], dates: [])
        }

        let count = series.map(\.values.count).min() ?? 0
        guard count > 1 else { return PortfolioTrend(values: [], dates: []) }

        let summed: [Double] = (0..<count).map { index in
            series.reduce(0) { total, item in
                total + item.values[item.values.count - count + index]
            }
        }

        // Take dates from the series whose date array length matches `count` if possible.
        let referenceDates: [Date] = {
            for item in series where item.dates.count >= count {
                return Array(item.dates.suffix(count))
            }
            return []
        }()

        return PortfolioTrend(values: summed, dates: referenceDates)
    }

    /// Slice a value/date series by a TimeRange.
    static func slice(values: [Double], dates: [Date], range: TimeRange, now: Date = Date()) -> PortfolioTrend {
        guard values.isEmpty == false else { return PortfolioTrend(values: [], dates: []) }
        let startIndex = range.startIndex(in: dates, totalCount: values.count, now: now)
        let slicedValues = Array(values[startIndex..<values.count])
        let slicedDates = dates.isEmpty ? [] : Array(dates[startIndex..<min(dates.count, values.count)])
        return PortfolioTrend(values: slicedValues, dates: slicedDates)
    }
}
