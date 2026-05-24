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
        disabledReason == nil
    }

    private var disabledReason: String? {
        if name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "請輸入帳戶名稱"
        }
        if currency.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "請選擇幣別"
        }
        if Double(openingBalanceText) == nil {
            return "開帳金額需要是數字（可填 0）"
        }
        return nil
    }

    var body: some View {
        NavigationStack {
            SheetCardScroll {
                GlassFormCard("基本資訊") {
                    FieldRow("帳戶名稱") {
                        TextField("如：玉山活存、嘉信美股", text: $name)
                            .textFieldStyle(.roundedBorder)
                    }
                    FieldRow("類型") {
                        Picker("類型", selection: $type) {
                            ForEach(AccountType.allCases) { kind in
                                Label(kind.displayTitle, systemImage: kind.symbolName).tag(kind)
                            }
                        }
                        .labelsHidden()
                    }
                    FieldRow("幣別") {
                        Picker("幣別", selection: $currency) {
                            ForEach(BaseCurrencyDefaults.supported, id: \.self) { code in
                                Text(code).tag(code)
                            }
                        }
                        .labelsHidden()
                    }
                }

                GlassFormCard(
                    "開帳金額",
                    footer: "這筆金額代表帳戶起始日的餘額。之後的交易與對帳調整會疊加在此基礎上。",
                    tinted: true
                ) {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        TextField("0", text: $openingBalanceText)
                            .font(.system(size: 32, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .decimalKeyboard()
                            .textFieldStyle(.plain)
                            .foregroundStyle(NorthstarTheme.primaryText)
                        Text(currency)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(NorthstarTheme.mutedText)
                    }
                }

                DisabledHintBanner(reason: disabledReason)
            }
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
