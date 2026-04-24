import SwiftUI

@main
struct CAHQBankMacApp: App {
    @StateObject private var model = AppViewModel(
        serviceProvider: BundledDatabaseQBankServiceProvider(storageDirectoryName: "CAHQBankMac")
    )
    @AppStorage(CAHAppearanceMode.storageKey) private var appearanceRawValue = CAHAppearanceMode.light.rawValue

    private var appearanceMode: CAHAppearanceMode {
        CAHAppearanceMode.normalized(appearanceRawValue)
    }

    var body: some Scene {
        WindowGroup("CAH QBank") {
            RootView(model: model)
                .frame(minWidth: 1180, minHeight: 780)
                .preferredColorScheme(appearanceMode.colorScheme)
                .task {
                    await model.bootstrapIfNeeded()
                }
        }
        .commands {
            CommandMenu("QBank") {
                Button(appearanceMode.toggleTitle) {
                    appearanceRawValue = appearanceMode.toggled.rawValue
                }
                .keyboardShortcut("l", modifiers: [.command, .option])

                Divider()

                Button("Refresh Library") {
                    Task {
                        await model.syncNow()
                    }
                }
                .keyboardShortcut("r", modifiers: [.command, .shift])
            }
            CommandMenu("Navigate") {
                Button("Dashboard") {
                    model.selectSection(.dashboard)
                }
                .keyboardShortcut("1", modifiers: [.command])

                Button("Browse Questions") {
                    model.selectSection(.browse)
                }
                .keyboardShortcut("2", modifiers: [.command])

                Button("Start Practice") {
                    model.selectSection(.practice)
                }
                .keyboardShortcut("3", modifiers: [.command])

                Button("Progress") {
                    model.selectSection(.progress)
                }
                .keyboardShortcut("4", modifiers: [.command])
            }
        }
    }
}
