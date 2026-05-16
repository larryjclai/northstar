import SwiftUI
import SwiftData

struct RecurringTransactionsView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \RecurringTransaction.createdAt) private var templates: [RecurringTransaction]
    @Query(sort: \Account.name) private var accounts: [Account]

    @State private var showAddSheet = false
    @State private var editingTemplate: RecurringTransaction?
    @State private var pendingDelete: RecurringTransaction?

    var body: some View {
        Form {
            Section {
                Text("每月固定發生的收入或支出可以在這裡建立模板。下次開啟 App 時，到期的扣款會自動寫入「收支」。")
                    .font(.caption)
                    .foregroundStyle(NorthstarTheme.secondaryText)
            }

            if templates.isEmpty {
                Section {
                    Text(accounts.isEmpty
                         ? "請先到「帳戶」分頁新增現金帳戶，才能設定定期交易。"
                         : "尚未建立任何定期交易，點右上 + 開始。")
                        .font(.subheadline)
                        .foregroundStyle(NorthstarTheme.secondaryText)
                }
            } else {
                Section {
                    ForEach(templates) { template in
                        Button {
                            editingTemplate = template
                        } label: {
                            RecurringTemplateRow(template: template)
                        }
                        .buttonStyle(.plain)
                        .contextMenu {
                            Button {
                                template.isActive.toggle()
                                try? modelContext.save()
                            } label: {
                                if template.isActive {
                                    Label("暫停", systemImage: "pause.circle")
                                } else {
                                    Label("啟用", systemImage: "play.circle")
                                }
                            }
                            Button(role: .destructive) {
                                pendingDelete = template
                            } label: {
                                Label("刪除", systemImage: "trash")
                            }
                        }
                    }
                }
            }
        }
        .platformFormStyle()
        .northstarScreenBackground()
        .navigationTitle("定期交易")
        .platformInlineNavigationTitle()
        .toolbar {
            ToolbarItem {
                Button {
                    showAddSheet = true
                } label: {
                    Label("新增", systemImage: "plus")
                }
                .disabled(accounts.isEmpty)
                .keyboardShortcut("n", modifiers: .command)
            }
        }
        .sheet(isPresented: $showAddSheet) {
            RecurringTransactionEditorView(editing: nil, accounts: accounts)
        }
        .sheet(item: $editingTemplate) { template in
            RecurringTransactionEditorView(editing: template, accounts: accounts)
        }
        .alert(
            "刪除這個定期交易？",
            isPresented: Binding(
                get: { pendingDelete != nil },
                set: { if $0 == false { pendingDelete = nil } }
            )
        ) {
            Button("刪除", role: .destructive) {
                if let template = pendingDelete {
                    modelContext.delete(template)
                    try? modelContext.save()
                }
                pendingDelete = nil
            }
            Button("取消", role: .cancel) { pendingDelete = nil }
        } message: {
            Text("已自動寫入的歷史紀錄不會被刪除。")
        }
    }
}

private struct RecurringTemplateRow: View {
    let template: RecurringTransaction

    private var entryType: LedgerEntryType {
        LedgerEntryType.infer(amount: template.amount, category: template.category)
    }

    private var nextRunText: String {
        template.nextRunDate.formatted(date: .abbreviated, time: .omitted)
    }

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(entryType.tint.opacity(0.16))
                Image(systemName: entryType.symbolName)
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(entryType.tint)
            }
            .frame(width: 36, height: 36)

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(template.category.isEmpty ? "未分類" : template.category)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.primaryText)
                    if template.isActive == false {
                        Text("已暫停")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(NorthstarTheme.warning)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(NorthstarTheme.warning.opacity(0.14), in: Capsule())
                    }
                }
                Text("每月 \(template.dayOfMonth) 日 · 下次 \(nextRunText)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(NorthstarTheme.mutedText)
                if let account = template.account {
                    Text(account.name)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.mutedText)
                }
            }

            Spacer()

            Text(CurrencyFormatters.signedMoney(template.amount, currencyCode: template.currency))
                .font(.subheadline.weight(.bold))
                .foregroundStyle(template.amount >= 0 ? NorthstarTheme.growth : NorthstarTheme.risk)
                .monospacedDigit()
        }
        .padding(.vertical, 4)
    }
}

