import SwiftUI

@main
struct CAHQBankiOSApp: App {
    @StateObject private var model = Self.makeModel()

    var body: some Scene {
        WindowGroup {
            iOSRootView(model: model)
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
