import Charts
import SwiftUI

struct DashboardView: View {
    @ObservedObject var model: AppViewModel

    private let metricColumns = [
        GridItem(.adaptive(minimum: 220), spacing: 16, alignment: .top),
    ]

    private let panelColumns = [
        GridItem(.adaptive(minimum: 360), spacing: 16, alignment: .top),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                heroSection

                if let dashboard = model.dashboard {
                    LazyVGrid(columns: metricColumns, spacing: 16) {
                        DashboardMetricCard(
                            label: "Published questions",
                            value: "\(dashboard.publishedCount)",
                            subtitle: "All published records currently available in the local bank.",
                            symbol: "doc.text",
                            tint: DashboardPalette.accent
                        )
                        DashboardMetricCard(
                            label: "Practice-ready",
                            value: "\(dashboard.answerableCount)",
                            subtitle: "Published questions with a single machine-checkable answer.",
                            symbol: "checklist.checked",
                            tint: DashboardPalette.teal,
                            progress: dashboard.publishedCount == 0
                                ? 0
                                : Double(dashboard.answerableCount) / Double(dashboard.publishedCount)
                        )
                        DashboardMetricCard(
                            label: "Flagged",
                            value: "\(dashboard.flaggedCount)",
                            subtitle: "Questions marked for follow-up during review or practice.",
                            symbol: "flag.fill",
                            tint: DashboardPalette.warning
                        )
                        DashboardMetricCard(
                            label: "Notes",
                            value: "\(dashboard.noteCount)",
                            subtitle: "Private note records stored in the learner database.",
                            symbol: "square.and.pencil",
                            tint: DashboardPalette.copy
                        )
                        DashboardMetricCard(
                            label: "Accuracy",
                            value: formatPercent(dashboard.accuracyPercent),
                            subtitle: "Correct answers across all recorded attempts.",
                            symbol: "target",
                            tint: DashboardPalette.success,
                            progress: dashboard.accuracyPercent / 100
                        )
                        DashboardMetricCard(
                            label: "Time spent",
                            value: formatDuration(milliseconds: dashboard.totalTimeSpentMs),
                            subtitle: "Uses tracked attempt time when available, otherwise completed session duration.",
                            symbol: "timer",
                            tint: DashboardPalette.copy
                        )
                        DashboardMetricCard(
                            label: "Current streak",
                            value: "\(dashboard.currentStreak)",
                            subtitle: "Consecutive correct answers from the most recent attempt backward.",
                            symbol: "bolt.fill",
                            tint: DashboardPalette.accent
                        )
                        DashboardMetricCard(
                            label: "Modules completed",
                            value: "\(dashboard.modulesCompleted)",
                            subtitle: "\(dashboard.modulesCompleted) curricula meet the mastery rule of 80% accuracy and Elo 1100.",
                            symbol: "checkmark.seal.fill",
                            tint: DashboardPalette.teal,
                            progress: dashboard.topicDistribution.isEmpty
                                ? 0
                                : Double(dashboard.modulesCompleted) / Double(dashboard.topicDistribution.count)
                        )
                    }

                    LazyVGrid(columns: panelColumns, spacing: 16) {
                        PerformanceTrendPanel(data: dashboard.trendData)
                        CurriculumDistributionPanel(data: dashboard.topicDistribution)
                        ActivityHeatmapPanel(data: dashboard.heatmapData)
                        SessionPerformancePanel(data: dashboard.sessionsBarData)
                    }

                    LazyVGrid(columns: panelColumns, spacing: 16) {
                        WeaknessPanel(data: dashboard.weakTags)
                        RecentSessionsPanel(
                            sessions: dashboard.recentSessions,
                            onResume: { sessionID in
                                Task {
                                    await model.reopenSession(id: sessionID)
                                }
                            }
                        )
                    }
                } else {
                    DashboardSurface(
                        title: "Dashboard unavailable",
                        subtitle: "The native learner app could not load analytics from the local question library."
                    ) {
                        ContentUnavailableView(
                            "Analytics offline",
                            systemImage: "chart.line.downtrend.xyaxis",
                            description: Text("Refresh the local question library to populate the learner dashboard.")
                        )
                        .frame(maxWidth: .infinity, minHeight: 280)
                    }
                }
            }
            .padding(24)
        }
        .background(DashboardPalette.windowBackground.ignoresSafeArea())
    }

    private var heroSection: some View {
        DashboardHeroCard(
            infoMessage: model.infoMessage,
            libraryStatusDetail: model.libraryStatusDetail,
            hasLoadedLibrary: model.hasLoadedLibrary,
            dashboard: model.dashboard,
            onBrowse: {
                model.selectSection(.browse)
            },
            onPractice: {
                model.selectSection(.practice)
            },
            onRefresh: {
                Task {
                    await model.syncNow()
                }
            }
        )
    }
}

