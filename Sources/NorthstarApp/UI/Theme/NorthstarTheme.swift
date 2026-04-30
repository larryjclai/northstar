import SwiftUI

enum NorthstarTheme {
    static let accent = Color(red: 0.42, green: 0.89, blue: 0.79)
    static let growth = Color(red: 0.38, green: 0.85, blue: 0.54)
    static let risk = Color(red: 0.94, green: 0.44, blue: 0.45)
    static let warning = Color(red: 0.90, green: 0.73, blue: 0.36)
}

extension Color {
    static let nsBackground = Color("NSBackground", bundle: .main)
    static let nsSurface = Color("NSSurface", bundle: .main)
    static let nsSecondarySurface = Color("NSSecondarySurface", bundle: .main)
    static let nsBorder = Color("NSBorder", bundle: .main)
}
