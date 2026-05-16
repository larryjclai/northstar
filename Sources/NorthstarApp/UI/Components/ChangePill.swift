import SwiftUI

struct ChangePill: View {
    let text: String
    let positive: Bool
    var showsArrow = true

    var body: some View {
        HStack(spacing: 5) {
            if showsArrow {
                Image(systemName: positive ? "arrow.up.right" : "arrow.down.right")
                    .font(.caption.bold())
            }
            Text(text)
                .font(.caption.weight(.bold))
                .lineLimit(1)
        }
        .foregroundStyle(positive ? NorthstarTheme.growth : NorthstarTheme.risk)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background((positive ? NorthstarTheme.growth : NorthstarTheme.risk).opacity(0.14), in: Capsule())
    }
}
