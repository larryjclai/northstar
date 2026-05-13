import SwiftUI
import SwiftData
#if os(macOS)
import AppKit
import UniformTypeIdentifiers
#endif

struct TransactionsView: View {
    @Binding var showAddSheet: Bool

    var body: some View {
        TransactionsContentView(showAddSheet: $showAddSheet)
    }
}

private struct TransactionsContentView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \InvestmentRecord.date, order: .reverse) private var records: [InvestmentRecord]
    @Query(sort: \PortfolioAsset.ticker) private var assets: [PortfolioAsset]
    @Query(sort: \Account.name) private var accounts: [Account]
    @Binding var showAddSheet: Bool
    @State private var selectedRecordIDs: Set<UUID> = []

    private var hasRecords: Bool {
        records.isEmpty == false
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    transactionsHero
                    recordsSection
                }
                .padding(20)
            }
            .northstarScreenBackground()
            .navigationTitle("交易")
            .platformLargeNavigationTitle()
            .toolbar(content: toolbarContent)
            .sheet(isPresented: $showAddSheet) {
                AddInvestmentRecordView(assets: assets, accounts: accounts)
            }
        }
    }

    @ViewBuilder
    private var recordsSection: some View {
        if hasRecords {
            ForEach(records) { record in
                recordRow(for: record)
            }
        } else {
            emptyState
        }
    }

    @ToolbarContentBuilder
    private func toolbarContent() -> some ToolbarContent {
        ToolbarItemGroup {
            Button(action: markSelectedReviewed) {
                Label("標記已審核", systemImage: "checkmark.circle")
            }
            .disabled(selectedRecordIDs.isEmpty)
            .keyboardShortcut("r", modifiers: [])

            Button(action: exportCSV) {
                Label("匯出 CSV", systemImage: "square.and.arrow.down")
            }
            .disabled(records.isEmpty)
            .keyboardShortcut("e", modifiers: .command)
        }

        ToolbarItem {
            Button(action: openAddSheet) {
                Label("新增", systemImage: "plus")
            }
            .keyboardShortcut("n", modifiers: .command)
        }
    }

    private var transactionsHero: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("投資事件")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.secondaryText)
                    Text("\(records.count) 筆紀錄")
                        .font(.system(size: 34, weight: .semibold))
                        .foregroundStyle(NorthstarTheme.primaryText)
                        .monospacedDigit()
                }

                Spacer()

                Image(systemName: "list.bullet.rectangle.portrait.fill")
                    .font(.title2)
                    .foregroundStyle(NorthstarTheme.netWorth)
            }

            Text("買賣、股利、配股與減資會連動持倉成本，讓投資變化成為可追蹤的時間線。")
                .font(.subheadline)
                .foregroundStyle(NorthstarTheme.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .northstarCardSurface()
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("還沒有交易紀錄")
                .font(.headline)
                .foregroundStyle(NorthstarTheme.primaryText)
            Text("新增買入、賣出或股利後，northstar 會在這裡保留可稽核的投資事件。")
                .font(.subheadline)
                .foregroundStyle(NorthstarTheme.secondaryText)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .northstarCardSurface()
    }

    private func toggleSelection(_ record: InvestmentRecord) {
        if selectedRecordIDs.contains(record.id) {
            selectedRecordIDs.remove(record.id)
        } else {
            selectedRecordIDs.insert(record.id)
        }
    }

    private func openAddSheet() {
        showAddSheet = true
    }

    private func markReviewed(_ record: InvestmentRecord) {
        record.isReviewed = true
        selectedRecordIDs.remove(record.id)
        try? modelContext.save()
    }

    private func recordRow(for record: InvestmentRecord) -> some View {
        TransactionRecordCard(
            record: record,
            isSelected: selectedRecordIDs.contains(record.id),
            onSelect: { toggleSelection(record) },
            onReview: { markReviewed(record) }
        )
    }

    private func markSelectedReviewed() {
        records
            .filter { selectedRecordIDs.contains($0.id) }
            .forEach { $0.isReviewed = true }
        selectedRecordIDs.removeAll()
        try? modelContext.save()
    }

    private func exportCSV() {
        #if os(macOS)
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.commaSeparatedText]
        panel.nameFieldStringValue = "northstar-investment-records.csv"
        guard panel.runModal() == .OK, let url = panel.url else { return }

        do {
            try csvString.write(to: url, atomically: true, encoding: .utf8)
        } catch {
            NSSound.beep()
        }
        #endif
    }

    private var csvString: String {
        let header = "Date,Ticker,Name,Action,Price,Quantity,Fee,Currency,LinkedAccount,Reviewed,Note"
        let rows = records.map { record in
            [
                csvDate(record.date),
                record.asset?.ticker ?? "",
                record.asset?.name ?? "",
                record.action.rawValue,
                String(record.price),
                String(record.quantity),
                String(record.fee),
                record.asset?.currency ?? record.linkedAccount?.currency ?? "TWD",
                record.linkedAccount?.name ?? "",
                record.isReviewed ? "true" : "false",
                record.note
            ]
            .map(csvEscape)
            .joined(separator: ",")
        }
        return ([header] + rows).joined(separator: "\n")
    }

    private func csvEscape(_ value: String) -> String {
        let escaped = value.replacingOccurrences(of: "\"", with: "\"\"")
        if escaped.contains(",") || escaped.contains("\"") || escaped.contains("\n") {
            return "\"\(escaped)\""
        }
        return escaped
    }

    private func csvDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}

