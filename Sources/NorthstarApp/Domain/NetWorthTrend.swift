import Foundation

struct NetWorthTrend {
    let totalValues: [Double]
    let cashValues: [Double]
    let investmentValues: [Double]
    let dates: [Date]
}

enum NetWorthTrendBuilder {
    /// Build a net-worth value trend = cash account balances (in base currency)
    /// + investment portfolio value (in base currency), aligned to the portfolio sparkline date axis.
    ///
    /// v2: historical FX rates are applied when available (via the `convert` closure that takes
    /// a date); falls back to spot when no history exists. Cash historical balance per account
    /// = current balance − sum of transactions strictly after `date`.
    static func build(
        holdings: [HoldingSnapshot],
        accounts: [Account],
        sparklines: [String: [Double]],
        sparklineDates: [String: [Date]],
        baseCurrency: String,
        tickerCurrency: (String) -> String,
        convert: (Double, String, String, Date) -> Double?
    ) -> NetWorthTrend {
        // Investment series per holding, scaled to current quantity, converted to base
        // using the FX rate at each close's date when historical FX is available.
        let investmentSeries: [(values: [Double], dates: [Date])] = holdings.compactMap { holding in
            guard let closes = sparklines[holding.ticker], closes.isEmpty == false else { return nil }
            let dates = sparklineDates[holding.ticker] ?? []
            let nativeCurrency = tickerCurrency(holding.ticker)
            let convertedValues = closes.enumerated().map { index, close -> Double in
                let nativeValue = close * holding.quantity
                let asOf = index < dates.count ? dates[index] : Date()
                return convert(nativeValue, nativeCurrency, baseCurrency, asOf) ?? 0
            }
            return (convertedValues, dates)
        }

        guard investmentSeries.isEmpty == false else {
            return NetWorthTrend(totalValues: [], cashValues: [], investmentValues: [], dates: [])
        }

        let count = investmentSeries.map(\.values.count).min() ?? 0
        guard count > 1 else {
            return NetWorthTrend(totalValues: [], cashValues: [], investmentValues: [], dates: [])
        }

        // Use the longest-matching date axis as the reference.
        let referenceDates: [Date] = {
            for item in investmentSeries where item.dates.count >= count {
                return Array(item.dates.suffix(count))
            }
            return []
        }()

        let investmentTotals: [Double] = (0..<count).map { index in
            investmentSeries.reduce(0.0) { running, item in
                running + item.values[item.values.count - count + index]
            }
        }

        // Cash historical balance per account, evaluated at each reference date.
        let cashTotals: [Double] = referenceDates.map { date in
            accounts.reduce(0.0) { running, account in
                let nativeBalanceAtDate = historicalBalance(account: account, at: date)
                let converted = convert(nativeBalanceAtDate, account.currency, baseCurrency, date) ?? 0
                return running + converted
            }
        }

        let totals = zip(investmentTotals, cashTotals).map { $0 + $1 }

        return NetWorthTrend(
            totalValues: totals,
            cashValues: cashTotals,
            investmentValues: investmentTotals,
            dates: referenceDates
        )
    }

    /// Slice a NetWorthTrend by TimeRange, keeping all three series aligned.
    static func slice(_ trend: NetWorthTrend, range: TimeRange, now: Date = Date()) -> NetWorthTrend {
        guard trend.totalValues.isEmpty == false else { return trend }
        let startIndex = range.startIndex(in: trend.dates, totalCount: trend.totalValues.count, now: now)
        let endIndex = trend.totalValues.count
        let upperDate = min(trend.dates.count, endIndex)
        return NetWorthTrend(
            totalValues: Array(trend.totalValues[startIndex..<endIndex]),
            cashValues: Array(trend.cashValues[startIndex..<endIndex]),
            investmentValues: Array(trend.investmentValues[startIndex..<endIndex]),
            dates: trend.dates.isEmpty ? [] : Array(trend.dates[startIndex..<upperDate])
        )
    }

    /// Historical balance of an account at `date`:
    /// current balance − sum of transactions strictly after `date`.
    private static func historicalBalance(account: Account, at date: Date) -> Double {
        let futureSum = account.transactions
            .filter { $0.date > date }
            .reduce(0.0) { $0 + $1.amount }
        return account.balance - futureSum
    }
}
