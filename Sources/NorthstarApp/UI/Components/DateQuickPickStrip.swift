import SwiftUI

/// Horizontal chip strip of common dates shown above a DatePicker.
/// Each chip writes a calendar-resolved date into the binding when tapped, and the chip
/// matching the current selection highlights.
struct DateQuickPickStrip: View {
    @Binding var date: Date

    private static let calendar: Calendar = {
        var cal = Calendar(identifier: .gregorian)
        cal.firstWeekday = 2  // Monday — matches Taiwan workweek convention
        return cal
    }()

    private var options: [Option] {
        Self.computeOptions(now: Date())
    }

    static func computeOptions(now: Date) -> [Option] {
        let cal = calendar
        let today = cal.startOfDay(for: now)
        let yesterday = cal.date(byAdding: .day, value: -1, to: today) ?? today

        let weekdayComponents = cal.dateComponents([.yearForWeekOfYear, .weekOfYear], from: today)
        let monday = cal.date(from: weekdayComponents) ?? today

        let monthStart = cal.date(from: cal.dateComponents([.year, .month], from: today)) ?? today
        let lastMonthEnd = cal.date(byAdding: .day, value: -1, to: monthStart) ?? today

        return [
            Option(id: "today", title: "今天", date: today),
            Option(id: "yesterday", title: "昨天", date: yesterday),
            Option(id: "monday", title: "本週一", date: monday),
            Option(id: "lastMonthEnd", title: "上月底", date: lastMonthEnd)
        ]
    }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(options) { option in
                    chip(option)
                }
            }
            .padding(.vertical, 2)
        }
    }

    private func chip(_ option: Option) -> some View {
        let isSelected = isSame(option.date, date)
        return Button {
            date = option.date
        } label: {
            Text(option.title)
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .foregroundStyle(isSelected ? Color.nsBackground : NorthstarTheme.primaryText)
                .background {
                    Capsule(style: .continuous)
                        .fill(isSelected ? NorthstarTheme.accent : NorthstarTheme.accent.opacity(0.10))
                }
        }
        .buttonStyle(.plain)
    }

    private func isSame(_ lhs: Date, _ rhs: Date) -> Bool {
        Self.calendar.isDate(lhs, inSameDayAs: rhs)
    }

    struct Option: Identifiable {
        let id: String
        let title: String
        let date: Date
    }
}
