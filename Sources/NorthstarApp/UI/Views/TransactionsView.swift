import SwiftUI
import SwiftData
import UniformTypeIdentifiers
#if os(macOS)
import AppKit
#endif

struct TransactionsView: View {
    let requestAdd: (AddSheetKind) -> Void

    var body: some View {
        TransactionsContentView(requestAdd: requestAdd)
    }
}

private struct PendingCSVImport: Identifiable {
    let id = UUID()
    let rows: [InvestmentCSVRow]
}

private struct TransactionsContentView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \InvestmentRecord.date, order: .reverse) private var records: [InvestmentRecord]
    @Query(sort: \PortfolioAsset.ticker) private var assets: [PortfolioAsset]
    @Query(sort: \Account.name) private var accounts: [Account]
    let requestAdd: (AddSheetKind) -> Void
    @State private var selectedRecordIDs: Set<UUID> = []
    @State private var editingRecord: InvestmentRecord?
    @State private var isImporting = false
    @State private var pendingImport: PendingCSVImport?
    @State private var importErrorMessage: String?
    @State private var isInSelectionMode = false
    @State private var pendingBulkDelete = false

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
            .sheet(item: $editingRecord) { record in
                InvestmentRecordEditorView(editing: record, assets: assets, accounts: accounts)
            }
            .sheet(item: $pendingImport) { pending in
                CSVImportPreviewView(
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
            .alert("刪除選取的紀錄？", isPresented: $pendingBulkDelete) {
                Button("刪除", role: .destructive, action: performBulkDelete)
                Button("取消", role: .cancel) {}
            } message: {
                Text("\(selectedRecordIDs.count) 筆會刪除，相關標的的均價與持倉會自動重算。")
            }
            .safeAreaInset(edge: .bottom) {
                if isInSelectionMode {
                    bulkActionBar
                }
            }
            .onChange(of: isInSelectionMode) { _, newValue in
                if newValue == false {
                    selectedRecordIDs.removeAll()
                }
            }
        }
    }

    private var importErrorBinding: Binding<Bool> {
        Binding(
            get: { importErrorMessage != nil },
            set: { if $0 == false { importErrorMessage = nil } }
        )
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
        if isInSelectionMode {
            ToolbarItem(placement: .cancellationAction) {
                Button("完成") {
                    isInSelectionMode = false
                }
            }
            ToolbarItemGroup {
                Button(action: toggleSelectAll) {
                    Label(
                        allRecordsSelected ? "全不選" : "選擇全部",
                        systemImage: allRecordsSelected ? "square" : "checkmark.square"
                    )
                }
                .disabled(records.isEmpty)
            }
        } else {
            ToolbarItemGroup {
                Button(action: enterSelectionMode) {
                    Label("選取", systemImage: "checkmark.circle")
                }
                .disabled(records.isEmpty)

                Button(action: { isImporting = true }) {
                    Label("匯入 CSV", systemImage: "tray.and.arrow.down")
                }
                .keyboardShortcut("o", modifiers: .command)

                Button(action: exportCSV) {
                    Label("匯出 CSV", systemImage: "square.and.arrow.down")
                }
                .disabled(records.isEmpty)
                .keyboardShortcut("e", modifiers: .command)
            }

            ToolbarItem {
                AddEntryMenu(primary: .investment, onSelect: requestAdd)
            }
        }
    }

    private var bulkActionBar: some View {
        HStack(spacing: 14) {
            Text("\(selectedRecordIDs.count) 筆已選取")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(NorthstarTheme.secondaryText)
            Spacer()
            Button(action: markSelectedReviewed) {
                Label("已審核", systemImage: "checkmark.seal")
            }
            .disabled(selectedRecordIDs.isEmpty)

            Button(role: .destructive) {
                pendingBulkDelete = true
            } label: {
                Label("刪除", systemImage: "trash")
            }
            .disabled(selectedRecordIDs.isEmpty)
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.thinMaterial)
    }

    private func enterSelectionMode() {
        isInSelectionMode = true
        selectedRecordIDs.removeAll()
    }

    private var allRecordsSelected: Bool {
        guard records.isEmpty == false else { return false }
        return records.allSatisfy { selectedRecordIDs.contains($0.id) }
    }

    private func toggleSelectAll() {
        if allRecordsSelected {
            selectedRecordIDs.removeAll()
        } else {
            selectedRecordIDs = Set(records.map(\.id))
        }
    }

    private func performBulkDelete() {
        let targets = records.filter { selectedRecordIDs.contains($0.id) }
        var affectedAssets: Set<PortfolioAsset> = []
        for record in targets {
            if let asset = record.asset { affectedAssets.insert(asset) }
            LedgerLinkage.removeLedger(for: record, context: modelContext)
            modelContext.delete(record)
        }
        try? modelContext.save()
        for asset in affectedAssets {
            PortfolioCalculator.apply(records: asset.records, to: asset)
        }
        try? modelContext.save()
        selectedRecordIDs.removeAll()
        isInSelectionMode = false
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

            Text("買賣、股利、配股與減資會連動持倉成本，讓投資變化成為可追蹤的時間線。點任意交易可編輯或刪除。")
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
            Text("新增買入、賣出或股利後，northstar 會在這裡保留可稽核的投資事件。也可以從工具列匯入 CSV。")
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

    private func markReviewed(_ record: InvestmentRecord) {
        record.isReviewed = true
        selectedRecordIDs.remove(record.id)
        try? modelContext.save()
    }

    private func recordRow(for record: InvestmentRecord) -> some View {
        TransactionRecordCard(
            record: record,
            isInSelectionMode: isInSelectionMode,
            isSelected: selectedRecordIDs.contains(record.id),
            onSelect: { toggleSelection(record) },
            onReview: { markReviewed(record) },
            onEdit: { editingRecord = record }
        )
    }

    private func markSelectedReviewed() {
        records
            .filter { selectedRecordIDs.contains($0.id) }
            .forEach { $0.isReviewed = true }
        selectedRecordIDs.removeAll()
        try? modelContext.save()
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
                let existingIDs = Set(records.map(\.id))
                let rows = InvestmentCSVParser.parse(text, existingIDs: existingIDs)
                if rows.isEmpty {
                    importErrorMessage = "檔案中沒有可解析的資料列。"
                    return
                }
                pendingImport = PendingCSVImport(rows: rows)
            } catch {
                importErrorMessage = error.localizedDescription
            }
        }
    }

    private func confirmImport(_ rows: [InvestmentCSVRow]) {
        _ = InvestmentCSVImporter.apply(rows, context: modelContext, assets: assets, accounts: accounts)
        pendingImport = nil
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
        let header = InvestmentCSVParser.headerLine
        let rows = records.map { record in
            [
                record.id.uuidString,
                CSVText.format(record.date),
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
            .map(CSVText.escape)
            .joined(separator: ",")
        }
        return ([header] + rows).joined(separator: "\n")
    }
}

