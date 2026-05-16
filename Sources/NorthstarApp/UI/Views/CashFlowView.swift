import SwiftUI
import SwiftData

struct CashFlowView: View {
    let fxStore: FXRateStore

    @Environment(\.modelContext) private var modelContext
    @Query(sort: \LedgerTransaction.date, order: .reverse) private var transactions: [LedgerTransaction]
    @Query(sort: \Account.name) private var accounts: [Account]
    @AppStorage(IntentRoutingKeys.baseCurrency) private var baseCurrency: String = BaseCurrencyDefaults.default

    @State private var selectedMonth: Date = CashFlowView.startOfMonth(Date())
    @State private var showAddSheet = false
    @State private var editingTransaction: LedgerTransaction?
    @State private var pendingDelete: LedgerTransaction?

    private static func startOfMonth(_ date: Date) -> Date {
        let calendar = Calendar(identifier: .gregorian)
        let components = calendar.dateComponents([.year, .month], from: date)
        return calendar.date(from: components) ?? date
    }

    private var monthRange: (start: Date, end: Date) {
        let calendar = Calendar(identifier: .gregorian)
        let end = calendar.date(byAdding: .month, value: 1, to: selectedMonth) ?? selectedMonth
        return (selectedMonth, end)
    }

    private var monthTransactions: [LedgerTransaction] {
        let range = monthRange
        return transactions.filter { $0.date >= range.start && $0.date < range.end }
    }

    private var monthIncomeBase: Double {
        monthTransactions
            .filter { $0.amount > 0 && LedgerCategoryCatalog.investmentLinkedCategories.contains($0.category) == false }
            .reduce(0) { running, txn in
                running + (fxStore.convert(txn.amount, from: txn.currency, to: baseCurrency) ?? 0)
            }
    }

    private var monthExpenseBase: Double {
        monthTransactions
            .filter { $0.amount < 0 && LedgerCategoryCatalog.investmentLinkedCategories.contains($0.category) == false }
            .reduce(0) { running, txn in
                running + (fxStore.convert(txn.amount, from: txn.currency, to: baseCurrency) ?? 0)
            }
    }

    private var monthNetBase: Double {
        monthIncomeBase + monthExpenseBase
    }

