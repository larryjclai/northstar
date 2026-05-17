import SwiftUI

struct SymbolPickerSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var store = SymbolSearchStore()
    @FocusState private var queryFocused: Bool

    let localAssets: [PortfolioAsset]
    let onSelect: (PickedSymbol) -> Void

    struct PickedSymbol {
        let symbol: String
        let name: String
        let currency: String?
        let exchange: String?
    }

    private var localMatches: [PortfolioAsset] {
        let q = store.query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard q.isEmpty == false else { return [] }
        return localAssets.filter {
            $0.ticker.localizedCaseInsensitiveContains(q)
                || $0.name.localizedCaseInsensitiveContains(q)
        }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                searchBar
                Divider()
                content
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .navigationTitle("選擇代號")
            .platformInlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 520, idealWidth: 560, minHeight: 480, idealHeight: 560)
        #endif
        .onAppear { queryFocused = true }
    }

    private var searchBar: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(NorthstarTheme.mutedText)
            TextField("輸入股票代號或名稱（例如 VTI、台積電）", text: Binding(
                get: { store.query },
                set: { store.update(query: $0) }
            ))
            .textFieldStyle(.plain)
            .focused($queryFocused)
            #if !os(macOS)
            .autocorrectionDisabled()
            .textInputAutocapitalization(.characters)
            #endif
            if store.query.isEmpty == false {
                Button {
                    store.clear()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(NorthstarTheme.mutedText)
                }
                .buttonStyle(.plain)
            }
            if store.isSearching {
                ProgressView().controlSize(.small)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    @ViewBuilder
    private var content: some View {
        if store.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            placeholder
        } else {
            List {
                if localMatches.isEmpty == false {
                    Section("我的標的") {
                        ForEach(localMatches, id: \.ticker) { asset in
                            Button {
                                onSelect(PickedSymbol(
                                    symbol: asset.ticker,
                                    name: asset.name,
                                    currency: asset.currency,
                                    exchange: nil
                                ))
                                dismiss()
                            } label: {
                                row(symbol: asset.ticker, name: asset.name, exchange: nil, currency: asset.currency)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                Section("線上搜尋") {
                    if store.results.isEmpty {
                        if store.isSearching {
                            HStack { Spacer(); ProgressView(); Spacer() }
                                .padding(.vertical, 12)
                        } else if let lastError = store.lastError {
                            Text(lastError)
                                .font(.caption)
                                .foregroundStyle(NorthstarTheme.warning)
                        } else {
                            Text("沒有符合的線上結果。")
                                .font(.caption)
                                .foregroundStyle(NorthstarTheme.secondaryText)
                        }
                    } else {
                        ForEach(store.results) { suggestion in
                            Button {
                                onSelect(PickedSymbol(
                                    symbol: suggestion.symbol,
                                    name: suggestion.name,
                                    currency: suggestion.currency,
                                    exchange: suggestion.exchange
                                ))
                                dismiss()
                            } label: {
                                row(
                                    symbol: suggestion.symbol,
                                    name: suggestion.name,
                                    exchange: suggestion.exchange,
                                    currency: suggestion.currency,
                                    typeLabel: suggestion.typeLabel
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .platformPlainListStyle()
        }
    }

    private var placeholder: some View {
        VStack(alignment: .center, spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.largeTitle)
                .foregroundStyle(NorthstarTheme.mutedText)
            Text("輸入代號或公司名稱開始搜尋")
                .font(.subheadline)
                .foregroundStyle(NorthstarTheme.secondaryText)
            Text("結果來源：Yahoo Finance")
                .font(.caption)
                .foregroundStyle(NorthstarTheme.mutedText)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func row(
        symbol: String,
        name: String,
        exchange: String?,
        currency: String?,
        typeLabel: String = ""
    ) -> some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(symbol)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(NorthstarTheme.primaryText)
                Text(name)
                    .font(.caption)
                    .foregroundStyle(NorthstarTheme.secondaryText)
                    .lineLimit(2)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                if let exchange {
                    Text(exchange)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(NorthstarTheme.mutedText)
                }
                if let currency {
                    Text(currency)
                        .font(.caption)
                        .foregroundStyle(NorthstarTheme.mutedText)
                } else if typeLabel.isEmpty == false {
                    Text(typeLabel)
                        .font(.caption)
                        .foregroundStyle(NorthstarTheme.mutedText)
                }
            }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }
}

private extension View {
    @ViewBuilder
    func platformPlainListStyle() -> some View {
        #if os(iOS)
        self.listStyle(.insetGrouped)
        #else
        self.listStyle(.inset)
        #endif
    }
}
