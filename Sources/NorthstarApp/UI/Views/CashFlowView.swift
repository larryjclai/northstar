import SwiftUI
import SwiftData
import UniformTypeIdentifiers
#if os(macOS)
import AppKit
#endif

private struct PendingLedgerImport: Identifiable {
    let id = UUID()
    let rows: [LedgerCSVRow]
}

struct CashFlowView: View {
    let fxStore: FXRateStore
    let requestAdd: (AddSheetKind) -> Void

    @Environment(\.modelContext) private var modelContext
    @Query(sort: \LedgerTransaction.date, order: .reverse) private var transactions: [LedgerTransaction]
    @Query(sort: \Account.name) private var accounts: [Account]
    @AppStorage(IntentRoutingKeys.baseCurrency) private var baseCurrency: String = BaseCurrencyDefaults.default

    @State private var selectedMonth: Date = CashFlowView.startOfMonth(Date())
    @State private var editingTransaction: LedgerTransaction?
    @State private var editingTransfer: LedgerTransaction?
    @State private var pendingDelete: LedgerTransaction?
    @State private var searchText: String = ""
    @State private var selectedCategoryFilter: String? = nil
    @State private var isImporting = false
    @State private var pendingImport: PendingLedgerImport?
    @State private var importErrorMessage: String?
    @State private var previewingReceipt: ReceiptPreviewItem?
    @State private var isInSelectionMode = false
    @State private var selectedTransactionIDs: Set<UUID> = []
    @State private var pendingBulkDelete = false
    @State private var pendingBulkCategoryChange = false
    @State private var bulkCategoryDraft: String = ""

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
            .filter { $0.amount > 0 && LedgerCategoryCatalog.excludedFromCashFlowTotals.contains($0.category) == false }
            .reduce(0) { running, txn in
                running + (fxStore.convert(txn.amount, from: txn.currency, to: baseCurrency) ?? 0)
            }
    }

    private var monthExpenseBase: Double {
        monthTransactions
            .filter { $0.amount < 0 && LedgerCategoryCatalog.excludedFromCashFlowTotals.contains($0.category) == false }
            .reduce(0) { running, txn in
                running + (fxStore.convert(txn.amount, from: txn.currency, to: baseCurrency) ?? 0)
            }
    }

    private var monthNetBase: Double {
        monthIncomeBase + monthExpenseBase
    }

    private var monthCategories: [String] {
        let names = monthTransactions.map { $0.category.isEmpty ? "未分類" : $0.category }
        var seen: Set<String> = []
        var ordered: [String] = []
        for name in names where seen.insert(name).inserted {
            ordered.append(name)
        }
        return ordered.sorted()
    }

    private var filteredMonthTransactions: [LedgerTransaction] {
        let trimmed = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return monthTransactions.filter { txn in
            let displayCategory = txn.category.isEmpty ? "未分類" : txn.category
            if let selectedCategoryFilter, displayCategory != selectedCategoryFilter {
                return false
            }
            guard trimmed.isEmpty == false else { return true }
            return displayCategory.lowercased().contains(trimmed)
                || txn.note.lowercased().contains(trimmed)
        }
    }

    private var hasActiveFilter: Bool {
        selectedCategoryFilter != nil || searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
    }

    enum LedgerDayItem: Identifiable {
        case single(LedgerTransaction)
        case split(id: UUID, members: [LedgerTransaction])
        case transfer(id: UUID, members: [LedgerTransaction])

        var id: String {
            switch self {
            case .single(let txn): return "single-\(txn.id.uuidString)"
            case .split(let id, _): return "split-\(id.uuidString)"
            case .transfer(let id, _): return "transfer-\(id.uuidString)"
            }
        }

        var sortDate: Date {
            switch self {
            case .single(let txn): return txn.date
            case .split(_, let members), .transfer(_, let members):
                return members.first?.date ?? .distantPast
            }
        }
    }

    private var groupedByDay: [(day: Date, items: [LedgerDayItem])] {
        let calendar = Calendar(identifier: .gregorian)
        let byDay = Dictionary(grouping: filteredMonthTransactions) { txn in
            calendar.startOfDay(for: txn.date)
        }
        return byDay
            .map { day, items in
                (day: day, items: Self.collapseSplits(items.sorted { $0.date > $1.date }))
            }
            .sorted { $0.day > $1.day }
    }

    /// Walks the day's transactions and folds rows that share a `groupID` into a single
    /// `.split` or `.transfer` item, using `LedgerGroupClassifier` to tell the two apart.
    /// Rows without a group, or singleton-grouped rows, are emitted as `.single`.
    private static func collapseSplits(_ items: [LedgerTransaction]) -> [LedgerDayItem] {
        var groupBuckets: [UUID: [LedgerTransaction]] = [:]
        for txn in items {
            if let gid = txn.groupID {
                groupBuckets[gid, default: []].append(txn)
            }
        }

        var result: [LedgerDayItem] = []
        var emittedGroups = Set<UUID>()
        for txn in items {
            if let gid = txn.groupID {
                guard emittedGroups.insert(gid).inserted else { continue }
                let members = groupBuckets[gid] ?? []
                switch LedgerGroupClassifier.classify(members) {
                case .transfer:
                    result.append(.transfer(id: gid, members: members))
                case .split:
                    result.append(.split(id: gid, members: members))
                case .singleton:
                    if let only = members.first {
                        result.append(.single(only))
                    }
                case .unknown:
                    // Fallback: surface every member as a regular row so nothing gets hidden.
                    for member in members {
                        result.append(.single(member))
                    }
                }
            } else {
                result.append(.single(txn))
            }
        }
        return result
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    monthHero
                    monthSelector
                    if monthCategories.isEmpty == false {
                        categoryFilterStrip
                    }
                    if monthTransactions.isEmpty {
                        emptyState
                    } else if filteredMonthTransactions.isEmpty {
                        filteredEmptyState
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
            .searchable(text: $searchText, prompt: "搜尋分類或備註")
            .onChange(of: selectedMonth) { _, _ in
                searchText = ""
                selectedCategoryFilter = nil
            }
            .onChange(of: isInSelectionMode) { _, newValue in
                if newValue == false {
                    selectedTransactionIDs.removeAll()
                }
            }
            .toolbar(content: toolbarContent)
            .safeAreaInset(edge: .bottom) {
                if isInSelectionMode {
                    bulkActionBar
                }
            }
            .sheet(item: $editingTransaction) { txn in
                CashFlowEditorView(editing: txn, accounts: accounts, recentTransactions: transactions)
            }
            .sheet(item: $editingTransfer) { txn in
                TransferEditorView(editing: txn, accounts: accounts, recentTransactions: transactions)
            }
            .sheet(item: $previewingReceipt) { item in
                ReceiptPreviewView(data: item.data) {
                    previewingReceipt = nil
                }
            }
            .sheet(isPresented: $pendingBulkCategoryChange) {
                BulkCategorySheet(
                    initialValue: bulkCategoryDraft,
                    suggestionType: bulkSuggestionType,
                    onCancel: { pendingBulkCategoryChange = false },
                    onApply: { newCategory in
                        applyBulkCategory(newCategory)
                        pendingBulkCategoryChange = false
                    }
                )
            }
            .alert(
                "刪除選取的紀錄？",
                isPresented: $pendingBulkDelete
            ) {
                Button("刪除", role: .destructive, action: performBulkDelete)
                Button("取消", role: .cancel) {}
            } message: {
                Text("\(deletableSelectedTransactions.count) 筆會被刪除，相關帳戶餘額自動重算。投資連動的列無法刪除，會跳過。")
            }
            .sheet(item: $pendingImport) { pending in
                LedgerCSVImportPreviewView(
                    rows: pending.rows,
                    onCancel: { pendingImport = nil },
                    onConfirm: { confirmImport(pending.rows) }
                )
            }
            .fileImporter(
                isPresented: $isImporting,
                allowedContentTypes: [.commaSeparatedText, .text, .plainText],
                allowsMultipleSelection: false
            ) { result in
                handleImportSelection(result)
            }
            .alert("匯入失敗", isPresented: importErrorBinding) {
                Button("確定", role: .cancel) { importErrorMessage = nil }
            } message: {
                Text(importErrorMessage ?? "")
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

    private var filteredEmptyState: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("找不到符合的紀錄")
                .font(.headline)
                .foregroundStyle(NorthstarTheme.primaryText)
            Text("試試清除分類或搜尋條件。")
                .font(.subheadline)
                .foregroundStyle(NorthstarTheme.secondaryText)
            Button("清除篩選") {
                searchText = ""
                selectedCategoryFilter = nil
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.small)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .northstarCardSurface()
    }

    private var categoryFilterStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                CategoryChip(
                    label: "全部",
                    isSelected: selectedCategoryFilter == nil,
                    action: { selectedCategoryFilter = nil }
                )
                ForEach(monthCategories, id: \.self) { category in
                    CategoryChip(
                        label: category,
                        isSelected: selectedCategoryFilter == category,
                        action: {
                            selectedCategoryFilter = selectedCategoryFilter == category ? nil : category
                        }
                    )
                }
            }
            .padding(.vertical, 2)
        }
    }

    private func daySection(_ group: (day: Date, items: [LedgerDayItem])) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(group.day.formatted(.dateTime.year().month(.abbreviated).day().weekday(.abbreviated)))
                .font(.caption.weight(.bold))
                .foregroundStyle(NorthstarTheme.mutedText)
                .padding(.leading, 4)

            ForEach(group.items) { item in
                switch item {
                case .single(let txn):
                    CashFlowRow(
                        transaction: txn,
                        isInSelectionMode: isInSelectionMode,
                        isSelected: selectedTransactionIDs.contains(txn.id),
                        onTap: { handleTap(txn) },
                        onDelete: { pendingDelete = txn },
                        onToggleSelection: { toggleSelection([txn]) },
                        onPreviewReceipt: { data in previewingReceipt = ReceiptPreviewItem(data: data) }
                    )
                case .split(_, let members):
                    CashFlowSplitGroupRow(
                        members: members,
                        isInSelectionMode: isInSelectionMode,
                        isSelected: isGroupSelected(members),
                        onTap: { handleTapSplitGroup(members) },
                        onDelete: { pendingDelete = members.first },
                        onToggleSelection: { toggleSelection(members) },
                        onPreviewReceipt: { data in previewingReceipt = ReceiptPreviewItem(data: data) }
                    )
                case .transfer(_, let members):
                    CashFlowTransferRow(
                        members: members,
                        isInSelectionMode: isInSelectionMode,
                        isSelected: isGroupSelected(members),
                        onTap: { handleTapTransfer(members) },
                        onDelete: { pendingDelete = members.first },
                        onToggleSelection: { toggleSelection(members) },
                        onPreviewReceipt: { data in previewingReceipt = ReceiptPreviewItem(data: data) }
                    )
                }
            }
        }
    }

    // MARK: - Selection mode

    @ToolbarContentBuilder
    private func toolbarContent() -> some ToolbarContent {
        if isInSelectionMode {
            ToolbarItem(placement: .cancellationAction) {
                Button("完成") {
                    isInSelectionMode = false
                }
            }
            ToolbarItemGroup {
                Button(action: toggleSelectAll) {
                    Label(
                        allFilteredSelected ? "全不選" : "選擇全部",
                        systemImage: allFilteredSelected ? "square" : "checkmark.square"
                    )
                }
                .disabled(filteredMonthTransactions.isEmpty)
            }
        } else {
            ToolbarItemGroup {
                Button(action: enterSelectionMode) {
                    Label("選取", systemImage: "checkmark.circle")
                }
                .disabled(monthTransactions.isEmpty)

                Button(action: { isImporting = true }) {
                    Label("匯入 CSV", systemImage: "tray.and.arrow.down")
                }
                .disabled(accounts.isEmpty)
                .keyboardShortcut("o", modifiers: .command)

                Button(action: exportCSV) {
                    Label("匯出 CSV", systemImage: "square.and.arrow.down")
                }
                .disabled(exportableTransactions.isEmpty)
                .keyboardShortcut("e", modifiers: .command)
            }

            ToolbarItem {
                AddEntryMenu(primary: .cashflow, onSelect: requestAdd)
                    .disabled(accounts.isEmpty)
            }
        }
    }

    private var bulkActionBar: some View {
        HStack(spacing: 14) {
            Text("\(selectedTransactionIDs.count) 筆已選取")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(NorthstarTheme.secondaryText)
            Spacer()
            Button {
                bulkCategoryDraft = ""
                pendingBulkCategoryChange = true
            } label: {
                Label("改分類", systemImage: "tag")
            }
            .disabled(editableSelectedTransactions.isEmpty)

            Button(action: performBulkReviewed) {
                Label("已審核", systemImage: "checkmark.seal")
            }
            .disabled(reviewableSelectedTransactions.isEmpty)

            Button(role: .destructive) {
                pendingBulkDelete = true
            } label: {
                Label("刪除", systemImage: "trash")
            }
            .disabled(deletableSelectedTransactions.isEmpty)
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.thinMaterial)
    }

    private func enterSelectionMode() {
        isInSelectionMode = true
        selectedTransactionIDs.removeAll()
    }

    private func toggleSelection(_ members: [LedgerTransaction]) {
        // For a split / transfer group, treat all members as a single selection unit:
        // selecting toggles the whole group on / off, since bulk actions like
        // "改分類" or "刪除" only make sense for the entire user-facing entry.
        let ids = members.map(\.id)
        let allSelected = ids.allSatisfy { selectedTransactionIDs.contains($0) }
        if allSelected {
            for id in ids { selectedTransactionIDs.remove(id) }
        } else {
            for id in ids { selectedTransactionIDs.insert(id) }
        }
    }

    private func isGroupSelected(_ members: [LedgerTransaction]) -> Bool {
        guard members.isEmpty == false else { return false }
        return members.allSatisfy { selectedTransactionIDs.contains($0.id) }
    }

    private var allFilteredSelected: Bool {
        guard filteredMonthTransactions.isEmpty == false else { return false }
        return filteredMonthTransactions.allSatisfy { selectedTransactionIDs.contains($0.id) }
    }

    private func toggleSelectAll() {
        if allFilteredSelected {
            for txn in filteredMonthTransactions {
                selectedTransactionIDs.remove(txn.id)
            }
        } else {
            for txn in filteredMonthTransactions {
                selectedTransactionIDs.insert(txn.id)
            }
        }
    }

    private var selectedTransactions: [LedgerTransaction] {
        transactions.filter { selectedTransactionIDs.contains($0.id) }
    }

    /// Editable means the row's category can be changed safely — investment-linked rows
    /// derive their category from the linked record, so we skip them in "改分類".
    private var editableSelectedTransactions: [LedgerTransaction] {
        selectedTransactions.filter { $0.linkedInvestmentRecordID == nil }
    }

    /// Investment-linked rows are read-only — exclude them from bulk delete.
    private var deletableSelectedTransactions: [LedgerTransaction] {
        selectedTransactions.filter { $0.linkedInvestmentRecordID == nil }
    }

    /// "標記已審核" can apply to any selected row (including investment-linked ones), since
    /// reviewed is purely metadata that doesn't change ledger semantics.
    private var reviewableSelectedTransactions: [LedgerTransaction] {
        selectedTransactions.filter { $0.isReviewed == false }
    }

    /// Pick category suggestions based on what the user is changing — if every selected
    /// editable row is income, surface income categories first; same for expense; otherwise
    /// fall back to expense suggestions (more common).
    private var bulkSuggestionType: LedgerEntryType {
        let signs = editableSelectedTransactions.map { $0.amount >= 0 }
        if signs.isEmpty { return .expense }
        if signs.allSatisfy({ $0 }) { return .income }
        return .expense
    }

    private func applyBulkCategory(_ newCategory: String) {
        let trimmed = newCategory.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.isEmpty == false else { return }
        for txn in editableSelectedTransactions {
            txn.category = trimmed
        }
        try? modelContext.save()
        exitSelectionAfterBulk()
    }

    private func performBulkReviewed() {
        for txn in reviewableSelectedTransactions {
            txn.isReviewed = true
        }
        try? modelContext.save()
        exitSelectionAfterBulk()
    }

    private func performBulkDelete() {
        var touchedAccounts: Set<UUID> = []
        var deletedGroupIDs: Set<UUID> = []
        for txn in deletableSelectedTransactions {
            if let gid = txn.groupID {
                // Mirror single-row delete semantics: a group goes together so we don't
                // strand half a split / transfer.
                guard deletedGroupIDs.insert(gid).inserted else { continue }
                for sibling in transactions where sibling.groupID == gid {
                    if let id = sibling.account?.id { touchedAccounts.insert(id) }
                    modelContext.delete(sibling)
                }
            } else {
                if let id = txn.account?.id { touchedAccounts.insert(id) }
                modelContext.delete(txn)
            }
        }
        try? modelContext.save()
        for account in accounts where touchedAccounts.contains(account.id) {
            account.recomputeBalance()
        }
        try? modelContext.save()
        exitSelectionAfterBulk()
    }

    private func exitSelectionAfterBulk() {
        selectedTransactionIDs.removeAll()
        isInSelectionMode = false
    }

    private func handleTap(_ txn: LedgerTransaction) {
        if txn.linkedInvestmentRecordID != nil {
            return
        }
        editingTransaction = txn
    }

    private func handleTapSplitGroup(_ members: [LedgerTransaction]) {
        // Open editing on the first member; the editor's init detects the groupID and
        // loads every sibling as a split line.
        guard let first = members.first else { return }
        editingTransaction = first
    }

    private func handleTapTransfer(_ members: [LedgerTransaction]) {
        // For a transfer, open the dedicated editor instead of the cash-flow editor.
        // Either leg is a fine anchor — the editor pulls both via groupID.
        guard let first = members.first else { return }
        editingTransfer = first
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
        if let gid = txn.groupID {
            // Delete every sibling in the split group together — a partial delete would
            // leave half-orphans that look like detached rows in the list.
            for member in transactions where member.groupID == gid {
                modelContext.delete(member)
            }
        } else {
            modelContext.delete(txn)
        }
        account?.recomputeBalance()
        try? modelContext.save()
    }

    // MARK: - CSV import / export

    private var exportableTransactions: [LedgerTransaction] {
        transactions.filter { $0.linkedInvestmentRecordID == nil }
    }

    private var importErrorBinding: Binding<Bool> {
        Binding(
            get: { importErrorMessage != nil },
            set: { if $0 == false { importErrorMessage = nil } }
        )
    }

    private func handleImportSelection(_ result: Result<[URL], Error>) {
        switch result {
        case .failure(let error):
            importErrorMessage = error.localizedDescription
        case .success(let urls):
            guard let url = urls.first else { return }
            let needsScope = url.startAccessingSecurityScopedResource()
            defer { if needsScope { url.stopAccessingSecurityScopedResource() } }

            do {
                let data = try Data(contentsOf: url)
                guard let text = String(data: data, encoding: .utf8) else {
                    importErrorMessage = "檔案不是 UTF-8 編碼。"
                    return
                }
                let existingIDs = Set(transactions.map(\.id))
                let rows = LedgerCSVParser.parse(text, existingIDs: existingIDs)
                if rows.isEmpty {
                    importErrorMessage = "檔案中沒有可解析的資料列。"
                    return
                }
                pendingImport = PendingLedgerImport(rows: rows)
            } catch {
                importErrorMessage = error.localizedDescription
            }
        }
    }

    private func confirmImport(_ rows: [LedgerCSVRow]) {
        _ = LedgerCSVImporter.apply(rows, context: modelContext, accounts: accounts)
        pendingImport = nil
    }

    private func exportCSV() {
        #if os(macOS)
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.commaSeparatedText]
        panel.nameFieldStringValue = "northstar-ledger.csv"
        guard panel.runModal() == .OK, let url = panel.url else { return }

        do {
            try csvString.write(to: url, atomically: true, encoding: .utf8)
        } catch {
            NSSound.beep()
        }
        #endif
    }

    private var csvString: String {
        let header = LedgerCSVParser.headerLine
        let rows = exportableTransactions.map { txn in
            [
                txn.id.uuidString,
                CSVText.format(txn.date),
                String(txn.amount),
                txn.currency,
                txn.category,
                txn.note,
                txn.account?.name ?? ""
            ]
            .map(CSVText.escape)
            .joined(separator: ",")
        }
        return ([header] + rows).joined(separator: "\n")
    }
}

