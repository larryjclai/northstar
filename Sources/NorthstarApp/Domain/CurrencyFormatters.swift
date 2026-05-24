import Foundation

enum CurrencyFormatters {
    static var isPrivacyMaskOn: Bool {
        UserDefaults.standard.bool(forKey: "northstar.privacyMode.enabled")
    }

    private static let maskedAmount = "＊＊＊＊＊＊"
    private static let maskedPercent = "＊＊.＊＊%"

    static func money(_ value: Double, currencyCode: String = "TWD") -> String {
        if isPrivacyMaskOn { return maskedAmount }
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCode
        formatter.maximumFractionDigits = 0
        formatter.locale = Locale(identifier: "zh_Hant_TW")
        return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
    }

    static func signedMoney(_ value: Double, currencyCode: String = "TWD") -> String {
        if isPrivacyMaskOn { return maskedAmount }
        let formatted = money(abs(value), currencyCode: currencyCode)
        return value < 0 ? "-\(formatted)" : "+\(formatted)"
    }

    static func price(_ value: Double, currencyCode: String = "TWD") -> String {
        if isPrivacyMaskOn { return maskedAmount }
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCode
        formatter.maximumFractionDigits = value < 100 ? 2 : 0
        formatter.minimumFractionDigits = value < 100 ? 2 : 0
        formatter.locale = Locale(identifier: "zh_Hant_TW")
        return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
    }

    static func percent(_ value: Double) -> String {
        if isPrivacyMaskOn { return maskedPercent }
        let formatter = NumberFormatter()
        formatter.numberStyle = .percent
        formatter.maximumFractionDigits = 2
        formatter.minimumFractionDigits = 2
        return formatter.string(from: NSNumber(value: value)) ?? "0.00%"
    }

    static func quantity(_ value: Double) -> String {
        if isPrivacyMaskOn { return maskedAmount }
        if value == value.rounded() {
            return String(Int(value))
        }
        return String(format: "%.2f", value)
    }
}