private struct TransactionRecordCard: View {
    let record: InvestmentRecord
    let isInSelectionMode: Bool
    let isSelected: Bool
    let onSelect: () -> Void
    let onReview: () -> Void
    let onEdit: () -> Void

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
        Button(action: handleTap) {
            cardContent
        }
        .buttonStyle(.plain)
        .contentShape(Rectangle())
        .accessibilityHint(isInSelectionMode ? "點擊以切換選取" : "點擊以編輯或刪除此交易")
    }

    private func handleTap() {
        if isInSelectionMode {
            onSelect()
        } else {
            onEdit()
        }
    }

    private var cardContent: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                if isInSelectionMode {
                    SelectionCheckmark(isSelected: isSelected)
                        .padding(.top, 14)
                }

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
                    } else if isInSelectionMode == false {
                        // Hide the inline review button when the user is multi-selecting —
                        // the bulk "已審核" toolbar action covers it without competing for tap area.
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
        case .stockSplit: return "股票分割"
        }
    }

    var symbolName: String {
        switch self {
        case .buy: return "arrow.down.forward"
        case .sell: return "arrow.up.forward"
        case .cashDividend: return "banknote.fill"
        case .stockDividend: return "plus.forwardslash.minus"
        case .capitalReduction: return "scissors"
        case .stockSplit: return "arrow.triangle.branch"
        }
    }

    var tint: Color {
        switch self {
        case .buy: return NorthstarTheme.spending
        case .sell, .cashDividend: return NorthstarTheme.income
        case .stockDividend, .stockSplit: return NorthstarTheme.netWorth
        case .capitalReduction: return NorthstarTheme.warning
        }
    }

    var explanation: String {
        switch self {
        case .buy:
            return "以價格 × 數量買進股份，手續費計入成本基礎。"
        case .sell:
            return "賣出採 FIFO（先進先出）：先賣最早買進的 lot，已實現損益依各 lot 成本逐筆計算。"
        case .cashDividend:
            return "每股現金股息 × 持股數，會匯入連結帳戶（幣別相符時）；不影響持股數量與成本。"
        case .stockDividend:
            return "公司以新股配股，新增「零成本」lot；持股數量增加但總成本不變，平均成本因而下降。"
        case .capitalReduction:
            return "公司按比例減少在外流通股數；本 app 採「保留總成本」處理：各 lot 股數依比例縮減、每股成本反向放大，使總成本不變。"
        case .stockSplit:
            return "公司調整面額；歷史每個 lot 的股數 × 比例、每股成本 ÷ 比例，總成本與市值不變。"
        }
    }

    var examplePhrase: String {
        switch self {
        case .buy:
            return "例：600 × 10 股 + 手續費 20 元 → 每股成本 602。"
        case .sell:
            return "例：賣 5 股 @ 700，最早 lot 成本 600 → 已實現損益約 500 元（再扣分攤手續費）。"
        case .cashDividend:
            return "例：持有 100 股、每股配 4 元 → 入帳 400 元。"
        case .stockDividend:
            return "例：持有 100 股 @ 平均 50；配股 10 股 → 110 股、平均成本約 45.45。"
        case .capitalReduction:
            return "例：100 股要減 10 股（在數量欄填「10」），原平均 50 → 約 55.56；總成本 5,000 不變。"
        case .stockSplit:
            return "例：2:1 分割（比例填 2）；100 股 @ 600 → 200 股 @ 300。"
        }
    }

    /// Caveat shown when the app's accounting convention may diverge from broker statements.
    var brokerCaveat: String? {
        switch self {
        case .capitalReduction:
            return "註：券商常把減資視為「現金退還沖抵成本」，本 app 採「保留總成本」估算，帳上數字可能與券商不同。"
        default:
            return nil
        }
    }
}