private struct CategoryChip: View {
    let label: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundStyle(isSelected ? NorthstarTheme.primaryText : NorthstarTheme.secondaryText)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(
                    Capsule()
                        .fill(isSelected ? NorthstarTheme.netWorth.opacity(0.18) : Color.nsSecondarySurface)
                )
                .overlay(
                    Capsule()
                        .stroke(isSelected ? NorthstarTheme.netWorth : Color.nsBorder, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }
}

private struct CashFlowRow: View {
    let transaction: LedgerTransaction
    let isInSelectionMode: Bool
    let isSelected: Bool
    let onTap: () -> Void
    let onDelete: () -> Void
    let onToggleSelection: () -> Void
    let onPreviewReceipt: (Data) -> Void

    private var isLocked: Bool {
        transaction.linkedInvestmentRecordID != nil
    }

    private var entryType: LedgerEntryType {
        LedgerEntryType.infer(amount: transaction.amount, category: transaction.category)
    }

    var body: some View {
        Button(action: handleTap) {
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
        .overlay {
            if isSelected {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(NorthstarTheme.accent, lineWidth: 1.5)
            }
        }
    }

    private func handleTap() {
        if isInSelectionMode {
            // Investment-linked rows are read-only, but we still allow them to participate
            // in multi-select for bulk operations like "mark reviewed" (delete stays disabled).
            onToggleSelection()
        } else {
            onTap()
        }
    }

    private var rowBody: some View {
        HStack(alignment: .center, spacing: 12) {
            if isInSelectionMode {
                SelectionCheckmark(isSelected: isSelected)
            }
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
                    if transaction.isReviewed {
                        Image(systemName: "checkmark.seal.fill")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(NorthstarTheme.growth)
                            .accessibilityLabel("已審核")
                    }
                }
                HStack(spacing: 6) {
                    if let account = transaction.account {
                        Label(account.name, systemImage: "creditcard")
                            .labelStyle(.titleAndIcon)
                    }
                    if let data = transaction.receipt {
                        ReceiptThumbnail(data: data, size: 22) {
                            onPreviewReceipt(data)
                        }
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

/// Small leading-edge checkbox shown only in multi-select mode. Standalone so each row
/// type can paste it in front of its existing content without invasive layout changes.
struct SelectionCheckmark: View {
    let isSelected: Bool

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 4, style: .continuous)
                .fill(isSelected ? NorthstarTheme.accent : Color.clear)
                .overlay {
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .stroke(isSelected ? NorthstarTheme.accent : Color.nsBorder, lineWidth: 1)
                }
                .frame(width: 18, height: 18)
            if isSelected {
                Image(systemName: "checkmark")
                    .font(.caption2.weight(.heavy))
                    .foregroundStyle(Color.nsBackground)
            }
        }
        .accessibilityLabel(isSelected ? "已選取" : "未選取")
    }
}

private struct CashFlowSplitGroupRow: View {
    let members: [LedgerTransaction]
    let isInSelectionMode: Bool
    let isSelected: Bool
    let onTap: () -> Void
    let onDelete: () -> Void
    let onToggleSelection: () -> Void
    let onPreviewReceipt: (Data) -> Void

    private var entryType: LedgerEntryType {
        guard let first = members.first else { return .expense }
        return LedgerEntryType.infer(amount: first.amount, category: first.category)
    }

    private var totalAmount: Double {
        members.reduce(0) { $0 + $1.amount }
    }

    private var currency: String {
        members.first?.currency ?? "TWD"
    }

    /// Receipts only attach to the first sibling per the split builder; if present, surface it.
    private var receiptData: Data? {
        members.first(where: { $0.receipt != nil })?.receipt
    }

    private var sharedNote: String {
        // The builder writes the same shared prefix into each member; take it from the
        // first one. If line-specific notes were attached, the row breakdown shows them.
        members.first?.note ?? ""
    }

    var body: some View {
        Button(action: handleTap) {
            content
        }
        .buttonStyle(.plain)
        .contentShape(Rectangle())
        .contextMenu {
            Button(role: .destructive, action: onDelete) {
                Label("刪除整組", systemImage: "trash")
            }
        }
        .overlay {
            if isSelected {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(NorthstarTheme.accent, lineWidth: 1.5)
            }
        }
    }

    private func handleTap() {
        if isInSelectionMode {
            onToggleSelection()
        } else {
            onTap()
        }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 12) {
                if isInSelectionMode {
                    SelectionCheckmark(isSelected: isSelected)
                }
                ZStack {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(entryType.tint.opacity(0.16))
                    Image(systemName: "rectangle.split.3x1")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(entryType.tint)
                }
                .frame(width: 38, height: 38)

                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text("拆分 · \(members.count) 項")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(NorthstarTheme.primaryText)
                    }
                    HStack(spacing: 6) {
                        if let account = members.first?.account {
                            Label(account.name, systemImage: "creditcard")
                                .labelStyle(.titleAndIcon)
                        }
                        if let data = receiptData {
                            ReceiptThumbnail(data: data, size: 22) {
                                onPreviewReceipt(data)
                            }
                        }
                        if sharedNote.isEmpty == false {
                            Text("· \(sharedNote)")
                                .lineLimit(1)
                        }
                    }
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(NorthstarTheme.mutedText)
                }

                Spacer()

                Text(CurrencyFormatters.signedMoney(totalAmount, currencyCode: currency))
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(totalAmount >= 0 ? NorthstarTheme.growth : NorthstarTheme.risk)
                    .monospacedDigit()
            }