private struct DashboardHeroCard: View {
    let infoMessage: String
    let libraryStatusDetail: String
    let hasLoadedLibrary: Bool
    let dashboard: DashboardSnapshot?
    let onBrowse: () -> Void
    let onPractice: () -> Void
    let onRefresh: () -> Void

    var body: some View {
        ZStack(alignment: .topTrailing) {
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            DashboardPalette.surface,
                            DashboardPalette.surfaceEmphasis,
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 26, style: .continuous)
                        .stroke(DashboardPalette.border.opacity(0.7), lineWidth: 1)
                )

            Circle()
                .fill(DashboardPalette.accent.opacity(0.18))
                .frame(width: 240, height: 240)
                .blur(radius: 20)
                .offset(x: 80, y: -60)

            VStack(alignment: .leading, spacing: 18) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(spacing: 10) {
                            DashboardChip(
                                title: hasLoadedLibrary ? "Local library ready" : "Library loading",
                                symbol: hasLoadedLibrary ? "checkmark.circle.fill" : "arrow.triangle.2.circlepath.circle.fill",
                                tint: hasLoadedLibrary ? DashboardPalette.success : DashboardPalette.accent
                            )
                            DashboardChip(
                                title: "Offline study workspace",
                                symbol: "sparkline",
                                tint: DashboardPalette.accent
                            )
                        }

                        Text("CAH QBank analytics")
                            .font(.system(size: 34, weight: .bold, design: .rounded))
                            .foregroundStyle(DashboardPalette.copy)

                        Text("A dense learner dashboard for volume, performance, recovery areas, and recent session behaviour inside the local macOS app.")
                            .font(.title3)
                            .foregroundStyle(DashboardPalette.copyMuted)
                            .fixedSize(horizontal: false, vertical: true)

                        Text(libraryStatusDetail)
                            .font(.callout.weight(.semibold))
                            .foregroundStyle(DashboardPalette.copy.opacity(0.92))

                        Text(infoMessage)
                            .font(.callout)
                            .foregroundStyle(DashboardPalette.copy.opacity(0.88))
                    }

                    Spacer(minLength: 24)

                    VStack(alignment: .trailing, spacing: 10) {
                        DashboardSummaryPill(
                            title: "Accuracy",
                            value: formatPercent(dashboard?.accuracyPercent ?? 0),
                            tint: DashboardPalette.success
                        )
                        DashboardSummaryPill(
                            title: "Streak",
                            value: "\(dashboard?.currentStreak ?? 0)",
                            tint: DashboardPalette.accent
                        )
                        DashboardSummaryPill(
                            title: "Completed",
                            value: "\(dashboard?.modulesCompleted ?? 0)",
                            tint: DashboardPalette.teal
                        )
                    }
                }

                HStack(spacing: 12) {
                    Button("Browse Questions", action: onBrowse)
                        .buttonStyle(DashboardPrimaryButtonStyle())

                    Button("Start Practice", action: onPractice)
                        .buttonStyle(DashboardSecondaryButtonStyle())

                    Button("Refresh Library", action: onRefresh)
                        .buttonStyle(DashboardGhostButtonStyle())
                }
            }
            .padding(24)
        }
        .frame(maxWidth: .infinity)
    }
}

private struct DashboardMetricCard: View {
    let label: String
    let value: String
    let subtitle: String
    let symbol: String
    let tint: Color
    var progress: Double? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(label.uppercased())
                        .font(.caption.weight(.semibold))
                        .tracking(0.8)
                        .foregroundStyle(DashboardPalette.copyMuted)

                    Text(value)
                        .font(.system(size: 34, weight: .bold, design: .rounded))
                        .foregroundStyle(DashboardPalette.copy)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                }

                Spacer()

                ZStack {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(tint.opacity(0.16))
                    Image(systemName: symbol)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(tint)
                }
                .frame(width: 46, height: 46)
            }

            Text(subtitle)
                .font(.subheadline)
                .foregroundStyle(DashboardPalette.copyMuted)
                .fixedSize(horizontal: false, vertical: true)

            if let progress {
                DashboardProgressStrip(progress: progress, tint: tint)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(DashboardPalette.surface)
                .overlay(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .stroke(DashboardPalette.border, lineWidth: 1)
                )
        )
    }
}

