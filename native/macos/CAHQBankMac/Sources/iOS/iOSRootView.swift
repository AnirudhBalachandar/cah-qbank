import SwiftUI

struct iOSRootView: View {
    @ObservedObject var model: AppViewModel
    @State private var selectedTab = AppViewModel.NavigationSection.dashboard

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack {
                iOSTodayView(model: model)
            }
            .tabItem {
                Label("Today", systemImage: "sparkles")
            }
            .tag(AppViewModel.NavigationSection.dashboard)

            NavigationStack {
                iOSBrowseView(model: model)
            }
            .tabItem {
                Label("Browse", systemImage: "book.pages")
            }
            .tag(AppViewModel.NavigationSection.browse)

            NavigationStack {
                iOSPracticeView(model: model)
            }
            .tabItem {
                Label("Practice", systemImage: "play.circle")
            }
            .tag(AppViewModel.NavigationSection.practice)

            NavigationStack {
                iOSProgressView(model: model)
            }
            .tabItem {
                Label("Progress", systemImage: "chart.line.uptrend.xyaxis")
            }
            .tag(AppViewModel.NavigationSection.progress)
        }
        .tint(iOSPalette.accent)
        .overlay(alignment: .top) {
            if model.isSyncing {
                ProgressView()
                    .progressViewStyle(.linear)
                    .tint(iOSPalette.accent)
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

private struct iOSTodayView: View {
    @ObservedObject var model: AppViewModel

    private var dashboard: DashboardSnapshot? {
        model.dashboard
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                iOSHeroCard(
                    title: "CAH QBank",
                    subtitle: "Offline iPhone study library",
                    detail: dashboard.map {
                        "\($0.answerableCount) practice-ready questions from \($0.publishedCount) published questions"
                    } ?? "Loading the bundled question library",
                    symbol: "checklist.checked",
                    actionTitle: "Start practice",
                    actionSymbol: "play.fill"
                ) {
                    model.selectSection(.practice)
                }

                iOSStatusBanner(model: model)

                if let dashboard {
                    iOSMetricGrid(metrics: [
                        iOSMetric(title: "Published", value: "\(dashboard.publishedCount)", symbol: "doc.text", tint: .blue),
                        iOSMetric(title: "Ready", value: "\(dashboard.answerableCount)", symbol: "checkmark.seal", tint: .green),
                        iOSMetric(title: "Accuracy", value: iOSFormat.percent(dashboard.accuracyPercent), symbol: "target", tint: .indigo),
                        iOSMetric(title: "Streak", value: "\(dashboard.currentStreak)", symbol: "bolt.fill", tint: .orange),
                    ])

                    iOSActionPanel(
                        title: "Next best step",
                        subtitle: dashboard.weakTags.isEmpty
                            ? "Start a mixed session to build your first mastery profile."
                            : "Target the lowest mastery topic first.",
                        primaryTitle: "Practice now",
                        primarySymbol: "play.circle.fill",
                        secondaryTitle: "Browse library",
                        secondarySymbol: "magnifyingglass"
                    ) {
                        if let weakTag = dashboard.weakTags.first {
                            model.practiceTagID = weakTag.slug
                        }
                        model.selectSection(.practice)
                    } secondaryAction: {
                        model.selectSection(.browse)
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
                    iOSEmptyPanel(
                        title: "Preparing your library",
                        message: "The iPhone app is loading the bundled offline question bank.",
                        symbol: "tray.and.arrow.down"
                    )
                }
            }
            .padding(16)
        }
        .background(iOSPalette.background.ignoresSafeArea())
        .navigationTitle("Today")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task {
                        await model.syncNow()
                    }
                } label: {
                    Label("Refresh", systemImage: "arrow.clockwise")
                }
                .disabled(model.isBusy)
            }
        }
        .refreshable {
            await model.syncNow()
        }
    }
}

private struct iOSBrowseView: View {
    @ObservedObject var model: AppViewModel
    @FocusState private var searchFocused: Bool

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
                iOSSearchCard(
                    searchText: $model.browseSearch,
                    isFocused: $searchFocused,
                    onSubmit: loadFirstPage
                )

