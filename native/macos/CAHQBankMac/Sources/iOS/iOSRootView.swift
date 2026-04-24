import SwiftUI

struct iOSRootView: View {
    @ObservedObject var model: AppViewModel
    @State private var selectedTab = AppViewModel.NavigationSection.dashboard

    var body: some View {
        VStack(spacing: 0) {
            Group {
                switch selectedTab {
                case .dashboard:
                    iOSTodayView(model: model)
                case .browse:
                    NavigationStack {
                        iOSBrowseView(model: model)
                    }
                case .practice:
                    iOSPracticeView(model: model)
                case .progress:
                    iOSProgressView(model: model)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .id(selectedTab)

            iOSBottomTabBar(selection: $selectedTab)
                .background(Color(.systemGroupedBackground))
        }
        .tint(.blue)
        .dynamicTypeSize(.xSmall ... .large)
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .overlay(alignment: .top) {
            if model.isSyncing {
                ProgressView()
                    .progressViewStyle(.linear)
            }
        }
        .onAppear {
            selectedTab = model.selection ?? .dashboard
        }
        .onChange(of: selectedTab) { _, newValue in
            if model.selection != newValue {
                model.selection = newValue
            }
        }
        .onChange(of: model.selection) { _, newValue in
            guard let newValue, selectedTab != newValue else { return }
            selectedTab = newValue
        }
    }
}

private struct iOSBottomTabBar: View {
    @Binding var selection: AppViewModel.NavigationSection

    var body: some View {
        HStack(spacing: 0) {
            tab(.dashboard, title: "Today", systemImage: "sparkles")
            tab(.browse, title: "Browse", systemImage: "book.pages")
            tab(.practice, title: "Practice", systemImage: "play.circle.fill")
            tab(.progress, title: "Progress", systemImage: "chart.line.uptrend.xyaxis")
        }
        .padding(.horizontal, 10)
        .padding(.top, 8)
        .padding(.bottom, 10)
        .background(Color(.secondarySystemGroupedBackground), in: Capsule())
        .overlay {
            Capsule()
                .stroke(Color.white.opacity(0.16), lineWidth: 1)
        }
        .padding(.horizontal, 18)
        .padding(.bottom, 8)
        .shadow(color: .black.opacity(0.16), radius: 18, y: 8)
    }

    private func tab(_ tab: AppViewModel.NavigationSection, title: String, systemImage: String) -> some View {
        Button {
            selection = tab
        } label: {
            VStack(spacing: 3) {
                Image(systemName: systemImage)
                    .font(.system(size: 18, weight: .semibold))
                Text(title)
                    .font(.caption2.weight(.semibold))
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 7)
            .foregroundStyle(selection == tab ? Color.blue : Color.secondary)
            .background(selection == tab ? Color.blue.opacity(0.14) : Color.clear, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
    }
}

private struct iOSTodayView: View {
    @ObservedObject var model: AppViewModel

    var body: some View {
        List {
            Section {
                HStack(alignment: .center) {
                    Text("Today")
                        .font(.title3.bold())
                    Spacer()
                    Button {
                        Task {
                            await model.syncNow()
                        }
                    } label: {
                        Label("Refresh", systemImage: "arrow.clockwise")
                            .labelStyle(.iconOnly)
                    }
                    .disabled(model.isBusy)
                    .buttonStyle(.borderless)
                }
                .padding(.vertical, 2)
            }

            if let dashboard = model.dashboard {
                Section {
                    Text("CAH QBank")
                        .font(.title2.bold())
                    Text(verbatim: "\(dashboard.answerableCount) practice-ready questions from \(dashboard.publishedCount) published questions")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("today-library-counts")
                    Button {
                        model.selectSection(.practice)
                    } label: {
                        Label("Start practice", systemImage: "play.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                } footer: {
                    Text("Offline library stored locally on this iPhone.")
                }

                Section("Study status") {
                    iOSMetricRow(title: "Published", value: "\(dashboard.publishedCount)", systemImage: "doc.text")
                    iOSMetricRow(title: "Practice-ready", value: "\(dashboard.answerableCount)", systemImage: "checkmark.seal")
                    iOSMetricRow(title: "Accuracy", value: iOSFormat.percent(dashboard.accuracyPercent), systemImage: "target")
                    iOSMetricRow(title: "Current streak", value: "\(dashboard.currentStreak)", systemImage: "bolt.fill")
                }

                iOSWeakTopicsSection(
                    title: "Weak topics",
                    weakTags: dashboard.weakTags,
                    onSelect: { tag in
                        model.practiceTagID = tag.slug
                        model.selectSection(.practice)
                    }
                )

                iOSRecentSessionsSection(
                    sessions: dashboard.recentSessions,
                    onResume: { sessionID in
                        Task {
                            await model.reopenSession(id: sessionID)
                        }
                    }
                )
            } else {
                Section {
                    ContentUnavailableView(
                        "Preparing Library",
                        systemImage: "tray.and.arrow.down",
                        description: Text("The bundled CAH QBank database is loading.")
                    )
                }
            }

            iOSStatusSection(model: model)
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .refreshable {
            await model.syncNow()
        }
    }
}

private struct iOSBrowseView: View {
    @ObservedObject var model: AppViewModel

    var body: some View {
        List {
            Section("Filters") {
                Picker("Curriculum", selection: $model.browseCurriculum) {
                    Text("All curricula").tag("")
                    ForEach(Curriculum.allCases, id: \.rawValue) { curriculum in
                        Text(curriculum.rawValue).tag(curriculum.rawValue)
                    }
                }

                Picker("Topic", selection: $model.browseTag) {
                    Text("All topics").tag("")
                    ForEach(Array(model.browseSnapshot.tagOptions.prefix(80))) { tag in
                        Text("\(tag.name) (\(tag.questionCount))").tag(tag.slug)
                    }
                }
            }

            if model.browseSnapshot.questions.isEmpty {
                Section {
                    ContentUnavailableView(
                        "No Matching Questions",
                        systemImage: "line.3.horizontal.decrease.circle",
                        description: Text("Adjust search, curriculum, or topic filters.")
                    )
                }
            } else {
                Section {
                    ForEach(model.browseSnapshot.questions) { question in
                        NavigationLink {
                            iOSQuestionDetailView(
                                model: model,
                                questionID: question.id,
                                fallbackQuestion: question
                            )
                        } label: {
                            iOSQuestionListRow(question: question)
                        }
                    }
                } header: {
                    HStack {
                        Text("\(model.browseSnapshot.total) questions")
                        Spacer()
                        Text("Page \(model.browseSnapshot.page) of \(model.browseSnapshot.pageCount)")
                    }
                }

                if model.browseSnapshot.pageCount > 1 {
                    Section {
                        iOSPager(
                            page: model.browseSnapshot.page,
                            pageCount: model.browseSnapshot.pageCount,
                            isBusy: model.isBusy,
                            previous: {
                                Task {
                                    await model.loadBrowse(page: max(1, model.browseSnapshot.page - 1))
                                }
                            },
                            next: {
                                Task {
                                    await model.loadBrowse(page: min(model.browseSnapshot.pageCount, model.browseSnapshot.page + 1))
                                }
                            }
                        )
                    }
                }
            }

            iOSStatusSection(model: model)
        }
        .navigationTitle("Browse")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $model.browseSearch, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search questions")
        .onSubmit(of: .search, loadFirstPage)
        .onChange(of: model.browseCurriculum) { _, _ in
            loadFirstPage()
        }
        .onChange(of: model.browseTag) { _, _ in
            loadFirstPage()
        }
        .refreshable {
            await model.loadBrowse()
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    clearFilters()
                } label: {
                    Label("Clear filters", systemImage: "xmark.circle")
                }
                .disabled(model.browseSearch.isEmpty && model.browseCurriculum.isEmpty && model.browseTag.isEmpty)
            }
        }
    }

    private func loadFirstPage() {
        Task {
            await model.loadBrowse(page: 1)
        }
    }

    private func clearFilters() {
        model.browseSearch = ""
        model.browseCurriculum = ""
        model.browseTag = ""
        loadFirstPage()
    }
}

private struct iOSQuestionDetailView: View {
    @ObservedObject var model: AppViewModel
    let questionID: String
    let fallbackQuestion: QBankQuestion

    @State private var noteDraft = ""
    @State private var noteWasEdited = false

    private var question: QBankQuestion {
        if let selectedQuestion = model.selectedQuestion, selectedQuestion.id == questionID {
            return selectedQuestion
        }
        if let browseQuestion = model.browseSnapshot.questions.first(where: { $0.id == questionID }) {
            return browseQuestion
        }
        return fallbackQuestion
    }

    var body: some View {
        List {
            Section("Question") {
                Text(question.stem)
                    .font(.body.weight(.medium))
                LabeledContent("Curriculum", value: question.curriculum.rawValue)
                if !question.tags.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Topics")
                            .font(.subheadline.weight(.semibold))
                        ForEach(question.tags.prefix(6)) { tag in
                            Text(tag.name)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }

            Section("Options") {
                ForEach(question.options, id: \.key) { option in
                    iOSOptionRow(option: option, isCorrectVisible: true)
                }
            }

            if let explanation = question.explanation, !explanation.isEmpty {
                Section("Explanation") {
                    Text(explanation)
                }
            }

            if !question.optionExplanations.isEmpty {
                Section("Option notes") {
                    ForEach(question.options, id: \.key) { option in
                        if let explanation = question.optionExplanations[option.key], !explanation.isEmpty {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(option.key)
                                    .font(.caption.bold())
                                    .foregroundStyle(.blue)
                                Text(explanation)
                                    .font(.callout)
                            }
                        }
                    }
                }
            }

            if !question.citations.isEmpty {
                Section("References") {
                    ForEach(Array(question.citations.enumerated()), id: \.offset) { index, citation in
                        VStack(alignment: .leading, spacing: 4) {
                            Text("\(index + 1). \(citation.title ?? citation.source ?? "Citation")")
                                .font(.callout.weight(.semibold))
                            if let source = citation.source, source != citation.title {
                                Text(source)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            if let page = citation.page {
                                Text("Page \(page)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }

            Section("Private note") {
                TextEditor(
                    text: Binding(
                        get: { noteDraft },
                        set: { newValue in
                            noteDraft = newValue
                            noteWasEdited = true
                        }
                    )
                )
                .frame(minHeight: 120)
                .textInputAutocapitalization(.sentences)

                Button {
                    Task {
                        await model.saveNote(questionID: question.id, note: noteDraft)
                        noteWasEdited = false
                    }
                } label: {
                    Label("Save note", systemImage: "checkmark.circle")
                }
                .disabled(model.isBusy || !noteWasEdited)
            }
        }
        .navigationTitle("Question")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task {
                        await model.toggleFlag(questionID: question.id)
                    }
                } label: {
                    Label(question.flagged ? "Unflag" : "Flag", systemImage: question.flagged ? "flag.fill" : "flag")
                }
                .disabled(model.isBusy)
            }
        }
        .task(id: questionID) {
            await model.selectQuestion(id: questionID)
            noteDraft = question.noteMarkdown
            noteWasEdited = false
        }
        .onChange(of: question.noteMarkdown) { _, newValue in
            if !noteWasEdited {
                noteDraft = newValue
            }
        }
    }
}

private struct iOSPracticeView: View {
    @ObservedObject var model: AppViewModel

    var body: some View {
        List {
            Section {
                Text("Practice")
                    .font(.title3.bold())
                    .padding(.vertical, 2)
            }

            if let session = model.activeSession {
                iOSPracticeSessionSection(model: model, session: session)
            }

            Section("Session setup") {
                Picker("Focus", selection: $model.practiceTagID) {
                    Text("All answerable questions").tag("")
                    ForEach(model.practiceTags) { tag in
                        Text("\(tag.name) (\(tag.questionCount))").tag(tag.slug)
                    }
                }

                Stepper(value: $model.practiceQuestionCount, in: 1...50) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(model.practiceQuestionCount) questions")
                        Text("Use short focused sessions on iPhone.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Button {
                    Task {
                        await model.startPractice()
                    }
                } label: {
                    Label(model.activeSession == nil ? "Start practice" : "Start new practice", systemImage: "play.circle.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("start-practice-session")
                .disabled(model.isBusy || model.practiceTags.isEmpty)
            }

            if model.activeSession == nil {
                Section {
                    ContentUnavailableView(
                        "No Active Session",
                        systemImage: "play.circle",
                        description: Text("Choose a focus and start practice. Attempts are stored locally on this iPhone.")
                    )
                }
            }

            iOSStatusSection(model: model)
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .refreshable {
            await model.syncNow()
        }
    }
}

private struct iOSPracticeSessionSection: View {
    @ObservedObject var model: AppViewModel
    let session: SessionSnapshot

    @State private var currentIndex = 0
    @State private var selectedKeys: [String: String] = [:]
    @State private var results: [String: AnswerResult] = [:]

    private var currentQuestion: QBankQuestion? {
        guard session.questions.indices.contains(currentIndex) else { return session.questions.first }
        return session.questions[currentIndex]
    }

    private var answeredCount: Int {
        session.answeredByQuestion.count
    }

    private var correctCount: Int {
        session.answeredByQuestion.values.filter(\.isCorrect).count
    }

    private var isComplete: Bool {
        session.completedAt != nil || answeredCount == session.questions.count
    }

    var body: some View {
        if let question = currentQuestion {
            Section {
                Text("Question \(currentIndex + 1)")
                    .font(.headline)
                Text(question.stem)
                    .font(.callout.weight(.medium))
                    .lineLimit(4)

                Button {
                    Task {
                        guard !currentSelectedKey(for: question).isEmpty else { return }
                        if let result = await model.submitAnswer(questionID: question.id, selectedKey: currentSelectedKey(for: question)) {
                            results[question.id] = result
                        }
                    }
                } label: {
                    Label("Submit", systemImage: "checkmark.circle")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("submit-answer")
                .disabled(currentSelectedKey(for: question).isEmpty || model.isBusy || session.answeredByQuestion[question.id] != nil)

                if let result = displayedResult(for: question) {
                    iOSResultSummary(result: result)
                }

                ForEach(question.options, id: \.key) { option in
                    iOSAnswerOptionButton(
                        option: option,
                        isSelected: currentSelectedKey(for: question) == option.key,
                        isCorrect: displayedResult(for: question) != nil && option.isCorrect == true,
                        isDisabled: session.answeredByQuestion[question.id] != nil
                    ) {
                        selectedKeys[question.id] = option.key
                    }
                }
            } footer: {
                Text("Question \(currentIndex + 1) of \(session.questions.count)")
            }
        }

        Section {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(isComplete ? "Session complete" : "Active session")
                        .font(.headline)
                    Text("\(answeredCount) of \(session.questions.count) answered · \(correctCount) correct")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button("Finish") {
                    Task {
                        await model.finishSession()
                    }
                }
                .disabled(isComplete)
            }

            ProgressView(value: session.questions.isEmpty ? 0 : Double(answeredCount) / Double(session.questions.count))
        }

        Section {
            HStack {
                Button {
                    currentIndex = iOSSessionNavigation.clampedIndex(currentIndex - 1, for: session)
                } label: {
                    Label("Previous", systemImage: "chevron.left")
                }
                .disabled(currentIndex <= 0)

                Spacer()

                Button {
                    currentIndex = iOSSessionNavigation.clampedIndex(currentIndex + 1, for: session)
                } label: {
                    Label("Next", systemImage: "chevron.right")
                }
                .disabled(!iOSSessionNavigation.isUnlocked(index: currentIndex + 1, in: session))
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Array(session.questions.enumerated()), id: \.element.id) { index, question in
                        let answered = session.answeredByQuestion[question.id]
                        let unlocked = iOSSessionNavigation.isUnlocked(index: index, in: session)
                        Button {
                            currentIndex = iOSSessionNavigation.clampedIndex(index, for: session)
                        } label: {
                            Text("\(index + 1)")
                                .font(.caption.weight(.semibold))
                                .frame(width: 34, height: 34)
                                .background(railBackground(isCurrent: index == currentIndex, answered: answered, unlocked: unlocked), in: Circle())
                                .foregroundStyle(railForeground(isCurrent: index == currentIndex, answered: answered, unlocked: unlocked))
                        }
                        .disabled(!unlocked)
                    }
                }
                .padding(.vertical, 4)
            }
        }
        .onAppear {
            syncState(with: session)
        }
        .onChange(of: session) { _, newSession in
            syncState(with: newSession)
        }
    }

    private func railBackground(isCurrent: Bool, answered: AttemptRecord?, unlocked: Bool) -> Color {
        if isCurrent { return .blue }
        if let answered { return answered.isCorrect ? .green.opacity(0.18) : .orange.opacity(0.2) }
        return unlocked ? Color(.tertiarySystemGroupedBackground) : Color(.systemGroupedBackground)
    }

    private func railForeground(isCurrent: Bool, answered: AttemptRecord?, unlocked: Bool) -> Color {
        if isCurrent { return .white }
        if let answered { return answered.isCorrect ? .green : .orange }
        return unlocked ? .primary : .secondary
    }

    private func currentSelectedKey(for question: QBankQuestion) -> String {
        selectedKeys[question.id] ?? session.answeredByQuestion[question.id]?.selectedKey ?? ""
    }

    private func displayedResult(for question: QBankQuestion) -> AnswerResult? {
        if let result = results[question.id] {
            return result
        }
        guard let attempt = session.answeredByQuestion[question.id] else { return nil }
        return AnswerResult(
            isCorrect: attempt.isCorrect,
            correctKey: question.correctKey,
            correctText: question.options.first(where: { $0.isCorrect == true })?.text,
            explanation: question.explanation,
            citations: question.citations,
            rationale: question.rationale,
            optionExplanations: question.optionExplanations,
            completedAt: session.completedAt != nil,
            nextIndex: session.currentIndex
        )
    }

    private func syncState(with nextSession: SessionSnapshot) {
        currentIndex = iOSSessionNavigation.clampedIndex(currentIndex, for: nextSession)
        let validIDs = Set(nextSession.questions.map(\.id))
        selectedKeys = selectedKeys.filter { validIDs.contains($0.key) }
        results = results.filter { validIDs.contains($0.key) }
    }
}

private struct iOSProgressView: View {
    @ObservedObject var model: AppViewModel

    var body: some View {
        List {
            Section {
                Text("Progress")
                    .font(.title3.bold())
                    .padding(.vertical, 2)
            }

            if let dashboard = model.dashboard {
                Section("Summary") {
                    iOSMetricRow(title: "Accuracy", value: iOSFormat.percent(dashboard.accuracyPercent), systemImage: "target")
                    iOSMetricRow(title: "Current streak", value: "\(dashboard.currentStreak)", systemImage: "bolt.fill")
                    iOSMetricRow(title: "Flagged", value: "\(dashboard.flaggedCount)", systemImage: "flag")
                    iOSMetricRow(title: "Notes", value: "\(dashboard.noteCount)", systemImage: "note.text")
                }

                iOSWeakTopicsSection(
                    title: "Recovery areas",
                    weakTags: dashboard.weakTags,
                    onSelect: { tag in
                        model.practiceTagID = tag.slug
                        model.selectSection(.practice)
                    }
                )

                iOSRecentSessionsSection(
                    sessions: dashboard.recentSessions,
                    onResume: { sessionID in
                        Task {
                            await model.reopenSession(id: sessionID)
                        }
                    }
                )
            }

            Section("Mastery") {
                if model.progressRows.isEmpty {
                    ContentUnavailableView(
                        "No Mastery Yet",
                        systemImage: "chart.bar",
                        description: Text("Complete practice questions to build progress.")
                    )
                } else {
                    ForEach(model.progressRows.prefix(40)) { row in
                        iOSMasteryRow(row: row)
                    }
                }
            }

            iOSStatusSection(model: model)
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .refreshable {
            await model.syncNow()
        }
    }
}

private enum iOSSessionNavigation {
    static func maxUnlockedIndex(for session: SessionSnapshot) -> Int {
        guard !session.questions.isEmpty else { return 0 }
        let lastIndex = session.questions.count - 1
        if session.completedAt != nil || session.answeredByQuestion.count >= session.questions.count {
            return lastIndex
        }
        return min(max(session.currentIndex, 0), lastIndex)
    }

    static func clampedIndex(_ proposedIndex: Int, for session: SessionSnapshot) -> Int {
        guard !session.questions.isEmpty else { return 0 }
        return min(max(proposedIndex, 0), maxUnlockedIndex(for: session))
    }

    static func isUnlocked(index: Int, in session: SessionSnapshot) -> Bool {
        guard session.questions.indices.contains(index) else { return false }
        return index <= maxUnlockedIndex(for: session)
    }
}

private struct iOSStatusSection: View {
    @ObservedObject var model: AppViewModel

    var body: some View {
        Section {
            if let errorMessage = model.errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange)
            } else {
                Label(statusMessage, systemImage: model.isBusy ? "arrow.triangle.2.circlepath" : "checkmark.circle.fill")
                    .foregroundStyle(model.isBusy ? .blue : .green)
            }
        } header: {
            Text("Library")
        }
    }

    private var statusMessage: String {
        if let dashboard = model.dashboard {
            return "Offline library ready with \(dashboard.answerableCount) practice-ready questions."
        }
        return "Preparing bundled library."
    }
}

private struct iOSMetricRow: View {
    let title: String
    let value: String
    let systemImage: String

    var body: some View {
        LabeledContent {
            Text(value)
                .fontWeight(.semibold)
        } label: {
            Label(title, systemImage: systemImage)
        }
    }
}

private struct iOSWeakTopicsSection: View {
    let title: String
    let weakTags: [WeakTagSnapshot]
    let onSelect: (WeakTagSnapshot) -> Void

    var body: some View {
        Section(title) {
            if weakTags.isEmpty {
                Text("No weak topics yet. Practice sessions will populate this view.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(weakTags.prefix(6)) { tag in
                    Button {
                        onSelect(tag)
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(tag.name)
                                    .foregroundStyle(.primary)
                                Text("\(tag.attempts) attempts")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text("\(Int(tag.elo.rounded())) ELO")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.orange)
                        }
                    }
                }
            }
        }
    }
}

private struct iOSRecentSessionsSection: View {
    let sessions: [RecentSessionSummary]
    let onResume: (String) -> Void

    var body: some View {
        Section("Recent sessions") {
            if sessions.isEmpty {
                Text("Completed and active sessions will appear here.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(sessions.prefix(6)) { session in
                    Button {
                        onResume(session.id)
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: session.completedAt == nil ? "pause.circle" : "checkmark.circle")
                                .foregroundStyle(session.completedAt == nil ? .orange : .green)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(session.mode.rawValue.capitalized)
                                    .foregroundStyle(.primary)
                                Text("\(session.answered) answered · \(session.correct) correct")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text(iOSFormat.shortDate(session.createdAt))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }
}

private struct iOSQuestionListRow: View {
    let question: QBankQuestion

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .firstTextBaseline) {
                Text(question.curriculum.rawValue)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.blue)
                    .lineLimit(1)
                Spacer()
                HStack(spacing: 8) {
                    if question.flagged {
                        Image(systemName: "flag.fill")
                            .foregroundStyle(.red)
                    }
                    if !question.noteMarkdown.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Image(systemName: "note.text")
                            .foregroundStyle(.blue)
                    }
                }
                .font(.caption)
            }

            Text(question.stem)
                .font(.body.weight(.medium))
                .lineLimit(4)

            HStack {
                Label(question.isAnswerable ? "Practice-ready" : "Browse-only", systemImage: question.isAnswerable ? "checkmark.circle" : "eye")
                if let firstTag = question.tags.first {
                    Text(firstTag.name)
                        .lineLimit(1)
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }
}

private struct iOSOptionRow: View {
    let option: QuestionOption
    let isCorrectVisible: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text(option.key)
                .font(.headline)
                .frame(width: 28, height: 28)
                .background(option.isCorrect == true && isCorrectVisible ? Color.green : Color(.tertiarySystemGroupedBackground), in: Circle())
                .foregroundStyle(option.isCorrect == true && isCorrectVisible ? .white : .primary)
            Text(option.text)
            Spacer(minLength: 0)
            if option.isCorrect == true && isCorrectVisible {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            }
        }
        .padding(.vertical, 3)
    }
}

private struct iOSAnswerOptionButton: View {
    let option: QuestionOption
    let isSelected: Bool
    let isCorrect: Bool
    let isDisabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: 12) {
                Text(option.key)
                    .font(.headline)
                    .frame(width: 30, height: 30)
                    .background(badgeBackground, in: Circle())
                    .foregroundStyle(badgeForeground)
                Text(option.text)
                    .foregroundStyle(.primary)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.blue)
                } else if isCorrect {
                    Image(systemName: "checkmark.seal.fill")
                        .foregroundStyle(.green)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("answer-option-\(option.key)")
        .disabled(isDisabled)
    }

    private var badgeBackground: Color {
        if isCorrect { return .green }
        if isSelected { return .blue }
        return Color(.tertiarySystemGroupedBackground)
    }

    private var badgeForeground: Color {
        (isSelected || isCorrect) ? .white : .primary
    }
}

private struct iOSResultSummary: View {
    let result: AnswerResult

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(result.isCorrect ? "Correct" : "Review this answer", systemImage: result.isCorrect ? "checkmark.circle.fill" : "xmark.circle.fill")
                .font(.headline)
                .foregroundStyle(result.isCorrect ? .green : .orange)

            if let correctKey = result.correctKey {
                Text("Correct answer: \(correctKey)\(result.correctText.map { ". \($0)" } ?? "")")
                    .font(.subheadline.weight(.semibold))
            }

            if let explanation = result.explanation, !explanation.isEmpty {
                Text(explanation)
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

private struct iOSMasteryRow: View {
    let row: ProgressRow

    private var accuracy: Double {
        guard row.attemptCount > 0 else { return 0 }
        return Double(row.correctCount) / Double(row.attemptCount)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.name)
                        .font(.body.weight(.medium))
                    Text("\(row.questionCount) questions · \(row.attemptCount) attempts")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text("\(Int(row.elo.rounded()))")
                        .font(.headline)
                    Text(iOSFormat.percent(accuracy * 100))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            ProgressView(value: min(max((row.elo - 800) / 600, 0), 1))
        }
        .padding(.vertical, 4)
    }
}

private struct iOSPager: View {
    let page: Int
    let pageCount: Int
    let isBusy: Bool
    let previous: () -> Void
    let next: () -> Void

    var body: some View {
        HStack {
            Button(action: previous) {
                Label("Previous", systemImage: "chevron.left")
            }
            .disabled(page <= 1 || isBusy)

            Spacer()

            Text("\(page) / \(pageCount)")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            Spacer()

            Button(action: next) {
                Label("Next", systemImage: "chevron.right")
            }
            .disabled(page >= pageCount || isBusy)
        }
    }
}

private enum iOSFormat {
    static func percent(_ value: Double) -> String {
        if value.isNaN || value.isInfinite {
            return "0%"
        }
        if value.rounded() == value {
            return "\(Int(value))%"
        }
        return String(format: "%.1f%%", value)
    }

    static func shortDate(_ date: Date) -> String {
        date.formatted(date: .abbreviated, time: .omitted)
    }
}
