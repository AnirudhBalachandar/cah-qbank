import SwiftUI

struct ProgressView: View {
    @ObservedObject var model: AppViewModel

    private let metricColumns = [
        GridItem(.adaptive(minimum: 170), spacing: 12, alignment: .top),
    ]

    private var attemptedRows: [ProgressRow] {
        model.progressRows.filter { $0.attemptCount > 0 }
    }

    private var weakestRows: [ProgressRow] {
        attemptedRows.sorted { accuracy($0) < accuracy($1) }.prefix(8).map { $0 }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                metrics

                GeometryReader { proxy in
                    progressPanels(width: proxy.size.width)
                }
                .frame(maxWidth: .infinity, minHeight: 420)
            }
            .padding(24)
        }
        .background(Color(nsColor: .controlBackgroundColor))
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("Progress")
                    .font(.largeTitle.bold())
                Text("Track mastery, spot weak topics, and launch focused recovery practice.")
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Picker("Range", selection: .constant("Last 30 days")) {
                Text("Last 30 days").tag("Last 30 days")
                Text("All time").tag("All time")
            }
            .frame(width: 180)
        }
    }

    private var metrics: some View {
        LazyVGrid(columns: metricColumns, spacing: 12) {
            NativeMetricCard(title: "Accuracy", value: percent(model.dashboard?.accuracyPercent ?? 0), detail: "All recorded attempts")
            NativeMetricCard(title: "Questions", value: "\(model.dashboard?.answerableCount ?? 0)", detail: "Practice-ready")
            NativeMetricCard(title: "Streak", value: "\(model.dashboard?.currentStreak ?? 0)", detail: "Current correct streak")
            NativeMetricCard(title: "Flagged", value: "\(model.dashboard?.flaggedCount ?? 0)", detail: "Marked for review")
        }
    }

    @ViewBuilder
    private func progressPanels(width: CGFloat) -> some View {
        if width >= 860 {
            HStack(alignment: .top, spacing: 16) {
                performancePanel
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                reviewPanel
                    .frame(width: min(max(width * 0.3, 280), 360))
                    .frame(maxHeight: .infinity)
            }
        } else {
            VStack(alignment: .leading, spacing: 16) {
                performancePanel
                    .frame(minHeight: 360)
                reviewPanel
                    .frame(minHeight: 260)
            }
        }
    }

    private var performancePanel: some View {
        VStack(alignment: .leading, spacing: 14) {
            GroupBox {
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        Text("Category performance")
                            .font(.headline)
                        Spacer()
                        Text("\(model.progressRows.count) topics")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    ScrollView {
                        if model.progressRows.isEmpty {
                            ContentUnavailableView("No Progress Yet", systemImage: "chart.line.downtrend.xyaxis", description: Text("Answer a few practice questions to start building mastery history."))
                        } else {
                            LazyVStack(alignment: .leading, spacing: 10) {
                                ForEach(model.progressRows.prefix(40)) { row in
                                    NativeProgressRow(row: row)
                                }
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                .padding(4)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var reviewPanel: some View {
        VStack(alignment: .leading, spacing: 14) {
            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Review next")
                        .font(.headline)
                    if weakestRows.isEmpty {
                        Text("Practice attempts will populate weak-topic recommendations.")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    } else {
                        ScrollView {
                            VStack(alignment: .leading, spacing: 10) {
                                ForEach(weakestRows) { row in
                                    Button {
                                        model.selectSinglePracticeTag(row.slug)
                                        model.selectSection(.practice)
                                    } label: {
                                        HStack {
                                            Text("\(accuracy(row))%")
                                                .font(.caption.bold())
                                                .foregroundStyle(.red)
                                                .padding(.horizontal, 8)
                                                .padding(.vertical, 5)
                                                .background(.red.opacity(0.1), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                                            Text(row.name)
                                                .font(.callout.weight(.semibold))
                                                .lineLimit(1)
                                            Spacer()
                                            Text("Practice")
                                                .font(.caption.weight(.semibold))
                                                .foregroundStyle(.blue)
                                        }
                                        .padding(10)
                                        .background(Color(nsColor: .textBackgroundColor), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                }
                .padding(4)
            }
        }
    }

    private func accuracy(_ row: ProgressRow) -> Int {
        guard row.attemptCount > 0 else { return 0 }
        return Int((Double(row.correctCount) / Double(row.attemptCount) * 100).rounded())
    }

    private func percent(_ value: Double) -> String {
        if value.rounded() == value {
            return "\(Int(value))%"
        }
        return String(format: "%.1f%%", value)
    }
}

private struct NativeMetricCard: View {
    let title: String
    let value: String
    let detail: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.title2.bold())
            Text(detail)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

private struct NativeProgressRow: View {
    let row: ProgressRow

    private var rowAccuracy: Int {
        guard row.attemptCount > 0 else { return 0 }
        return Int((Double(row.correctCount) / Double(row.attemptCount) * 100).rounded())
    }

    private var progress: Double {
        if row.attemptCount > 0 {
            return Double(rowAccuracy) / 100
        }
        return min(max((row.elo - 800) / 600, 0.06), 1)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.name)
                        .font(.callout.weight(.semibold))
                    Text("\(row.kind.rawValue.capitalized) · \(row.questionCount) questions · \(row.attemptCount) attempts")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text(row.attemptCount == 0 ? "New" : "\(rowAccuracy)%")
                    .font(.headline)
                    .foregroundStyle(rowAccuracy >= 70 ? .green : rowAccuracy <= 40 && row.attemptCount > 0 ? .red : .orange)
            }
            SwiftUI.ProgressView(value: progress)
                .tint(rowAccuracy <= 40 && row.attemptCount > 0 ? .red : .green)
        }
        .padding(12)
        .background(Color(nsColor: .textBackgroundColor), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}
