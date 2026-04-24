import SwiftUI

struct iOSRootView: View {
    @ObservedObject var model: AppViewModel

    var body: some View {
        TabView(selection: selection) {
            NavigationStack {
                iOSDashboardView(model: model)
            }
            .tabItem {
                Label("Dashboard", systemImage: "rectangle.grid.2x2")
            }
            .tag(AppViewModel.NavigationSection.dashboard)

            NavigationStack {
                iOSPlaceholderSection(
                    title: "Browse",
                    systemImage: "book",
                    message: "No question library is available on this device yet."
                )
            }
            .tabItem {
                Label("Browse", systemImage: "book")
            }
            .tag(AppViewModel.NavigationSection.browse)

            NavigationStack {
                iOSPlaceholderSection(
                    title: "Practice",
                    systemImage: "play.circle",
                    message: "Practice sessions will appear here once mobile content is available."
                )
            }
            .tabItem {
                Label("Practice", systemImage: "play.circle")
            }
            .tag(AppViewModel.NavigationSection.practice)

            NavigationStack {
                iOSPlaceholderSection(
                    title: "Progress",
                    systemImage: "chart.bar",
                    message: "Study progress will appear here after mobile practice sessions are recorded."
                )
            }
            .tabItem {
                Label("Progress", systemImage: "chart.bar")
            }
            .tag(AppViewModel.NavigationSection.progress)
        }
    }

    private var selection: Binding<AppViewModel.NavigationSection> {
        Binding(
            get: { model.selection ?? .dashboard },
            set: { model.selection = $0 }
        )
    }
}

private struct iOSDashboardView: View {
    @ObservedObject var model: AppViewModel

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Label("CAH QBank", systemImage: "checklist.checked")
                        .font(.title2.bold())
                    Text("iPhone")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text("Your mobile question library is not linked yet.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 8)
            }

            Section("Content") {
                metricRow("Published questions", value: model.dashboard?.publishedCount ?? 0)
                metricRow("Practice-ready", value: model.dashboard?.answerableCount ?? 0)
                metricRow("Flagged", value: model.dashboard?.flaggedCount ?? 0)
                metricRow("Notes", value: model.dashboard?.noteCount ?? 0)
            }

            Section("Status") {
                Text(model.infoMessage)
                if let errorMessage = model.errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(.orange)
                }
            }
        }
        .navigationTitle("Dashboard")
        .refreshable {
            await model.syncNow()
        }
    }

    private func metricRow(_ title: String, value: Int) -> some View {
        HStack {
            Text(title)
            Spacer()
            Text("\(value)")
                .fontWeight(.semibold)
                .foregroundStyle(.secondary)
        }
    }
}

private struct iOSPlaceholderSection: View {
    let title: String
    let systemImage: String
    let message: String

    var body: some View {
        ContentUnavailableView(
            title,
            systemImage: systemImage,
            description: Text(message)
        )
        .navigationTitle(title)
    }
}
