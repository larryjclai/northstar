import SwiftUI
import SwiftData

struct SettingsView: View {
    let fxStore: FXRateStore
    let priceStore: PriceStore

    @AppStorage(IntentRoutingKeys.baseCurrency) private var baseCurrency: String = BaseCurrencyDefaults.default
    @AppStorage(IntentRoutingKeys.privacyMode) private var privacyMode: Bool = false
    @AppStorage(IntentRoutingKeys.preferredNameLocale) private var preferredNameLocale: String = NameLocalePreference.auto
    @Query(sort: \PortfolioAsset.ticker) private var assets: [PortfolioAsset]
    @Query(sort: \Account.name) private var accounts: [Account]

    private var portfolioCurrencies: [String] {
        var seen = Set<String>()
        var ordered: [String] = []
        for currency in assets.map(\.currency) + accounts.map(\.currency) {
            let upper = currency.uppercased()
            guard upper.isEmpty == false, seen.insert(upper).inserted else { continue }
            ordered.append(upper)
        }
        return ordered.sorted()
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("本位幣") {
                    Picker("Base currency", selection: $baseCurrency) {
                        ForEach(BaseCurrencyDefaults.supported, id: \.self) { code in
                            Text(code).tag(code)
                        }
                    }
                    Text("Dashboard 與 Holdings 的總計會以本位幣顯示，非本位幣標的會自動折算。")
                        .font(.caption)
                        .foregroundStyle(NorthstarTheme.secondaryText)
                }

                Section("匯率狀態") {
                    HStack {
                        Text("更新時間")
                        Spacer()
                        Text(fxStore.lastUpdated.map { $0.formatted(date: .abbreviated, time: .shortened) } ?? "尚未取得")
                            .foregroundStyle(NorthstarTheme.secondaryText)
                            .monospacedDigit()
                    }

                    Button {
                        Task {
                            await fxStore.refresh(
                                currencies: portfolioCurrencies,
                                base: baseCurrency,
                                force: true
                            )
                        }
                    } label: {
                        if fxStore.isRefreshing {
                            Label("更新中…", systemImage: "arrow.clockwise")
                        } else {
                            Label("立即更新匯率", systemImage: "arrow.clockwise")
                        }
                    }
                    .disabled(fxStore.isRefreshing || portfolioCurrencies.isEmpty)

                    if let error = fxStore.lastError {
                        Label(error, systemImage: "exclamationmark.triangle.fill")
                            .font(.subheadline)
                            .foregroundStyle(NorthstarTheme.warning)
                    }

                    if portfolioCurrencies.isEmpty {
                        Text("尚未有任何資產或帳戶，無需匯率。")
                            .font(.caption)
                            .foregroundStyle(NorthstarTheme.secondaryText)
                    } else {
                        ForEach(portfolioCurrencies, id: \.self) { currency in
                            ratePairRow(currency: currency)
                        }
                    }
                }

                Section("顯示") {
                    Picker("標的名稱語系", selection: $preferredNameLocale) {
                        Text("跟隨系統").tag(NameLocalePreference.auto)
                        Text("繁體中文").tag(NameLocalePreference.zhHant)
                        Text("English").tag(NameLocalePreference.en)
                    }
                    Text("新增股票時會用這個語系顯示名稱；缺少對應翻譯時自動使用 Yahoo 回傳的原文。")
                        .font(.caption)
                        .foregroundStyle(NorthstarTheme.secondaryText)
                }

                Section("隱私") {
                    Toggle(isOn: $privacyMode) {
                        Label("隱藏金額（截圖模式）", systemImage: privacyMode ? "eye.slash.fill" : "eye.fill")
                    }
                    Text("開啟後所有金額會顯示為 ＊＊＊＊＊＊，方便錄影或回報問題。可在頂部工具列快速切換（⌘⇧H）。")
                        .font(.caption)
                        .foregroundStyle(NorthstarTheme.secondaryText)

                    Label("資料儲存在這台裝置", systemImage: "lock.fill")
                        .font(.subheadline)
                    Text("northstar 是 local-first 設計。投資紀錄、帳戶餘額與分類完全存在本機 SwiftData 中，不會上傳。")
                        .font(.caption)
                        .foregroundStyle(NorthstarTheme.secondaryText)
                }
            }
            .platformSettingsFormStyle()
            .northstarScreenBackground()
            .navigationTitle("Settings")
            .platformLargeNavigationTitle()
        }
        .task(id: portfolioCurrencies.joined() + baseCurrency) {
            await fxStore.refresh(currencies: portfolioCurrencies, base: baseCurrency)
        }
    }

    @ViewBuilder
    private func ratePairRow(currency: String) -> some View {
        let displayCurrency = currency
        let base = baseCurrency
        let rate = fxStore.rate(from: displayCurrency, to: base)
        let timestamp = fxStore.timestamp(from: displayCurrency, to: base)

        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("1 \(displayCurrency) = ")
                    .font(.subheadline.weight(.semibold))
                    + Text(rate.map { String(format: "%.4f", $0) } ?? "—")
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(rate == nil ? .secondary : .primary)
                    + Text(" \(base)")
                        .font(.subheadline.weight(.semibold))
                Text(timestamp.map { "更新於 \($0.formatted(date: .abbreviated, time: .shortened))" } ?? "尚無資料")
                    .font(.caption2)
                    .foregroundStyle(NorthstarTheme.secondaryText)
            }
            Spacer()
            if currency == base {
                Text("本位幣")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(NorthstarTheme.accent)
            } else if rate == nil {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(NorthstarTheme.warning)
            }
        }
    }
}

private extension View {
    @ViewBuilder
    func platformSettingsFormStyle() -> some View {
        #if os(iOS)
        self.formStyle(.grouped)
        #else
        self.formStyle(.grouped)
        #endif
    }
}