private struct TransactionRecordCard: View {
    let record: InvestmentRecord
    let isSelected: Bool
    let onSelect: () -> Void
    let onReview: () -> Void

    private var action: InvestmentAction {
        record.action
    }

    private var currency: String {
        record.asset?.currency ?? record.linkedAccount?.currency ?? "TWD"
    }

    private var grossValue: Double {
        record.price * record.quantity
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                Button(action: onSelect) {
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(isSelected ? NorthstarTheme.accent : Color.clear)
                        .overlay {
                            RoundedRectangle(cornerRadius: 3, style: .continuous)
                                .stroke(isSelected ? NorthstarTheme.accent : Color.nsBorder, lineWidth: 1)
                        }
                        .frame(width: 14, height: 14)
                }
                .buttonStyle(.plain)
                .padding(.top, 14)

                ZStack {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(action.tint.opacity(0.16))
                    Image(systemName: action.symbolName)
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(action.tint)
                }
                .frame(width: 42, height: 42)

                VStack(alignment: .leading, spacing: 4) {
                    Text(record.asset?.name ?? "未命名標的")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.primaryText)
                        .lineLimit(1)
                    Text(record.asset?.ticker ?? "-")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.secondaryText)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 8) {
                    Text(action.displayTitle)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(action.tint)
                        .padding(.horizontal, 9)
                        .padding(.vertical, 5)
                        .background(action.tint.opacity(0.14), in: Capsule())

                    if record.isReviewed {
                        Label("Reviewed", systemImage: "checkmark.circle.fill")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(NorthstarTheme.growth)
                    } else {
                        Button("Mark reviewed", action: onReview)
                            .font(.caption2.weight(.bold))
                            .buttonStyle(.borderless)
                    }
                }
            }

            HStack(alignment: .bottom, spacing: 14) {
                transactionMetric("日期", record.date.formatted(date: .abbreviated, time: .omitted))
                transactionMetric("數量", String(format: "%.2f", record.quantity))
                transactionMetric("單價", CurrencyFormatters.price(record.price, currencyCode: currency))
                Spacer(minLength: 0)
                VStack(alignment: .trailing, spacing: 3) {
                    Text("金額")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.secondaryText)
                    Text(CurrencyFormatters.money(grossValue, currencyCode: currency))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.primaryText)
                        .monospacedDigit()
                }
            }

            if record.fee > 0 || record.note.isEmpty == false || record.linkedAccount != nil {
                HStack(spacing: 8) {
                    if let account = record.linkedAccount {
                        Label(account.name, systemImage: "creditcard")
                    }
                    if record.fee > 0 {
                        Label("手續費 \(CurrencyFormatters.price(record.fee, currencyCode: currency))", systemImage: "minus.circle")
                    }
                    if record.note.isEmpty == false {
                        Label(record.note, systemImage: "note.text")
                    }
                }
                .font(.caption.weight(.semibold))
                .foregroundStyle(NorthstarTheme.mutedText)
                .lineLimit(1)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .northstarCardSurface()
        .overlay {
            if isSelected {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(NorthstarTheme.accent, lineWidth: 1.5)
            }
        }
    }

    private func transactionMetric(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(NorthstarTheme.secondaryText)
            Text(value)
                .font(.caption.weight(.semibold))
                .foregroundStyle(NorthstarTheme.primaryText)
                .monospacedDigit()
                .lineLimit(1)
        }
    }
}

extension InvestmentAction {
    var displayTitle: String {
        switch self {
        case .buy: return "買入"
        case .sell: return "賣出"
        case .cashDividend: return "現金股利"
        case .stockDividend: return "股票股利"
        case .capitalReduction: return "減資"
        }
    }

    var symbolName: String {
        switch self {
        case .buy: return "arrow.down.forward"
        case .sell: return "arrow.up.forward"
        case .cashDividend: return "banknote.fill"
        case .stockDividend: return "plus.forwardslash.minus"
        case .capitalReduction: return "scissors"
        }
    }

    var tint: Color {
        switch self {
        case .buy: return NorthstarTheme.spending
        case .sell, .cashDividend: return NorthstarTheme.income
        case .stockDividend: return NorthstarTheme.netWorth
        case .capitalReduction: return NorthstarTheme.warning
        }
    }
}

