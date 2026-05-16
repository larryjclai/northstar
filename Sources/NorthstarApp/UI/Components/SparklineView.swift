import SwiftUI

struct SparklineView: View {
    let values: [Double]
    let color: Color
    var comparison: [Double] = []
    var comparisonColor: Color = NorthstarTheme.mutedText
    var comparisonLabel: String? = nil

    var body: some View {
        GeometryReader { proxy in
            if values.count > 1 {
                let primaryNormalized = normalize(values)
                let comparisonNormalized: [Double] = comparison.count > 1
                    ? rebase(comparison, toCount: primaryNormalized.count)
                    : []

                let combined = primaryNormalized + comparisonNormalized
                let minValue = combined.min() ?? 0
                let maxValue = combined.max() ?? 0
                let range = max(maxValue - minValue, 0.0001)

                let primaryPoints = points(for: primaryNormalized, in: proxy.size, min: minValue, range: range)
                let comparisonPoints = points(for: comparisonNormalized, in: proxy.size, min: minValue, range: range)

                ZStack(alignment: .topLeading) {
                    areaPath(points: primaryPoints, size: proxy.size)
                        .fill(
                            LinearGradient(
                                colors: [color.opacity(0.22), color.opacity(0.02)],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )

                    if comparisonPoints.isEmpty == false {
                        linePath(points: comparisonPoints)
                            .stroke(
                                comparisonColor,
                                style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round, dash: [4, 4])
                            )
                    }

                    linePath(points: primaryPoints)
                        .stroke(color, style: StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))

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
            } else {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Color.nsSecondarySurface)
                    .overlay {
                        Text("等待走勢")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
            }
        }
    }

    private func normalize(_ series: [Double]) -> [Double] {
        guard let first = series.first, abs(first) > 0.000001 else { return series }
        return series.map { $0 / first }
    }

    private func rebase(_ series: [Double], toCount count: Int) -> [Double] {
        let tail = Array(series.suffix(count))
        guard let first = tail.first, abs(first) > 0.000001 else { return tail }
        return tail.map { $0 / first }
    }

    private func points(for series: [Double], in size: CGSize, min minValue: Double, range: Double) -> [CGPoint] {
        guard series.count > 1 else { return [] }
        let step = size.width / CGFloat(series.count - 1)
        return series.enumerated().map { index, value in
            let x = CGFloat(index) * step
            let y = size.height - (CGFloat((value - minValue) / range) * size.height)
            return CGPoint(x: x, y: y)
        }
    }

    private func linePath(points: [CGPoint]) -> Path {
        Path { path in
            guard let first = points.first else { return }
            path.move(to: first)
            for point in points.dropFirst() {
                path.addLine(to: point)
            }
        }
    }

    private func areaPath(points: [CGPoint], size: CGSize) -> Path {
        Path { path in
            guard let first = points.first, let last = points.last else { return }
            path.move(to: CGPoint(x: first.x, y: size.height))
            path.addLine(to: first)
            for point in points.dropFirst() {
                path.addLine(to: point)
            }
            path.addLine(to: CGPoint(x: last.x, y: size.height))
            path.closeSubpath()
        }
    }
}
