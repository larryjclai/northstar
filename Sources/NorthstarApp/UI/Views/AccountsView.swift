import SwiftUI
import SwiftData

struct AccountsView: View {
    let fxStore: FXRateStore

    @Environment(\.modelContext) private var modelContext
    @Query(sort: \Account.name) private var accounts: [Account]
    @AppStorage(IntentRoutingKeys.baseCurrency) private var baseCurrency: String = BaseCurrencyDefaults.default

    @State private var editingAccount: Account?
    @State private var showAddSheet = false
    @State private var reconcilingAccount: Account?
    @State private var pendingDelete: Account?

    private var totalBase: Double {
        accounts.reduce(0) { running, account in
            running + (fxStore.convert(account.balance, from: account.currency, to: baseCurrency) ?? 0)
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    hero
                    if accounts.isEmpty {
                        emptyState
                    } else {
                        ForEach(accounts) { account in
                            AccountCard(
                                account: account,
                                baseCurrency: baseCurrency,
                                convertedBalance: fxStore.convert(account.balance, from: account.currency, to: baseCurrency),
                                onEdit: { editingAccount = account },
                                onReconcile: { reconcilingAccount = account },
                                onDelete: { pendingDelete = account }
                            )
                        }
                    }
                }
                .padding(20)
            }
            .northstarScreenBackground()
            .navigationTitle("帳戶")
            .platformLargeNavigationTitle()
            .toolbar {
                ToolbarItem {
                    Button {
                        showAddSheet = true
                    } label: {
                        Label("新增帳戶", systemImage: "plus")
                    }
                    .keyboardShortcut("n", modifiers: .command)
                }
            }
            .sheet(isPresented: $showAddSheet) {
                AccountEditorView(editing: nil)
            }
            .sheet(item: $editingAccount) { account in
                AccountEditorView(editing: account)
            }
            .sheet(item: $reconcilingAccount) { account in
                AccountReconcileView(account: account)
            }
            .alert(
                "刪除帳戶 \(pendingDelete?.name ?? "")？",
                isPresented: Binding(
                    get: { pendingDelete != nil },
                    set: { if $0 == false { pendingDelete = nil } }
                )
            ) {
                Button("刪除", role: .destructive) {
                    if let account = pendingDelete {
                        delete(account)
                    }
                    pendingDelete = nil
                }
                Button("取消", role: .cancel) { pendingDelete = nil }
            } message: {
                Text("此帳戶會連同其所有交易與已連動的投資紀錄被移除。")
            }
        }
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("現金帳戶")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.secondaryText)
                    Text("\(accounts.count) 個帳戶")
                        .font(.system(size: 34, weight: .semibold))
                        .foregroundStyle(NorthstarTheme.primaryText)
                        .monospacedDigit()
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 4) {
                    Text("總現金（\(baseCurrency)）")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.secondaryText)
                    Text(CurrencyFormatters.money(totalBase, currencyCode: baseCurrency))
                        .font(.title2.weight(.bold))
                        .foregroundStyle(NorthstarTheme.primaryText)
                        .monospacedDigit()
                }
            }

            Text("管理活存、外幣、券商現金等帳戶。設定 opening balance 補齊歷史餘額，使用對帳功能將現況調整到 statement 金額。")
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
            Text("還沒有現金帳戶")
                .font(.headline)
                .foregroundStyle(NorthstarTheme.primaryText)
            Text("新增銀行、外幣或券商帳戶後，可以記錄 opening balance、追蹤現金流動，並讓投資交易自動連動扣款／入帳。")
                .font(.subheadline)
                .foregroundStyle(NorthstarTheme.secondaryText)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .northstarCardSurface()
    }

    private func delete(_ account: Account) {
        modelContext.delete(account)
        try? modelContext.save()
    }
}

private struct AccountCard: View {
    let account: Account
    let baseCurrency: String
    let convertedBalance: Double?
    let onEdit: () -> Void
    let onReconcile: () -> Void
    let onDelete: () -> Void

    private var isForeign: Bool {
        account.currency.uppercased() != baseCurrency.uppercased()
    }

    private var movementSinceOpening: Double {
        account.balance - account.openingBalance
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(NorthstarTheme.accent.opacity(0.16))
                    Image(systemName: "creditcard.fill")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.accent)
                }
                .frame(width: 42, height: 42)

                VStack(alignment: .leading, spacing: 3) {
                    Text(account.name)
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.primaryText)
                    Text(account.currency)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.secondaryText)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 4) {
                    Text(CurrencyFormatters.money(account.balance, currencyCode: account.currency))
                        .font(.title3.weight(.bold))
                        .foregroundStyle(NorthstarTheme.primaryText)
                        .monospacedDigit()
                    if isForeign {
                        if let convertedBalance {
                            Text("≈ \(CurrencyFormatters.money(convertedBalance, currencyCode: baseCurrency))")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(NorthstarTheme.secondaryText)
                                .monospacedDigit()
                        } else {
                            Text("匯率待更新")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(NorthstarTheme.warning)
                        }
                    }
                }
            }

            HStack(spacing: 16) {
                metric("Opening", CurrencyFormatters.money(account.openingBalance, currencyCode: account.currency))
                metric("自起始變動", CurrencyFormatters.signedMoney(movementSinceOpening, currencyCode: account.currency))
                metric("交易筆數", "\(account.transactions.count)")
                Spacer(minLength: 0)
            }

            HStack(spacing: 10) {
                Button(action: onEdit) {
                    Label("編輯", systemImage: "pencil")
                        .font(.caption.weight(.semibold))
                }
                .buttonStyle(.bordered)

                Button(action: onReconcile) {
                    Label("對帳", systemImage: "checklist")
                        .font(.caption.weight(.semibold))
                }
                .buttonStyle(.bordered)
                .tint(NorthstarTheme.accent)

                Spacer()

                Button(role: .destructive, action: onDelete) {
                    Label("刪除", systemImage: "trash")
                        .font(.caption.weight(.semibold))
                }
                .buttonStyle(.bordered)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .northstarCardSurface()
    }

    private func metric(_ label: String, _ value: String) -> some View {
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

