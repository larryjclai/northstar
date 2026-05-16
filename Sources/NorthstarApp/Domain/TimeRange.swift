import Foundation

enum TimeRange: String, CaseIterable, Identifiable, Hashable {
    case week = "1W"
    case month = "1M"
    case threeMonth = "3M"
    case ytd = "YTD"
    case year = "1Y"
    case all = "ALL"

    var id: String { rawValue }
    var label: String { rawValue }

    /// Returns the suffix index (inclusive) for a date series that matches this range.
    /// `dates` must be ascending.
    /// If no dates, falls back to a sensible default count.
    func startIndex(in dates: [Date], totalCount: Int, now: Date = Date()) -> Int {
        guard totalCount > 0 else { return 0 }

        // If we have no timestamp metadata, slice by approximate trading-day counts.
        guard dates.isEmpty == false else {
            switch self {
            case .week: return max(0, totalCount - 5)
            case .month: return max(0, totalCount - 22)
            case .threeMonth: return max(0, totalCount - 66)
            case .ytd, .year: return max(0, totalCount - 252)
            case .all: return 0
            }
        }

        let calendar = Calendar(identifier: .gregorian)
        let threshold: Date
        switch self {
        case .week:
            threshold = calendar.date(byAdding: .day, value: -7, to: now) ?? dates.first!
        case .month:
            threshold = calendar.date(byAdding: .month, value: -1, to: now) ?? dates.first!
        case .threeMonth:
            threshold = calendar.date(byAdding: .month, value: -3, to: now) ?? dates.first!
        case .ytd:
            let components = calendar.dateComponents([.year], from: now)
            threshold = calendar.date(from: DateComponents(year: components.year, month: 1, day: 1)) ?? dates.first!
        case .year:
            threshold = calendar.date(byAdding: .year, value: -1, to: now) ?? dates.first!
        case .all:
            return 0
        }

        // Find first index whose date >= threshold.
        if let first = dates.firstIndex(where: { $0 >= threshold }) {
            return min(first, totalCount - 1)
        }
        // No points in range, just return last point.
        return max(0, totalCount - 1)
    }
}