            VStack(alignment: .leading, spacing: 4) {
                ForEach(members) { member in
                    HStack(spacing: 8) {
                        Circle()
                            .fill(NorthstarTheme.mutedText.opacity(0.4))
                            .frame(width: 4, height: 4)
                        Text(member.category.isEmpty ? "未分類" : member.category)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(NorthstarTheme.secondaryText)
                        Spacer()
                        Text(CurrencyFormatters.signedMoney(member.amount, currencyCode: member.currency))
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(NorthstarTheme.secondaryText)
                            .monospacedDigit()
                    }
                }
            }
            .padding(.leading, 50)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .northstarCardSurface()
    }
}

private struct CashFlowTransferRow: View {
    let members: [LedgerTransaction]
    let isInSelectionMode: Bool
    let isSelected: Bool
    let onTap: () -> Void
    let onDelete: () -> Void
    let onToggleSelection: () -> Void
    let onPreviewReceipt: (Data) -> Void

    private var source: LedgerTransaction? {
        LedgerGroupClassifier.sourceLeg(of: members)
    }

    private var destination: LedgerTransaction? {
        LedgerGroupClassifier.destinationLeg(of: members)
    }

    private var isCrossCurrency: Bool {
        guard let s = source?.currency, let d = destination?.currency else { return false }
        return s != d
    }

