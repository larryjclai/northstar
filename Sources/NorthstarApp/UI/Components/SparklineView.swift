import SwiftUI
import Charts

struct SparklineView: View {
    let values: [Double]
    let color: Color
    var comparison: [Double] = []
    var comparisonColor: Color = NorthstarTheme.mutedText
    var comparisonLabel: String? = nil
    var interactive: Bool = false

    @State private var selectedIndex: Int? = nil

    var body: some View {
        if values.count > 1 {
            chart
        } else {
            placeholder
        }
    }

    // MARK: - Chart

    private var chart: some View {
        let primaryPoints = values.enumerated().map { Point(index: $0.offset, value: $0.element, series: .primary) }
        let scaledComparison = rebasedComparison()
        let comparisonPoints = scaledComparison.enumerated().map { Point(index: $0.offset, value: $0.element, series: .comparison) }
        let combined = primaryPoints + comparisonPoints
        let minY = combined.map(\.value).min() ?? 0
        let maxY = combined.map(\.value).max() ?? 0
        let padding = max((maxY - minY) * 0.08, 0.0001)

        return Chart {
            ForEach(primaryPoints) { point in
                AreaMark(
                    x: .value("Index", point.index),
                    yStart: .value("Floor", minY - padding),
                    yEnd: .value("Value", point.value)
                )
                .foregroundStyle(
                    LinearGradient(
                        colors: [color.opacity(0.22), color.opacity(0.02)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                LineMark(
                    x: .value("Index", point.index),
                    y: .value("Value", point.value)
                )
                .foregroundStyle(color)
                .lineStyle(StrokeStyle(lineWidth: interactive ? 2.5 : 3, lineCap: .round, lineJoin: .round))
                .interpolationMethod(.monotone)
            }

            if comparisonPoints.isEmpty == false {
                ForEach(comparisonPoints) { point in
                    LineMark(
                        x: .value("Index", point.index),
                        y: .value("Comparison", point.value)
                    )
                    .foregroundStyle(comparisonColor)
                    .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round, dash: [4, 4]))
                    .interpolationMethod(.monotone)
                }
            }

            if interactive, let selectedIndex, selectedIndex < values.count {
                RuleMark(x: .value("Selected", selectedIndex))
                    .foregroundStyle(NorthstarTheme.mutedText.opacity(0.5))
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
                PointMark(
                    x: .value("Selected", selectedIndex),
                    y: .value("Value", values[selectedIndex])
                )
                .foregroundStyle(color)
                .symbolSize(70)
            }
        }
        .chartYScale(domain: (minY - padding)...(maxY + padding))
        .chartXAxis(interactive ? .automatic : .hidden)
        .chartYAxis(interactive ? .automatic : .hidden)
        .chartPlotStyle { plot in
            plot.frame(maxWidth: .infinity)
        }
        .chartOverlay { proxy in
            if interactive {
                GeometryReader { geo in
                    Rectangle()
                        .fill(Color.clear)
                        .contentShape(Rectangle())
                        .gesture(
                            DragGesture(minimumDistance: 0)
                                .onChanged { value in
                                    updateSelection(at: value.location, proxy: proxy, geo: geo)
                                }
                                .onEnded { _ in
                                    selectedIndex = nil
                                }
                        )
                }
            }
        }
        .overlay(alignment: .topLeading) {
            if let comparisonLabel, comparisonPoints.isEmpty == false {
                HStack(spacing: 6) {
                    Capsule()
                        .fill(comparisonColor)
                        .frame(width: 16, height: 2)
                    Text(comparisonLabel)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(comparisonColor)
                }
                .padding(6)
            }
        }
        .overlay(alignment: .topTrailing) {
            if interactive, let selectedIndex, selectedIndex < values.count {
                Text(quickFormat(values[selectedIndex]))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(NorthstarTheme.primaryText)
                    .monospacedDigit()
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .fill(Color.nsSecondarySurface.opacity(0.9))
                    )
                    .padding(6)
            }
        }
    }

    private var placeholder: some View {
        RoundedRectangle(cornerRadius: 8, style: .continuous)
            .fill(Color.nsSecondarySurface)
            .overlay {
                Text("等待走勢")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
    }

    // MARK: - Helpers

    private struct Point: Identifiable {
        enum Series { case primary, comparison }
        let index: Int
        let value: Double
        let series: Series
        var id: String { "\(series)-\(index)" }
    }

    private func rebasedComparison() -> [Double] {
        guard comparison.count > 1, let first = values.first, let cFirst = comparison.first,
              abs(cFirst) > 0.000001 else { return [] }
        let tail = Array(comparison.suffix(values.count))
        guard let tailFirst = tail.first, abs(tailFirst) > 0.000001 else { return [] }
        let scale = first / tailFirst
        return tail.map { $0 * scale }
    }

    private func updateSelection(at location: CGPoint, proxy: ChartProxy, geo: GeometryProxy) {
        let origin = geo[proxy.plotAreaFrame].origin
        let plotX = location.x - origin.x
        guard let index: Int = proxy.value(atX: plotX) else { return }
        let clamped = max(0, min(values.count - 1, index))
        selectedIndex = clamped
    }

    private func quickFormat(_ value: Double) -> String {
        let abs = Swift.abs(value)
        if abs >= 1_000_000 {
            return String(format: "%.2fM", value / 1_000_000)
        } else if abs >= 1_000 {
            return String(format: "%.2fK", value / 1_000)
        } else if abs >= 1 {
            return String(format: "%.2f", value)
        } else {
            return String(format: "%.4f", value)
        }
    }
}