                curriculumFilters
                topicMenu

                if model.browseSnapshot.questions.isEmpty {
                    iOSEmptyPanel(
                        title: "No matching questions",
                        message: "Adjust search, curriculum, or topic filters.",
                        symbol: "line.3.horizontal.decrease.circle"
                    )
                } else {
                    HStack {
                        Text("\(model.browseSnapshot.total) questions")
                            .font(.headline)
                        Spacer()
                        Text("Page \(model.browseSnapshot.page) of \(model.browseSnapshot.pageCount)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    ForEach(model.browseSnapshot.questions) { question in
                        NavigationLink {
                            iOSQuestionDetailView(
                                model: model,
                                questionID: question.id,
                                fallbackQuestion: question
                            )
                        } label: {
                            iOSQuestionCard(question: question)
                        }
                        .buttonStyle(.plain)
                    }

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
            .padding(16)
        }
        .background(iOSPalette.background.ignoresSafeArea())
        .navigationTitle("Browse")
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
        .refreshable {
            await model.loadBrowse()
        }
    }

    private var curriculumFilters: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                iOSFilterChip(
                    title: "All",
                    isSelected: model.browseCurriculum.isEmpty
                ) {
                    model.browseCurriculum = ""
                    loadFirstPage()
                }

                ForEach(Curriculum.allCases, id: \.rawValue) { curriculum in
                    iOSFilterChip(
                        title: curriculum.rawValue,
                        isSelected: model.browseCurriculum == curriculum.rawValue
                    ) {
                        model.browseCurriculum = curriculum.rawValue
                        loadFirstPage()
                    }
                }
            }
            .padding(.vertical, 2)
        }
    }

    private var topicMenu: some View {
        Menu {
            Button("All topics") {
                model.browseTag = ""
                loadFirstPage()
            }

            ForEach(Array(model.browseSnapshot.tagOptions.prefix(40))) { tag in
                Button("\(tag.name) (\(tag.questionCount))") {
                    model.browseTag = tag.slug
                    loadFirstPage()
                }
            }
        } label: {
            HStack {
                Label(selectedTopicTitle, systemImage: "tag")
                Spacer()
                Image(systemName: "chevron.down")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(iOSPalette.text)
            .padding(14)
            .background(iOSPalette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    }

    private var selectedTopicTitle: String {
        guard !model.browseTag.isEmpty else { return "All topics" }
        return model.browseSnapshot.tagOptions.first(where: { $0.slug == model.browseTag })?.name ?? "Selected topic"
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
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                iOSQuestionHeader(question: question)

                iOSDetailSection(title: "Question", symbol: "text.alignleft") {
                    Text(question.stem)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(iOSPalette.text)
                        .fixedSize(horizontal: false, vertical: true)
                }

                iOSDetailSection(title: "Options", symbol: "list.bullet") {
                    VStack(spacing: 10) {
                        ForEach(question.options, id: \.key) { option in
                            iOSAnswerOptionRow(
                                option: option,
                                isSelected: false,
                                isCorrect: option.isCorrect == true,
                                isDisabled: true
                            ) {}
                        }
                    }
                }

                if let explanation = question.explanation, !explanation.isEmpty {
                    iOSDetailSection(title: "Explanation", symbol: "lightbulb") {
                        Text(explanation)
                            .font(.body)
                            .foregroundStyle(iOSPalette.text)
                    }
                }

                if !question.optionExplanations.isEmpty {
                    iOSDetailSection(title: "Option notes", symbol: "text.bubble") {
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(question.options, id: \.key) { option in
                                if let explanation = question.optionExplanations[option.key], !explanation.isEmpty {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(option.key)
                                            .font(.caption.weight(.bold))
                                            .foregroundStyle(iOSPalette.accent)
                                        Text(explanation)
                                            .font(.callout)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }
                }

                if !question.citations.isEmpty {
                    iOSDetailSection(title: "References", symbol: "quote.bubble") {
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(Array(question.citations.enumerated()), id: \.offset) { index, citation in
                                VStack(alignment: .leading, spacing: 3) {
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
                }

                iOSDetailSection(title: "Private note", symbol: "square.and.pencil") {
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
                    .padding(10)
                    .scrollContentBackground(.hidden)
                    .background(iOSPalette.background, in: RoundedRectangle(cornerRadius: 14, style: .continuous))

                    Button {
                        Task {
                            await model.saveNote(questionID: question.id, note: noteDraft)
                            noteWasEdited = false
                        }
                    } label: {
                        Label("Save note", systemImage: "checkmark.circle")
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(model.isBusy || !noteWasEdited)
                }
            }
            .padding(16)
        }
        .background(iOSPalette.background.ignoresSafeArea())
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
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                iOSHeroCard(
                    title: "Practice",
                    subtitle: "Sequential exam-style sessions",
                    detail: selectedPracticeSummary,
                    symbol: "play.circle",
                    actionTitle: model.activeSession == nil ? "Start session" : "Start new",
                    actionSymbol: "play.fill"
                ) {
                    Task {
                        await model.startPractice()
                    }
                }
                .disabled(model.isBusy || model.practiceTags.isEmpty)

                iOSPracticeSetupCard(model: model)

                if let session = model.activeSession {
                    iOSPracticeSessionView(model: model, session: session)
                } else {
                    iOSEmptyPanel(
                        title: "No active session",
                        message: "Choose a focus and start a session. The app stores attempts locally on this iPhone.",
                        symbol: "play.circle"
                    )
                }
            }
            .padding(16)
        }
        .background(iOSPalette.background.ignoresSafeArea())
        .navigationTitle("Practice")
    }

    private var selectedPracticeSummary: String {
        guard !model.practiceTagID.isEmpty,
              let tag = model.practiceTags.first(where: { $0.slug == model.practiceTagID }) else {
            return "\(model.practiceQuestionCount) mixed questions"
        }
        return "\(model.practiceQuestionCount) questions from \(tag.name)"
    }
}

private struct iOSPracticeSetupCard: View {
    @ObservedObject var model: AppViewModel

    private var selectedTagTitle: String {
        guard !model.practiceTagID.isEmpty,
              let tag = model.practiceTags.first(where: { $0.slug == model.practiceTagID }) else {
            return "All answerable questions"
        }
        return "\(tag.name) (\(tag.questionCount))"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            iOSSectionHeader(title: "Session setup", symbol: "slider.horizontal.3")

            Menu {
                Button("All answerable questions") {
                    model.practiceTagID = ""
                }
                ForEach(model.practiceTags) { tag in
                    Button("\(tag.name) (\(tag.questionCount))") {
                        model.practiceTagID = tag.slug
                    }
                }
            } label: {
                HStack {
                    Label(selectedTagTitle, systemImage: "tag")
                    Spacer()
                    Image(systemName: "chevron.down")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                .padding(14)
                .background(iOSPalette.background, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }

            Stepper(value: $model.practiceQuestionCount, in: 1...50) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(model.practiceQuestionCount) questions")
                        .font(.headline)
                    Text("Small focused sessions work best on iPhone.")
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
        .iOSCard()
    }
}

private struct iOSPracticeSessionView: View {
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

    private var progress: Double {
        guard !session.questions.isEmpty else { return 0 }
        return Double(answeredCount) / Double(session.questions.count)
    }

    private var isComplete: Bool {
        session.completedAt != nil || answeredCount == session.questions.count
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            iOSPracticeSessionHeader(
                answered: answeredCount,
                total: session.questions.count,
                correct: correctCount,
                progress: progress,
                isComplete: isComplete
            ) {
                Task {
                    await model.finishSession()
                }
            }

            if let currentQuestion {
                questionCard(currentQuestion)
            }

            questionRail
        }
        .onAppear {
            syncState(with: session)
        }
        .onChange(of: session) { _, newSession in
            syncState(with: newSession)
        }
    }

    private func questionCard(_ question: QBankQuestion) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Question \(currentIndex + 1)")
                    .font(.headline)
                Spacer()
                Text("\(currentIndex + 1) / \(session.questions.count)")
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(iOSPalette.accentSoft, in: Capsule())
                    .foregroundStyle(iOSPalette.accent)
            }

            Text(question.stem)
                .font(.title3.weight(.semibold))
                .foregroundStyle(iOSPalette.text)
                .fixedSize(horizontal: false, vertical: true)

            VStack(spacing: 10) {
                ForEach(question.options, id: \.key) { option in
                    iOSAnswerOptionRow(
                        option: option,
                        isSelected: currentSelectedKey(for: question) == option.key,
                        isCorrect: displayedResult(for: question) != nil && option.isCorrect == true,
                        isDisabled: session.answeredByQuestion[question.id] != nil
                    ) {
                        selectedKeys[question.id] = option.key
                    }
                }
            }

            if let result = displayedResult(for: question) {
                iOSResultCard(result: result)
            }

            HStack(spacing: 10) {
                Button {
                    currentIndex = iOSSessionNavigation.clampedIndex(currentIndex - 1, for: session)
                } label: {
                    Label("Previous", systemImage: "chevron.left")
                }
                .buttonStyle(.bordered)
                .disabled(currentIndex <= 0)

                Spacer()

                Button {
                    Task {
                        guard !currentSelectedKey(for: question).isEmpty else { return }
                        if let result = await model.submitAnswer(questionID: question.id, selectedKey: currentSelectedKey(for: question)) {
                            results[question.id] = result
                        }
                    }
                } label: {
                    Label("Submit", systemImage: "checkmark.circle")
                }
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("submit-answer")
                .disabled(currentSelectedKey(for: question).isEmpty || model.isBusy || session.answeredByQuestion[question.id] != nil)

                Button {
                    currentIndex = iOSSessionNavigation.clampedIndex(currentIndex + 1, for: session)
                } label: {
                    Label("Next", systemImage: "chevron.right")
                }
                .buttonStyle(.bordered)
                .disabled(!iOSSessionNavigation.isUnlocked(index: currentIndex + 1, in: session))
            }
            .labelStyle(.iconOnly)
        }
        .iOSCard()
    }

    private var questionRail: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Array(session.questions.enumerated()), id: \.element.id) { index, question in
                    let answered = session.answeredByQuestion[question.id]
                    let unlocked = iOSSessionNavigation.isUnlocked(index: index, in: session)
                    Button {
                        currentIndex = iOSSessionNavigation.clampedIndex(index, for: session)
                    } label: {
                        Text("\(index + 1)")
                            .font(.caption.weight(.bold))
                            .frame(width: 34, height: 34)
                            .background(railBackground(isCurrent: index == currentIndex, answered: answered, unlocked: unlocked), in: Circle())
                            .foregroundStyle(railForeground(isCurrent: index == currentIndex, answered: answered, unlocked: unlocked))
                    }
                    .disabled(!unlocked)
                }
            }
            .padding(.vertical, 2)
        }
    }

    private func railBackground(isCurrent: Bool, answered: AttemptRecord?, unlocked: Bool) -> Color {
        if isCurrent { return iOSPalette.accent }
        if let answered { return answered.isCorrect ? .green.opacity(0.18) : .orange.opacity(0.2) }
        return unlocked ? iOSPalette.card : iOSPalette.cardMuted
    }

    private func railForeground(isCurrent: Bool, answered: AttemptRecord?, unlocked: Bool) -> Color {
        if isCurrent { return .white }
        if let answered { return answered.isCorrect ? .green : .orange }
        return unlocked ? iOSPalette.text : .secondary
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
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let dashboard = model.dashboard {
                    iOSMetricGrid(metrics: [
                        iOSMetric(title: "Accuracy", value: iOSFormat.percent(dashboard.accuracyPercent), symbol: "target", tint: .indigo),
                        iOSMetric(title: "Streak", value: "\(dashboard.currentStreak)", symbol: "bolt.fill", tint: .orange),
                        iOSMetric(title: "Notes", value: "\(dashboard.noteCount)", symbol: "note.text", tint: .blue),
                        iOSMetric(title: "Flagged", value: "\(dashboard.flaggedCount)", symbol: "flag.fill", tint: .red),
                    ])

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

                VStack(alignment: .leading, spacing: 12) {
                    iOSSectionHeader(title: "Mastery", symbol: "chart.bar")
                    if model.progressRows.isEmpty {
                        iOSEmptyPanel(
                            title: "No mastery yet",
                            message: "Answer practice questions to build an iPhone progress profile.",
                            symbol: "chart.bar"
                        )
                    } else {
                        ForEach(model.progressRows.prefix(30)) { row in
                            iOSMasteryRow(row: row)
                        }
                    }
                }
                .iOSCard()
            }
            .padding(16)
        }
        .background(iOSPalette.background.ignoresSafeArea())
        .navigationTitle("Progress")
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

