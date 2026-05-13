import SwiftUI

enum NorthstarTheme {
    static let accent = Color(red: 0.11, green: 0.42, blue: 1.00)
    static let growth = Color(red: 0.00, green: 0.80, blue: 0.29)
    static let risk = Color(red: 1.00, green: 0.27, blue: 0.20)
    static let warning = Color(red: 1.00, green: 0.81, blue: 0.30)
    static let income = growth
    static let spending = risk
    static let netWorth = accent
    static let primaryText = Color.white.opacity(0.90)
    static let secondaryText = Color(red: 0.50, green: 0.55, blue: 0.64)
    static let mutedText = Color(red: 0.35, green: 0.49, blue: 0.67)
}

extension Color {
    static let nsBackground = Color("NSBackground", bundle: .main)
    static let nsSurface = Color("NSSurface", bundle: .main)
    static let nsSecondarySurface = Color("NSSecondarySurface", bundle: .main)
    static let nsBorder = Color("NSBorder", bundle: .main)
}
