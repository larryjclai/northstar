import Foundation

enum CurrencyFormatters {
    static func money(_ value: Double, currencyCode: String = "TWD") -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCode
        formatter.maximumFractionDigits = 0
        formatter.locale = Locale(identifier: "zh_Hant_TW")
        return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
    }

    static func signedMoney(_ value: Double, currencyCode: String = "TWD") -> String {
        let formatted = money(abs(value), currencyCode: currencyCode)
        return value < 0 ? "-\(formatted)" : "+\(formatted)"
    }

    static func price(_ value: Double, currencyCode: String = "TWD") -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCode
        formatter.maximumFractionDigits = value < 100 ? 2 : 0
        formatter.minimumFractionDigits = value < 100 ? 2 : 0
        formatter.locale = Locale(identifier: "zh_Hant_TW")
        return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
    }

    static func percent(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .percent
        formatter.maximumFractionDigits = 2
        formatter.minimumFractionDigits = 2
        return formatter.string(from: NSNumber(value: value)) ?? "0.00%"
    }
}