    private var implicitRate: Double? {
        guard let source, let destination, isCrossCurrency else { return nil }
        return TransferBuilder.implicitRate(
            sourceCurrency: source.currency,
            sourceMagnitude: abs(source.amount),
            destinationCurrency: destination.currency,
            destinationMagnitude: abs(destination.amount)
        )
    }

    private var note: String {
        source?.note ?? destination?.note ?? ""
    }

    private var receiptData: Data? {
        members.first(where: { $0.receipt != nil })?.receipt
    }

    var body: some View {
        Button(action: handleTap) {
            content
        }
        .buttonStyle(.plain)
        .contentShape(Rectangle())
        .contextMenu {
            Button(role: .destructive, action: onDelete) {
                Label("刪除整組", systemImage: "trash")
            }
        }
        .overlay {
            if isSelected {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(NorthstarTheme.accent, lineWidth: 1.5)
            }
        }
    }

    private func handleTap() {
        if isInSelectionMode {
            onToggleSelection()
        } else {
            onTap()
        }
    }

    private var content: some View {
        HStack(alignment: .center, spacing: 12) {
            if isInSelectionMode {
                SelectionCheckmark(isSelected: isSelected)
            }
            ZStack {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(NorthstarTheme.netWorth.opacity(0.16))
                Image(systemName: "arrow.left.arrow.right")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(NorthstarTheme.netWorth)
            }
            .frame(width: 38, height: 38)

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(isCrossCurrency ? "外幣兌換" : "轉帳")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.primaryText)
                }
                HStack(spacing: 6) {
                    Text("\(source?.account?.name ?? "—") → \(destination?.account?.name ?? "—")")
                        .lineLimit(1)
                    if let data = receiptData {
                        ReceiptThumbnail(data: data, size: 22) {
                            onPreviewReceipt(data)
                        }
                    }
                    if note.isEmpty == false {
                        Text("· \(note)")
                            .lineLimit(1)
                    }
                }
                .font(.caption.weight(.semibold))
                .foregroundStyle(NorthstarTheme.mutedText)
                if let rate = implicitRate,
                   let src = source?.currency,
                   let dest = destination?.currency {
                    Text("1 \(src) ≈ \(Self.rateString(rate)) \(dest)")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.secondaryText)
                        .monospacedDigit()
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 3) {
                if let source {
                    Text(CurrencyFormatters.money(abs(source.amount), currencyCode: source.currency))
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(NorthstarTheme.primaryText)
                        .monospacedDigit()
                }
                if let destination, isCrossCurrency {
                    Text(CurrencyFormatters.money(abs(destination.amount), currencyCode: destination.currency))
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.secondaryText)
                        .monospacedDigit()
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .northstarCardSurface()
    }

    private static func rateString(_ rate: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = 2
        formatter.maximumFractionDigits = 6
        return formatter.string(from: NSNumber(value: rate)) ?? String(format: "%.4f", rate)
    }
}

