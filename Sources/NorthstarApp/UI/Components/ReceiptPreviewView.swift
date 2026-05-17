import SwiftUI
#if os(macOS)
import AppKit
#else
import UIKit
#endif

/// Full-screen receipt viewer with pinch / drag-to-zoom. Used by both the list rows and
/// the editor preview so behaviour is identical wherever a receipt thumbnail is tappable.
struct ReceiptPreviewView: View {
    let data: Data
    let onDismiss: () -> Void

    @State private var scale: CGFloat = 1
    @State private var lastScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero

    private static let minScale: CGFloat = 1
    private static let maxScale: CGFloat = 6

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let image = ReceiptImage.from(data: data) {
                image
                    .resizable()
                    .scaledToFit()
                    .scaleEffect(scale)
                    .offset(offset)
                    .gesture(zoomGesture)
                    .simultaneousGesture(panGesture)
                    .onTapGesture(count: 2, perform: handleDoubleTap)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                Text("無法解析收據圖片")
                    .font(.headline)
                    .foregroundStyle(.white)
            }

            VStack {
                HStack {
                    Spacer()
                    Button(action: onDismiss) {
                        Image(systemName: "xmark")
                            .font(.headline.weight(.semibold))
                            .padding(10)
                            .background(.ultraThinMaterial, in: Circle())
                    }
                    .buttonStyle(.plain)
                    .padding(.trailing, 20)
                    .padding(.top, 20)
                    .accessibilityLabel("關閉預覽")
                }
                Spacer()
                if scale > Self.minScale {
                    Button {
                        resetTransform()
                    } label: {
                        Label("重設縮放", systemImage: "arrow.uturn.backward")
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .background(.ultraThinMaterial, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .padding(.bottom, 24)
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 480, minHeight: 360)
        #endif
    }

    private var zoomGesture: some Gesture {
        MagnificationGesture()
            .onChanged { value in
                let next = lastScale * value
                scale = min(max(next, Self.minScale), Self.maxScale)
            }
            .onEnded { _ in
                lastScale = scale
                if scale <= Self.minScale {
                    resetTransform()
                }
            }
    }

    private var panGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                guard scale > Self.minScale else { return }
                offset = CGSize(
                    width: lastOffset.width + value.translation.width,
                    height: lastOffset.height + value.translation.height
                )
            }
            .onEnded { _ in
                lastOffset = offset
            }
    }

    private func handleDoubleTap() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
            if scale > Self.minScale {
                resetTransform()
            } else {
                scale = 2.5
                lastScale = scale
            }
        }
    }

    private func resetTransform() {
        scale = Self.minScale
        lastScale = Self.minScale
        offset = .zero
        lastOffset = .zero
    }
}

/// Small inline thumbnail (square) for list rows. Tapping invokes `onTap`,
/// which the host wires up to the full-screen preview. Falls back to a paperclip
/// glyph if the data cannot be decoded.
struct ReceiptThumbnail: View {
    let data: Data
    var size: CGFloat = 26
    var onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            content
        }
        .buttonStyle(.plain)
        .accessibilityLabel("檢視收據")
    }

    @ViewBuilder
    private var content: some View {
        if let image = ReceiptImage.from(data: data) {
            image
                .resizable()
                .scaledToFill()
                .frame(width: size, height: size)
                .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 5, style: .continuous)
                        .stroke(NorthstarTheme.mutedText.opacity(0.3), lineWidth: 0.5)
                }
        } else {
            ZStack {
                RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .fill(NorthstarTheme.mutedText.opacity(0.18))
                Image(systemName: "paperclip")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(NorthstarTheme.mutedText)
            }
            .frame(width: size, height: size)
        }
    }
}

/// Identifiable wrapper used by host views to drive `.sheet(item:)` based receipt presentation.
struct ReceiptPreviewItem: Identifiable {
    let id = UUID()
    let data: Data
}

/// Cross-platform Image factory used by both the thumbnail and the full preview.
enum ReceiptImage {
    static func from(data: Data) -> Image? {
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
}
