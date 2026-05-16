import SwiftUI

struct TickerAvatar: View {
    let ticker: String

    var body: some View {
        ZStack {
            Circle()
                .fill(NorthstarTheme.accent.opacity(0.18))
            Text(String(ticker.prefix(1)))
                .font(.headline.bold())
                .foregroundStyle(NorthstarTheme.accent)
        }
        .frame(width: 40, height: 40)
    }
}
