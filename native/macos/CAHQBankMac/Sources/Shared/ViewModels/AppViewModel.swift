import Foundation

protocol QBankServiceProviding {
    func connectedService(configuration: RepoLinkConfiguration) throws -> QBankService
}

struct LocalRepoQBankServiceProvider: QBankServiceProviding {
    func connectedService(configuration: RepoLinkConfiguration) throws -> QBankService {
        try QBankService.connectedToLocalRepo(configuration: configuration)
    }
}

@MainActor
final class AppViewModel: ObservableObject {
    private static let preferredRepoRootDefaultsKey = "preferredRepoRootPath"
    private static let emptyBrowseSnapshot = BrowseSnapshot(page: 1, total: 0, pageCount: 1, questions: [], tagOptions: [])

    enum NavigationSection: String, CaseIterable, Identifiable {
        case dashboard
        case browse
        case practice
        case progress

        var id: String { rawValue }
    }

    @Published var selection: NavigationSection? = .dashboard
    @Published var dashboard: DashboardSnapshot?
    @Published var browseSnapshot = BrowseSnapshot(page: 1, total: 0, pageCount: 1, questions: [], tagOptions: [])
    @Published var progressRows: [ProgressRow] = []
    @Published var practiceTags: [PracticeTagSummary] = []
    @Published var selectedQuestion: QBankQuestion?
    @Published var selectedQuestionID: String?
    @Published var activeSession: SessionSnapshot?
    @Published var errorMessage: String?
    @Published var infoMessage = "Resolving local repo link…"
    @Published var isLoading = false
    @Published var isSyncing = false
    @Published var repoRootPath = ""
    @Published var preferredRepoRootPath: String?
    @Published var browseSearch = ""
    @Published var browseCurriculum = ""
    @Published var browseTag = ""
    @Published var practiceTagID = ""
    @Published var practiceQuestionCount = 20

    private let userDefaults: UserDefaults
    private let serviceProvider: QBankServiceProviding
    private var service: QBankService?
    private var bootstrapped = false
    private var loadingOperationCount = 0 {
        didSet { isLoading = loadingOperationCount > 0 }
    }
    private var syncOperationCount = 0 {
        didSet { isSyncing = syncOperationCount > 0 }
    }
    private var bootstrapGeneration = 0
    private var browseLoadGeneration = 0
    private var questionSelectionGeneration = 0

    init(
        userDefaults: UserDefaults = .standard,
        serviceProvider: QBankServiceProviding = LocalRepoQBankServiceProvider()
    ) {
        self.userDefaults = userDefaults
        self.serviceProvider = serviceProvider
        preferredRepoRootPath = userDefaults.string(forKey: Self.preferredRepoRootDefaultsKey)
    }

    var hasLinkedRepo: Bool {
        service != nil && !repoRootPath.isEmpty
    }

    var hasPreferredRepoRoot: Bool {
        guard let preferredRepoRootPath else { return false }
        return !preferredRepoRootPath.isEmpty
    }

    var isBusy: Bool {
        isLoading || isSyncing
    }

    var curriculumOptions: [String] {
        Curriculum.allCases.map(\.rawValue)
    }

    var repoStatusDetail: String {
        if let preferredRepoRootPath, !preferredRepoRootPath.isEmpty {
            if !hasLinkedRepo {
                return "Pinned repo unavailable: \(preferredRepoRootPath)"
            }
            return "Pinned repo: \(preferredRepoRootPath)"
        }
        if !repoRootPath.isEmpty {
            return "Auto-detected repo: \(repoRootPath)"
        }
        return "No repo selected"
    }

    func selectSection(_ section: NavigationSection) {
        selection = section
    }

    func clearError() {
        errorMessage = nil
    }

    func setPreferredRepoRoot(_ url: URL) async {
        let standardizedPath = url.standardizedFileURL.path
        preferredRepoRootPath = standardizedPath
        userDefaults.set(standardizedPath, forKey: Self.preferredRepoRootDefaultsKey)
        await bootstrap(forceSync: true)
    }

    func resetPreferredRepoRoot() async {
        preferredRepoRootPath = nil
        userDefaults.removeObject(forKey: Self.preferredRepoRootDefaultsKey)
        await bootstrap(forceSync: true)
    }

    func bootstrapIfNeeded() async {
        guard !bootstrapped else { return }
        bootstrapped = true
        await bootstrap(forceSync: false)
    }

    func syncNow() async {
        await bootstrap(forceSync: true)
    }

