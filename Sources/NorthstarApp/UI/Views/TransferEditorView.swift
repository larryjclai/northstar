import SwiftUI
import SwiftData

/// Dedicated editor for two-leg transfers. Produces exactly two `LedgerTransaction`
/// rows sharing a `groupID`: one negative on the source account, one positive on the
/// destination account. Cross-currency transfers reveal an explicit destination-amount
/// field and an implicit-rate readout.
struct TransferEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    let editing: LedgerTransaction?
    let accounts: [Account]
    let recentTransactions: [LedgerTransaction]

    @State private var date: Date
    @State private var sourceAccountID: UUID?
    @State private var destinationAccountID: UUID?
    @State private var sourceAmountText: String
    @State private var destinationAmountText: String
    @State private var note: String
    @State private var receiptData: Data?

    init(
        editing: LedgerTransaction?,
        accounts: [Account],
        recentTransactions: [LedgerTransaction] = []
    ) {
        self.editing = editing
        self.accounts = accounts
        self.recentTransactions = recentTransactions

        // Load existing transfer when editing — both legs come from the same group.
        if let editing,
           let groupID = editing.groupID {
            let members = recentTransactions.filter { $0.groupID == groupID }
            if LedgerGroupClassifier.classify(members) == .transfer,
               let source = LedgerGroupClassifier.sourceLeg(of: members),
               let destination = LedgerGroupClassifier.destinationLeg(of: members) {
                _date = State(initialValue: editing.date)
                _sourceAccountID = State(initialValue: source.account?.id)
                _destinationAccountID = State(initialValue: destination.account?.id)
                _sourceAmountText = State(initialValue: Self.numberString(abs(source.amount)))
                _destinationAmountText = State(initialValue: Self.numberString(abs(destination.amount)))
                _note = State(initialValue: editing.note)
                _receiptData = State(initialValue: source.receipt)
                return
            }
        }

        _date = State(initialValue: editing?.date ?? Date())
        _sourceAccountID = State(initialValue: accounts.first?.id)
        let defaultDestination = accounts.dropFirst().first?.id ?? accounts.first?.id
        _destinationAccountID = State(initialValue: defaultDestination)
        _sourceAmountText = State(initialValue: "")
        _destinationAmountText = State(initialValue: "")
        _note = State(initialValue: "")
        _receiptData = State(initialValue: nil)
    }

    private static func numberString(_ value: Double) -> String {
        if value == value.rounded() {
            return String(Int(value))
        }
        return String(value)
    }

    private var sourceAccount: Account? {
        guard let id = sourceAccountID else { return nil }
        return accounts.first(where: { $0.id == id })
    }

    private var destinationAccount: Account? {
        guard let id = destinationAccountID else { return nil }
        return accounts.first(where: { $0.id == id })
    }

    private var isCrossCurrency: Bool {
        guard let s = sourceAccount, let d = destinationAccount else { return false }
        return s.currency != d.currency
    }

    private var evaluatedSource: Double? {
        AmountExpression.evaluate(sourceAmountText)
    }

    private var evaluatedDestination: Double? {
        AmountExpression.evaluate(destinationAmountText)
    }

    private var sourceShowsExpressionPreview: Bool {
        amountShowsPreview(amountText: sourceAmountText, evaluated: evaluatedSource)
    }

    private var destinationShowsExpressionPreview: Bool {
        amountShowsPreview(amountText: destinationAmountText, evaluated: evaluatedDestination)
    }

    private func amountShowsPreview(amountText: String, evaluated: Double?) -> Bool {
        guard let value = evaluated else { return false }
        let trimmed = amountText.trimmingCharacters(in: .whitespacesAndNewlines)
        if let direct = Double(trimmed.replacingOccurrences(of: ",", with: ".")), direct == value {
            return false
        }
        return true
    }

    private var implicitRate: Double? {
        guard isCrossCurrency,
              let src = sourceAccount,
              let dest = destinationAccount,
              let s = evaluatedSource, s > 0,
              let d = evaluatedDestination, d > 0
        else { return nil }
        return TransferBuilder.implicitRate(
            sourceCurrency: src.currency,
            sourceMagnitude: s,
            destinationCurrency: dest.currency,
            destinationMagnitude: d
        )
    }

    private var canSave: Bool {
        disabledReason == nil
    }

    private var disabledReason: String? {
        guard let source = sourceAccount else {
            return "請選擇來源帳戶"
        }
        guard let destination = destinationAccount else {
            return "請選擇目標帳戶"
        }
        if source.id == destination.id {
            return "來源與目標帳戶必須不同"
        }
        guard let s = evaluatedSource, s > 0 else {
            return "請輸入來源金額"
        }
        if isCrossCurrency {
            guard let d = evaluatedDestination, d > 0 else {
                return "跨幣別轉帳請輸入目標金額"
            }
            _ = d
        }
        _ = s
        return nil
    }

    var body: some View {
        NavigationStack {
            SheetCardScroll {
                identityCard
                amountCard
                metaCard
                DisabledHintBanner(reason: disabledReason)
            }
            .navigationTitle(editing == nil ? "新增轉帳" : "編輯轉帳")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(editing == nil ? "儲存" : "更新") { save() }
                        .disabled(!canSave)
                }
            }
        }
    }

    @ViewBuilder
    private var identityCard: some View {
        GlassFormCard("基本資訊") {
            FieldRow("日期") {
                VStack(alignment: .leading, spacing: 8) {
                    DateQuickPickStrip(date: $date)
                    DatePicker("日期", selection: $date, displayedComponents: .date)
                        .datePickerStyle(.compact)
                        .labelsHidden()
                }
            }

            FieldRow("從") {
                Picker("從", selection: $sourceAccountID) {
                    ForEach(accounts, id: \.id) { account in
                        Text("\(account.name) · \(account.currency)").tag(Optional(account.id))
                    }
                }
                .labelsHidden()
            }

            FieldRow("到") {
                Picker("到", selection: $destinationAccountID) {
                    ForEach(accounts, id: \.id) { account in
                        Text("\(account.name) · \(account.currency)").tag(Optional(account.id))
                    }
                }
                .labelsHidden()
            }

            if let source = sourceAccount,
               let destination = destinationAccount,
               source.id == destination.id {
                Label("來源與目標帳戶必須不同。", systemImage: "exclamationmark.triangle.fill")
                    .font(.caption)
                    .foregroundStyle(NorthstarTheme.warning)
            }
        }
    }

    @ViewBuilder
    private var amountCard: some View {
        GlassFormCard("金額", tinted: true) {
            heroAmountField(
                label: "來源金額",
                text: $sourceAmountText,
                currency: sourceAccount?.currency
            )
            if sourceShowsExpressionPreview, let value = evaluatedSource {
                Text("= \(CurrencyFormatters.money(value, currencyCode: sourceAccount?.currency ?? "TWD"))")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(NorthstarTheme.accent)
                    .monospacedDigit()
            }

            if isCrossCurrency {
                Divider().padding(.vertical, 4)
                heroAmountField(
                    label: "目標金額",
                    text: $destinationAmountText,
                    currency: destinationAccount?.currency
                )
                if destinationShowsExpressionPreview, let value = evaluatedDestination {
                    Text("= \(CurrencyFormatters.money(value, currencyCode: destinationAccount?.currency ?? "TWD"))")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.accent)
                        .monospacedDigit()
                }
                if let rate = implicitRate,
                   let src = sourceAccount,
                   let dest = destinationAccount {
                    Text("隱含匯率：1 \(src.currency) ≈ \(rateString(rate)) \(dest.currency)")
                        .font(.caption)
                        .foregroundStyle(NorthstarTheme.secondaryText)
                        .monospacedDigit()
                } else {
                    Text("跨幣別轉帳請填兩個金額；系統會記下隱含匯率。")
                        .font(.caption2)
                        .foregroundStyle(NorthstarTheme.mutedText)
                }
            } else {
                Text("同幣別轉帳兩邊金額相同，只需填一次。可輸入算式，例如 1000+500。")
                    .font(.caption2)
                    .foregroundStyle(NorthstarTheme.mutedText)
            }
        }
    }

    private func heroAmountField(label: String, text: Binding<String>, currency: String?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(NorthstarTheme.mutedText)
                .textCase(.uppercase)
                .tracking(0.4)
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                TextField("0", text: text)
                    .font(.system(size: 32, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .decimalKeyboard()
                    .textFieldStyle(.plain)
                    .foregroundStyle(NorthstarTheme.primaryText)
                Text(currency ?? "TWD")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(NorthstarTheme.mutedText)
            }
        }
    }

    @ViewBuilder
    private var metaCard: some View {
        GlassFormCard("備註與收據") {
            FieldRow("備註") {
                TextField("備註（可選）", text: $note)
                    .textFieldStyle(.roundedBorder)
            }
            ReceiptAttachmentSection(receipt: $receiptData)
        }
    }

    private func rateString(_ rate: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = 2
        formatter.maximumFractionDigits = 6
        return formatter.string(from: NSNumber(value: rate)) ?? String(format: "%.4f", rate)
    }

    private func save() {
        guard
            let source = sourceAccount,
            let destination = destinationAccount,
            source.id != destination.id,
            let sourceMagnitude = evaluatedSource, sourceMagnitude > 0
        else { return }

        let destinationMagnitude: Double?
        if isCrossCurrency {
            guard let d = evaluatedDestination, d > 0 else { return }
            destinationMagnitude = d
        } else {
            destinationMagnitude = nil
        }

        let groupID = editing?.groupID ?? UUID()

        // Replace existing legs cleanly. We pull both legs (including ones on accounts the
        // user may have just swapped away from) so balances on every affected account get
        // recomputed.
        var affectedAccounts: Set<UUID> = [source.id, destination.id]
        if let editing {
            for txn in recentTransactions where txn.groupID == groupID {
                if let id = txn.account?.id { affectedAccounts.insert(id) }
                modelContext.delete(txn)
            }
            // The editing row itself may already be in recentTransactions, but harmless to
            // call delete a second time on a row already scheduled for deletion in this
            // context. Guard anyway.
            if editing.groupID != groupID {
                if let id = editing.account?.id { affectedAccounts.insert(id) }
                modelContext.delete(editing)
            }
        }

        guard let rows = TransferBuilder.build(.init(
            date: date,
            sourceAccount: source,
            destinationAccount: destination,
            sourceMagnitude: sourceMagnitude,
            destinationMagnitude: destinationMagnitude,
            note: note,
            receipt: receiptData,
            groupID: groupID
        )) else { return }

        for row in rows {
            modelContext.insert(row)
        }
        for accountID in affectedAccounts {
            accounts.first(where: { $0.id == accountID })?.recomputeBalance()
        }
        try? modelContext.save()
        dismiss()
    }
}
