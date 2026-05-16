import SwiftUI

struct CSVImportPreviewView: View {
    let rows: [InvestmentCSVRow]
    let onCancel: () -> Void
    let onConfirm: () -> Void

    private var newCount: Int {
        rows.filter { if case .new = $0.status { return true } else { return false } }.count
    }

    private var duplicateCount: Int {
        rows.filter { $0.status == .duplicate }.count
    }

    private var errorCount: Int {
        rows.filter { if case .invalid = $0.status { return true } else { return false } }.count
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    summaryCard
                    if rows.isEmpty {
                        emptyState
                    } else {
                        ForEach(rows) { row in
                            CSVRowCard(row: row)
                        }
                    }
                }
                .padding(20)
            }
            .northstarScreenBackground()
            .navigationTitle("匯入預覽")
            .platformLargeNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消", action: onCancel)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("確認匯入", action: onConfirm)
                        .disabled(newCount == 0)
                }
            }
        }
    }

    private var summaryCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("CSV 匯入")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.secondaryText)
                    Text("\(rows.count) 筆紀錄")
                        .font(.system(size: 28, weight: .semibold))
                        .foregroundStyle(NorthstarTheme.primaryText)
                        .monospacedDigit()
                }
                Spacer()
                Image(systemName: "tray.and.arrow.down.fill")
                    .font(.title2)
                    .foregroundStyle(NorthstarTheme.netWorth)
            }

            HStack(spacing: 18) {
                summaryStat(label: "將新增", value: "\(newCount)", color: NorthstarTheme.growth)
                summaryStat(label: "跳過重複", value: "\(duplicateCount)", color: NorthstarTheme.mutedText)
                summaryStat(label: "錯誤", value: "\(errorCount)", color: NorthstarTheme.risk)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .northstarCardSurface()
    }

    private func summaryStat(label: String, value: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundStyle(NorthstarTheme.secondaryText)
            Text(value)
                .font(.title3.weight(.bold))
                .foregroundStyle(color)
                .monospacedDigit()
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("找不到任何資料列")
                .font(.headline)
                .foregroundStyle(NorthstarTheme.primaryText)
            Text("請確認檔案至少有一筆 Date / Ticker / Action / Price / Quantity 的紀錄。")
                .font(.subheadline)
                .foregroundStyle(NorthstarTheme.secondaryText)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .northstarCardSurface()
    }
}

private struct CSVRowCard: View {
    let row: InvestmentCSVRow

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(row.ticker.isEmpty ? "—" : row.ticker)
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.primaryText)
                    Text(row.name.isEmpty ? "未命名" : row.name)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.secondaryText)
                        .lineLimit(1)
                }

                Spacer()

                StatusPill(status: row.status)
            }

            HStack(spacing: 14) {
                metric("日期", row.date.map { CSVText.format($0) } ?? "—")
                metric("動作", row.action?.displayTitle ?? "—")
                metric("數量", String(format: "%.2f", row.quantity))
                metric("單價", CurrencyFormatters.price(row.price, currencyCode: row.currency))
                Spacer(minLength: 0)
            }

            if case .invalid(let reason) = row.status {
                Label(reason, systemImage: "exclamationmark.triangle.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(NorthstarTheme.risk)
            }

            if row.linkedAccountName.isEmpty == false || row.note.isEmpty == false {
                HStack(spacing: 8) {
                    if row.linkedAccountName.isEmpty == false {
                        Label(row.linkedAccountName, systemImage: "creditcard")
                    }
                    if row.note.isEmpty == false {
                        Label(row.note, systemImage: "note.text")
                    }
                }
                .font(.caption.weight(.semibold))
                .foregroundStyle(NorthstarTheme.mutedText)
                .lineLimit(1)
            }

            Text("第 \(row.lineNumber) 行")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(NorthstarTheme.mutedText)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .northstarCardSurface()
    }

    private func metric(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(NorthstarTheme.secondaryText)
            Text(value)
                .font(.caption.weight(.semibold))
                .foregroundStyle(NorthstarTheme.primaryText)
                .monospacedDigit()
                .lineLimit(1)
        }
    }
}

private struct StatusPill: View {
    let status: InvestmentCSVRow.Status

    private var label: String {
        switch status {
        case .new: return "新增"
        case .duplicate: return "重複"
        case .invalid: return "錯誤"
        }
    }

    private var color: Color {
        switch status {
        case .new: return NorthstarTheme.growth
        case .duplicate: return NorthstarTheme.mutedText
        case .invalid: return NorthstarTheme.risk
        }
    }

    var body: some View {
        Text(label)
            .font(.caption.weight(.bold))
            .foregroundStyle(color)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(color.opacity(0.16), in: Capsule())
    }
}
