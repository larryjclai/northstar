import SwiftUI

/// Glass-backed card container for grouping related fields inside an editor sheet.
/// Replaces the native `Form { Section { ... } }` look (label-left rows on macOS)
/// with a stacked `VStack` whose background uses `.glassEffect(...)` on iOS 26 /
/// macOS 26 and falls back to `Color.nsSurface` on older systems.
struct GlassFormCard<Content: View>: View {
    private let title: String?
    private let footer: String?
    private let tinted: Bool
    private let content: () -> Content

    init(
        _ title: String? = nil,
        footer: String? = nil,
        tinted: Bool = false,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.title = title
        self.footer = footer
        self.tinted = tinted
        self.content = content
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let title {
                Text(title)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(NorthstarTheme.mutedText)
                    .textCase(.uppercase)
                    .tracking(0.6)
            }
            VStack(alignment: .leading, spacing: 14) {
                content()
            }
            if let footer {
                Text(footer)
                    .font(.caption2)
                    .foregroundStyle(NorthstarTheme.mutedText)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(alignment: .topLeading) {
            if tinted {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(NorthstarTheme.accent.opacity(0.10))
            }
        }
        .northstarCardSurface(cornerRadius: 18)
    }
}

/// A label-above-content field row designed for `GlassFormCard`.
/// Use when you want a small caption above a Picker, TextField, etc.
struct FieldRow<Content: View>: View {
    private let label: String
    private let content: () -> Content

    init(_ label: String, @ViewBuilder content: @escaping () -> Content) {
        self.label = label
        self.content = content
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(NorthstarTheme.mutedText)
                .textCase(.uppercase)
                .tracking(0.4)
            content()
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

/// Two distinct chip languages so users learn the difference at a glance:
/// - `.transient` = momentary action (e.g. "set the date to today" — chip itself
///   never highlights as a persistent state).
/// - `.sticky` = currently-selected persistent choice (e.g. recent-category pick).
enum NorthstarChipRole {
    case transient
    case sticky(isSelected: Bool)
}

extension View {
    /// Styles a chip's label content. Apply to the inner `Text(...)` (or other label)
    /// of a `Button { ... } label: { Text(...).northstarChipStyle(.transient) }`.
    @ViewBuilder
    func northstarChipStyle(_ role: NorthstarChipRole) -> some View {
        switch role {
        case .transient:
            self
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .foregroundStyle(NorthstarTheme.primaryText)
                .background {
                    Capsule(style: .continuous)
                        .strokeBorder(NorthstarTheme.accent.opacity(0.35), lineWidth: 1)
                }
        case .sticky(let isSelected):
            self
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .foregroundStyle(isSelected ? Color.nsBackground : NorthstarTheme.primaryText)
                .background {
                    Capsule(style: .continuous)
                        .fill(isSelected ? NorthstarTheme.accent : NorthstarTheme.accent.opacity(0.10))
                }
        }
    }

    /// Toolbar buttons on iOS 26 / macOS 26 get the new `.glass` button style.
    /// Older systems fall back to the default toolbar treatment unchanged.
    @ViewBuilder
    func northstarToolbarGlass() -> some View {
        if #available(iOS 26.0, macOS 26.0, *) {
            self.buttonStyle(.glass)
        } else {
            self
        }
    }

    /// Selected sidebar/nav row background: tinted glass on iOS 26 / macOS 26,
    /// solid accent fill on older systems.
    @ViewBuilder
    func northstarSelectionSurface(isSelected: Bool, cornerRadius: CGFloat = 8) -> some View {
        if isSelected {
            if #available(iOS 26.0, macOS 26.0, *) {
                self.background {
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(NorthstarTheme.accent.opacity(0.18))
                        .glassEffect(
                            .regular.tint(NorthstarTheme.accent.opacity(0.35)),
                            in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        )
                }
            } else {
                self.background {
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(Color(red: 0.38, green: 0.62, blue: 1.00))
                }
            }
        } else {
            self
        }
    }
}

/// Compact inline hint shown when the editor's Save button is disabled. The reason
/// string is computed by each editor (e.g. "輸入金額後即可儲存") so users don't have
/// to guess why the toolbar's primary action is greyed out.
struct DisabledHintBanner: View {
    let reason: String?

    var body: some View {
        if let reason {
            Label(reason, systemImage: "info.circle.fill")
                .font(.caption.weight(.semibold))
                .foregroundStyle(NorthstarTheme.mutedText)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(NorthstarTheme.mutedText.opacity(0.08))
                }
        }
    }
}

/// Container for editor sheets: vertical scroll, padded card stack, consistent
/// max-width on macOS. Keep using `NavigationStack { ... }.toolbar { ... }` around
/// this — `SheetCardScroll` only handles the body.
struct SheetCardScroll<Content: View>: View {
    private let content: () -> Content

    init(@ViewBuilder content: @escaping () -> Content) {
        self.content = content
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                content()
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 20)
            .frame(maxWidth: 640)
            .frame(maxWidth: .infinity)
        }
        .scrollContentBackground(.hidden)
        .background(Color.nsBackground.ignoresSafeArea())
        #if os(macOS)
        .frame(minWidth: 520, idealWidth: 560, minHeight: 520, idealHeight: 640)
        #endif
    }
}
