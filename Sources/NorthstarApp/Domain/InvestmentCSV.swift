import Foundation
import SwiftData

enum CSVText {
    static func escape(_ value: String) -> String {
        let escaped = value.replacingOccurrences(of: "\"", with: "\"\"")
        if escaped.contains(",") || escaped.contains("\"") || escaped.contains("\n") {
            return "\"\(escaped)\""
        }
        return escaped
    }

    static func format(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    static func parseDate(_ value: String) -> Date? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.isEmpty == false else { return nil }

        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        for pattern in ["yyyy-MM-dd", "yyyy/MM/dd"] {
            formatter.dateFormat = pattern
            if let date = formatter.date(from: trimmed) {
                return date
            }
        }
        return nil
    }
}

struct InvestmentCSVRow: Identifiable {
    enum Status: Equatable {
        case new
        case duplicate
        case invalid(reason: String)
    }

    let id = UUID()
    let lineNumber: Int
    let recordID: UUID?
    let date: Date?
    let ticker: String
    let name: String
    let action: InvestmentAction?
    let price: Double
    let quantity: Double
    let fee: Double
    let currency: String
    let linkedAccountName: String
    let reviewed: Bool
    let note: String
    let status: Status

    var isImportable: Bool {
        if case .new = status { return true }
        return false
    }
}

enum InvestmentCSVParser {
    static let headerFields = [
        "id", "Date", "Ticker", "Name", "Action",
        "Price", "Quantity", "Fee", "Currency", "LinkedAccount", "Reviewed", "Note"
    ]

    static var headerLine: String { headerFields.joined(separator: ",") }

    static func parse(_ contents: String, existingIDs: Set<UUID>) -> [InvestmentCSVRow] {
        let lines = contents.components(separatedBy: .newlines)
        guard let firstLine = lines.first else { return [] }

        let lowered = firstLine.lowercased()
        let hasHeader = lowered.contains("date") && lowered.contains("ticker") && lowered.contains("action")
        let dataLines = hasHeader ? Array(lines.dropFirst()) : lines
        let startingLineNumber = hasHeader ? 2 : 1

        var seenIDs = existingIDs
        var rows: [InvestmentCSVRow] = []

        for (offset, rawLine) in dataLines.enumerated() {
            let line = rawLine.trimmingCharacters(in: .whitespaces)
            guard line.isEmpty == false else { continue }
            let fields = splitCSVLine(rawLine)
            rows.append(makeRow(fields: fields, lineNumber: startingLineNumber + offset, seenIDs: &seenIDs))
        }

        return rows
    }

    private static func makeRow(fields: [String], lineNumber: Int, seenIDs: inout Set<UUID>) -> InvestmentCSVRow {
        func field(_ index: Int) -> String {
            index < fields.count ? fields[index].trimmingCharacters(in: .whitespacesAndNewlines) : ""
        }

        let idRaw = field(0)
        let dateRaw = field(1)
        let ticker = field(2).uppercased()
        let name = field(3)
        let actionRaw = field(4)
        let priceRaw = field(5)
        let quantityRaw = field(6)
        let feeRaw = field(7)
        let currencyRaw = field(8).uppercased()
        let linkedAccount = field(9)
        let reviewedRaw = field(10).lowercased()
        let note = field(11)

        let recordID: UUID? = idRaw.isEmpty ? nil : UUID(uuidString: idRaw)
        let date = CSVText.parseDate(dateRaw)
        let action = InvestmentAction(rawValue: actionRaw)
        let price = Double(priceRaw)
        let quantity = Double(quantityRaw)
        let fee = Double(feeRaw) ?? 0
        let currency = currencyRaw.isEmpty ? "TWD" : currencyRaw
        let reviewed = ["true", "yes", "1"].contains(reviewedRaw)

        var status: InvestmentCSVRow.Status = .new
        if idRaw.isEmpty == false, recordID == nil {
            status = .invalid(reason: "id 不是有效的 UUID")
        } else if let recordID, seenIDs.contains(recordID) {
            status = .duplicate
        } else if date == nil {
            status = .invalid(reason: "日期格式無法解析（需 yyyy-MM-dd 或 yyyy/MM/dd）")
        } else if ticker.isEmpty {
            status = .invalid(reason: "缺少 Ticker")
        } else if action == nil {
            status = .invalid(reason: "Action 需為 Buy / Sell / CashDividend / StockDividend / CapitalReduction")
        } else if price == nil {
            status = .invalid(reason: "Price 不是數字")
        } else if quantity == nil {
            status = .invalid(reason: "Quantity 不是數字")
        }

        if case .new = status, let recordID {
            seenIDs.insert(recordID)
        }

        return InvestmentCSVRow(
            lineNumber: lineNumber,
            recordID: recordID,
            date: date,
            ticker: ticker,
            name: name,
            action: action,
            price: price ?? 0,
            quantity: quantity ?? 0,
            fee: fee,
            currency: currency,
            linkedAccountName: linkedAccount,
            reviewed: reviewed,
            note: note,
            status: status
        )
    }

