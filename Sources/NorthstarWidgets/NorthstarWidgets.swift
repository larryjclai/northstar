import SwiftUI
import WidgetKit

private struct NorthstarTimelineEntry: TimelineEntry {
    let date: Date
    let snapshot: NativeSurfaceSnapshot
}

private struct NorthstarTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> NorthstarTimelineEntry {
        NorthstarTimelineEntry(date: Date(), snapshot: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (NorthstarTimelineEntry) -> Void) {
        completion(NorthstarTimelineEntry(date: Date(), snapshot: NativeSurfaceSnapshot.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<NorthstarTimelineEntry>) -> Void) {
        let entry = NorthstarTimelineEntry(date: Date(), snapshot: NativeSurfaceSnapshot.load())
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date()
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

struct NetWorthWidget: Widget {
    let kind = "NetWorthWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: NorthstarTimelineProvider()) { entry in
            NetWorthWidgetView(entry: entry)
        }
        .configurationDisplayName("Northstar 淨值")
        .description("快速查看目前淨值。")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct MonthlyCashFlowWidget: Widget {
    let kind = "MonthlyCashFlowWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: NorthstarTimelineProvider()) { entry in
            MonthlyCashFlowWidgetView(entry: entry)
        }
        .configurationDisplayName("本月收支")
        .description("查看本月收入、支出與淨流入。")
        .supportedFamilies([.systemSmall])
    }
}

struct FeaturedHoldingWidget: Widget {
    let kind = "FeaturedHoldingWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: NorthstarTimelineProvider()) { entry in
            FeaturedHoldingWidgetView(entry: entry)
        }
        .configurationDisplayName("單一持股")
        .description("追蹤目前最大持股的市值與報酬率。")
        .supportedFamilies([.systemMedium])
    }
}

@main
struct NorthstarWidgetsBundle: WidgetBundle {
    var body: some Widget {
        NetWorthWidget()
        MonthlyCashFlowWidget()
        FeaturedHoldingWidget()
    }
}

private struct NetWorthWidgetView: View {
    let entry: NorthstarTimelineEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Northstar", systemImage: "paperplane.fill")
                .font(.caption.weight(.bold))
                .foregroundStyle(.secondary)
            Spacer()
            Text("淨值")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(money(entry.snapshot.netWorth.amount, currency: entry.snapshot.netWorth.currency))
                .font(.title2.weight(.bold))
                .minimumScaleFactor(0.72)
                .monospacedDigit()
            updatedText
        }
        .containerBackground(.background, for: .widget)
    }

    private var updatedText: some View {
        Text(entry.snapshot.updatedAt == .distantPast ? "等待資料" : entry.snapshot.updatedAt.formatted(date: .omitted, time: .shortened))
            .font(.caption2.weight(.semibold))
            .foregroundStyle(.secondary)
    }
}

private struct MonthlyCashFlowWidgetView: View {
    let entry: NorthstarTimelineEntry

    var body: some View {
        let cashFlow = entry.snapshot.monthlyCashFlow
        VStack(alignment: .leading, spacing: 7) {
            Text("本月收支")
                .font(.headline.weight(.bold))
            Spacer()
            metric("收入", cashFlow.income, currency: cashFlow.currency, tint: .green)
            metric("支出", cashFlow.expense, currency: cashFlow.currency, tint: .red)
            Divider()
            metric(cashFlow.net >= 0 ? "淨流入" : "淨流出", abs(cashFlow.net), currency: cashFlow.currency, tint: cashFlow.net >= 0 ? .green : .red)
        }
        .containerBackground(.background, for: .widget)
    }

    private func metric(_ label: String, _ value: Double, currency: String, tint: Color) -> some View {
        HStack {
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Spacer()
            Text(money(value, currency: currency))
                .font(.caption.weight(.bold))
                .foregroundStyle(tint)
                .monospacedDigit()
                .minimumScaleFactor(0.78)
        }
    }
}

private struct FeaturedHoldingWidgetView: View {
    let entry: NorthstarTimelineEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("單一持股")
                .font(.caption.weight(.bold))
                .foregroundStyle(.secondary)
            if let holding = entry.snapshot.featuredHolding {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(holding.ticker)
                            .font(.title2.weight(.bold))
                        Text(holding.name)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    Spacer()
                    Text(percent(holding.returnRate))
                        .font(.caption.weight(.bold))
                        .foregroundStyle(holding.returnRate >= 0 ? .green : .red)
                        .monospacedDigit()
                }
                Spacer()
                Text(money(holding.marketValue, currency: holding.currency))
                    .font(.title3.weight(.bold))
                    .monospacedDigit()
                    .minimumScaleFactor(0.78)
            } else {
                Spacer()
                Text("新增持倉後會顯示最大部位")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
            }
        }
        .containerBackground(.background, for: .widget)
    }
}

private func money(_ value: Double, currency: String) -> String {
    let formatter = NumberFormatter()
    formatter.numberStyle = .currency
    formatter.currencyCode = currency
    formatter.maximumFractionDigits = ["TWD", "JPY", "KRW"].contains(currency.uppercased()) ? 0 : 2
    formatter.minimumFractionDigits = formatter.maximumFractionDigits
    return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
}

private func percent(_ value: Double) -> String {
    let formatter = NumberFormatter()
    formatter.numberStyle = .percent
    formatter.maximumFractionDigits = 2
    formatter.minimumFractionDigits = 2
    formatter.positivePrefix = "+"
    return formatter.string(from: NSNumber(value: value)) ?? "0.00%"
}