    func loadBrowse(page: Int? = nil) async {
        guard let service else { return }
        browseLoadGeneration += 1
        let generation = browseLoadGeneration
        beginLoading()
        defer { endLoading() }
        do {
            let snapshot = try await fetchBrowseSnapshot(using: service, page: page ?? browseSnapshot.page)
            guard generation == browseLoadGeneration else { return }
            browseSnapshot = snapshot
            if let selectedQuestionID,
               let refreshed = snapshot.questions.first(where: { $0.id == selectedQuestionID }) {
                selectedQuestion = refreshed
            } else {
                selectedQuestion = snapshot.questions.first
                selectedQuestionID = snapshot.questions.first?.id
            }
            errorMessage = nil
        } catch {
            guard generation == browseLoadGeneration else { return }
            errorMessage = error.localizedDescription
        }
    }

    func selectQuestion(id: String?) async {
        questionSelectionGeneration += 1
        let generation = questionSelectionGeneration
        selectedQuestionID = id
        guard let id, let service else {
            selectedQuestion = nil
            return
        }
        beginLoading()
        defer { endLoading() }
        do {
            let question = try await service.fetchQuestionDetail(id: id)
            guard generation == questionSelectionGeneration, selectedQuestionID == id else { return }
            selectedQuestion = question
            errorMessage = nil
        } catch {
            guard generation == questionSelectionGeneration else { return }
            errorMessage = error.localizedDescription
        }
    }

    func toggleFlagForSelectedQuestion() async {
        guard let selectedQuestion else { return }
        await toggleFlag(questionID: selectedQuestion.id)
    }

    func saveNoteForSelectedQuestion(_ note: String) async {
        guard let selectedQuestion else { return }
        await saveNote(questionID: selectedQuestion.id, note: note)
    }

