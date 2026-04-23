import SwiftUI

struct DashboardView: View {
    @ObservedObject var model: AppViewModel

    private let columns = [
        GridItem(.flexible()),
        GridItem(.flexible()),
        GridItem(.flexible()),
        GridItem(.flexible()),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("CAH QBank")
                    .font(.largeTitle.bold())
                Text("Local-first paediatrics revision powered by repo-tracked JSON and the existing learner SQLite state.")
                    .foregroundStyle(.secondary)
                if !model.repoRootPath.isEmpty {
                    Text(model.repoRootPath)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }

                if let dashboard = model.dashboard {
                    LazyVGrid(columns: columns, spacing: 14) {
                        metricCard(title: "Published Questions", value: "\(dashboard.publishedCount)")
                        metricCard(title: "Practice-ready", value: "\(dashboard.answerableCount)")
                        metricCard(title: "Flagged", value: "\(dashboard.flaggedCount)")
                        metricCard(title: "Notes", value: "\(dashboard.noteCount)")
                    }

                    HStack(alignment: .top, spacing: 16) {
                        GroupBox("Recent Sessions") {
                            VStack(alignment: .leading, spacing: 12) {
                                if dashboard.recentSessions.isEmpty {
                                    Text("No sessions yet. Start a short run and the dashboard will begin tracking your progress.")
                                        .foregroundStyle(.secondary)
                                } else {
                                    ForEach(dashboard.recentSessions) { session in
                                        Button {
                                            Task {
                                                await model.reopenSession(id: session.id)
                                            }
                                        } label: {
                                            HStack {
                                                VStack(alignment: .leading, spacing: 2) {
                                                    Text(session.mode.rawValue.capitalized)
                                                        .fontWeight(.semibold)
                                                    Text(session.createdAt.formatted(date: .abbreviated, time: .shortened))
                                                        .font(.caption)
                                                        .foregroundStyle(.secondary)
                                                }
                                                Spacer()
                                                VStack(alignment: .trailing, spacing: 2) {
                                                    Text("\(session.correct)/\(session.answered)")
                                                        .fontWeight(.semibold)
                                                    Text(session.completedAt == nil ? "In Progress" : "Completed")
                                                        .font(.caption)
                                                        .foregroundStyle(.secondary)
                                                }
                                            }
                                            .padding(.vertical, 4)
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }

                        GroupBox("Weakest Tags") {
                            VStack(alignment: .leading, spacing: 12) {
                                if dashboard.weakTags.isEmpty {
                                    Text("Tag mastery appears once you begin answering questions.")
                                        .foregroundStyle(.secondary)
                                } else {
                                    ForEach(dashboard.weakTags) { tag in
                                        HStack {
                                            VStack(alignment: .leading, spacing: 2) {
                                                Text(tag.name)
                                                    .fontWeight(.medium)
                                                Text("\(tag.attempts) attempts")
                                                    .font(.caption)
                                                    .foregroundStyle(.secondary)
                                            }
                                            Spacer()
                                            Text(tag.elo.formatted(.number.precision(.fractionLength(1))))
                                                .fontWeight(.semibold)
                                        }
                                        .padding(.vertical, 4)
                                    }
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                } else {
                    ContentUnavailableView("Dashboard Unavailable", systemImage: "chart.bar.xaxis", description: Text("Link the local repo and run sync to populate learner metrics."))
                }
            }
            .padding(24)
        }
    }

    private func metricCard(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.system(size: 34, weight: .bold, design: .rounded))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}