struct CashFlowEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    struct SplitLine: Identifiable, Equatable {
        let id: UUID
        var category: String
        var customCategoryText: String
        var amountText: String

        init(
            id: UUID = UUID(),
            category: String,
            customCategoryText: String = "",
            amountText: String = ""
        ) {
            self.id = id
            self.category = category
            self.customCategoryText = customCategoryText
            self.amountText = amountText
        }

        var resolvedCategory: String {
            if category == LedgerCategoryCatalog.custom {
                return customCategoryText.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            return category
        }
    }

    let editing: LedgerTransaction?
    let accounts: [Account]
    let recentTransactions: [LedgerTransaction]

    @State private var date: Date
    @State private var entryType: LedgerEntryType
    @State private var amountText: String
    @State private var selectedCategory: String
    @State private var customCategoryText: String
    @State private var selectedAccountID: UUID?
    @State private var note: String
    @State private var receiptData: Data?
    @State private var isSplit: Bool
    @State private var splitLines: [SplitLine]

    init(
        editing: LedgerTransaction?,
        accounts: [Account],
        recentTransactions: [LedgerTransaction] = [],
        initialEntryType: LedgerEntryType? = nil
    ) {
        self.editing = editing
        self.accounts = accounts
        self.recentTransactions = recentTransactions

        let initialType: LedgerEntryType
        if let editing {
            initialType = LedgerEntryType.infer(amount: editing.amount, category: editing.category)
        } else {
            initialType = initialEntryType ?? .expense
        }

        _date = State(initialValue: editing?.date ?? Date())
        _entryType = State(initialValue: initialType)
        _amountText = State(initialValue: editing.map { Self.numberString(abs($0.amount)) } ?? "")
        _note = State(initialValue: editing?.note ?? "")
        _selectedAccountID = State(initialValue: editing?.account?.id ?? accounts.first?.id)
        _receiptData = State(initialValue: editing?.receipt)

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

        // Detect split-group edit: more than one sibling with the same groupID means we
        // should open in split mode with all siblings loaded as lines.
        if let editing,
           let groupID = editing.groupID {
            let siblings = recentTransactions
                .filter { $0.groupID == groupID }
                .sorted { $0.id.uuidString < $1.id.uuidString }
            if siblings.count >= 2 {
                let lines = siblings.map { sibling -> SplitLine in
                    let raw = sibling.category
                    if suggestions.contains(raw) {
                        return SplitLine(category: raw, amountText: Self.numberString(abs(sibling.amount)))
                    }
                    return SplitLine(
                        category: LedgerCategoryCatalog.custom,
                        customCategoryText: raw,
                        amountText: Self.numberString(abs(sibling.amount))
                    )
                }
                _isSplit = State(initialValue: true)
                _splitLines = State(initialValue: lines)
                return
            }
        }

        _isSplit = State(initialValue: false)
        _splitLines = State(initialValue: [])
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

    private var recentCategorySuggestions: [String] {
        RecentCategorySuggester.topCategories(
            from: recentTransactions,
            type: entryType
        )
    }

    private func applyCategoryChip(_ category: String) {
        let suggestions = LedgerCategoryCatalog.suggestions(for: entryType)
        if suggestions.contains(category) {
            selectedCategory = category
            customCategoryText = ""
        } else {
            selectedCategory = LedgerCategoryCatalog.custom
            customCategoryText = category
        }
    }

    private var evaluatedAmount: Double? {
        AmountExpression.evaluate(amountText)
    }

    /// True when the user typed something more elaborate than a single number that we
    /// successfully evaluated — surface a "= 235" hint underneath the field.
    private var amountShowsExpressionPreview: Bool {
        guard let evaluated = evaluatedAmount else { return false }
        let trimmed = amountText.trimmingCharacters(in: .whitespacesAndNewlines)
        if let direct = Double(trimmed.replacingOccurrences(of: ",", with: ".")),
           direct == evaluated {
            return false
        }
        return true
    }

    private var canSave: Bool {
        disabledReason == nil
    }

    /// Returns the first unmet save requirement so the editor can surface an inline
    /// hint instead of a silently disabled Save button.
    private var disabledReason: String? {
        if isLockedInvestmentLink {
            return nil  // toolbar is already explicitly disabled with a separate notice card
        }
        if selectedAccount == nil {
            return "請先選擇帳戶"
        }
        if isSplit {
            if splitValidatedLines() == nil {
                return "請完成所有拆分明細"
            }
            return nil
        }
        if (evaluatedAmount ?? 0) <= 0 {
            return "輸入金額後即可儲存"
        }
        if resolvedCategory.isEmpty {
            return "請選擇分類"
        }
        return nil
    }

    /// Returns the evaluated lines if every split row is valid, otherwise nil.
    /// Used by both `canSave` and `save()` so the validation rules stay in one place.
    private func splitValidatedLines() -> [SplitTransactionBuilder.Line]? {
        guard splitLines.isEmpty == false else { return nil }
        var built: [SplitTransactionBuilder.Line] = []
        for line in splitLines {
            let category = line.resolvedCategory
            guard category.isEmpty == false else { return nil }
            guard let magnitude = AmountExpression.evaluate(line.amountText), magnitude > 0 else {
                return nil
            }
            built.append(.init(category: category, magnitude: magnitude))
        }
        return built
    }

    private var splitAllocatedTotal: Double {
        splitLines.reduce(0) { running, line in
            running + (AmountExpression.evaluate(line.amountText) ?? 0)
        }
    }

    private var isLockedInvestmentLink: Bool {
        editing?.linkedInvestmentRecordID != nil
    }

    var body: some View {
        NavigationStack {
            SheetCardScroll {
                typeSegmentedHero

                identityCard

                amountCard

                metaCard

                if isLockedInvestmentLink {
                    GlassFormCard {
                        Label("此筆由投資交易自動產生，請至「交易」修改。", systemImage: "lock.fill")
                            .font(.caption)
                            .foregroundStyle(NorthstarTheme.warning)
                    }
                }

                DisabledHintBanner(reason: disabledReason)
            }
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

    private var typeSegmentedHero: some View {
        Picker("類型", selection: $entryType) {
            ForEach(LedgerEntryType.allCases) { type in
                Text(type.displayTitle).tag(type)
            }
        }
        .pickerStyle(.segmented)
        .labelsHidden()
        .onChange(of: entryType) { _, newValue in
            let suggestions = LedgerCategoryCatalog.suggestions(for: newValue)
            if suggestions.contains(selectedCategory) == false {
                selectedCategory = suggestions.first ?? LedgerCategoryCatalog.custom
            }
        }
    }

    @ViewBuilder
    private var identityCard: some View {
        GlassFormCard("基本資訊") {
            if accounts.isEmpty == false {
                FieldRow("帳戶") {
                    Picker("帳戶", selection: $selectedAccountID) {
                        ForEach(accounts, id: \.id) { account in
                            Text("\(account.name) · \(account.currency)").tag(Optional(account.id))
                        }
                    }
                    .labelsHidden()
                }
            }

            FieldRow("日期") {
                VStack(alignment: .leading, spacing: 8) {
                    DateQuickPickStrip(date: $date)
                    DatePicker("日期", selection: $date, displayedComponents: .date)
                        .datePickerStyle(.compact)
                        .labelsHidden()
                }
            }

            if isSplit == false {
                if recentCategorySuggestions.isEmpty == false {
                    FieldRow("最近用過") {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(recentCategorySuggestions, id: \.self) { category in
                                    recentCategoryChip(category)
                                }
                            }
                            .padding(.vertical, 2)
                        }
                    }
                }

                FieldRow("分類") {
                    VStack(alignment: .leading, spacing: 8) {
                        Picker("分類", selection: $selectedCategory) {
                            ForEach(LedgerCategoryCatalog.suggestions(for: entryType), id: \.self) { category in
                                Text(category).tag(category)
                            }
                            Text(LedgerCategoryCatalog.custom).tag(LedgerCategoryCatalog.custom)
                        }
                        .labelsHidden()

                        if selectedCategory == LedgerCategoryCatalog.custom {
                            TextField("自訂分類", text: $customCategoryText)
                                .textFieldStyle(.roundedBorder)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var amountCard: some View {
        GlassFormCard(isSplit ? "拆分明細" : "金額", tinted: true) {
            if isSplit {
                splitLinesContent
            } else {
                heroAmountField
                if amountShowsExpressionPreview, let value = evaluatedAmount {
                    Text("= \(CurrencyFormatters.money(value, currencyCode: selectedAccount?.currency ?? "TWD"))")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.accent)
                        .monospacedDigit()
                }
                Text("可輸入算式，例如 120+85+30。")
                    .font(.caption2)
                    .foregroundStyle(NorthstarTheme.mutedText)
                if let account = selectedAccount, (evaluatedAmount ?? 0) > 0 {
                    Text("完成後 \(account.name) 餘額會自動更新。")
                        .font(.caption2)
                        .foregroundStyle(NorthstarTheme.secondaryText)
                }
            }

            HStack {
                Spacer()
                Button {
                    toggleSplit(to: !isSplit)
                } label: {
                    Label(
                        isSplit ? "回到單筆" : "拆分明細",
                        systemImage: isSplit ? "arrow.uturn.left" : "rectangle.split.3x1"
                    )
                    .font(.caption.weight(.semibold))
                }
                .buttonStyle(.borderless)
                .foregroundStyle(NorthstarTheme.accent)
                .disabled(isLockedInvestmentLink)
            }
        }
    }

    private var heroAmountField: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            TextField("0", text: $amountText)
                .font(.system(size: 38, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .decimalKeyboard()
                .textFieldStyle(.plain)
                .foregroundStyle(NorthstarTheme.primaryText)
            Text(selectedAccount?.currency ?? "TWD")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(NorthstarTheme.mutedText)
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

    private func recentCategoryChip(_ category: String) -> some View {
        let isSelected = (resolvedCategory == category)
        return Button {
            applyCategoryChip(category)
        } label: {
            Text(category)
                .northstarChipStyle(.sticky(isSelected: isSelected))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Split mode

    private func toggleSplit(to newValue: Bool) {
        if newValue == isSplit { return }
        if newValue {
            // Seed with the current single entry as the first line.
            let seedAmount = amountText.trimmingCharacters(in: .whitespacesAndNewlines)
            let seed = SplitLine(
                category: selectedCategory,
                customCategoryText: customCategoryText,
                amountText: seedAmount
            )
            splitLines = [seed, SplitLine(
                category: LedgerCategoryCatalog.suggestions(for: entryType).first ?? LedgerCategoryCatalog.custom,
                amountText: ""
            )]
            isSplit = true
        } else {
            // Collapse: keep the first line as the main amount + category, drop the rest.
            if let first = splitLines.first {
                amountText = first.amountText
                selectedCategory = first.category
                customCategoryText = first.customCategoryText
            }
            splitLines = []
            isSplit = false
        }
    }

    private var splitLinesContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            splitTotalsBanner

            ForEach($splitLines) { $line in
                splitLineRow(line: $line)
            }

            Button {
                let initial = LedgerCategoryCatalog.suggestions(for: entryType).first ?? LedgerCategoryCatalog.custom
                splitLines.append(SplitLine(category: initial, amountText: ""))
            } label: {
                Label("新增明細", systemImage: "plus.circle")
                    .font(.subheadline.weight(.semibold))
            }
            .buttonStyle(.borderless)
            .foregroundStyle(NorthstarTheme.accent)
        }
    }

    private var splitTotalsBanner: some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 2) {
                Text("已分配")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(NorthstarTheme.mutedText)
                Text(CurrencyFormatters.money(splitAllocatedTotal, currencyCode: selectedAccount?.currency ?? "TWD"))
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(NorthstarTheme.primaryText)
                    .monospacedDigit()
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text("\(splitLines.count) 筆明細")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(NorthstarTheme.mutedText)
                if splitValidatedLines() == nil {
                    Text("尚有未填欄位")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.warning)
                } else {
                    Text("可儲存")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.growth)
                }
            }
        }
        .padding(.vertical, 2)
    }

    @ViewBuilder
    private func splitLineRow(line: Binding<SplitLine>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Picker("分類", selection: line.category) {
                    ForEach(LedgerCategoryCatalog.suggestions(for: entryType), id: \.self) { category in
                        Text(category).tag(category)
                    }
                    Text(LedgerCategoryCatalog.custom).tag(LedgerCategoryCatalog.custom)
                }
                .labelsHidden()

                TextField("金額", text: line.amountText)
                    .decimalKeyboard()
                    .multilineTextAlignment(.trailing)
                    .frame(maxWidth: 140)

                if splitLines.count > 1 {
                    Button(role: .destructive) {
                        if let index = splitLines.firstIndex(where: { $0.id == line.id }) {
                            splitLines.remove(at: index)
                        }
                    } label: {
                        Image(systemName: "trash")
                    }
                    .buttonStyle(.borderless)
                    .foregroundStyle(NorthstarTheme.risk)
                }
            }
            if line.wrappedValue.category == LedgerCategoryCatalog.custom {
                TextField("自訂分類", text: line.customCategoryText)
            }
        }
    }

    private func save() {
        guard let account = selectedAccount else { return }
        if isSplit {
            saveSplit(account: account)
        } else {
            saveSingle(account: account)
        }
    }

    private func saveSingle(account: Account) {
        guard let magnitude = evaluatedAmount else { return }
        let signed = entryType.signedAmount(magnitude: magnitude)
        let categoryFinal = resolvedCategory
        let trimmedNote = note.trimmingCharacters(in: .whitespacesAndNewlines)

        if let editing {
            // Switching from split → single: remove sibling rows so we don't leave orphans.
            if let oldGroupID = editing.groupID {
                removeSiblings(groupID: oldGroupID, excluding: editing.id)
            }
            let oldAccount = editing.account
            editing.date = date
            editing.amount = signed
            editing.currency = account.currency
            editing.category = categoryFinal
            editing.note = trimmedNote
            editing.account = account
            editing.receipt = receiptData
            editing.groupID = nil
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
                account: account,
                receipt: receiptData
            )
            modelContext.insert(txn)
            account.recomputeBalance()
        }

        try? modelContext.save()
        dismiss()
    }

