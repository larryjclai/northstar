import SwiftUI

/// Toolbar / FAB control that exposes a primary "add" action plus a dropdown of all add kinds.
/// - Single click (or Cmd+N): runs the primary action — the most sensible add for the current tab.
/// - Long press / chevron: reveals the full menu (投資紀錄 / 記帳 / 轉帳).
struct AddEntryMenu: View {
    let primary: AddSheetKind
    let onSelect: (AddSheetKind) -> Void

    var body: some View {
        Menu {
            ForEach(AddSheetKind.allCases) { kind in
                Button {
                    onSelect(kind)
                } label: {
                    Label {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(LocalizedStringKey(kind.titleKey))
                            Text(LocalizedStringKey(kind.subtitleKey))
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: kind.systemImageName)
                    }
                }
            }
        } label: {
            Label("新增", systemImage: "plus")
        } primaryAction: {
            onSelect(primary)
        }
        .keyboardShortcut("n", modifiers: .command)
        .help("新增（長按開啟選單）")
    }
}
