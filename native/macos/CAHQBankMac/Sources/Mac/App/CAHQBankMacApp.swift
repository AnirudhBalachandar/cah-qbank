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
                .frame(minWidth: 980, minHeight: 680)
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

                Button("Browse") {
                    model.selectSection(.browse)
                }
                .keyboardShortcut("2", modifiers: [.command])

                Button("Practice") {
                    model.selectSection(.practice)
                }
                .keyboardShortcut("3", modifiers: [.command])

                Button("Progress") {
                    model.selectSection(.progress)
                }
                .keyboardShortcut("4", modifiers: [.command])

                Button("Notebook") {
                    model.selectSection(.notebook)
                }
                .keyboardShortcut("5", modifiers: [.command])

                Button("Profile") {
                    model.selectSection(.profile)
                }
                .keyboardShortcut("6", modifiers: [.command])
            }
        }
    }
}
