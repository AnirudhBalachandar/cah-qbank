import AppKit
import SwiftUI

@main
struct CAHQBankMacApp: App {
    @StateObject private var model = AppViewModel()

    var body: some Scene {
        WindowGroup("CAH QBank") {
            RootView(model: model)
                .frame(minWidth: 1180, minHeight: 780)
                .task {
                    await model.bootstrapIfNeeded()
                }
        }
        .commands {
            CommandMenu("QBank") {
                Button("Sync Question Bank") {
                    Task {
                        await model.syncNow()
                    }
                }
                .keyboardShortcut("r", modifiers: [.command, .shift])

                Button(model.hasPreferredRepoRoot ? "Change Repo…" : "Choose Repo…") {
                    chooseRepo()
                }
                .keyboardShortcut("o", modifiers: [.command, .option])

                Button("Use Auto Detection") {
                    Task {
                        await model.resetPreferredRepoRoot()
                    }
                }
                .disabled(!model.hasPreferredRepoRoot)
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

    private func chooseRepo() {
        let panel = NSOpenPanel()
        panel.message = "Choose the local cah-qbank repo root that contains questions/, app/, and native/."
        panel.prompt = "Choose Repo"
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.canCreateDirectories = false
        if !model.repoRootPath.isEmpty {
            panel.directoryURL = URL(fileURLWithPath: model.repoRootPath, isDirectory: true)
        } else if let preferredRepoRootPath = model.preferredRepoRootPath, !preferredRepoRootPath.isEmpty {
            panel.directoryURL = URL(fileURLWithPath: preferredRepoRootPath, isDirectory: true)
        }

        guard panel.runModal() == .OK, let url = panel.url else { return }
        Task {
            await model.setPreferredRepoRoot(url)
        }
    }
}