private struct DashboardProgressStrip: View {
    let progress: Double
    let tint: Color

    var body: some View {
        let clampedProgress = min(max(progress, 0), 1)
        let activeSegments = Int((clampedProgress * 10).rounded(.awayFromZero))

        return HStack(spacing: 5) {
            ForEach(0..<10, id: \.self) { index in
                Capsule()
                    .fill(index < activeSegments ? tint : DashboardPalette.surfaceRaised)
                    .frame(maxWidth: .infinity)
                    .frame(height: 6)
            }
        }
    }
}

private struct PerformanceTrendPanel: View {
    let data: [DashboardTrendPoint]

    private var populatedData: [DashboardTrendPoint] {
        data.filter { $0.score != nil }
    }

    var body: some View {
        DashboardSurface(
            title: "30-day performance trend",
            subtitle: "Daily accuracy points with gaps preserved when there was no activity."
        ) {
            if populatedData.isEmpty {
                DashboardEmptyState(
                    title: "No answer history yet",
                    message: "Start a practice session to populate the rolling performance line."
                )
            } else {
                Chart {
                    RuleMark(y: .value("Target", 80))
                        .foregroundStyle(DashboardPalette.warning.opacity(0.45))
                        .lineStyle(StrokeStyle(lineWidth: 1, dash: [5, 5]))

                    ForEach(populatedData) { point in
                        if let score = point.score {
                            AreaMark(
                                x: .value("Date", point.date),
                                y: .value("Score", score)
                            )
                            .foregroundStyle(
                                LinearGradient(
                                    colors: [
                                        DashboardPalette.accent.opacity(0.28),
                                        DashboardPalette.accent.opacity(0.02),
                                    ],
                                    startPoint: .top,
                                    endPoint: .bottom
                                )
                            )

                            LineMark(
                                x: .value("Date", point.date),
                                y: .value("Score", score)
                            )
                            .lineStyle(StrokeStyle(lineWidth: 2.5, lineCap: .round))
                            .foregroundStyle(DashboardPalette.accent)

                            PointMark(
                                x: .value("Date", point.date),
                                y: .value("Score", score)
                            )
                            .foregroundStyle(DashboardPalette.copy)
                            .symbolSize(28)
                        }
                    }
                }
                .chartYScale(domain: 0...100)
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: 5)) { value in
                        AxisGridLine(stroke: StrokeStyle(lineWidth: 0.6, dash: [2, 4]))
                            .foregroundStyle(DashboardPalette.grid)
                        AxisTick(stroke: StrokeStyle(lineWidth: 0.6))
                            .foregroundStyle(DashboardPalette.grid)
                        AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                            .foregroundStyle(DashboardPalette.copyMuted)
                    }
                }
                .chartYAxis {
                    AxisMarks(position: .leading) { value in
                        AxisGridLine(stroke: StrokeStyle(lineWidth: 0.6, dash: [2, 4]))
                            .foregroundStyle(DashboardPalette.grid)
                        AxisValueLabel {
                            if let score = value.as(Double.self) {
                                Text("\(score, specifier: "%.0f")%")
                                    .foregroundStyle(DashboardPalette.copyMuted)
                            }
                        }
                    }
                }
                .chartPlotStyle { plotArea in
                    plotArea
                        .background(DashboardPalette.plotBackground)
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                }
                .frame(minHeight: 250)
            }
        }
    }
}

private struct CurriculumDistributionPanel: View {
    let data: [DashboardTopicDistributionPoint]

    private let palette = DashboardPalette.chartPalette

