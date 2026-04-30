import SwiftUI
import SwiftData

struct TransactionsView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \InvestmentRecord.date, order: .reverse) private var records: [InvestmentRecord]
    @Query(sort: \PortfolioAsset.ticker) private var assets: [PortfolioAsset]
    @Query(sort: \Account.name) private var accounts: [Account]
    @Binding var showAddSheet: Bool

    var body: some View {
        NavigationStack {
            List {
                ForEach(records) { record in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(record.asset?.ticker ?? "-")
                                .font(.headline)
                            Spacer()
                            Text(record.action.rawValue)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                        }
                        HStack {
                            Text(record.date, style: .date)
                            Spacer()
                            Text("數量 \(record.quantity, specifier: "%.2f")")
                        }
                        .font(.subheadline)
                        HStack {
                            Text("價格 \(CurrencyFormatters.money(record.price))")
                            Spacer()
                            Text("手續費 \(CurrencyFormatters.money(record.fee))")
                        }
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 2)
                }
            }
            .navigationTitle("交易")
            .toolbar {
                Button {
                    showAddSheet = true
                } label: {
                    Label("新增", systemImage: "plus")
                }
            }
            .sheet(isPresented: $showAddSheet) {
                AddInvestmentRecordView(assets: assets, accounts: accounts)
            }
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
    @State private var selectedAsset: PortfolioAsset?
    @State private var selectedAccount: Account?
    @State private var priceText = ""
    @State private var quantityText = ""
    @State private var feeText = ""
    @State private var note = ""

    var body: some View {
        NavigationStack {
            Form {
                DatePicker("日期", selection: $date, displayedComponents: .date)
                Picker("動作", selection: $action) {
                    ForEach(InvestmentAction.allCases) { action in
                        Text(action.rawValue).tag(action)
                    }
                }
                Picker("標的", selection: $selectedAsset) {
                    Text("請選擇").tag(nil as PortfolioAsset?)
                    ForEach(assets, id: \.ticker) { asset in
                        Text("\(asset.ticker) \(asset.name)").tag(asset as PortfolioAsset?)
                    }
                }
                Picker("扣款帳戶", selection: $selectedAccount) {
                    Text("請選擇").tag(nil as Account?)
                    ForEach(accounts, id: \.id) { account in
                        Text(account.name).tag(account as Account?)
                    }
                }
                TextField("價格", text: $priceText)
                    .decimalKeyboard()
                TextField("數量", text: $quantityText)
                    .decimalKeyboard()
                TextField("手續費", text: $feeText)
                    .decimalKeyboard()
                TextField("備註", text: $note)
            }
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
            if selectedAsset == nil { selectedAsset = assets.first }
            if selectedAccount == nil { selectedAccount = accounts.first }
        }
    }

    private var canSave: Bool {
        selectedAsset != nil && Double(priceText) != nil && Double(quantityText) != nil
    }

    private func save() {
        guard
            let asset = selectedAsset,
            let price = Double(priceText),
            let quantity = Double(quantityText)
        else { return }

        let fee = Double(feeText) ?? 0
        let record = InvestmentRecord(
            date: date,
            action: action,
            price: price,
            quantity: quantity,
            fee: fee,
            note: note,
            asset: asset,
            linkedAccount: selectedAccount
        )
        modelContext.insert(record)
        PortfolioCalculator.apply(records: asset.records, to: asset)
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
}