private struct iOSHeroCard: View {
    let title: String
    let subtitle: String
    let detail: String
    let symbol: String
    let actionTitle: String
    let actionSymbol: String
    let action: () -> Void

    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top) {
                Image(systemName: symbol)
                    .font(.title2.weight(.bold))
                    .frame(width: 44, height: 44)
                    .background(.white.opacity(0.16), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                Spacer()
                Text(subtitle)
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(.white.opacity(0.14), in: Capsule())
            }

            VStack(alignment: .leading, spacing: 8) {
                Text(title)
                    .font(.largeTitle.bold())
                Text(detail)
                    .font(.callout)
                    .foregroundStyle(.white.opacity(0.82))
                    .fixedSize(horizontal: false, vertical: true)
            }

            Button(action: action) {
                Label(actionTitle, systemImage: actionSymbol)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(.white)
            .foregroundStyle(iOSPalette.accent)
            .disabled(!isEnabled)
        }
        .padding(20)
        .foregroundStyle(.white)
        .background(
            LinearGradient(
                colors: [iOSPalette.accent, iOSPalette.accentDeep],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 28, style: .continuous)
        )
    }
}

private struct iOSStatusBanner: View {
    @ObservedObject var model: AppViewModel

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: statusSymbol)
                .font(.headline)
                .foregroundStyle(statusTint)
                .frame(width: 30, height: 30)
                .background(statusTint.opacity(0.13), in: Circle())

            VStack(alignment: .leading, spacing: 3) {
                Text(statusTitle)
                    .font(.subheadline.weight(.semibold))
                Text(statusMessage)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()
        }
        .iOSCard()
    }

    private var statusTitle: String {
        if model.errorMessage != nil { return "Needs attention" }
        if model.isBusy { return "Updating library" }
        return "Offline library ready"
    }

    private var statusMessage: String {
        if let errorMessage = model.errorMessage { return errorMessage }
        if let dashboard = model.dashboard {
            return "Stored locally on this iPhone with \(dashboard.answerableCount) practice-ready questions."
        }
        return "Preparing the bundled CAH QBank database."
    }

    private var statusSymbol: String {
        if model.errorMessage != nil { return "exclamationmark.triangle.fill" }
        if model.isBusy { return "arrow.triangle.2.circlepath" }
        return "checkmark.circle.fill"
    }

    private var statusTint: Color {
        if model.errorMessage != nil { return .orange }
        if model.isBusy { return .blue }
        return .green
    }
}

