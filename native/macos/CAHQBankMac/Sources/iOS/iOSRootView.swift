import SwiftUI

struct iOSRootView: View {
    @ObservedObject var model: AppViewModel
    @State private var selectedTab = iOSAppTab.browse

    var body: some View {
        VStack(spacing: 0) {
            Group {
                switch selectedTab {
                case .browse:
                    NavigationStack {
                        iOSBrowseView(model: model)
                    }
                case .practice:
                    iOSPracticeView(model: model)
                case .progress:
                    iOSProgressView(model: model)
                case .notebook:
                    iOSNotebookView(model: model)
                case .profile:
                    iOSProfileView(model: model)
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
            selectedTab = iOSAppTab(model.selection ?? .browse)
        }
        .onChange(of: selectedTab) { _, newValue in
            if let modelSection = newValue.modelSection, model.selection != modelSection {
                model.selection = modelSection
            }
        }
        .onChange(of: model.selection) { _, newValue in
            guard let newValue else { return }
            let tab = iOSAppTab(newValue)
            guard selectedTab != tab else { return }
            selectedTab = tab
        }
    }
}

private enum iOSAppTab: String, CaseIterable, Identifiable {
    case browse
    case practice
    case progress
    case notebook
    case profile

    var id: String { rawValue }

    init(_ section: AppViewModel.NavigationSection) {
        switch section {
        case .dashboard, .browse:
            self = .browse
        case .practice:
            self = .practice
        case .progress:
            self = .progress
        }
    }

    var title: String {
        switch self {
        case .browse: return "Browse"
        case .practice: return "Practice"
        case .progress: return "Progress"
        case .notebook: return "Notebook"
        case .profile: return "Profile"
        }
    }

    var systemImage: String {
        switch self {
        case .browse: return "house.fill"
        case .practice: return "checkmark.circle"
        case .progress: return "chart.bar.fill"
        case .notebook: return "book"
        case .profile: return "person"
        }
    }

    var modelSection: AppViewModel.NavigationSection? {
        switch self {
        case .browse:
            return .browse
        case .practice:
            return .practice
        case .progress:
            return .progress
        case .notebook, .profile:
            return nil
        }
    }
}

private struct iOSBottomTabBar: View {
    @Binding var selection: iOSAppTab

    var body: some View {
        HStack(spacing: 0) {
            ForEach(iOSAppTab.allCases) { tab in
                tabButton(tab, title: tab.title, systemImage: tab.systemImage)
            }
        }
        .padding(.horizontal, 10)
        .padding(.top, 8)
        .padding(.bottom, 10)
        .background(Color(.secondarySystemGroupedBackground))
        .overlay {
            Rectangle()
                .frame(height: 1)
                .foregroundStyle(Color(.separator))
                .frame(maxHeight: .infinity, alignment: .top)
        }
        .shadow(color: .black.opacity(0.08), radius: 14, y: -4)
    }

    private func tabButton(_ tab: iOSAppTab, title: String, systemImage: String) -> some View {
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
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityIdentifier("tab-\(tab.rawValue)")
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
        .contentMargins(.bottom, 18, for: .scrollContent)
        .refreshable {
            await model.syncNow()
        }
    }
}

private struct iOSBrowseView: View {
    @ObservedObject var model: AppViewModel
    @State private var showingFilters = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text("CAH QBank")
                        .font(.title3.bold())
                        .foregroundStyle(.blue)
                    Spacer()
                    Button {
                        Task { await model.syncNow() }
                    } label: {
                        Image(systemName: "bell")
                            .overlay(alignment: .topTrailing) {
                                Circle()
                                    .fill(.red)
                                    .frame(width: 8, height: 8)
                            }
                    }
                    .accessibilityLabel("Refresh notifications")
                }

                HStack(spacing: 8) {
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass")
                            .foregroundStyle(.secondary)
                        TextField("Search topics, keywords, stem, or ID...", text: $model.browseSearch)
                            .textInputAutocapitalization(.never)
                            .submitLabel(.search)
                            .onSubmit(loadFirstPage)
                    }
                    .padding(.horizontal, 12)
                    .frame(minHeight: 44)
                    .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .stroke(Color(.separator).opacity(0.5), lineWidth: 1)
                    }