    private func saveSplit(account: Account) {
        guard let lines = splitValidatedLines() else { return }

        // Single-line "split" collapses to a regular transaction so we don't leave a
        // sneaky 1-row group lying around.
        if lines.count == 1 {
            amountText = splitLines[0].amountText
            selectedCategory = splitLines[0].category
            customCategoryText = splitLines[0].customCategoryText
            isSplit = false
            saveSingle(account: account)
            return
        }

        let trimmedNote = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let groupID = editing?.groupID ?? UUID()

        // Replace any existing rows for this group (and the editing row itself), then
        // insert fresh rows from the builder. Cleaner than diffing on category change.
        if let editing {
            if let oldAccount = editing.account, oldAccount !== account {
                removeSiblings(groupID: groupID, excluding: nil, account: oldAccount)
                oldAccount.recomputeBalance()
            } else {
                removeSiblings(groupID: groupID, excluding: nil)
            }
            modelContext.delete(editing)
        }

        guard let newRows = SplitTransactionBuilder.build(
            date: date,
            account: account,
            entryType: entryType,
            sharedNote: trimmedNote,
            receipt: receiptData,
            groupID: groupID,
            lines: lines
        ) else { return }

        for row in newRows {
            modelContext.insert(row)
        }
        account.recomputeBalance()
        try? modelContext.save()
        dismiss()
    }

