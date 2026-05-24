import SwiftUI
import SwiftData
#if os(macOS)
import AppKit
#endif

struct InvestmentRecordEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    let editing: InvestmentRecord?
    let assets: [PortfolioAsset]
    let accounts: [Account]

    @State private var date: Date
    @State private var action: InvestmentAction
    @State private var selectedAssetTicker: String
    @State private var selectedAccountID: UUID?
    @State private var newTicker = ""
    @State private var newAssetName = ""
    @State private var newAssetCurrency = "TWD"
    @State private var newAccountName = ""
    @State private var priceText: String
    @State private var quantityText: String
    @State private var feeText: String
    @State private var note: String
    @State private var showDeleteConfirm = false
    @State private var splitRatioText: String = "2"
    @State private var enableDRIP: Bool = false
    @State private var dripPriceText: String = ""
    @State private var showSymbolPicker = false

    init(
        editing: InvestmentRecord?,
        assets: [PortfolioAsset],
        accounts: [Account],
        preselectedTicker: String? = nil
    ) {
        self.editing = editing
        self.assets = assets
        self.accounts = accounts

        _date = State(initialValue: editing?.date ?? Date())
        _action = State(initialValue: editing?.action ?? .buy)
        let initialTicker = editing?.asset?.ticker ?? preselectedTicker ?? ""
        _selectedAssetTicker = State(initialValue: initialTicker)
        _selectedAccountID = State(initialValue: editing?.linkedAccount?.id)
        _priceText = State(initialValue: editing.map { Self.numberString($0.price) } ?? "")
        _quantityText = State(initialValue: editing.map { Self.numberString($0.quantity) } ?? "")
        _feeText = State(initialValue: editing.flatMap { $0.fee == 0 ? nil : Self.numberString($0.fee) } ?? "")
        _note = State(initialValue: editing?.note ?? "")
        if let editing, editing.action == .stockSplit {
            _splitRatioText = State(initialValue: Self.numberString(editing.quantity))
        }
    }

    private static func numberString(_ value: Double) -> String {
        if value == value.rounded() {
            return String(Int(value))
        }
        return String(value)
    }

    var body: some View {
        NavigationStack {
            SheetCardScroll {
                GlassFormCard("基本資訊") {
                    FieldRow("日期") {
                        DatePicker("日期", selection: $date, displayedComponents: .date)
                            .datePickerStyle(.compact)
                            .labelsHidden()
                    }
                    FieldRow("動作") {
                        Picker("動作", selection: $action) {
                            ForEach(InvestmentAction.allCases) { action in
                                Text(action.displayTitle).tag(action)
                            }
                        }
                        .labelsHidden()
                    }
                    actionExplanationBlock
                }

                GlassFormCard("標的") {
                    symbolPickerRow
                    if selectedAsset == nil, newTicker.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false {
                        FieldRow("名稱") {
                            TextField("自動帶入，可修改", text: $newAssetName)
                                .textFieldStyle(.roundedBorder)
                        }
                        FieldRow("幣別") {
                            TextField("自動帶入，可修改", text: $newAssetCurrency)
                                .textFieldStyle(.roundedBorder)
                        }
                    }
                }

                GlassFormCard("扣款帳戶") {
                    if accounts.isEmpty == false {
                        FieldRow("帳戶") {
                            Picker("帳戶", selection: $selectedAccountID) {
                                Text("不連結").tag(Optional<UUID>.none)
                                ForEach(accounts, id: \.id) { account in
                                    Text(account.name).tag(Optional(account.id))
                                }
                            }
                            .labelsHidden()
                        }
                    }
                    FieldRow("新增帳戶") {
                        TextField("帳戶名稱（可選）", text: $newAccountName)
                            .textFieldStyle(.roundedBorder)
                    }
                }

                if action == .stockSplit {
                    GlassFormCard(
                        "分割比例",
                        footer: "例如 2 代表 1→2；0.1 代表 10→1 反向。",
                        tinted: true
                    ) {
                        TextField("分割比例", text: $splitRatioText)
                            .font(.system(size: 32, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .decimalKeyboard()
                            .textFieldStyle(.plain)
                    }
                } else {
                    GlassFormCard("交易數值", tinted: true) {
                        FieldRow("價格") {
                            TextField("價格", text: $priceText)
                                .decimalKeyboard()
                                .textFieldStyle(.roundedBorder)
                        }
                        FieldRow("數量") {
                            TextField("數量", text: $quantityText)
                                .decimalKeyboard()
                                .textFieldStyle(.roundedBorder)
                        }
                        FieldRow("手續費") {
                            TextField("手續費", text: $feeText)
                                .decimalKeyboard()
                                .textFieldStyle(.roundedBorder)
                        }
                    }

                    GlassFormCard("現金影響") {
                        cashImpactRow
                    }

                    if action == .cashDividend, editing == nil {
                        GlassFormCard(
                            "股息再投入 (DRIP)",
                            footer: enableDRIP ? "會在同一天為此標的建立一筆買入，數量 = (股息 − 手續費) ÷ 單價。" : nil
                        ) {
                            Toggle("自動建立買入交易", isOn: $enableDRIP)
                            if enableDRIP {
                                FieldRow("再投入單價") {
                                    TextField("再投入單價", text: $dripPriceText)
                                        .decimalKeyboard()
                                        .textFieldStyle(.roundedBorder)
                                }
                            }
                        }
                    }
                }

                GlassFormCard("備註") {
                    TextField("備註", text: $note)
                        .textFieldStyle(.roundedBorder)
                }

                if editing != nil {
                    GlassFormCard {
                        Button(role: .destructive) {
                            showDeleteConfirm = true
                        } label: {
                            Label("刪除此交易", systemImage: "trash")
                                .font(.subheadline.weight(.semibold))
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .buttonStyle(.borderless)
                        .foregroundStyle(NorthstarTheme.risk)
                    }
                }

                DisabledHintBanner(reason: disabledReason)
            }
            .navigationTitle(editing == nil ? "新增交易" : "編輯交易")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(editing == nil ? "儲存" : "更新") { save() }
                        .disabled(!canSave)
                }
            }
            .alert("確定刪除這筆交易？", isPresented: $showDeleteConfirm) {
                Button("刪除", role: .destructive, action: deleteRecord)
                Button("取消", role: .cancel) {}
            } message: {
                Text("刪除後會重新計算該標的持倉與均價。")
            }
            .sheet(isPresented: $showSymbolPicker) {
                SymbolPickerSheet(localAssets: assets) { picked in
                    applyPickedSymbol(picked)
                }
            }
        }
        .onAppear {
            if editing == nil, selectedAccountID == nil {
                selectedAccountID = accounts.first?.id
            }
            activateAppForTextInput()
        }
    }

    @ViewBuilder
    private var actionExplanationBlock: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label {
                Text(action.explanation)
                    .font(.caption)
                    .foregroundStyle(NorthstarTheme.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            } icon: {
                Image(systemName: "info.circle")
                    .foregroundStyle(NorthstarTheme.accent)
            }
            Text(action.examplePhrase)
                .font(.caption2)
                .foregroundStyle(NorthstarTheme.mutedText)
                .fixedSize(horizontal: false, vertical: true)
            if let caveat = action.brokerCaveat {
                Label {
                    Text(caveat)
                        .font(.caption2)
                        .foregroundStyle(NorthstarTheme.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                } icon: {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(NorthstarTheme.warning)
                }
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var symbolPickerRow: some View {
        Button {
            showSymbolPicker = true
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(NorthstarTheme.accent)
                if let selectedAsset {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(selectedAsset.ticker)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(NorthstarTheme.primaryText)
                        Text(selectedAsset.name)
                            .font(.caption)
                            .foregroundStyle(NorthstarTheme.secondaryText)
                            .lineLimit(1)
                    }
                    Spacer()
                    Text(selectedAsset.currency)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.mutedText)
                } else if newTicker.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(newTicker.uppercased())
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(NorthstarTheme.primaryText)
                        if newAssetName.isEmpty == false {
                            Text(newAssetName)
                                .font(.caption)
                                .foregroundStyle(NorthstarTheme.secondaryText)
                                .lineLimit(1)
                        }
                    }
                    Spacer()
                    Text(newAssetCurrency)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.mutedText)
                } else {
                    Text("選擇代號…")
                        .foregroundStyle(NorthstarTheme.secondaryText)
                    Spacer()
                }
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(NorthstarTheme.mutedText)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func applyPickedSymbol(_ picked: SymbolPickerSheet.PickedSymbol) {
        let symbolUpper = picked.symbol.uppercased()
        if let existing = assets.first(where: { $0.ticker.caseInsensitiveCompare(symbolUpper) == .orderedSame }) {
            selectedAssetTicker = existing.ticker
            newTicker = ""
            newAssetName = ""
            newAssetCurrency = existing.currency
        } else {
            selectedAssetTicker = ""
            newTicker = symbolUpper
            newAssetName = picked.name
            newAssetCurrency = picked.currency ?? Self.inferredCurrency(symbol: symbolUpper, exchange: picked.exchange)
        }
    }

    private static func inferredCurrency(symbol: String, exchange: String?) -> String {
        let upper = symbol.uppercased()
        if upper.hasSuffix(".TW") || upper.hasSuffix(".TWO") { return "TWD" }
        if upper.hasSuffix(".HK") { return "HKD" }
        if upper.hasSuffix(".T") { return "JPY" }
        if upper.hasSuffix(".L") { return "GBP" }
        if upper.hasSuffix(".SS") || upper.hasSuffix(".SZ") { return "CNY" }
        if upper.hasSuffix(".TO") || upper.hasSuffix(".V") { return "CAD" }
        if upper.hasSuffix(".AX") { return "AUD" }
        if upper.hasSuffix(".PA") || upper.hasSuffix(".AS") || upper.hasSuffix(".DE") { return "EUR" }
        if let exchange {
            let e = exchange.uppercased()
            if e.contains("TAIPEI") || e.contains("TAIWAN") { return "TWD" }
            if e.contains("HONG KONG") || e.contains("HKEX") { return "HKD" }
            if e.contains("TOKYO") { return "JPY" }
            if e.contains("LONDON") { return "GBP" }
            if e.contains("SHANGHAI") || e.contains("SHENZHEN") { return "CNY" }
            if e.contains("TORONTO") { return "CAD" }
            if e.contains("PARIS") || e.contains("XETRA") || e.contains("AMSTERDAM") { return "EUR" }
        }
        return "USD"
    }

    private var canSave: Bool {
        disabledReason == nil
    }

    private var disabledReason: String? {
        if hasAssetInput == false {
            return "請選擇或輸入標的代號"
        }
        if action == .stockSplit {
            guard let ratio = Double(splitRatioText), ratio > 0 else {
                return "請輸入大於 0 的分割比例"
            }
            _ = ratio
            return nil
        }
        if Double(priceText) == nil {
            return "請輸入價格"
        }
        if Double(quantityText) == nil {
            return "請輸入數量"
        }
        if action == .cashDividend, enableDRIP {
            guard let dp = Double(dripPriceText), dp > 0 else {
                return "請輸入再投入單價（大於 0）"
            }
            _ = dp
        }
        return nil
    }

    private var effectiveAssetCurrency: String? {
        if let selectedAsset {
            return selectedAsset.currency
        }
        let trimmed = newAssetCurrency.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed.uppercased()
    }

    private var effectiveAccountCurrency: String? {
        if let selectedAccount {
            return selectedAccount.currency
        }
        let pendingName = newAccountName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard pendingName.isEmpty == false else { return nil }
        let trimmed = newAssetCurrency.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed.uppercased()
    }

    private var currentCashImpact: LedgerLinkage.CashImpact {
        LedgerLinkage.cashImpact(
            action: action,
            price: Double(priceText) ?? 0,
            quantity: Double(quantityText) ?? 0,
            fee: Double(feeText) ?? 0,
            assetCurrency: effectiveAssetCurrency,
            accountCurrency: effectiveAccountCurrency
        )
    }

    @ViewBuilder
    private var cashImpactRow: some View {
        switch currentCashImpact {
        case .none:
            if selectedAccount == nil && newAccountName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Label("未連結扣款帳戶", systemImage: "creditcard")
                    .foregroundStyle(NorthstarTheme.secondaryText)
            } else if action == .stockDividend || action == .capitalReduction {
                Label("此動作不影響現金", systemImage: "info.circle")
                    .foregroundStyle(NorthstarTheme.secondaryText)
            } else {
                Label("填入價格與數量後計算", systemImage: "questionmark.circle")
                    .foregroundStyle(NorthstarTheme.secondaryText)
            }
        case .currencyMismatch:
            Label {
                VStack(alignment: .leading, spacing: 2) {
                    Text("幣別不符，不會自動連動現金")
                        .font(.subheadline.weight(.semibold))
                    Text("標的 \(effectiveAssetCurrency ?? "—") · 帳戶 \(effectiveAccountCurrency ?? "—")")
                        .font(.caption)
                        .foregroundStyle(NorthstarTheme.secondaryText)
                }
            } icon: {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(NorthstarTheme.warning)
            }
        case .amount(let amount):
            let currencyCode = effectiveAccountCurrency ?? "TWD"
            let accountName = selectedAccount?.name
                ?? newAccountName.trimmingCharacters(in: .whitespacesAndNewlines)
            Label {
                VStack(alignment: .leading, spacing: 2) {
                    Text(amount < 0 ? "將從帳戶扣款" : "將入帳至帳戶")
                        .font(.subheadline.weight(.semibold))
                    Text("\(accountName.isEmpty ? "—" : accountName) · \(CurrencyFormatters.signedMoney(amount, currencyCode: currencyCode))")
                        .font(.caption)
                        .monospacedDigit()
                        .foregroundStyle(amount < 0 ? NorthstarTheme.risk : NorthstarTheme.growth)
                }
            } icon: {
                Image(systemName: amount < 0 ? "arrow.down.left.circle.fill" : "arrow.up.right.circle.fill")
                    .foregroundStyle(amount < 0 ? NorthstarTheme.risk : NorthstarTheme.growth)
            }
        }
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
        let price: Double
        let quantity: Double
        let fee: Double

        if action == .stockSplit {
            guard let ratio = Double(splitRatioText), ratio > 0 else { return }
            price = 0
            quantity = ratio
            fee = 0
        } else {
            guard
                let p = Double(priceText),
                let q = Double(quantityText)
            else { return }
            price = p
            quantity = q
            fee = Double(feeText) ?? 0
        }

        let asset = selectedAsset ?? createAsset()
        let linkedAccount = selectedAccount ?? createAccountIfNeeded()

        if let editing {
            let oldAsset = editing.asset
            let oldAccount = editing.linkedAccount
            editing.date = date
            editing.action = action
            editing.price = price
            editing.quantity = quantity
            editing.fee = fee
            editing.note = note
            editing.linkedAccount = linkedAccount
            editing.asset = asset

            if let oldAsset, oldAsset !== asset {
                PortfolioCalculator.apply(records: oldAsset.records, to: oldAsset)
            }
            PortfolioCalculator.apply(records: asset.records, to: asset)
            LedgerLinkage.syncLedger(for: editing, context: modelContext)
            if let oldAccount, oldAccount !== linkedAccount {
                oldAccount.recomputeBalance()
            }
        } else {
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
            var newRecords = [record]

            if action == .cashDividend, enableDRIP,
               let dripPrice = Double(dripPriceText), dripPrice > 0 {
                let cash = price * quantity - fee
                if cash > 0 {
                    let dripQty = cash / dripPrice
                    let dripRecord = InvestmentRecord(
                        date: date,
                        action: .buy,
                        price: dripPrice,
                        quantity: dripQty,
                        fee: 0,
                        note: "DRIP",
                        asset: asset,
                        linkedAccount: linkedAccount
                    )
                    modelContext.insert(dripRecord)
                    newRecords.append(dripRecord)
                }
            }

            PortfolioCalculator.apply(records: asset.records + newRecords, to: asset)
            for r in newRecords {
                LedgerLinkage.syncLedger(for: r, context: modelContext)
            }
        }

        try? modelContext.save()
        dismiss()
    }

    private func deleteRecord() {
        guard let editing else { return }
        let asset = editing.asset
        LedgerLinkage.removeLedger(for: editing, context: modelContext)
        modelContext.delete(editing)
        try? modelContext.save()
        if let asset {
            PortfolioCalculator.apply(records: asset.records, to: asset)
            try? modelContext.save()
        }
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
