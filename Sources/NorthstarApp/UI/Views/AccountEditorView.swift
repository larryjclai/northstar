import SwiftUI
import SwiftData

struct AccountEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    let editing: Account?

    @State private var name: String
    @State private var currency: String
    @State private var openingBalanceText: String
    @State private var type: AccountType

    init(editing: Account?) {
        self.editing = editing
        _name = State(initialValue: editing?.name ?? "")
        _currency = State(initialValue: editing?.currency ?? "TWD")
        _openingBalanceText = State(initialValue: editing.map { Self.numberString($0.openingBalance) } ?? "0")
        _type = State(initialValue: editing?.type ?? .depository)
    }

    private static func numberString(_ value: Double) -> String {
        if value == value.rounded() {
            return String(Int(value))
        }
        return String(value)
    }

    private var canSave: Bool {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let currencyTrimmed = currency.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty == false
            && currencyTrimmed.isEmpty == false
            && Double(openingBalanceText) != nil
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("基本資訊") {
                    TextField("帳戶名稱(如：玉山活存、嘉信美股)", text: $name)
                    Picker("類型", selection: $type) {
                        ForEach(AccountType.allCases) { kind in
                            Label(kind.displayTitle, systemImage: kind.symbolName).tag(kind)
                        }
                    }
                    Picker("幣別", selection: $currency) {
                        ForEach(BaseCurrencyDefaults.supported, id: \.self) { code in
                            Text(code).tag(code)
                        }
                    }
                }
                Section("Opening Balance") {
                    TextField("開帳金額", text: $openingBalanceText)
                        .decimalKeyboard()
                    Text("這筆金額代表帳戶起始日的餘額。之後的交易與對帳調整會疊加在此基礎上。")
                        .font(.caption)
                        .foregroundStyle(NorthstarTheme.secondaryText)
                }
            }
            .platformFormStyle()
            .navigationTitle(editing == nil ? "新增帳戶" : "編輯帳戶")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(editing == nil ? "建立" : "更新") { save() }
                        .disabled(!canSave)
                }
            }
        }
    }

    private func save() {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedCurrency = currency.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        let opening = Double(openingBalanceText) ?? 0

        if let editing {
            editing.name = trimmedName
            editing.currency = normalizedCurrency
            editing.openingBalance = opening
            editing.type = type
            editing.recomputeBalance()
        } else {
            let account = Account(
                name: trimmedName,
                currency: normalizedCurrency,
                balance: opening,
                openingBalance: opening,
                type: type
            )
            modelContext.insert(account)
        }

        try? modelContext.save()
        dismiss()
    }
}
