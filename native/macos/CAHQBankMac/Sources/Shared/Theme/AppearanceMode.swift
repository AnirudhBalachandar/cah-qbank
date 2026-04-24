import SwiftUI

enum CAHAppearanceMode: String, CaseIterable, Identifiable {
    case light
    case dark

    static let storageKey = "cah.appearance.mode"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .light:
            return "Light"
        case .dark:
            return "Dark"
        }
    }

    var systemImage: String {
        switch self {
        case .light:
            return "sun.max"
        case .dark:
            return "moon"
        }
    }

    var colorScheme: ColorScheme {
        switch self {
        case .light:
            return .light
        case .dark:
            return .dark
        }
    }

    var toggled: CAHAppearanceMode {
        switch self {
        case .light:
            return .dark
        case .dark:
            return .light
        }
    }

    var toggleTitle: String {
        "Switch to \(toggled.title) Mode"
    }

    static func normalized(_ rawValue: String) -> CAHAppearanceMode {
        CAHAppearanceMode(rawValue: rawValue) ?? .light
    }
}

struct AppearanceModeButton: View {
    @AppStorage(CAHAppearanceMode.storageKey) private var rawValue = CAHAppearanceMode.light.rawValue

    private var mode: CAHAppearanceMode {
        CAHAppearanceMode.normalized(rawValue)
    }

    var body: some View {
        Button {
            rawValue = mode.toggled.rawValue
        } label: {
            Label(mode.toggleTitle, systemImage: mode.toggled.systemImage)
        }
        .help(mode.toggleTitle)
        .accessibilityLabel(mode.toggleTitle)
    }
}