    var body: some View {
        DashboardSurface(
            title: "Curriculum distribution",
            subtitle: "Published answerable content split by curriculum because the local library has no separate topic taxonomy."
        ) {
            if data.isEmpty {
                DashboardEmptyState(
                    title: "No answerable questions",
                    message: "Refresh the local library to render curriculum coverage."
                )
            } else {
                HStack(alignment: .center, spacing: 20) {
                    ZStack {
                        Chart(Array(data.enumerated()), id: \.element.id) { entry in
                            let index = entry.offset
                            let point = entry.element
                            SectorMark(
                                angle: .value("Questions", point.count),
                                innerRadius: .ratio(0.62),
                                angularInset: 2
                            )
                            .cornerRadius(8)
                            .foregroundStyle(palette[index % palette.count])
                        }
                        .chartLegend(.hidden)
                        .frame(width: 220, height: 220)

                        VStack(spacing: 6) {
                            Text("\(data.reduce(0) { $0 + $1.count })")
                                .font(.system(size: 30, weight: .bold, design: .rounded))
                                .foregroundStyle(DashboardPalette.copy)
                            Text("answerable")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(DashboardPalette.copyMuted)
                        }
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(Array(data.enumerated()), id: \.element.id) { entry in
                            let index = entry.offset
                            let point = entry.element
                            HStack(alignment: .center, spacing: 10) {
                                Circle()
                                    .fill(palette[index % palette.count])
                                    .frame(width: 10, height: 10)

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(point.topic)
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(DashboardPalette.copy)
                                    Text("\(point.count) questions")
                                        .font(.caption)
                                        .foregroundStyle(DashboardPalette.copyMuted)
                                }

                                Spacer()

                                Text(formatPercent(point.percentage))
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(DashboardPalette.copy.opacity(0.9))
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}

private struct ActivityHeatmapPanel: View {
    let data: [DashboardHeatmapPoint]

    private var weeks: [[DashboardHeatmapPoint]] {
        stride(from: 0, to: data.count, by: 7).map { index in
            Array(data[index..<min(index + 7, data.count)])
        }
    }

    private var activeDays: Int {
        data.filter { $0.value > 0 }.count
    }

    private var maxValue: Int {
        max(data.map(\.value).max() ?? 0, 1)
    }

    var body: some View {
        DashboardSurface(
            title: "Activity heatmap",
            subtitle: "\(activeDays) active days in the last eight weeks."
        ) {
            if data.allSatisfy({ $0.value == 0 }) {
                DashboardEmptyState(
                    title: "No activity recorded",
                    message: "The heatmap will start filling as soon as attempts are saved."
                )
            } else {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 9) {
                        ForEach(Array(["Mon", "", "Wed", "", "Fri", "", "Sun"].enumerated()), id: \.offset) { entry in
                            let label = entry.element
                            Text(label)
                                .font(.caption2)
                                .foregroundStyle(DashboardPalette.copyMuted)
                                .frame(height: 16, alignment: .leading)
                        }
                    }

                    HStack(alignment: .top, spacing: 6) {
                        ForEach(Array(weeks.enumerated()), id: \.offset) { entry in
                            let week = entry.element
                            VStack(spacing: 6) {
                                ForEach(week) { point in
                                    RoundedRectangle(cornerRadius: 5, style: .continuous)
                                        .fill(heatmapColor(for: point.value, maxValue: maxValue))
                                        .frame(width: 18, height: 18)
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 5, style: .continuous)
                                                .stroke(DashboardPalette.border.opacity(0.5), lineWidth: 0.6)
                                        )
                                        .help("\(point.date.formatted(date: .abbreviated, time: .omitted)): \(point.value) attempt\(point.value == 1 ? "" : "s")")
                                }
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private func heatmapColor(for value: Int, maxValue: Int) -> Color {
        guard value > 0 else { return DashboardPalette.surfaceRaised }
        let intensity = Double(value) / Double(maxValue)
        return DashboardPalette.accent.opacity(0.18 + (intensity * 0.78))
    }
}

private struct SessionPerformancePanel: View {
    let data: [DashboardSessionBarPoint]

    var body: some View {
        DashboardSurface(
            title: "Recent session performance",
            subtitle: "Each bar reflects the scored share of answered questions in that session."
        ) {
            if data.isEmpty {
                DashboardEmptyState(
                    title: "No recent sessions",
                    message: "Launch a practice run to see comparative session bars."
                )
            } else {
                Chart(data) { point in
                    BarMark(
                        x: .value("Score", point.score),
                        y: .value("Session", point.label)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .foregroundStyle(color(for: point.score))
                    .annotation(position: .trailing, alignment: .trailing) {
                        Text(formatPercent(point.score))
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(DashboardPalette.copy)
                    }
                }
                .chartXScale(domain: 0...100)
                .chartXAxis {
                    AxisMarks(values: [0, 25, 50, 75, 100]) { value in
                        AxisGridLine(stroke: StrokeStyle(lineWidth: 0.6, dash: [2, 4]))
                            .foregroundStyle(DashboardPalette.grid)
                        AxisValueLabel {
                            if let score = value.as(Double.self) {
                                Text("\(score, specifier: "%.0f")%")
                                    .foregroundStyle(DashboardPalette.copyMuted)
                            }
                        }
                    }
                }
                .chartYAxis {
                    AxisMarks(position: .leading) { _ in
                        AxisValueLabel()
                            .foregroundStyle(DashboardPalette.copyMuted)
                    }
                }
                .chartPlotStyle { plotArea in
                    plotArea
                        .background(DashboardPalette.plotBackground)
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                }
                .frame(minHeight: 250)
            }
        }
    }

    private func color(for score: Double) -> Color {
        switch score {
        case 80...:
            return DashboardPalette.success
        case 60..<80:
            return DashboardPalette.warning
        default:
            return DashboardPalette.error
        }
    }
}

private struct WeaknessPanel: View {
    let data: [WeakTagSnapshot]

    var body: some View {
        DashboardSurface(
            title: "Weakest areas",
            subtitle: "Lowest Elo curriculum or topic tags with recorded practice history."
        ) {
            if data.isEmpty {
                DashboardEmptyState(
                    title: "No weak-tag signal yet",
                    message: "Tag mastery appears after answer history accumulates."
                )
            } else {
                VStack(spacing: 12) {
                    ForEach(data) { tag in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(alignment: .firstTextBaseline) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(tag.name)
                                        .font(.headline)
                                        .foregroundStyle(DashboardPalette.copy)
                                    Text("\(tag.attempts) attempts")
                                        .font(.caption)
                                        .foregroundStyle(DashboardPalette.copyMuted)
                                }

                                Spacer()

                                Text("Elo \(tag.elo, specifier: "%.0f")")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(tag.elo < 950 ? DashboardPalette.error : DashboardPalette.warning)
                            }

                            GeometryReader { proxy in
                                let intensity = min(max((1100 - tag.elo) / 300, 0), 1)
                                ZStack(alignment: .leading) {
                                    Capsule()
                                        .fill(DashboardPalette.surfaceRaised)
                                    Capsule()
                                        .fill(tag.elo < 950 ? DashboardPalette.error : DashboardPalette.warning)
                                        .frame(width: max(proxy.size.width * intensity, 10))
                                }
                            }
                            .frame(height: 8)
                        }
                        .padding(14)
                        .background(
                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                .fill(DashboardPalette.surfaceRaised.opacity(0.72))
                        )
                    }
                }
            }
        }
    }
}

private struct RecentSessionsPanel: View {
    let sessions: [RecentSessionSummary]
    let onResume: (String) -> Void

    var body: some View {
        DashboardSurface(
            title: "Session feed",
            subtitle: "Resume recent work directly from the analytics view."
        ) {
            if sessions.isEmpty {
                DashboardEmptyState(
                    title: "No saved sessions",
                    message: "Recent sessions will appear here once you start practicing."
                )
            } else {
                VStack(spacing: 12) {
                    ForEach(sessions) { session in
                        Button {
                            onResume(session.id)
                        } label: {
                            HStack(spacing: 14) {
                                ZStack {
                                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                                        .fill(statusTint(for: session).opacity(0.16))
                                    Image(systemName: session.completedAt == nil ? "play.fill" : "checkmark")
                                        .foregroundStyle(statusTint(for: session))
                                }
                                .frame(width: 42, height: 42)

                                VStack(alignment: .leading, spacing: 4) {
                                    Text(session.mode.rawValue.capitalized)
                                        .font(.headline)
                                        .foregroundStyle(DashboardPalette.copy)
                                    Text(session.createdAt.formatted(date: .abbreviated, time: .shortened))
                                        .font(.caption)
                                        .foregroundStyle(DashboardPalette.copyMuted)
                                }

                                Spacer()

                                VStack(alignment: .trailing, spacing: 4) {
                                    Text(session.answered == 0 ? "0%" : formatPercent(Double(session.correct) / Double(session.answered) * 100))
                                        .font(.headline)
                                        .foregroundStyle(DashboardPalette.copy)
                                    Text(session.completedAt == nil ? "In progress" : "Completed")
                                        .font(.caption)
                                        .foregroundStyle(DashboardPalette.copyMuted)
                                }
                            }
                            .padding(14)
                            .background(
                                RoundedRectangle(cornerRadius: 18, style: .continuous)
                                    .fill(DashboardPalette.surfaceRaised.opacity(0.72))
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func statusTint(for session: RecentSessionSummary) -> Color {
        if session.completedAt == nil {
            return DashboardPalette.accent
        }
        if session.answered == 0 {
            return DashboardPalette.copyMuted
        }
        let score = Double(session.correct) / Double(session.answered) * 100
        switch score {
        case 80...:
            return DashboardPalette.success
        case 60..<80:
            return DashboardPalette.warning
        default:
            return DashboardPalette.error
        }
    }
}

private struct DashboardSurface<Content: View>: View {
    let title: String
    let subtitle: String
    let content: Content

    init(title: String, subtitle: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.subtitle = subtitle
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(DashboardPalette.copy)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(DashboardPalette.copyMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }

            content
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(DashboardPalette.surface)
                .overlay(
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .stroke(DashboardPalette.border, lineWidth: 1)
                )
        )
    }
}

private struct DashboardEmptyState: View {
    let title: String
    let message: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: "sparkles.rectangle.stack")
                .font(.system(size: 26, weight: .semibold))
                .foregroundStyle(DashboardPalette.accent)
            Text(title)
                .font(.headline)
                .foregroundStyle(DashboardPalette.copy)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(DashboardPalette.copyMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, minHeight: 220, alignment: .center)
    }
}

private struct DashboardChip: View {
    let title: String
    let symbol: String
    let tint: Color

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: symbol)
            Text(title)
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(tint)
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(
            Capsule()
                .fill(tint.opacity(0.12))
        )
    }
}

private struct DashboardSummaryPill: View {
    let title: String
    let value: String
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased())
                .font(.caption2.weight(.semibold))
                .tracking(0.8)
                .foregroundStyle(DashboardPalette.copyMuted)
            Text(value)
                .font(.title2.weight(.bold))
                .foregroundStyle(DashboardPalette.copy)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(tint.opacity(0.12))
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(tint.opacity(0.28), lineWidth: 1)
                )
        )
    }
}

private struct DashboardPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(DashboardPalette.accent.opacity(configuration.isPressed ? 0.8 : 1))
            )
    }
}

private struct DashboardSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(DashboardPalette.copy)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(DashboardPalette.teal.opacity(configuration.isPressed ? 0.22 : 0.14))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(DashboardPalette.teal.opacity(0.4), lineWidth: 1)
                    )
            )
    }
}

