import SwiftUI
#if os(macOS)
import AppKit
import UniformTypeIdentifiers
#else
import PhotosUI
#endif

/// Cross-platform section that lets the user attach, preview, or remove
/// a receipt image stored as Data on a SwiftData model.
struct ReceiptAttachmentSection: View {
    @Binding var receipt: Data?
    #if !os(macOS)
    @State private var photosItem: PhotosPickerItem? = nil
    #endif

    var body: some View {
        Section("收據") {
            if let data = receipt, let preview = NorthstarImage(data: data) {
                preview
                    .resizable()
                    .scaledToFit()
                    .frame(maxHeight: 200)
                    .cornerRadius(10)

                Button(role: .destructive) {
                    receipt = nil
                } label: {
                    Label("移除收據", systemImage: "trash")
                }
            } else {
                #if os(macOS)
                Button {
                    pickFromMacPanel()
                } label: {
                    Label("從檔案加入收據", systemImage: "photo.on.rectangle")
                }
                #else
                PhotosPicker(selection: $photosItem, matching: .images) {
                    Label("加入收據", systemImage: "photo.on.rectangle")
                }
                .onChange(of: photosItem) { _, newValue in
                    guard let newValue else { return }
                    Task {
                        if let loaded = try? await newValue.loadTransferable(type: Data.self) {
                            receipt = loaded
                        }
                    }
                }
                #endif

                Text("收據圖片會以外部儲存附加在這筆紀錄上，僅留存在本機。")
                    .font(.caption)
                    .foregroundStyle(NorthstarTheme.secondaryText)
            }
        }
    }

    #if os(macOS)
    private func pickFromMacPanel() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.image]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        guard panel.runModal() == .OK, let url = panel.url else { return }
        if let data = try? Data(contentsOf: url) {
            receipt = data
        }
    }
    #endif
}

/// Bridges Image construction across platforms.
private func NorthstarImage(data: Data) -> Image? {
    #if os(macOS)
    if let image = NSImage(data: data) {
        return Image(nsImage: image)
    }
    #else
    if let image = UIImage(data: data) {
        return Image(uiImage: image)
    }
    #endif
    return nil
}
