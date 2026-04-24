import SwiftUI

@main
struct CAHQBankiOSApp: App {
    @StateObject private var model = AppViewModel(
        serviceProvider: BundledDatabaseQBankServiceProvider()
    )

    var body: some Scene {
        WindowGroup {
            iOSRootView(model: model)
                .task {
                    await model.bootstrapIfNeeded()
                }
        }
    }
}