struct AddInvestmentRecordView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    let assets: [PortfolioAsset]
    let accounts: [Account]

    @State private var date = Date()
    @State private var action: InvestmentAction = .buy
    @State private var selectedAssetTicker = ""
    @State private var selectedAccountID: UUID?
    @State private var newTicker = ""
    @State private var newAssetName = ""
    @State private var newAssetCurrency = "TWD"
    @State private var newAccountName = ""
    @State private var priceText = ""
    @State private var quantityText = ""
    @State private var feeText = ""
    @State private var note = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("基本資訊") {
                    DatePicker("日期", selection: $date, displayedComponents: .date)
                    Picker("動作", selection: $action) {
                        ForEach(InvestmentAction.allCases) { action in
                            Text(action.rawValue).tag(action)
                        }
                    }
                    if assets.isEmpty == false {
                        Picker("標的", selection: $selectedAssetTicker) {
                            Text("新增標的").tag("")
                            ForEach(assets, id: \.ticker) { asset in
                                Text("\(asset.ticker) \(asset.name)").tag(asset.ticker)
                            }
                        }
                    }

                    if selectedAsset == nil {
                        TextField("代號，例如 2330.TW", text: $newTicker)
                        TextField("名稱，例如 台積電", text: $newAssetName)
                        TextField("幣別，例如 TWD", text: $newAssetCurrency)
                    }

                    if accounts.isEmpty == false {
                        Picker("扣款帳戶", selection: $selectedAccountID) {
                            Text("不連結帳戶").tag(Optional<UUID>.none)
                            ForEach(accounts, id: \.id) { account in
                                Text(account.name).tag(Optional(account.id))
                            }
                        }
                    }
                    TextField("新增帳戶名稱（可選）", text: $newAccountName)
                }

                Section("交易數值") {
                    TextField("價格", text: $priceText)
                        .decimalKeyboard()
                    TextField("數量", text: $quantityText)
                        .decimalKeyboard()
                    TextField("手續費", text: $feeText)
                        .decimalKeyboard()
                }

                Section("備註") {
                    TextField("備註", text: $note)
                }
            }
            .platformFormStyle()
            .navigationTitle("新增交易")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("儲存") { save() }
                        .disabled(!canSave)
                }
            }
        }
        .onAppear {
            if selectedAccountID == nil { selectedAccountID = accounts.first?.id }
            activateAppForTextInput()
        }
    }

    private var canSave: Bool {
        hasAssetInput && Double(priceText) != nil && Double(quantityText) != nil
    }

    private var hasAssetInput: Bool {
        selectedAsset != nil || newTicker.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
    }

    private var selectedAsset: PortfolioAsset? {
        assets.first(where: { $0.ticker == selectedAssetTicker })
    }

    private var selectedAccount: Account? {
        guard let selectedAccountID else { return nil }
        return accounts.first(where: { $0.id == selectedAccountID })
    }

    private func save() {
        guard
            let price = Double(priceText),
            let quantity = Double(quantityText)
        else { return }

        let asset = selectedAsset ?? createAsset()
        let linkedAccount = selectedAccount ?? createAccountIfNeeded()
        let fee = Double(feeText) ?? 0
        let record = InvestmentRecord(
            date: date,
            action: action,
            price: price,
            quantity: quantity,
            fee: fee,
            note: note,
            asset: asset,
            linkedAccount: linkedAccount
        )
        modelContext.insert(record)
        PortfolioCalculator.apply(records: asset.records + [record], to: asset)
        try? modelContext.save()
        dismiss()
    }

    private func createAsset() -> PortfolioAsset {
        let ticker = newTicker.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        if let existing = assets.first(where: { $0.ticker.uppercased() == ticker }) {
            return existing
        }

        let name = newAssetName.trimmingCharacters(in: .whitespacesAndNewlines)
        let currency = newAssetCurrency.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        let asset = PortfolioAsset(
            ticker: ticker,
            name: name.isEmpty ? ticker : name,
            currency: currency.isEmpty ? "TWD" : currency
        )
        modelContext.insert(asset)
        return asset
    }

    private func createAccountIfNeeded() -> Account? {
        let name = newAccountName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard name.isEmpty == false else { return nil }
        if let existing = accounts.first(where: { $0.name.localizedCaseInsensitiveCompare(name) == .orderedSame }) {
            return existing
        }

        let currency = newAssetCurrency.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        let account = Account(name: name, currency: currency.isEmpty ? "TWD" : currency, balance: 0)
        modelContext.insert(account)
        return account
    }

    private func activateAppForTextInput() {
        #if os(macOS)
        let application = NSApplication.shared
        if #available(macOS 14.0, *) {
            application.activate()
        } else {
            application.activate(ignoringOtherApps: true)
        }
        application.mainWindow?.makeKeyAndOrderFront(nil)
        application.keyWindow?.makeKey()
        #endif
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