    func startPractice() async {
        guard let service else { return }
        beginLoading()
        defer { endLoading() }
        do {
            let sessionID = try await service.startSession(
                tagID: practiceTagID.isEmpty ? nil : practiceTagID,
                questionCount: practiceQuestionCount
            )
            activeSession = try await service.fetchSession(id: sessionID)
            selection = .practice
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func submitAnswer(questionID: String, selectedKey: String) async -> AnswerResult? {
        guard let service, let activeSession else { return nil }
        beginLoading()
        defer { endLoading() }
        do {
            let result = try await service.answer(sessionID: activeSession.id, questionID: questionID, selectedKey: selectedKey)
            let refreshedSession = try await service.fetchSession(id: activeSession.id)
            let refreshedQuestion = try await service.fetchQuestionDetail(id: questionID)
            self.activeSession = refreshedSession
            if let refreshedQuestion {
                replaceQuestion(refreshedQuestion)
            } else if selectedQuestionID == questionID {
                selectedQuestion = nil
            }
            await refreshDashboardAndProgress()
            return result
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func toggleFlag(questionID: String) async {
        guard let service else { return }
        beginLoading()
        defer { endLoading() }
        do {
            let flagged = try await service.toggleFlag(questionID: questionID)
            applyQuestionMutation(questionID: questionID, flagged: flagged, noteMarkdown: nil)
            await refreshDashboard()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func saveNote(questionID: String, note: String) async {
        guard let service else { return }
        beginLoading()
        defer { endLoading() }
        do {
            let savedNote = try await service.saveNote(questionID: questionID, noteMarkdown: note)
            applyQuestionMutation(questionID: questionID, flagged: nil, noteMarkdown: savedNote)
            await refreshDashboard()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func finishSession() async {
        guard let service, let activeSession else { return }
        beginLoading()
        defer { endLoading() }
        do {
            try await service.endSession(id: activeSession.id)
            self.activeSession = try await service.fetchSession(id: activeSession.id)
            await refreshDashboardAndProgress()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func reopenSession(id: String) async {
        guard let service else { return }
        beginLoading()
        defer { endLoading() }
        do {
            activeSession = try await service.fetchSession(id: id)
            guard activeSession != nil else {
                errorMessage = QBankServiceError.sessionNotFound.localizedDescription
                return
            }
            selection = .practice
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func bootstrap(forceSync: Bool) async {
        bootstrapGeneration += 1
        browseLoadGeneration += 1
        questionSelectionGeneration += 1
        let generation = bootstrapGeneration
        let existingSessionID = activeSession?.id
        let preferredQuestionID = selectedQuestionID
        let preferredBrowsePage = browseSnapshot.page

        beginLoading(sync: forceSync)
        defer {
            endLoading(sync: forceSync)
        }

        do {
            let explicitRepoRootURL = preferredRepoRootPath.flatMap { path in
                URL(fileURLWithPath: path, isDirectory: true)
            }
            let service = try serviceProvider.connectedService(
                configuration: RepoLinkConfiguration(explicitRepoRootURL: explicitRepoRootURL)
            )
            let resolvedRepoRootPath = await service.repoRootPath()
            let report = try await service.syncIfNeeded(force: forceSync)
            let dashboard = try await service.fetchDashboard()
            let practiceTags = try await service.fetchPracticeTags()
            let progressRows = try await service.fetchProgress()
            let browseSnapshot = try await fetchBrowseSnapshot(using: service, page: preferredBrowsePage)
            let refreshedSession: SessionSnapshot?
            if let existingSessionID {
                refreshedSession = try await service.fetchSession(id: existingSessionID)
            } else {
                refreshedSession = nil
            }
            let refreshedSelectedQuestion: QBankQuestion?
            if let preferredQuestionID {
                refreshedSelectedQuestion = try await service.fetchQuestionDetail(id: preferredQuestionID)
            } else {
                refreshedSelectedQuestion = nil
            }
            guard generation == bootstrapGeneration else { return }

            self.service = service
            repoRootPath = resolvedRepoRootPath
            self.dashboard = dashboard
            self.practiceTags = practiceTags
            self.progressRows = progressRows
            self.activeSession = refreshedSession
            let selectedQuestionWasCleared = applyBrowseState(
                browseSnapshot,
                preferredQuestionID: preferredQuestionID,
                preferredQuestion: refreshedSelectedQuestion
            )
            let sessionWasCleared = existingSessionID != nil && refreshedSession == nil

            errorMessage = nil
            infoMessage = makeRepoLinkedMessage(
                report: report,
                forceSync: forceSync,
                sessionWasCleared: sessionWasCleared,
                selectedQuestionWasCleared: selectedQuestionWasCleared
            )
        } catch {
            guard generation == bootstrapGeneration else { return }
            clearLinkedState()
            errorMessage = error.localizedDescription
            infoMessage = makeRepoLinkFailureMessage()
        }
    }

    private func refreshDashboard() async {
        guard let service else { return }
        do {
            dashboard = try await service.fetchDashboard()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func refreshDashboardAndProgress() async {
        guard let service else { return }
        do {
            dashboard = try await service.fetchDashboard()
            progressRows = try await service.fetchProgress()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func applyQuestionMutation(questionID: String, flagged: Bool?, noteMarkdown: String?) {
        if let selectedQuestion, selectedQuestion.id == questionID {
            self.selectedQuestion = updating(selectedQuestion, flagged: flagged, noteMarkdown: noteMarkdown)
        }

        browseSnapshot = BrowseSnapshot(
            page: browseSnapshot.page,
            total: browseSnapshot.total,
            pageCount: browseSnapshot.pageCount,
            questions: browseSnapshot.questions.map { question in
                guard question.id == questionID else { return question }
                return updating(question, flagged: flagged, noteMarkdown: noteMarkdown)
            },
            tagOptions: browseSnapshot.tagOptions
        )

        if let activeSession {
            self.activeSession = SessionSnapshot(
                id: activeSession.id,
                mode: activeSession.mode,
                currentIndex: activeSession.currentIndex,
                createdAt: activeSession.createdAt,
                completedAt: activeSession.completedAt,
                questions: activeSession.questions.map { question in
                    guard question.id == questionID else { return question }
                    return updating(question, flagged: flagged, noteMarkdown: noteMarkdown)
                },
                answeredByQuestion: activeSession.answeredByQuestion
            )
        }
    }

    private func beginLoading(sync: Bool = false) {
        loadingOperationCount += 1
        if sync {
            syncOperationCount += 1
        }
    }

    private func endLoading(sync: Bool = false) {
        loadingOperationCount = max(0, loadingOperationCount - 1)
        if sync {
            syncOperationCount = max(0, syncOperationCount - 1)
        }
    }

    private func fetchBrowseSnapshot(using service: QBankService, page: Int) async throws -> BrowseSnapshot {
        let requestedSnapshot = try await service.fetchBrowse(
            search: browseSearch.isEmpty ? nil : browseSearch,
            curriculum: browseCurriculum.isEmpty ? nil : browseCurriculum,
            tag: browseTag.isEmpty ? nil : browseTag,
            page: page
        )
        guard requestedSnapshot.total > 0,
              requestedSnapshot.questions.isEmpty,
              requestedSnapshot.page > requestedSnapshot.pageCount else {
            return requestedSnapshot
        }

        return try await service.fetchBrowse(
            search: browseSearch.isEmpty ? nil : browseSearch,
            curriculum: browseCurriculum.isEmpty ? nil : browseCurriculum,
            tag: browseTag.isEmpty ? nil : browseTag,
            page: requestedSnapshot.pageCount
        )
    }

    private func applyBrowseState(
        _ snapshot: BrowseSnapshot,
        preferredQuestionID: String?,
        preferredQuestion: QBankQuestion?
    ) -> Bool {
        browseSnapshot = snapshot

        if let preferredQuestionID, let preferredQuestion {
            selectedQuestionID = preferredQuestionID
            selectedQuestion = preferredQuestion
            return false
        }

        if let preferredQuestionID,
           let questionOnPage = snapshot.questions.first(where: { $0.id == preferredQuestionID }) {
            selectedQuestionID = preferredQuestionID
            selectedQuestion = questionOnPage
            return false
        }

        let fallbackQuestion = snapshot.questions.first
        selectedQuestionID = fallbackQuestion?.id
        selectedQuestion = fallbackQuestion
        return preferredQuestionID != nil && fallbackQuestion?.id != preferredQuestionID
    }

    private func clearLinkedState() {
        service = nil
        dashboard = nil
        browseSnapshot = Self.emptyBrowseSnapshot
        progressRows = []
        practiceTags = []
        selectedQuestion = nil
        selectedQuestionID = nil
        activeSession = nil
        repoRootPath = ""
    }

    private func makeRepoLinkedMessage(
        report: RepoSyncReport,
        forceSync: Bool,
        sessionWasCleared: Bool,
        selectedQuestionWasCleared: Bool
    ) -> String {
        let action = forceSync ? "Synced" : "Loaded"
        var message = "\(action) \(report.questionCount) questions and \(report.tagCount) tags"
        message += hasPreferredRepoRoot ? " from selected repo" : " from auto-detected repo"
        if sessionWasCleared {
            message += " · active session cleared after content sync"
        }
        if selectedQuestionWasCleared {
            message += " · selected question no longer available"
        }
        return message
    }

    private func makeRepoLinkFailureMessage() -> String {
        if let preferredRepoRootPath, !preferredRepoRootPath.isEmpty {
            return "Selected repo unavailable at \(preferredRepoRootPath)"
        }
        return "Unable to link a local repo automatically"
    }

    private func replaceQuestion(_ question: QBankQuestion) {
        if selectedQuestionID == question.id {
            selectedQuestion = question
        }

        browseSnapshot = BrowseSnapshot(
            page: browseSnapshot.page,
            total: browseSnapshot.total,
            pageCount: browseSnapshot.pageCount,
            questions: browseSnapshot.questions.map { existingQuestion in
                existingQuestion.id == question.id ? question : existingQuestion
            },
            tagOptions: browseSnapshot.tagOptions
        )

        if let activeSession {
            self.activeSession = SessionSnapshot(
                id: activeSession.id,
                mode: activeSession.mode,
                currentIndex: activeSession.currentIndex,
                createdAt: activeSession.createdAt,
                completedAt: activeSession.completedAt,
                questions: activeSession.questions.map { existingQuestion in
                    existingQuestion.id == question.id ? question : existingQuestion
                },
                answeredByQuestion: activeSession.answeredByQuestion
            )
        }
    }

    private func updating(_ question: QBankQuestion, flagged: Bool?, noteMarkdown: String?) -> QBankQuestion {
        QBankQuestion(
            id: question.id,
            stem: question.stem,
            questionType: question.questionType,
            options: question.options,
            explanation: question.explanation,
            citations: question.citations,
            rationale: question.rationale,
            optionExplanations: question.optionExplanations,
            curriculum: question.curriculum,
            createdBy: question.createdBy,
            createdAt: question.createdAt,
            difficulty: question.difficulty,
            ausScore: question.ausScore,
            moduleCode: question.moduleCode,
            sourceFingerprint: question.sourceFingerprint,
            sourceJSON: question.sourceJSON,
            isAnswerable: question.isAnswerable,
            correctKey: question.correctKey,
            tags: question.tags,
            flagged: flagged ?? question.flagged,
            noteMarkdown: noteMarkdown ?? question.noteMarkdown,
            attemptCount: question.attemptCount,
            correctCount: question.correctCount
        )
    }
}
