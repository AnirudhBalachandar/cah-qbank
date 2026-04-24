import SwiftUI

@main
struct CAHQBankiOSApp: App {
    @StateObject private var model = AppViewModel(
        serviceProvider: UnavailableQBankServiceProvider()
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
