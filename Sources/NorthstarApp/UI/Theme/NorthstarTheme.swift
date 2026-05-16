import SwiftUI

enum NorthstarTheme {
    static let accent = Color(red: 0.11, green: 0.42, blue: 1.00)
    static let growth = Color(
        light: Color(red: 0.00, green: 0.60, blue: 0.22),
        dark:  Color(red: 0.00, green: 0.80, blue: 0.29)
    )
    static let risk = Color(
        light: Color(red: 0.82, green: 0.15, blue: 0.10),
        dark:  Color(red: 1.00, green: 0.27, blue: 0.20)
    )
    static let warning = Color(red: 1.00, green: 0.81, blue: 0.30)
    static let income = growth
    static let spending = risk
    static let netWorth = accent
    static let primaryText = Color(
        light: Color(red: 0.10, green: 0.10, blue: 0.12).opacity(0.90),
        dark:  Color.white.opacity(0.90)
    )
    static let secondaryText = Color(
        light: Color(red: 0.28, green: 0.33, blue: 0.42),
        dark:  Color(red: 0.50, green: 0.55, blue: 0.64)
    )
    static let mutedText = Color(
        light: Color(red: 0.40, green: 0.46, blue: 0.56),
        dark:  Color(red: 0.35, green: 0.49, blue: 0.67)
    )
}

extension Color {
    static let nsBackground = Color("NSBackground", bundle: .main)
    static let nsSurface = Color("NSSurface", bundle: .main)
    static let nsSecondarySurface = Color("NSSecondarySurface", bundle: .main)
    static let nsBorder = Color("NSBorder", bundle: .main)

    init(light: Color, dark: Color) {
        #if os(macOS)
        self = Color(NSColor(name: nil) { appearance in
            switch appearance.bestMatch(from: [.aqua, .darkAqua]) {
            case .darkAqua: return NSColor(dark)
            default:        return NSColor(light)
            }
        })
        #else
        self = Color(UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light)
        })
        #endif
    }
}
