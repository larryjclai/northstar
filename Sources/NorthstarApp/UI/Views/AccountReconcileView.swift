import SwiftUI
import SwiftData

struct AccountReconcileView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    let account: Account

    @State private var targetBalanceText: String
    @State private var reconcileDate: Date = Date()
    @State private var note: String = ""

    init(account: Account) {
        self.account = account
        _targetBalanceText = State(initialValue: AccountReconcileView.numberString(account.balance))
    }

    private static func numberString(_ value: Double) -> String {
        if value == value.rounded() {
            return String(Int(value))
        }
        return String(value)
    }

    private var target: Double? {
        Double(targetBalanceText)
    }

    private var delta: Double {
        (target ?? account.balance) - account.balance
    }

    private var canApply: Bool {
        target != nil && abs(delta) > 0.0001
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("\(account.name)") {
                    HStack {
                        Text("目前餘額")
                        Spacer()
                        Text(CurrencyFormatters.money(account.balance, currencyCode: account.currency))
                            .foregroundStyle(NorthstarTheme.secondaryText)
                            .monospacedDigit()
                    }
                }
                Section("Statement 金額") {
                    TextField("實際餘額", text: $targetBalanceText)
                        .decimalKeyboard()
                    DatePicker("對帳日期", selection: $reconcileDate, displayedComponents: .date)
                    TextField("備註(可選)", text: $note)
                }
                Section("調整") {
                    if let target {
                        HStack {
                            Text("差額")
                            Spacer()
                            Text(CurrencyFormatters.signedMoney(target - account.balance, currencyCode: account.currency))
                                .foregroundStyle(target - account.balance >= 0 ? NorthstarTheme.growth : NorthstarTheme.risk)
                                .monospacedDigit()
                                .font(.subheadline.weight(.semibold))
                        }
                        Text("套用後會新增一筆「對帳調整」的 ledger transaction，將餘額導正到 statement 金額。")
                            .font(.caption)
                            .foregroundStyle(NorthstarTheme.secondaryText)
                    } else {
                        Text("輸入有效的金額後會顯示差額。")
                            .font(.caption)
                            .foregroundStyle(NorthstarTheme.secondaryText)
                    }
                }
            }
            .platformFormStyle()
            .navigationTitle("對帳")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("套用") { apply() }
                        .disabled(!canApply)
                }
            }
        }
    }

    private func apply() {
        guard let target else { return }
        let adjustment = target - account.balance
        guard abs(adjustment) > 0.0001 else { return }

        let trimmedNote = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let ledger = LedgerTransaction(
            date: reconcileDate,
            amount: adjustment,
            currency: account.currency,
            category: "對帳調整",
            note: trimmedNote.isEmpty ? "對帳調整 \(reconcileDate.formatted(date: .abbreviated, time: .omitted))" : trimmedNote,
            account: account
        )
        modelContext.insert(ledger)
        account.recomputeBalance()
        try? modelContext.save()
        dismiss()
    }
}