    private static func splitCSVLine(_ line: String) -> [String] {
        var fields: [String] = []
        var current = ""
        var inQuotes = false
        var index = line.startIndex

        while index < line.endIndex {
            let character = line[index]
            if inQuotes {
                if character == "\"" {
                    let next = line.index(after: index)
                    if next < line.endIndex, line[next] == "\"" {
                        current.append("\"")
                        index = line.index(after: next)
                        continue
                    }
                    inQuotes = false
                } else {
                    current.append(character)
                }
            } else {
                if character == "," {
                    fields.append(current)
                    current = ""
                } else if character == "\"" {
                    inQuotes = true
                } else {
                    current.append(character)
                }
            }
            index = line.index(after: index)
        }

        fields.append(current)
        return fields
    }
}

@MainActor
enum InvestmentCSVImporter {
    struct Outcome {
        var inserted: Int = 0
        var skipped: Int = 0
        var failed: Int = 0
    }

    static func apply(
        _ rows: [InvestmentCSVRow],
        context: ModelContext,
        assets: [PortfolioAsset],
        accounts: [Account]
    ) -> Outcome {
        var assetByTicker: [String: PortfolioAsset] = [:]
        for asset in assets {
            assetByTicker[asset.ticker.uppercased()] = asset
        }

        var accountByName: [String: Account] = [:]
        for account in accounts {
            accountByName[account.name.lowercased()] = account
        }

        var outcome = Outcome()
        var affectedAssets: [PortfolioAsset] = []
        var seenAssetIDs = Set<ObjectIdentifier>()

        for row in rows {
            switch row.status {
            case .duplicate:
                outcome.skipped += 1
                continue
            case .invalid:
                outcome.failed += 1
                continue
            case .new:
                break
            }

            guard let date = row.date, let action = row.action else {
                outcome.failed += 1
                continue
            }

            let asset: PortfolioAsset
            if let existing = assetByTicker[row.ticker] {
                asset = existing
            } else {
                let displayName = row.name.isEmpty ? row.ticker : row.name
                let newAsset = PortfolioAsset(ticker: row.ticker, name: displayName, currency: row.currency)
                context.insert(newAsset)
                assetByTicker[row.ticker] = newAsset
                asset = newAsset
            }

            let linkedAccount: Account?
            let accountName = row.linkedAccountName.trimmingCharacters(in: .whitespacesAndNewlines)
            if accountName.isEmpty {
                linkedAccount = nil
            } else if let existing = accountByName[accountName.lowercased()] {
                linkedAccount = existing
            } else {
                let newAccount = Account(name: accountName, currency: row.currency, balance: 0)
                context.insert(newAccount)
                accountByName[accountName.lowercased()] = newAccount
                linkedAccount = newAccount
            }

            let record = InvestmentRecord(
                id: row.recordID ?? UUID(),
                date: date,
                action: action,
                price: row.price,
                quantity: row.quantity,
                fee: row.fee,
                note: row.note,
                isReviewed: row.reviewed,
                asset: asset,
                linkedAccount: linkedAccount
            )
            context.insert(record)
            outcome.inserted += 1

            if seenAssetIDs.insert(ObjectIdentifier(asset)).inserted {
                affectedAssets.append(asset)
            }
        }

        try? context.save()

        for asset in affectedAssets {
            PortfolioCalculator.apply(records: asset.records, to: asset)
        }
        try? context.save()

        return outcome
    }
}
