import AppKit
import SwiftUI

struct RootView: View {
    @ObservedObject var model: AppViewModel

    var body: some View {
        NavigationSplitView {
            List(selection: $model.selection) {
                Section("Learner") {
                    Label("Dashboard", systemImage: "rectangle.grid.2x2")
                        .tag(AppViewModel.NavigationSection.dashboard)
                    Label("Browse Questions", systemImage: "book")
                        .tag(AppViewModel.NavigationSection.browse)
                    Label("Start Practice", systemImage: "play.circle")
                        .tag(AppViewModel.NavigationSection.practice)
                    Label("Progress", systemImage: "chart.bar")
                        .tag(AppViewModel.NavigationSection.progress)
                }
                Section("Status") {
                    VStack(alignment: .leading, spacing: 6) {
                        Label("CAH QBank", systemImage: statusSymbol)
                            .font(.headline)
                        Text(model.infoMessage)
                            .font(.caption)
                            .foregroundStyle(statusColor)
                            .lineLimit(4)
                        Text(model.repoStatusDetail)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(3)
                        if !model.repoRootPath.isEmpty {
                            Text(model.repoRootPath)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .lineLimit(2)
                        }
                        HStack {
                            Button(model.hasPreferredRepoRoot ? "Change Repo" : "Choose Repo") {
                                chooseRepo()
                            }

                            if model.hasPreferredRepoRoot {
                                Button("Reset Repo") {
                                    Task {
                                        await model.resetPreferredRepoRoot()
                                    }
                                }
                            }
                        }
                        .buttonStyle(.link)
                        .font(.caption)

                        HStack {
                            Button("Open Repo") {
                                openRepoInFinder()
                            }
                            .disabled(model.repoRootPath.isEmpty)

                            Button("Copy Path") {
                                copyRepoPath()
                            }
                            .disabled(model.repoRootPath.isEmpty)
                        }
                        .buttonStyle(.link)
                        .font(.caption)
                    }
                    .padding(.vertical, 4)
                }
            }
            .listStyle(.sidebar)
            .navigationSplitViewColumnWidth(min: 250, ideal: 280)
        } detail: {
            ZStack {
                detailView
                if model.isBusy {
                    VStack(spacing: 10) {
                        SwiftUI.ProgressView()
                        Text(model.isSyncing ? "Syncing local qbank state…" : "Refreshing local qbank state…")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding()
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
            }
            .safeAreaInset(edge: .top) {
                if let errorMessage = model.errorMessage {
                    errorBanner(errorMessage)
                }
            }
            .toolbar {
                ToolbarItemGroup {
                    Button {
                        Task {
                            await model.syncNow()
                        }
                    } label: {
                        Label("Sync", systemImage: "arrow.triangle.2.circlepath")
                    }
                    .keyboardShortcut("r", modifiers: [.command, .shift])
                    .disabled(model.isBusy)

                    Button {
                        openRepoInFinder()
                    } label: {
                        Label("Open Repo", systemImage: "folder")
                    }
                    .disabled(model.repoRootPath.isEmpty)

                    Button {
                        chooseRepo()
                    } label: {
                        Label(model.hasPreferredRepoRoot ? "Change Repo" : "Choose Repo", systemImage: "externaldrive.badge.plus")
                    }
                    .disabled(model.isBusy)
                }
            }
        }
        .navigationSplitViewStyle(.balanced)
    }

    @ViewBuilder
    private var detailView: some View {
        if !model.hasLinkedRepo && model.dashboard == nil {
            ContentUnavailableView(
                "Repo Link Unavailable",
                systemImage: "externaldrive.badge.exclamationmark",
                description: Text(
                    model.errorMessage
                    ?? "The native learner app could not resolve the local `cah-qbank` repo. Choose the repo root explicitly or retry after the repo is available on this Mac."
                )
            )
        } else {
            switch model.selection ?? .dashboard {
            case .dashboard:
                DashboardView(model: model)
            case .browse:
                BrowseView(model: model)
            case .practice:
                PracticeView(model: model)
            case .progress:
                ProgressView(model: model)
            }
        }
    }

    private var statusSymbol: String {
        if model.errorMessage != nil {
            return "exclamationmark.triangle.fill"
        }
        if model.isBusy {
            return "arrow.triangle.2.circlepath.circle.fill"
        }
        return "checkmark.circle.fill"
    }

    private var statusColor: Color {
        if model.errorMessage != nil {
            return .red
        }
        return .secondary
    }

    private func openRepoInFinder() {
        guard !model.repoRootPath.isEmpty else { return }
        NSWorkspace.shared.selectFile(nil, inFileViewerRootedAtPath: model.repoRootPath)
    }

    private func copyRepoPath() {
        guard !model.repoRootPath.isEmpty else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(model.repoRootPath, forType: .string)
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

    private func errorBanner(_ message: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.red)
            Text(message)
                .font(.caption)
                .lineLimit(2)
            Spacer()
            Button("Dismiss") {
                model.clearError()
            }
            .buttonStyle(.link)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.thinMaterial)
    }
}