private struct iOSSearchCard: View {
    @Binding var searchText: String
    var isFocused: FocusState<Bool>.Binding
    let onSubmit: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
            TextField("Search stems", text: $searchText)
                .focused(isFocused)
                .submitLabel(.search)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .onSubmit(onSubmit)
            if !searchText.isEmpty {
                Button {
                    searchText = ""
                    onSubmit()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(14)
        .background(iOSPalette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct iOSMetric: Identifiable {
    let id = UUID()
    let title: String
    let value: String
    let symbol: String
    let tint: Color
}

private struct iOSMetricGrid: View {
    let metrics: [iOSMetric]

    private let columns = [
        GridItem(.flexible(), spacing: 10),
        GridItem(.flexible(), spacing: 10),
    ]

    var body: some View {
        LazyVGrid(columns: columns, spacing: 10) {
            ForEach(metrics) { metric in
                VStack(alignment: .leading, spacing: 10) {
                    Image(systemName: metric.symbol)
                        .font(.headline.weight(.bold))
                        .foregroundStyle(metric.tint)
                        .frame(width: 34, height: 34)
                        .background(metric.tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    Text(metric.value)
                        .font(.title2.bold())
                        .foregroundStyle(iOSPalette.text)
                        .minimumScaleFactor(0.7)
                    Text(metric.title)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .iOSCard()
            }
        }
    }
}

private struct iOSActionPanel: View {
    let title: String
    let subtitle: String
    let primaryTitle: String
    let primarySymbol: String
    let secondaryTitle: String
    let secondarySymbol: String
    let primaryAction: () -> Void
    let secondaryAction: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            iOSSectionHeader(title: title, symbol: "arrow.up.forward.circle")
            Text(subtitle)
                .font(.callout)
                .foregroundStyle(.secondary)

            HStack(spacing: 10) {
                Button(action: primaryAction) {
                    Label(primaryTitle, systemImage: primarySymbol)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)

                Button(action: secondaryAction) {
                    Label(secondaryTitle, systemImage: secondarySymbol)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }
            .labelStyle(.titleAndIcon)
        }
        .iOSCard()
    }
}

private struct iOSWeakTopicsSection: View {
    let title: String
    let weakTags: [WeakTagSnapshot]
    let onSelect: (WeakTagSnapshot) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            iOSSectionHeader(title: title, symbol: "scope")

            if weakTags.isEmpty {
                Text("No weak topics yet. Practice sessions will populate this view.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(weakTags) { tag in
                            Button {
                                onSelect(tag)
                            } label: {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text(tag.name)
                                        .font(.headline)
                                        .foregroundStyle(iOSPalette.text)
                                        .lineLimit(2)
                                    Text("\(Int(tag.elo.rounded())) ELO")
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(.orange)
                                    Text("\(tag.attempts) attempts")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                .frame(width: 180, alignment: .leading)
                                .padding(14)
                                .background(iOSPalette.background, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
        .iOSCard()
    }
}

private struct iOSRecentSessionsSection: View {
    let sessions: [RecentSessionSummary]
    let onResume: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            iOSSectionHeader(title: "Recent sessions", symbol: "clock.arrow.circlepath")

            if sessions.isEmpty {
                Text("Completed and active sessions will appear here.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(sessions) { session in
                    Button {
                        onResume(session.id)
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: session.completedAt == nil ? "pause.circle" : "checkmark.circle")
                                .font(.title3)
                                .foregroundStyle(session.completedAt == nil ? .orange : .green)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(session.mode.rawValue.capitalized)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(iOSPalette.text)
                                Text("\(session.answered) answered · \(session.correct) correct")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text(iOSFormat.shortDate(session.createdAt))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding(12)
                        .background(iOSPalette.background, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .iOSCard()
    }
}

private struct iOSQuestionCard: View {
    let question: QBankQuestion

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                Text(question.curriculum.rawValue)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(iOSPalette.accent)
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
                .font(.headline)
                .foregroundStyle(iOSPalette.text)
                .lineLimit(4)
                .fixedSize(horizontal: false, vertical: true)

            HStack {
                Label(question.isAnswerable ? "Practice-ready" : "Browse-only", systemImage: question.isAnswerable ? "checkmark.circle" : "eye")
                Spacer()
                Text(question.tags.prefix(2).map(\.name).joined(separator: ", "))
                    .lineLimit(1)
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .iOSCard()
    }
}

private struct iOSQuestionHeader: View {
    let question: QBankQuestion

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text(question.curriculum.rawValue)
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(iOSPalette.accentSoft, in: Capsule())
                    .foregroundStyle(iOSPalette.accent)
                if question.flagged {
                    Label("Flagged", systemImage: "flag.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.red)
                }
            }

            FlowTags(tags: Array(question.tags.prefix(6)))
        }
        .iOSCard()
    }
}

private struct FlowTags: View {
    let tags: [QuestionTag]

    var body: some View {
        if !tags.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(tags) { tag in
                    Text(tag.name)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
        }
    }
}

private struct iOSPracticeSessionHeader: View {
    let answered: Int
    let total: Int
    let correct: Int
    let progress: Double
    let isComplete: Bool
    let finish: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(isComplete ? "Session complete" : "Active session")
                        .font(.headline)
                    Text("\(answered) of \(total) answered · \(correct) correct")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button("Finish", action: finish)
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("finish-session")
                    .disabled(isComplete)
            }

            ProgressView(value: progress)
                .tint(iOSPalette.accent)
        }
        .iOSCard()
    }
}

private struct iOSAnswerOptionRow: View {
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
                    .frame(width: 32, height: 32)
                    .background(badgeBackground, in: Circle())
                    .foregroundStyle(badgeForeground)
                Text(option.text)
                    .font(.body)
                    .foregroundStyle(iOSPalette.text)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(iOSPalette.accent)
                } else if isCorrect {
                    Image(systemName: "checkmark.seal.fill")
                        .foregroundStyle(.green)
                }
            }
            .padding(12)
            .background(rowBackground, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("answer-option-\(option.key)")
        .disabled(isDisabled)
    }

    private var rowBackground: Color {
        if isCorrect { return .green.opacity(0.12) }
        if isSelected { return iOSPalette.accentSoft }
        return iOSPalette.background
    }

    private var badgeBackground: Color {
        if isCorrect { return .green }
        if isSelected { return iOSPalette.accent }
        return iOSPalette.cardMuted
    }

    private var badgeForeground: Color {
        (isSelected || isCorrect) ? .white : iOSPalette.text
    }
}

private struct iOSResultCard: View {
    let result: AnswerResult

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
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
        .padding(14)
        .background((result.isCorrect ? Color.green : Color.orange).opacity(0.12), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct iOSMasteryRow: View {
    let row: ProgressRow

    private var accuracy: Double {
        guard row.attemptCount > 0 else { return 0 }
        return Double(row.correctCount) / Double(row.attemptCount)
    }

    private var eloProgress: Double {
        min(max((row.elo - 800) / 600, 0), 1)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.name)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(iOSPalette.text)
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
            ProgressView(value: eloProgress)
                .tint(iOSPalette.accent)
        }
        .padding(12)
        .background(iOSPalette.background, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

private struct iOSFilterChip: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.caption.weight(.semibold))
                .lineLimit(1)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(isSelected ? iOSPalette.accent : iOSPalette.card, in: Capsule())
                .foregroundStyle(isSelected ? .white : iOSPalette.text)
        }
        .buttonStyle(.plain)
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
        .buttonStyle(.bordered)
    }
}

private struct iOSDetailSection<Content: View>: View {
    let title: String
    let symbol: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            iOSSectionHeader(title: title, symbol: symbol)
            content
        }
        .iOSCard()
    }
}

