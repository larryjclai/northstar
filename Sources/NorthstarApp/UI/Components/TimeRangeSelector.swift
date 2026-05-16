import SwiftUI

struct TimeRangeSelector: View {
    @Binding var selected: TimeRange

    var body: some View {
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
    }
}
