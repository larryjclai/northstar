import Foundation

enum CurrencyFormatters {
    /// Pick a sensible locale for each currency so the symbol & grouping match
    /// the currency's native conventions (US$ vs $, etc.).
    private static let localeByCurrency: [String: String] = [
        "TWD": "zh_Hant_TW",
        "USD": "en_US",
        "JPY": "ja_JP",
        "EUR": "de_DE",
        "GBP": "en_GB",
        "HKD": "zh_Hant_HK",
        "CNY": "zh_Hans_CN",
        "AUD": "en_AU",
        "SGD": "en_SG",
        "KRW": "ko_KR"
    ]

    private static func locale(for currencyCode: String) -> Locale {
        if let identifier = localeByCurrency[currencyCode.uppercased()] {
            return Locale(identifier: identifier)
        }
        return Locale.autoupdatingCurrent
    }

    /// Currencies that conventionally have no minor units (JPY, KRW, TWD for whole-dollar display).
    private static let zeroDecimalCurrencies: Set<String> = ["JPY", "KRW", "TWD"]

    static func money(_ value: Double, currencyCode: String = "TWD") -> String {
        let code = currencyCode.uppercased()
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = code
        formatter.locale = locale(for: code)
        formatter.maximumFractionDigits = zeroDecimalCurrencies.contains(code) ? 0 : 2
        formatter.minimumFractionDigits = formatter.maximumFractionDigits
        return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
    }

    static func signedMoney(_ value: Double, currencyCode: String = "TWD") -> String {
        let formatted = money(abs(value), currencyCode: currencyCode)
        return value < 0 ? "-\(formatted)" : "+\(formatted)"
    }

    static func price(_ value: Double, currencyCode: String = "TWD") -> String {
        let code = currencyCode.uppercased()
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = code
        formatter.locale = locale(for: code)
        let needsDecimals = abs(value) < 100 && zeroDecimalCurrencies.contains(code) == false
        formatter.maximumFractionDigits = needsDecimals ? 2 : 0
        formatter.minimumFractionDigits = formatter.maximumFractionDigits
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