    private var groupedByDay: [(day: Date, items: [LedgerTransaction])] {
        let calendar = Calendar(identifier: .gregorian)
        let grouped = Dictionary(grouping: monthTransactions) { txn in
            calendar.startOfDay(for: txn.date)
        }
        return grouped
            .map { (day: $0.key, items: $0.value.sorted { $0.date > $1.date }) }
            .sorted { $0.day > $1.day }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    monthHero
                    monthSelector
                    if monthTransactions.isEmpty {
                        emptyState
                    } else {
                        ForEach(groupedByDay, id: \.day) { group in
                            daySection(group)
                        }
                    }
                }
                .padding(20)
            }
            .northstarScreenBackground()
            .navigationTitle("收支")
            .platformLargeNavigationTitle()
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
                CashFlowEditorView(editing: nil, accounts: accounts)
            }
            .sheet(item: $editingTransaction) { txn in
                CashFlowEditorView(editing: txn, accounts: accounts)
            }
            .alert(
                "刪除這筆紀錄？",
                isPresented: Binding(
                    get: { pendingDelete != nil },
                    set: { if $0 == false { pendingDelete = nil } }
                )
            ) {
                Button("刪除", role: .destructive) {
                    if let txn = pendingDelete { delete(txn) }
                    pendingDelete = nil
                }
                Button("取消", role: .cancel) { pendingDelete = nil }
            } message: {
                Text("刪除後該帳戶餘額會自動重算。")
            }
        }
    }

    private var monthHero: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(monthTitle)
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.secondaryText)
                    Text(CurrencyFormatters.signedMoney(monthNetBase, currencyCode: baseCurrency))
                        .font(.system(size: 34, weight: .semibold))
                        .foregroundStyle(monthNetBase >= 0 ? NorthstarTheme.growth : NorthstarTheme.risk)
                        .monospacedDigit()
                }
                Spacer()
                Image(systemName: "arrow.left.arrow.right.circle.fill")
                    .font(.title2)
                    .foregroundStyle(NorthstarTheme.netWorth)
            }

            HStack(spacing: 16) {
                metricColumn("本月收入", CurrencyFormatters.money(monthIncomeBase, currencyCode: baseCurrency), tint: NorthstarTheme.growth)
                metricColumn("本月支出", CurrencyFormatters.money(abs(monthExpenseBase), currencyCode: baseCurrency), tint: NorthstarTheme.risk)
                metricColumn("筆數", "\(monthTransactions.count)", tint: NorthstarTheme.secondaryText)
                Spacer(minLength: 0)
            }

            Text("記錄薪水、伙食、訂閱等一般收支。投資相關的扣款 / 入帳會由「交易」自動寫入，這裡僅可檢視。")
                .font(.subheadline)
                .foregroundStyle(NorthstarTheme.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .northstarCardSurface()
    }

    private var monthSelector: some View {
        HStack(spacing: 12) {
            Button {
                shiftMonth(-1)
            } label: {
                Image(systemName: "chevron.left")
                    .font(.body.weight(.semibold))
            }
            .buttonStyle(.bordered)

            Text(monthTitle)
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity)

            Button {
                shiftMonth(1)
            } label: {
                Image(systemName: "chevron.right")
                    .font(.body.weight(.semibold))
            }
            .buttonStyle(.bordered)
            .disabled(isAtCurrentMonth)

            Button("本月") {
                selectedMonth = CashFlowView.startOfMonth(Date())
            }
            .buttonStyle(.bordered)
            .disabled(isAtCurrentMonth)
        }
        .padding(.vertical, 4)
    }

    private var isAtCurrentMonth: Bool {
        let calendar = Calendar(identifier: .gregorian)
        return calendar.isDate(selectedMonth, equalTo: Date(), toGranularity: .month)
    }

    private var monthTitle: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_Hant_TW")
        formatter.dateFormat = "yyyy 年 M 月"
        return formatter.string(from: selectedMonth)
    }

    private func shiftMonth(_ delta: Int) {
        let calendar = Calendar(identifier: .gregorian)
        if let next = calendar.date(byAdding: .month, value: delta, to: selectedMonth) {
            selectedMonth = CashFlowView.startOfMonth(next)
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(accounts.isEmpty ? "請先新增現金帳戶" : "本月還沒有紀錄")
                .font(.headline)
                .foregroundStyle(NorthstarTheme.primaryText)
            Text(accounts.isEmpty
                ? "前往「帳戶」分頁新增第一個現金帳戶，才能登錄收支。"
                : "點右上 + 新增收入或支出，或切換到其他月份檢視歷史紀錄。")
                .font(.subheadline)
                .foregroundStyle(NorthstarTheme.secondaryText)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .northstarCardSurface()
    }

    private func daySection(_ group: (day: Date, items: [LedgerTransaction])) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(group.day.formatted(.dateTime.year().month(.abbreviated).day().weekday(.abbreviated)))
                .font(.caption.weight(.bold))
                .foregroundStyle(NorthstarTheme.mutedText)
                .padding(.leading, 4)

            ForEach(group.items) { txn in
                CashFlowRow(
                    transaction: txn,
                    onTap: { handleTap(txn) },
                    onDelete: { pendingDelete = txn }
                )
            }
        }
    }

    private func handleTap(_ txn: LedgerTransaction) {
        if txn.linkedInvestmentRecordID != nil {
            return
        }
        editingTransaction = txn
    }

    private func metricColumn(_ label: String, _ value: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(NorthstarTheme.secondaryText)
            Text(value)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(tint)
                .monospacedDigit()
        }
    }

    private func delete(_ txn: LedgerTransaction) {
        guard txn.linkedInvestmentRecordID == nil else { return }
        let account = txn.account
        modelContext.delete(txn)
        account?.recomputeBalance()
        try? modelContext.save()
    }
}

private struct CashFlowRow: View {
    let transaction: LedgerTransaction
    let onTap: () -> Void
    let onDelete: () -> Void

    private var isLocked: Bool {
        transaction.linkedInvestmentRecordID != nil
    }

    private var entryType: LedgerEntryType {
        LedgerEntryType.infer(amount: transaction.amount, category: transaction.category)
    }

    var body: some View {
        Button(action: onTap) {
            rowBody
        }
        .buttonStyle(.plain)
        .contentShape(Rectangle())
        .contextMenu {
            if isLocked == false {
                Button(role: .destructive, action: onDelete) {
                    Label("刪除", systemImage: "trash")
                }
            }
        }
    }