private struct DashboardGhostButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(DashboardPalette.copy)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(DashboardPalette.surfaceRaised.opacity(configuration.isPressed ? 0.9 : 0.6))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(DashboardPalette.border, lineWidth: 1)
                    )
            )
    }
}

private enum DashboardPalette {
    static let windowBackground = Color(nsColor: .controlBackgroundColor)
    static let surface = Color(nsColor: .textBackgroundColor)
    static let surfaceEmphasis = Color(nsColor: .windowBackgroundColor)
    static let surfaceRaised = Color(nsColor: .controlBackgroundColor)
    static let border = Color.primary.opacity(0.09)
    static let plotBackground = Color.primary.opacity(0.025)
    static let grid = Color.primary.opacity(0.1)
    static let accent = Color(red: 11.0 / 255.0, green: 99.0 / 255.0, blue: 229.0 / 255.0)
    static let teal = Color(red: 14.0 / 255.0, green: 116.0 / 255.0, blue: 144.0 / 255.0)
    static let copy = Color.primary
    static let copyMuted = Color.secondary
    static let success = Color(red: 22.0 / 255.0, green: 163.0 / 255.0, blue: 74.0 / 255.0)
    static let warning = Color(red: 217.0 / 255.0, green: 119.0 / 255.0, blue: 6.0 / 255.0)
    static let error = Color(red: 225.0 / 255.0, green: 29.0 / 255.0, blue: 72.0 / 255.0)
    static let chartPalette: [Color] = [
        accent,
        teal,
        Color(red: 139.0 / 255.0, green: 92.0 / 255.0, blue: 246.0 / 255.0),
        warning,
        success,
        Color(red: 96.0 / 255.0, green: 165.0 / 255.0, blue: 250.0 / 255.0),
    ]
}

private func formatPercent(_ value: Double) -> String {
    let rounded = (value * 10).rounded() / 10
    if rounded.rounded() == rounded {
        return "\(Int(rounded))%"
    }
    return String(format: "%.1f%%", rounded)
}

private func formatDuration(milliseconds: Int) -> String {
    guard milliseconds > 0 else { return "0m" }

    let totalMinutes = Int((Double(milliseconds) / 60_000).rounded())
    let hours = totalMinutes / 60
    let minutes = totalMinutes % 60

    if hours == 0 {
        return "\(minutes)m"
    }
    if minutes == 0 {
        return "\(hours)h"
    }
    return "\(hours)h \(minutes)m"
}
