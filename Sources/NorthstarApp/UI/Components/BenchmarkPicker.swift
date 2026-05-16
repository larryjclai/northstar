import SwiftUI

struct BenchmarkPicker: View {
    let options: [String]
    @Binding var selection: String?

    var body: some View {
        HStack(spacing: 8) {
            Text("BENCHMARK")
                .font(.caption2.weight(.bold))
                .foregroundStyle(NorthstarTheme.mutedText)

            Button {
                selection = nil
            } label: {
                Text("None")
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background {
                        Capsule()
                            .fill(selection == nil ? NorthstarTheme.accent.opacity(0.28) : Color.nsSecondarySurface)
                    }
                    .foregroundStyle(selection == nil ? NorthstarTheme.primaryText : NorthstarTheme.mutedText)
            }
            .buttonStyle(.plain)

            ForEach(options, id: \.self) { symbol in
                Button {
                    selection = symbol
                } label: {
                    Text(symbol)
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background {
                            Capsule()
                                .fill(selection == symbol ? NorthstarTheme.accent.opacity(0.28) : Color.nsSecondarySurface)
                        }
                        .foregroundStyle(selection == symbol ? NorthstarTheme.primaryText : NorthstarTheme.mutedText)
                }
                .buttonStyle(.plain)
            }
            Spacer()
        }
    }
}