                    Button {
                        showingFilters = true
                    } label: {
                        Image(systemName: "line.3.horizontal.decrease")
                            .frame(width: 44, height: 44)
                            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .overlay {
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .stroke(Color(.separator).opacity(0.5), lineWidth: 1)
                            }
                    }
                    .accessibilityLabel("Open filters")
                }

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        iOSPill(text: model.browseCurriculum.isEmpty ? "RACP (Paediatrics)" : model.browseCurriculum, color: .blue)
                        iOSPill(text: selectedTopicName, color: .blue)
                        iOSPill(text: "SBA", color: .blue)
                        iOSPill(text: "Source: AI", color: .blue)
                    }
                }

                HStack {
                    Text("\(model.browseSnapshot.total.formatted()) questions found")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("Most relevant") {}
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                }

                if model.browseSnapshot.questions.isEmpty {
                    ContentUnavailableView(
                        "No Matching Questions",
                        systemImage: "line.3.horizontal.decrease.circle",
                        description: Text("Adjust search, curriculum, or topic filters.")
                    )
                    .frame(maxWidth: .infinity)
                    .padding(.top, 32)
                } else {
                    ForEach(model.browseSnapshot.questions) { question in
                        iOSQuestionCard(question: question) {
                            Task {
                                model.practiceQuestionCount = 1
                                model.practiceTagID = ""
                                await model.selectQuestion(id: question.id)
                                await model.startPractice()
                            }
                        }
                    }

                    if model.browseSnapshot.pageCount > 1 {
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
                        .padding(.vertical, 8)
                    }
                }
            }
            .padding(16)
        }
        .background(Color(.systemGroupedBackground))
        .onChange(of: model.browseCurriculum) { _, _ in
            loadFirstPage()
        }
        .onChange(of: model.browseTag) { _, _ in
            loadFirstPage()
        }
        .refreshable {
            await model.loadBrowse()
        }
        .sheet(isPresented: $showingFilters) {
            NavigationStack {
                Form {
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
                .navigationTitle("Filters")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Clear") {
                            clearFilters()
                        }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") {
                            showingFilters = false
                            loadFirstPage()
                        }
                    }
                }
            }
            .presentationDetents([.medium, .large])
        }
    }

    private var selectedTopicName: String {
        guard !model.browseTag.isEmpty else { return "Respiratory" }
        return model.browseSnapshot.tagOptions.first(where: { $0.slug == model.browseTag })?.name ?? "Topic"
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

private struct iOSPill: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(color.opacity(0.1), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

private struct iOSQuestionCard: View {
    let question: QBankQuestion
    let practice: () -> Void

    private var accuracy: Int? {
        guard question.attemptCount > 0 else { return nil }
        return Int((Double(question.correctCount) / Double(question.attemptCount) * 100).rounded())
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Q-\(question.id.prefix(5).uppercased())")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                Image(systemName: question.flagged ? "flag.fill" : "star")
                    .foregroundStyle(question.flagged ? .red : .orange)
            }

            Text(question.stem)
                .font(.subheadline.weight(.medium))
                .lineLimit(5)
                .lineSpacing(2)

            HStack(spacing: 6) {
                iOSPill(text: "RACP", color: .blue)
                ForEach(question.tags.prefix(2)) { tag in
                    iOSPill(text: tag.name, color: .blue)
                }
                if question.isAnswerable {
                    iOSPill(text: "Answerable", color: .green)
                }
            }

            HStack {
                Text("\(question.attemptCount) \(question.attemptCount == 1 ? "attempt" : "attempts")")
                Text("\(question.correctCount) correct")
                if let accuracy {
                    Text("\(accuracy)%")
                        .fontWeight(.bold)
                        .foregroundStyle(accuracy >= 70 ? .green : accuracy == 0 ? .red : .orange)
                } else {
                    Text("New")
                        .fontWeight(.bold)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button("Practice", action: practice)
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color(.separator).opacity(0.45), lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.05), radius: 10, y: 3)
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
        .contentMargins(.bottom, 18, for: .scrollContent)
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
                HStack {
                    Button {} label: {
                        Image(systemName: "xmark")
                    }
                    .buttonStyle(.plain)
                    Spacer()
                    Text("Practice Setup")
                        .font(.headline)
                    Spacer()
                    Button("Reset") {
                        model.practiceTagID = ""
                        model.practiceQuestionCount = 20
                    }
                    .font(.caption.weight(.semibold))
                }
            }

            if let session = model.activeSession {
                iOSPracticeSessionSection(model: model, session: session)
            }

            Section {
                VStack(alignment: .leading, spacing: 12) {
                    iOSNumberedHeader(number: 1, title: "Choose your scope")
                    ForEach(Array(model.practiceTags.prefix(4))) { tag in
                        Button {
                            model.practiceTagID = tag.slug
                        } label: {
                            iOSTopicSelectionRow(
                                title: tag.name,
                                detail: "\(tag.questionCount) questions",
                                progress: min(max((tag.elo - 800) / 600, 0.08), 1),
                                selected: model.practiceTagID == tag.slug
                            )
                        }
                        .buttonStyle(.plain)
                    }
                    Button("Show more topics") {}
                        .font(.caption.weight(.semibold))
                }
            }

            Section {
                VStack(alignment: .leading, spacing: 12) {
                    iOSNumberedHeader(number: 2, title: "Choose session type")
                    HStack(spacing: 0) {
                        ForEach(["Revision", "Timed", "Incorrect", "Flagged"], id: \.self) { item in
                            Text(item)
                                .font(.caption.weight(.semibold))
                                .frame(maxWidth: .infinity, minHeight: 38)
                                .background(item == "Revision" ? Color.blue.opacity(0.12) : Color.clear)
                                .foregroundStyle(item == "Revision" ? .blue : .primary)
                                .overlay {
                                    Rectangle()
                                        .stroke(Color(.separator).opacity(0.5), lineWidth: 0.5)
                                }
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    Text("Study at your own pace and build knowledge.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Section {
                VStack(alignment: .leading, spacing: 12) {
                    iOSNumberedHeader(number: 3, title: "Choose number of questions")
                    HStack(spacing: 8) {
                        ForEach([10, 20, 40, 100], id: \.self) { count in
                            Button {
                                model.practiceQuestionCount = count
                            } label: {
                                Text("\(count)")
                                    .font(.caption.weight(.bold))
                                    .frame(maxWidth: .infinity, minHeight: 40)
                            }
                            .buttonStyle(.bordered)
                            .tint(model.practiceQuestionCount == count ? .blue : .secondary)
                        }
                    }
                }
            }

            Section {
                VStack(alignment: .leading, spacing: 12) {
                    iOSNumberedHeader(number: 4, title: "Question selection")
                    ForEach([
                        ("New questions only", "Questions you have not attempted before"),
                        ("Unanswered questions", "Questions you have not answered yet"),
                        ("Incorrect questions", "Questions you answered incorrectly"),
                        ("Review due", "Questions due for spaced repetition")
                    ], id: \.0) { item in
                        Label {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.0)
                                    .font(.subheadline.weight(.semibold))
                                Text(item.1)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        } icon: {
                            Image(systemName: "checkmark.square.fill")
                                .foregroundStyle(.blue)
                        }
                    }
                }
            }

            iOSStatusSection(model: model)
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .contentMargins(.bottom, 18, for: .scrollContent)
        .refreshable {
            await model.syncNow()
        }
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 6) {
                Button {
                    Task { await model.startPractice() }
                } label: {
                    Label("Start session", systemImage: "play.fill")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("start-practice-session")
                .disabled(model.isBusy || model.practiceTags.isEmpty)

                Text("Estimated time: 30-40 min    Questions: \(model.practiceQuestionCount)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .background(.regularMaterial)
        }
    }
}

private struct iOSNumberedHeader: View {
    let number: Int
    let title: String

    var body: some View {
        HStack(spacing: 8) {
            Text("\(number)")
                .font(.caption.bold())
                .frame(width: 22, height: 22)
                .background(.blue, in: Circle())
                .foregroundStyle(.white)
            Text(title)
                .font(.subheadline.bold())
        }
    }
}

private struct iOSTopicSelectionRow: View {
    let title: String
    let detail: String
    let progress: Double
    let selected: Bool

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: selected ? "checkmark.square.fill" : "square")
                .foregroundStyle(selected ? .blue : .secondary)
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                SwiftUI.ProgressView(value: progress)
                    .tint(.green)
            }
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

        if isComplete {
            Section {
                iOSSessionSummaryCard(
                    total: session.questions.count,
                    correct: correctCount,
                    incorrect: max(answeredCount - correctCount, 0),
                    unanswered: max(session.questions.count - answeredCount, 0)
                )
            }
        }

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

    private var reviewDueRows: [ProgressRow] {
        model.progressRows
            .filter { row in
                guard row.attemptCount > 0 else { return false }
                return Double(row.correctCount) / Double(row.attemptCount) < 0.8
            }
            .sorted { left, right in
                let leftScore = Double(left.correctCount) / Double(max(left.attemptCount, 1))
                let rightScore = Double(right.correctCount) / Double(max(right.attemptCount, 1))
                return leftScore < rightScore
            }
    }

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

            Section("Review Due") {
                if reviewDueRows.isEmpty {
                    Text("No review-due topics. Items appear here when a practiced topic is below 80% accuracy.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(reviewDueRows.prefix(8)) { row in
                        Button {
                            model.practiceTagID = row.slug
                            model.selectSection(.practice)
                        } label: {
                            HStack {
                                Text(iOSFormat.percent(Double(row.correctCount) / Double(max(row.attemptCount, 1)) * 100))
                                    .font(.caption.bold())
                                    .foregroundStyle(.red)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 5)
                                    .background(.red.opacity(0.1), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(row.name)
                                        .foregroundStyle(.primary)
                                    Text("\(row.correctCount) of \(row.attemptCount) correct")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text("Practice")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.blue)
                            }
                        }
                    }
                }
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
        .contentMargins(.bottom, 18, for: .scrollContent)
        .refreshable {
            await model.syncNow()
        }
    }
}

private struct iOSNotebookView: View {
    @ObservedObject var model: AppViewModel

    private var notes: [QBankQuestion] {
        model.browseSnapshot.questions.filter { !$0.noteMarkdown.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    private var bookmarks: [QBankQuestion] {
        model.browseSnapshot.questions.filter(\.flagged)
    }

    var body: some View {
        List {
            Section {
                HStack {
                    Text("Notebook")
                        .font(.title3.bold())
                    Spacer()
                    Button {
                    } label: {
                        Label("New note", systemImage: "plus")
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                }
            }

            Section {
                HStack {
                    iOSPill(text: "All Notes \(notes.count + bookmarks.count)", color: .blue)
                    iOSPill(text: "My Notes \(notes.count)", color: .blue)
                    iOSPill(text: "Bookmarks \(bookmarks.count)", color: .secondary)
                }
            }

            Section {
                if notes.isEmpty && bookmarks.isEmpty {
                    ContentUnavailableView(
                        "No Notes Yet",
                        systemImage: "book",
                        description: Text("Save notes from question detail or explanation screens.")
                    )
                } else {
                    ForEach(notes.prefix(20)) { question in
                        iOSNotebookNoteCard(question: question)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .contentMargins(.bottom, 18, for: .scrollContent)
    }
}

private struct iOSNotebookNoteCard: View {
    let question: QBankQuestion

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Text("MY NOTE")
                    .font(.caption2.bold())
                    .foregroundStyle(.orange)
                Spacer()
                Image(systemName: "bookmark.fill")
                    .foregroundStyle(.blue)
            }
            Text(question.tags.first?.name ?? question.curriculum.rawValue)
                .font(.subheadline.bold())
            Text(question.noteMarkdown)
                .font(.callout)
                .foregroundStyle(.secondary)
                .lineLimit(3)
            HStack {
                iOSPill(text: question.curriculum.rawValue, color: .blue)
                if let tag = question.tags.first {
                    iOSPill(text: tag.name, color: .secondary)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

private struct iOSProfileView: View {
    @ObservedObject var model: AppViewModel
    @AppStorage(CAHAppearanceMode.storageKey) private var appearanceRawValue = CAHAppearanceMode.light.rawValue
    @AppStorage("cah.profile.offlineContent") private var offlineContent = true
    @AppStorage("cah.profile.notifications") private var notifications = true
    @AppStorage("cah.profile.compactCards") private var compactCards = false

    private var appearanceMode: CAHAppearanceMode {
        CAHAppearanceMode.normalized(appearanceRawValue)
    }

    private var darkModeBinding: Binding<Bool> {
        Binding(
            get: { appearanceMode == .dark },
            set: { isDark in
                appearanceRawValue = isDark ? CAHAppearanceMode.dark.rawValue : CAHAppearanceMode.light.rawValue
            }
        )
    }

    var body: some View {
        List {
            Section {
                HStack(spacing: 14) {
                    Text("AB")
                        .font(.title2.bold())
                        .frame(width: 62, height: 62)
                        .background(.purple.opacity(0.12), in: Circle())
                        .foregroundStyle(.purple)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Alex Brown")
                            .font(.headline)
                        Text("alex.brown@cahqbank.com")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text("Edit profile")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.blue)
                    }
                }
            }

            Section {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Your plan")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text("CAH QBank Local")
                            .font(.headline)
                        Text(model.libraryStatusDetail)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text("Active")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.green)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(.green.opacity(0.12), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
            }

            Section {
                iOSSettingsToggleRow(
                    systemImage: appearanceMode.systemImage,
                    title: "Dark mode",
                    subtitle: appearanceMode == .dark ? "Dark appearance is enabled across the app." : "Light appearance is enabled across the app.",
                    isOn: darkModeBinding
                )
                iOSSettingsToggleRow(
                    systemImage: "arrow.down.to.line",
                    title: "Download content",
                    subtitle: offlineContent ? "Bundled database is available offline." : "Offline cache is disabled for this device.",
                    isOn: $offlineContent
                )
                iOSSettingsToggleRow(
                    systemImage: "bell",
                    title: "Study reminders",
                    subtitle: notifications ? "Local study reminders are enabled." : "Local study reminders are disabled.",
                    isOn: $notifications
                )
                iOSSettingsToggleRow(
                    systemImage: "rectangle.compress.vertical",
                    title: "Compact cards",
                    subtitle: compactCards ? "Compact card density is enabled." : "Comfortable card density is enabled.",
                    isOn: $compactCards
                )
                iOSSettingsRow(systemImage: "questionmark.circle", title: "Help and support", subtitle: "Get help and contact support.")
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .contentMargins(.bottom, 18, for: .scrollContent)
    }
}

private struct iOSSettingsToggleRow: View {
    let systemImage: String
    let title: String
    let subtitle: String
    @Binding var isOn: Bool

    var body: some View {
        Toggle(isOn: $isOn) {
            HStack(spacing: 12) {
                Image(systemName: systemImage)
                    .frame(width: 28)
                    .foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}

private struct iOSSettingsRow: View {
    let systemImage: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: systemImage)
                .frame(width: 28)
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
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
            .padding(12)
            .frame(minHeight: 52)
            .background(cardBackground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(cardBorder, lineWidth: isSelected || isCorrect ? 1.5 : 1)
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

    private var cardBackground: Color {
        if isCorrect { return .green.opacity(0.1) }
        if isSelected { return .blue.opacity(0.1) }
        return Color(.secondarySystemGroupedBackground)
    }

    private var cardBorder: Color {
        if isCorrect { return .green }
        if isSelected { return .blue }
        return Color(.separator).opacity(0.5)
    }
}

private struct iOSResultSummary: View {
    let result: AnswerResult

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(result.isCorrect ? "Correct! Well done" : "Incorrect", systemImage: result.isCorrect ? "checkmark.circle.fill" : "xmark.circle.fill")
                .font(.headline)
                .foregroundStyle(result.isCorrect ? .green : .red)

            if let correctKey = result.correctKey {
                Text("Correct answer: \(correctKey)\(result.correctText.map { ". \($0)" } ?? "")")
                    .font(.subheadline.weight(.semibold))
            }

            if let explanation = result.explanation, !explanation.isEmpty {
                Text(explanation)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
                HStack {
                    Text("View explanation")
                        .font(.caption.weight(.semibold))
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                }
                .foregroundStyle(.blue)
            }
        }
        .padding(12)
        .background(result.isCorrect ? Color.green.opacity(0.1) : Color.red.opacity(0.1), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(result.isCorrect ? Color.green.opacity(0.25) : Color.red.opacity(0.25), lineWidth: 1)
        }
    }
}

private struct iOSSessionSummaryCard: View {
    let total: Int
    let correct: Int
    let incorrect: Int
    let unanswered: Int

    private var percentage: Int {
        guard total > 0 else { return 0 }
        return Int((Double(correct) / Double(total) * 100).rounded())
    }

    var body: some View {
        VStack(spacing: 14) {
            ZStack {
                Circle()
                    .stroke(Color.blue.opacity(0.15), lineWidth: 10)
                Circle()
                    .trim(from: 0, to: CGFloat(percentage) / 100)
                    .stroke(Color.blue, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                VStack(spacing: 2) {
                    Text("\(percentage)%")
                        .font(.title.bold())
                    Text("\(correct) of \(total) correct")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(width: 128, height: 128)

            HStack {
                iOSSummaryStat(value: total, label: "Total")
                iOSSummaryStat(value: correct, label: "Correct")
                iOSSummaryStat(value: incorrect, label: "Incorrect")
                iOSSummaryStat(value: unanswered, label: "Unanswered")
            }

            Button {
            } label: {
                Label("Review incorrect (\(incorrect))", systemImage: "play.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity)
    }
}

private struct iOSSummaryStat: View {
    let value: Int
    let label: String

    var body: some View {
        VStack(spacing: 3) {
            Text("\(value)")
                .font(.headline)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
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