private struct iOSSectionHeader: View {
    let title: String
    let symbol: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: symbol)
                .foregroundStyle(iOSPalette.accent)
            Text(title)
                .font(.headline)
                .foregroundStyle(iOSPalette.text)
        }
    }
}

private struct iOSEmptyPanel: View {
    let title: String
    let message: String
    let symbol: String

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: symbol)
                .font(.title)
                .foregroundStyle(iOSPalette.accent)
            Text(title)
                .font(.headline)
                .foregroundStyle(iOSPalette.text)
            Text(message)
                .font(.callout)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(24)
        .iOSCard()
    }
}

private struct iOSCardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(16)
            .background(iOSPalette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(iOSPalette.border, lineWidth: 1)
            )
    }
}

private extension View {
    func iOSCard() -> some View {
        modifier(iOSCardModifier())
    }
}

private enum iOSPalette {
    static let background = Color(.systemGroupedBackground)
    static let card = Color(.secondarySystemGroupedBackground)
    static let cardMuted = Color(.tertiarySystemGroupedBackground)
    static let border = Color.black.opacity(0.06)
    static let text = Color.primary
    static let accent = Color(red: 0.10, green: 0.30, blue: 0.84)
    static let accentDeep = Color(red: 0.05, green: 0.16, blue: 0.48)
    static let accentSoft = accent.opacity(0.12)
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
