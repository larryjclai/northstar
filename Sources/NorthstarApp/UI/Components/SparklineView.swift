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
    @State private var selectedSeries: Point.Series = .primary

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
                if selectedSeries == .comparison, selectedIndex < scaledComparison.count {
                    PointMark(
                        x: .value("Selected", selectedIndex),
                        y: .value("Comparison", scaledComparison[selectedIndex])
                    )
                    .foregroundStyle(comparisonColor)
                    .symbolSize(70)
                } else {
                    PointMark(
                        x: .value("Selected", selectedIndex),
                        y: .value("Value", values[selectedIndex])
                    )
                    .foregroundStyle(color)
                    .symbolSize(70)
                }
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
                                    updateSelection(
                                        at: value.location,
                                        proxy: proxy,
                                        geo: geo,
                                        comparisonValues: scaledComparison
                                    )
                                }
                                .onEnded { _ in
                                    selectedIndex = nil
                                    selectedSeries = .primary
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
            if interactive, let readout = selectedReadout {
                Text(readout.text)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(readout.tint)
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

    private var selectedReadout: (text: String, tint: Color)? {
        guard let selectedIndex, selectedIndex < values.count else { return nil }

        if selectedSeries == .comparison,
           let relativeChange = comparisonRelativeChange(at: selectedIndex) {
            let label = comparisonLabel ?? "Benchmark"
            return ("\(label) \(signedPercent(relativeChange))", comparisonColor)
        }

        return (quickFormat(values[selectedIndex]), NorthstarTheme.primaryText)
    }

    private func rebasedComparison() -> [Double] {
        let tail = comparisonTail()
        guard let first = values.first,
              let tailFirst = tail.first,
              abs(tailFirst) > 0.000001 else { return [] }
        let scale = first / tailFirst
        return tail.map { $0 * scale }
    }

    private func comparisonTail() -> [Double] {
        guard comparison.count > 1, let first = comparison.first, abs(first) > 0.000001 else { return [] }
        let tail = Array(comparison.suffix(values.count))
        guard let tailFirst = tail.first, abs(tailFirst) > 0.000001 else { return [] }
        return tail
    }

    private func comparisonRelativeChange(at index: Int) -> Double? {
        let tail = comparisonTail()
        guard index < tail.count, let first = tail.first, abs(first) > 0.000001 else { return nil }
        return (tail[index] - first) / first
    }

    private func updateSelection(
        at location: CGPoint,
        proxy: ChartProxy,
        geo: GeometryProxy,
        comparisonValues: [Double]
    ) {
        guard let plotFrame = proxy.plotFrame else { return }
        let origin = geo[plotFrame].origin
        let plotX = location.x - origin.x
        guard let index: Int = proxy.value(atX: plotX) else { return }
        let clamped = max(0, min(values.count - 1, index))
        selectedIndex = clamped
        selectedSeries = nearestSeries(
            atY: location.y - origin.y,
            index: clamped,
            proxy: proxy,
            comparisonValues: comparisonValues
        )
    }

    private func nearestSeries(
        atY plotY: CGFloat,
        index: Int,
        proxy: ChartProxy,
        comparisonValues: [Double]
    ) -> Point.Series {
        guard comparisonValues.indices.contains(index),
              let primaryY = proxy.position(forY: values[index]),
              let comparisonY = proxy.position(forY: comparisonValues[index]) else {
            return .primary
        }
        return abs(plotY - comparisonY) < abs(plotY - primaryY) ? .comparison : .primary
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

    private func signedPercent(_ value: Double) -> String {
        let prefix = value >= 0 ? "+" : ""
        return "\(prefix)\(CurrencyFormatters.percent(value))"
    }
}