struct RecurringTransactionEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    let editing: RecurringTransaction?
    let accounts: [Account]

    @State private var entryType: LedgerEntryType
    @State private var amountText: String
    @State private var selectedCategory: String
    @State private var customCategoryText: String
    @State private var selectedAccountID: UUID?
    @State private var dayOfMonth: Int
    @State private var isActive: Bool
    @State private var note: String

    init(editing: RecurringTransaction?, accounts: [Account]) {
        self.editing = editing
        self.accounts = accounts

        let initialType: LedgerEntryType
        if let editing {
            initialType = LedgerEntryType.infer(amount: editing.amount, category: editing.category)
        } else {
            initialType = .expense
        }

        _entryType = State(initialValue: initialType)
        _amountText = State(initialValue: editing.map { Self.numberString(abs($0.amount)) } ?? "")
        _selectedAccountID = State(initialValue: editing?.account?.id ?? accounts.first?.id)
        _dayOfMonth = State(initialValue: editing?.dayOfMonth ?? Calendar(identifier: .gregorian).component(.day, from: Date()))
        _isActive = State(initialValue: editing?.isActive ?? true)
        _note = State(initialValue: editing?.note ?? "")

        let suggestions = LedgerCategoryCatalog.suggestions(for: initialType)
        if let existing = editing?.category, existing.isEmpty == false {
            if suggestions.contains(existing) {
                _selectedCategory = State(initialValue: existing)
                _customCategoryText = State(initialValue: "")
            } else {
                _selectedCategory = State(initialValue: LedgerCategoryCatalog.custom)
                _customCategoryText = State(initialValue: existing)
            }
        } else {
            _selectedCategory = State(initialValue: suggestions.first ?? "")
            _customCategoryText = State(initialValue: "")
        }
    }

    private static func numberString(_ value: Double) -> String {
        if value == value.rounded() {
            return String(Int(value))
        }
        return String(value)
    }

    private var selectedAccount: Account? {
        guard let selectedAccountID else { return nil }
        return accounts.first(where: { $0.id == selectedAccountID })
    }

    private var resolvedCategory: String {
        if selectedCategory == LedgerCategoryCatalog.custom {
            return customCategoryText.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return selectedCategory
    }

    private var canSave: Bool {
        Double(amountText) != nil
            && selectedAccount != nil
            && resolvedCategory.isEmpty == false
            && (Double(amountText) ?? 0) > 0
            && (1...31).contains(dayOfMonth)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("類型") {
                    Picker("類型", selection: $entryType) {
                        ForEach(LedgerEntryType.allCases) { type in
                            Text(type.displayTitle).tag(type)
                        }
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: entryType) { _, newValue in
                        let suggestions = LedgerCategoryCatalog.suggestions(for: newValue)
                        if suggestions.contains(selectedCategory) == false {
                            selectedCategory = suggestions.first ?? LedgerCategoryCatalog.custom
                        }
                    }
                }

                Section("基本資訊") {
                    Picker("帳戶", selection: $selectedAccountID) {
                        ForEach(accounts, id: \.id) { account in
                            Text("\(account.name) · \(account.currency)").tag(Optional(account.id))
                        }
                    }

                    Picker("分類", selection: $selectedCategory) {
                        ForEach(LedgerCategoryCatalog.suggestions(for: entryType), id: \.self) { category in
                            Text(category).tag(category)
                        }
                        Text(LedgerCategoryCatalog.custom).tag(LedgerCategoryCatalog.custom)
                    }

                    if selectedCategory == LedgerCategoryCatalog.custom {
                        TextField("自訂分類", text: $customCategoryText)
                    }

                    Stepper("每月 \(dayOfMonth) 日", value: $dayOfMonth, in: 1...31)
                    Toggle("啟用", isOn: $isActive)
                }

                Section("金額") {
                    TextField("金額", text: $amountText)
                        .decimalKeyboard()
                    if let account = selectedAccount {
                        Text("以 \(account.currency) 記錄。下次到期會自動寫入 \(account.name)。")
                            .font(.caption)
                            .foregroundStyle(NorthstarTheme.secondaryText)
                    }
                }

                Section("備註") {
                    TextField("備註（可選）", text: $note)
                }
            }
            .platformFormStyle()
            .navigationTitle(editing == nil ? "新增定期交易" : "編輯定期交易")
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

    private func save() {
        guard
            let magnitude = Double(amountText),
            let account = selectedAccount
        else { return }

        let signed = entryType.signedAmount(magnitude: magnitude)
        let categoryFinal = resolvedCategory
        let trimmedNote = note.trimmingCharacters(in: .whitespacesAndNewlines)

        if let editing {
            editing.amount = signed
            editing.currency = account.currency
            editing.category = categoryFinal
            editing.note = trimmedNote
            editing.account = account
            editing.dayOfMonth = dayOfMonth
            editing.isActive = isActive
            // Re-anchor next run if user changed dayOfMonth.
            let calendar = Calendar(identifier: .gregorian)
            let currentDay = calendar.component(.day, from: editing.nextRunDate)
            if currentDay != dayOfMonth {
                editing.nextRunDate = RecurringScheduler.initialRunDate(dayOfMonth: dayOfMonth)
            }
        } else {
            let template = RecurringTransaction(
                amount: signed,
                currency: account.currency,
                category: categoryFinal,
                note: trimmedNote,
                dayOfMonth: dayOfMonth,
                nextRunDate: RecurringScheduler.initialRunDate(dayOfMonth: dayOfMonth),
                isActive: isActive,
                account: account
            )
            modelContext.insert(template)
        }

        try? modelContext.save()
        dismiss()
    }
}
