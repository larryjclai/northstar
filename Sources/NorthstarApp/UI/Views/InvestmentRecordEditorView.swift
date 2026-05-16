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
    }

    private static func numberString(_ value: Double) -> String {
        if value == value.rounded() {
            return String(Int(value))
        }
        return String(value)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("基本資訊") {
                    DatePicker("日期", selection: $date, displayedComponents: .date)
                    Picker("動作", selection: $action) {
                        ForEach(InvestmentAction.allCases) { action in
                            Text(action.displayTitle).tag(action)
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

                Section("現金影響") {
                    cashImpactRow
                }

                Section("備註") {
                    TextField("備註", text: $note)
                }

                if editing != nil {
                    Section {
                        Button(role: .destructive) {
                            showDeleteConfirm = true
                        } label: {
                            Label("刪除此交易", systemImage: "trash")
                        }
                    }
                }
            }
            .platformFormStyle()
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
        }
        .onAppear {
            if editing == nil, selectedAccountID == nil {
                selectedAccountID = accounts.first?.id
            }
            activateAppForTextInput()
        }
    }

    private var canSave: Bool {
        hasAssetInput && Double(priceText) != nil && Double(quantityText) != nil
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
        guard
            let price = Double(priceText),
            let quantity = Double(quantityText)
        else { return }

        let asset = selectedAsset ?? createAsset()
        let linkedAccount = selectedAccount ?? createAccountIfNeeded()
        let fee = Double(feeText) ?? 0

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
            PortfolioCalculator.apply(records: asset.records + [record], to: asset)
            LedgerLinkage.syncLedger(for: record, context: modelContext)
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
