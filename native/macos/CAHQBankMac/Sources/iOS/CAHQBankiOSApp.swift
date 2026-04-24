import SwiftUI

@main
struct CAHQBankiOSApp: App {
    @StateObject private var model = Self.makeModel()
    @AppStorage(CAHAppearanceMode.storageKey) private var appearanceRawValue = CAHAppearanceMode.light.rawValue

    private var appearanceMode: CAHAppearanceMode {
        CAHAppearanceMode.normalized(appearanceRawValue)
    }

    var body: some Scene {
        WindowGroup {
            iOSRootView(model: model)
                .preferredColorScheme(appearanceMode.colorScheme)
                .task {
                    await model.bootstrapIfNeeded()
            }
        }
    }

    private static func makeModel() -> AppViewModel {
        if ProcessInfo.processInfo.arguments.contains("--uitest-reset") {
            let suiteName = "CAHQBankiOSUITests"
            let defaults = UserDefaults(suiteName: suiteName) ?? .standard
            defaults.removePersistentDomain(forName: suiteName)
            return AppViewModel(
                userDefaults: defaults,
                serviceProvider: BundledDatabaseQBankServiceProvider(storageDirectoryName: suiteName)
            )
        }

        return AppViewModel(
            serviceProvider: BundledDatabaseQBankServiceProvider()
        )
    }
}
