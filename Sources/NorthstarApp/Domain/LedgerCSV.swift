import Foundation
import SwiftData

struct LedgerCSVRow: Identifiable {
    enum Status: Equatable {
        case new
        case duplicate
        case invalid(reason: String)
    }

    let id = UUID()
    let lineNumber: Int
    let transactionID: UUID?
    let date: Date?
    let amount: Double?
    let currency: String
    let category: String
    let note: String
    let accountName: String
    let status: Status

    var isImportable: Bool {
        if case .new = status { return true }
        return false
    }
}

enum LedgerCSVParser {
    static let headerFields = [
        "id", "Date", "Amount", "Currency", "Category", "Note", "Account"
    ]

    static var headerLine: String { headerFields.joined(separator: ",") }

    static func parse(_ contents: String, existingIDs: Set<UUID>) -> [LedgerCSVRow] {
        let lines = contents.components(separatedBy: .newlines)
        guard let firstLine = lines.first else { return [] }

        let lowered = firstLine.lowercased()
        let hasHeader = lowered.contains("date") && lowered.contains("amount") && lowered.contains("category")
        let dataLines = hasHeader ? Array(lines.dropFirst()) : lines
        let startingLineNumber = hasHeader ? 2 : 1

        var seenIDs = existingIDs
        var rows: [LedgerCSVRow] = []

        for (offset, rawLine) in dataLines.enumerated() {
            let line = rawLine.trimmingCharacters(in: .whitespaces)
            guard line.isEmpty == false else { continue }
            let fields = splitCSVLine(rawLine)
            rows.append(makeRow(fields: fields, lineNumber: startingLineNumber + offset, seenIDs: &seenIDs))
        }

        return rows
    }

    private static func makeRow(fields: [String], lineNumber: Int, seenIDs: inout Set<UUID>) -> LedgerCSVRow {
        func field(_ index: Int) -> String {
            index < fields.count ? fields[index].trimmingCharacters(in: .whitespacesAndNewlines) : ""
        }

        let idRaw = field(0)
        let dateRaw = field(1)
        let amountRaw = field(2)
        let currencyRaw = field(3).uppercased()
        let category = field(4)
        let note = field(5)
        let accountName = field(6)

        let transactionID: UUID? = idRaw.isEmpty ? nil : UUID(uuidString: idRaw)
        let date = CSVText.parseDate(dateRaw)
        let amount = Double(amountRaw)
        let currency = currencyRaw.isEmpty ? "TWD" : currencyRaw

        var status: LedgerCSVRow.Status = .new
        if idRaw.isEmpty == false, transactionID == nil {
            status = .invalid(reason: "id 不是有效的 UUID")
        } else if let transactionID, seenIDs.contains(transactionID) {
            status = .duplicate
        } else if date == nil {
            status = .invalid(reason: "日期格式無法解析（需 yyyy-MM-dd 或 yyyy/MM/dd）")
        } else if amount == nil {
            status = .invalid(reason: "Amount 不是數字")
        } else if accountName.isEmpty {
            status = .invalid(reason: "缺少 Account 名稱")
        }

        if case .new = status, let transactionID {
            seenIDs.insert(transactionID)
        }

        return LedgerCSVRow(
            lineNumber: lineNumber,
            transactionID: transactionID,
            date: date,
            amount: amount,
            currency: currency,
            category: category,
            note: note,
            accountName: accountName,
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
enum LedgerCSVImporter {
    struct Outcome {
        var inserted: Int = 0
        var skipped: Int = 0
        var failed: Int = 0
    }

    static func apply(
        _ rows: [LedgerCSVRow],
        context: ModelContext,
        accounts: [Account]
    ) -> Outcome {
        var accountByName: [String: Account] = [:]
        for account in accounts {
            accountByName[account.name.lowercased()] = account
        }

        var outcome = Outcome()
        var affectedAccounts: [Account] = []
        var seenAccountIDs = Set<ObjectIdentifier>()

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

            guard let date = row.date, let amount = row.amount else {
                outcome.failed += 1
                continue
            }

            let trimmedName = row.accountName.trimmingCharacters(in: .whitespacesAndNewlines)
            guard trimmedName.isEmpty == false else {
                outcome.failed += 1
                continue
            }

            let account: Account
            if let existing = accountByName[trimmedName.lowercased()] {
                account = existing
            } else {
                let newAccount = Account(name: trimmedName, currency: row.currency, balance: 0)
                context.insert(newAccount)
                accountByName[trimmedName.lowercased()] = newAccount
                account = newAccount
            }

            let txn = LedgerTransaction(
                id: row.transactionID ?? UUID(),
                date: date,
                amount: amount,
                currency: row.currency,
                category: row.category,
                note: row.note,
                account: account
            )
            context.insert(txn)
            outcome.inserted += 1

            if seenAccountIDs.insert(ObjectIdentifier(account)).inserted {
                affectedAccounts.append(account)
            }
        }

        try? context.save()

        for account in affectedAccounts {
            account.recomputeBalance()
        }
        try? context.save()

        return outcome
    }
}