    private var rowBody: some View {
        HStack(alignment: .center, spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(entryType.tint.opacity(0.16))
                Image(systemName: entryType.symbolName)
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(entryType.tint)
            }
            .frame(width: 38, height: 38)

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(transaction.category.isEmpty ? "未分類" : transaction.category)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.primaryText)
                        .lineLimit(1)
                    if isLocked {
                        Text("投資")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(NorthstarTheme.accent)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(NorthstarTheme.accent.opacity(0.14), in: Capsule())
                    }
                }
                HStack(spacing: 6) {
                    if let account = transaction.account {
                        Label(account.name, systemImage: "creditcard")
                            .labelStyle(.titleAndIcon)
                    }
                    if transaction.note.isEmpty == false {
                        Text("· \(transaction.note)")
                    }
                }
                .font(.caption.weight(.semibold))
                .foregroundStyle(NorthstarTheme.mutedText)
                .lineLimit(1)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 3) {
                Text(CurrencyFormatters.signedMoney(transaction.amount, currencyCode: transaction.currency))
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(transaction.amount >= 0 ? NorthstarTheme.growth : NorthstarTheme.risk)
                    .monospacedDigit()
                Text(transaction.date.formatted(date: .omitted, time: .shortened))
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(NorthstarTheme.secondaryText)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .northstarCardSurface()
    }
}

struct CashFlowEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    let editing: LedgerTransaction?
    let accounts: [Account]

    @State private var date: Date
    @State private var entryType: LedgerEntryType
    @State private var amountText: String
    @State private var selectedCategory: String
    @State private var customCategoryText: String
    @State private var selectedAccountID: UUID?
    @State private var note: String

    init(editing: LedgerTransaction?, accounts: [Account]) {
        self.editing = editing
        self.accounts = accounts

        let initialType: LedgerEntryType
        if let editing {
            initialType = LedgerEntryType.infer(amount: editing.amount, category: editing.category)
        } else {
            initialType = .expense
        }

        _date = State(initialValue: editing?.date ?? Date())
        _entryType = State(initialValue: initialType)
        _amountText = State(initialValue: editing.map { Self.numberString(abs($0.amount)) } ?? "")
        _note = State(initialValue: editing?.note ?? "")
        _selectedAccountID = State(initialValue: editing?.account?.id ?? accounts.first?.id)

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
    }

    private var isLockedInvestmentLink: Bool {
        editing?.linkedInvestmentRecordID != nil
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
                    DatePicker("日期", selection: $date, displayedComponents: .date)

                    if accounts.isEmpty == false {
                        Picker("帳戶", selection: $selectedAccountID) {
                            ForEach(accounts, id: \.id) { account in
                                Text("\(account.name) · \(account.currency)").tag(Optional(account.id))
                            }
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
                }

                Section("金額") {
                    TextField("金額", text: $amountText)
                        .decimalKeyboard()
                    if let account = selectedAccount {
                        Text("以 \(account.currency) 記錄。完成後 \(account.name) 餘額會自動更新。")
                            .font(.caption)
                            .foregroundStyle(NorthstarTheme.secondaryText)
                    }
                }

                Section("備註") {
                    TextField("備註（可選）", text: $note)
                }

                if isLockedInvestmentLink {
                    Section {
                        Label("此筆由投資交易自動產生，請至「交易」修改。", systemImage: "lock.fill")
                            .font(.caption)
                            .foregroundStyle(NorthstarTheme.warning)
                    }
                }
            }
            .platformFormStyle()
            .navigationTitle(editing == nil ? "新增收支" : "編輯收支")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(editing == nil ? "儲存" : "更新") { save() }
                        .disabled(!canSave || isLockedInvestmentLink)
                }
            }
            .disabled(isLockedInvestmentLink)
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
            let oldAccount = editing.account
            editing.date = date
            editing.amount = signed
            editing.currency = account.currency
            editing.category = categoryFinal
            editing.note = trimmedNote
            editing.account = account
            if let oldAccount, oldAccount !== account {
                oldAccount.recomputeBalance()
            }
            account.recomputeBalance()
        } else {
            let txn = LedgerTransaction(
                date: date,
                amount: signed,
                currency: account.currency,
                category: categoryFinal,
                note: trimmedNote,
                account: account
            )
            modelContext.insert(txn)
            account.recomputeBalance()
        }

        try? modelContext.save()
        dismiss()
    }
}

private extension View {
    @ViewBuilder
    func decimalKeyboard() -> some View {
        #if os(iOS)
        self.keyboardType(.decimalPad)
        #else
        self
        #endif
    }

    @ViewBuilder
    func platformFormStyle() -> some View {
        #if os(iOS)
        self.formStyle(.grouped)
        #else
        self
        #endif
    }
}