    /// Removes every transaction sharing `groupID` (optionally skipping one by id).
    /// Looks them up via the @Query-fed `recentTransactions` because that array
    /// already covers the full month-and-beyond ledger that the editor was opened from.
    private func removeSiblings(
        groupID: UUID,
        excluding excludedID: UUID?,
        account: Account? = nil
    ) {
        for txn in recentTransactions where txn.groupID == groupID {
            if let excludedID, txn.id == excludedID { continue }
            if let account, txn.account !== account { continue }
            modelContext.delete(txn)
        }
    }
}


private struct BulkCategorySheet: View {
    let initialValue: String
    let suggestionType: LedgerEntryType
    let onCancel: () -> Void
    let onApply: (String) -> Void

    @State private var selectedCategory: String
    @State private var customCategoryText: String

    init(
        initialValue: String,
        suggestionType: LedgerEntryType,
        onCancel: @escaping () -> Void,
        onApply: @escaping (String) -> Void
    ) {
        self.initialValue = initialValue
        self.suggestionType = suggestionType
        self.onCancel = onCancel
        self.onApply = onApply

        let suggestions = LedgerCategoryCatalog.suggestions(for: suggestionType)
        if suggestions.contains(initialValue) {
            _selectedCategory = State(initialValue: initialValue)
            _customCategoryText = State(initialValue: "")
        } else {
            _selectedCategory = State(initialValue: suggestions.first ?? LedgerCategoryCatalog.custom)
            _customCategoryText = State(initialValue: initialValue)
        }
    }

    private var resolvedCategory: String {
        if selectedCategory == LedgerCategoryCatalog.custom {
            return customCategoryText.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return selectedCategory
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("套用新分類") {
                    Picker("分類", selection: $selectedCategory) {
                        ForEach(LedgerCategoryCatalog.suggestions(for: suggestionType), id: \.self) { category in
                            Text(category).tag(category)
                        }
                        Text(LedgerCategoryCatalog.custom).tag(LedgerCategoryCatalog.custom)
                    }
                    if selectedCategory == LedgerCategoryCatalog.custom {
                        TextField("自訂分類", text: $customCategoryText)
                    }
                    Text("投資連動的列會被略過（分類由原始投資交易決定）。")
                        .font(.caption)
                        .foregroundStyle(NorthstarTheme.secondaryText)
                }
            }
            .platformFormStyle()
            .navigationTitle("改分類")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消", action: onCancel)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("套用") { onApply(resolvedCategory) }
                        .disabled(resolvedCategory.isEmpty)
                }
            }
        }
    }
}
