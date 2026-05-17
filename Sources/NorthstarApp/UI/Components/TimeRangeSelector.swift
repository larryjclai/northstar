import SwiftUI

struct TimeRangeSelector: View {
    @Binding var selected: TimeRange

    var body: some View {
        VStack(spacing: 6) {
            HStack(spacing: 8) {
                ForEach(TimeRange.allCases) { range in
                    Button {
                        selected = range
                    } label: {
                        Text(range.label)
                            .font(.caption.weight(.bold))
                            .foregroundStyle(range == selected ? NorthstarTheme.primaryText : NorthstarTheme.mutedText)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background {
                                if range == selected {
                                    Capsule().fill(NorthstarTheme.accent.opacity(0.28))
                                }
                            }
                    }
                    .buttonStyle(.plain)
                }
            }
            .frame(maxWidth: .infinity)

            if selected == .all {
                Label("目前以 Yahoo 1 年 history 為上限", systemImage: "info.circle")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(NorthstarTheme.mutedText)
                    .frame(maxWidth: .infinity)
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.18), value: selected)
    }
}
