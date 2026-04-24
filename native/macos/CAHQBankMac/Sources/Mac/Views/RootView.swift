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
                        Label("Local Library", systemImage: statusSymbol)
                            .font(.headline)
                        Text(model.infoMessage)
                            .font(.caption)
                            .foregroundStyle(statusColor)
                            .lineLimit(4)
                        Text(model.libraryStatusDetail)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(3)
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
                        Text(model.isSyncing ? "Refreshing local question library…" : "Loading local question library…")
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
                        Label("Refresh Library", systemImage: "arrow.triangle.2.circlepath")
                    }
                    .keyboardShortcut("r", modifiers: [.command, .shift])
                    .disabled(model.isBusy)
                }
            }
        }
        .navigationSplitViewStyle(.balanced)
    }

    @ViewBuilder
    private var detailView: some View {
        if !model.hasLoadedLibrary && model.dashboard == nil {
            ContentUnavailableView(
                "Question Library Unavailable",
                systemImage: "externaldrive.badge.exclamationmark",
                description: Text(
                    model.errorMessage
                    ?? "The app could not load its bundled question library. Reinstall CAH QBank and try again."
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
