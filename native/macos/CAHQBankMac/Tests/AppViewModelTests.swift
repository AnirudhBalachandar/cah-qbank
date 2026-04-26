import Foundation
import XCTest
@testable import CAHQBankMac

@MainActor
final class AppViewModelTests: XCTestCase {
    func testAppViewModelUsesInjectedServiceProvider() async throws {
        let repo = try TemporaryRepo(questions: [
            fixtureQuestion(id: "q-1")
        ])
        defer { try? repo.cleanup() }

        let provider = try SpyServiceProvider(context: repo.context)
        let defaults = makeIsolatedUserDefaults()
        let model = AppViewModel(userDefaults: defaults, serviceProvider: provider)

        await model.setPreferredRepoRoot(repo.rootURL)

        XCTAssertTrue(model.hasLinkedRepo)
        XCTAssertEqual(provider.configurations.count, 1)
        XCTAssertEqual(provider.configurations.first?.explicitRepoRootURL?.path, repo.rootURL.standardizedFileURL.path)
    }

    func testSetPreferredRepoRootLoadsPinnedRepoState() async throws {
        let repo = try TemporaryRepo(questions: [
            fixtureQuestion(id: "q-1", tags: ["general-paediatrics", "respiratory"])
        ])
        defer { try? repo.cleanup() }

        let defaults = makeIsolatedUserDefaults()
        let model = AppViewModel(userDefaults: defaults)

        await model.setPreferredRepoRoot(repo.rootURL)

        XCTAssertTrue(model.hasLinkedRepo)
        XCTAssertEqual(model.repoRootPath, repo.rootURL.standardizedFileURL.path)
        XCTAssertEqual(model.preferredRepoRootPath, repo.rootURL.standardizedFileURL.path)
        XCTAssertEqual(model.dashboard?.publishedCount, 1)
        XCTAssertEqual(model.repoStatusDetail, "Pinned repo: \(repo.rootURL.standardizedFileURL.path)")
        XCTAssertEqual(model.libraryStatusDetail, "1 practice-ready questions from 1 published questions")
        XCTAssertTrue(model.infoMessage.contains("local question library"))
        XCTAssertNil(model.errorMessage)
    }

    func testInvalidPreferredRepoRootReportsUnavailablePinnedRepo() async throws {
        let invalidRoot = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: invalidRoot, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: invalidRoot) }

        let defaults = makeIsolatedUserDefaults()
        let model = AppViewModel(userDefaults: defaults)

        await model.setPreferredRepoRoot(invalidRoot)

        XCTAssertFalse(model.hasLinkedRepo)
        XCTAssertEqual(model.repoRootPath, "")
        XCTAssertEqual(model.repoStatusDetail, "Pinned repo unavailable: \(invalidRoot.standardizedFileURL.path)")
        XCTAssertEqual(model.infoMessage, "Unable to load the local question library")
        XCTAssertEqual(model.errorMessage, RepoStoreError.invalidConfiguredRepoRoot(invalidRoot.standardizedFileURL.path).localizedDescription)
    }

    func testBundledDatabaseProviderBootstrapsStandaloneLibrary() async throws {
        let storageName = "CAHQBankMacTests-\(UUID().uuidString)"
        let storageRoot = try XCTUnwrap(
            FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
        ).appendingPathComponent(storageName, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: storageRoot) }

        let defaults = makeIsolatedUserDefaults()
        let model = AppViewModel(
            userDefaults: defaults,
            serviceProvider: BundledDatabaseQBankServiceProvider(storageDirectoryName: storageName)
        )

        await model.bootstrapIfNeeded()

        XCTAssertTrue(model.hasLoadedLibrary)
        XCTAssertEqual(model.dashboard?.publishedCount, 3_060)
        XCTAssertEqual(model.dashboard?.answerableCount, 3_056)
        XCTAssertEqual(model.libraryStatusDetail, "3056 practice-ready questions from 3060 published questions")
        XCTAssertTrue(FileManager.default.fileExists(atPath: storageRoot.appendingPathComponent("cah.db").path))
        XCTAssertNil(model.errorMessage)
    }

    func testBundledDatabaseProviderRefreshesStaleLocalContentAndPreservesUserData() async throws {
        let fileManager = FileManager.default
        let storageName = "CAHQBankMacMigrationTests-\(UUID().uuidString)"
        let storageRoot = try XCTUnwrap(
            fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
        ).appendingPathComponent(storageName, isDirectory: true)
        let databaseURL = storageRoot.appendingPathComponent("cah.db")
        let bundleRoot = fileManager.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        let bundledDatabaseURL = bundleRoot.appendingPathComponent("bundled-cah.db")
        defer {
            try? fileManager.removeItem(at: storageRoot)
            try? fileManager.removeItem(at: bundleRoot)
        }

        try fileManager.createDirectory(at: storageRoot, withIntermediateDirectories: true)
        try fileManager.createDirectory(at: bundleRoot, withIntermediateDirectories: true)
        try writeProjectedDatabase(
            at: databaseURL,
            questions: [
                fixtureQuestion(id: "q-1", stem: "Old bundled question"),
            ]
        )
        try writeProjectedDatabase(
            at: bundledDatabaseURL,
            questions: [
                fixtureQuestion(id: "q-1", stem: "Updated bundled question"),
                fixtureQuestion(id: "q-2", stem: "New bundled question", createdAt: Date(timeIntervalSince1970: 1_700_000_100)),
            ]
        )

        let database = try SQLiteDatabase(path: databaseURL.path)
        try database.execute(
            """
            INSERT INTO PracticeSession (id, mode, questionIds, currentIndex, createdAt, completedAt)
            VALUES ('session-1', 'revision', '["q-1"]', 1, ?, NULL);
            """,
            bindings: [.text(QuestionFileCodec.formatDate(Date(timeIntervalSince1970: 1_700_001_000)))]
        )
        try database.execute(
            """
            INSERT INTO Attempt (id, questionId, sessionId, selectedKey, isCorrect, timeSpentMs, confidence, createdAt)
            VALUES ('attempt-1', 'q-1', 'session-1', 'B', 1, 12000, 4, ?);
            """,
            bindings: [.text(QuestionFileCodec.formatDate(Date(timeIntervalSince1970: 1_700_001_030)))]
        )
        try database.execute(
            """
            INSERT INTO Flag (questionId, createdAt)
            VALUES ('q-1', ?);
            """,
            bindings: [.text(QuestionFileCodec.formatDate(Date(timeIntervalSince1970: 1_700_001_040)))]
        )
        try database.execute(
            """
            INSERT INTO UserNote (questionId, noteMarkdown, updatedAt)
            VALUES ('q-1', 'Keep this note', ?);
            """,
            bindings: [.text(QuestionFileCodec.formatDate(Date(timeIntervalSince1970: 1_700_001_050)))]
        )
        try database.execute(
            """
            INSERT INTO TagMastery (tagId, elo, attemptCount, correctCount, updatedAt)
            VALUES ('general-paediatrics', 1110, 1, 1, ?);
            """,
            bindings: [.text(QuestionFileCodec.formatDate(Date(timeIntervalSince1970: 1_700_001_060)))]
        )

        let provider = BundledDatabaseQBankServiceProvider(
            storageDirectoryName: storageName,
            bundledDatabaseURL: bundledDatabaseURL,
            bundledContentVersion: "2"
        )
        let service = try provider.connectedService(configuration: RepoLinkConfiguration())
        _ = try await service.syncIfNeeded(force: true)

        let dashboard = try await service.fetchDashboard()
        let migratedDatabase = try SQLiteDatabase(path: databaseURL.path)
        let questionRows = try migratedDatabase.query("SELECT id, stem FROM Question ORDER BY id;")
        let sessionRows = try migratedDatabase.query("SELECT id FROM PracticeSession;")
        let attemptRows = try migratedDatabase.query("SELECT id, timeSpentMs, confidence FROM Attempt;")
        let flagRows = try migratedDatabase.query("SELECT questionId FROM Flag;")
        let noteRows = try migratedDatabase.query("SELECT noteMarkdown FROM UserNote;")
        let masteryRows = try migratedDatabase.query("SELECT tagId, elo, attemptCount, correctCount FROM TagMastery;")
        let metadataRows = try migratedDatabase.query(
            "SELECT value FROM LibraryMetadata WHERE key = 'bundledContentVersion';"
        )

        XCTAssertEqual(dashboard.publishedCount, 2)
        XCTAssertEqual(dashboard.answerableCount, 2)
        XCTAssertEqual(dashboard.flaggedCount, 1)
        XCTAssertEqual(dashboard.noteCount, 1)
        XCTAssertEqual(try questionRows.map { try $0.string("id") }, ["q-1", "q-2"])
        XCTAssertEqual(try questionRows.first?.string("stem"), "Updated bundled question")
        XCTAssertEqual(try sessionRows.first?.string("id"), "session-1")
        XCTAssertEqual(try attemptRows.first?.string("id"), "attempt-1")
        XCTAssertEqual(try attemptRows.first?.int("timeSpentMs"), 12000)
        XCTAssertEqual(try attemptRows.first?.int("confidence"), 4)
        XCTAssertEqual(try flagRows.first?.string("questionId"), "q-1")
        XCTAssertEqual(try noteRows.first?.string("noteMarkdown"), "Keep this note")
        XCTAssertEqual(try masteryRows.first?.string("tagId"), "general-paediatrics")
        XCTAssertEqual(try masteryRows.first?.double("elo"), 1110)
        XCTAssertEqual(try masteryRows.first?.int("attemptCount"), 1)
        XCTAssertEqual(try masteryRows.first?.int("correctCount"), 1)
        XCTAssertEqual(try metadataRows.first?.string("value"), "2")
    }

    func testBundledDatabaseProviderReportsMissingBundledDatabase() throws {
        let provider = BundledDatabaseQBankServiceProvider(
            bundle: Bundle(for: AppViewModelTests.self),
            storageDirectoryName: "MissingBundledDatabase-\(UUID().uuidString)"
        )

        XCTAssertThrowsError(try provider.connectedService(configuration: RepoLinkConfiguration())) { error in
            XCTAssertEqual(error.localizedDescription, BundledDatabaseBootstrapError.missingBundledDatabase.localizedDescription)
        }
    }

    func testSyncNowPreservesBrowseFiltersAndSelectedQuestion() async throws {
        let repo = try TemporaryRepo(questions: [
            fixtureQuestion(id: "q-keep", stem: "Keep this question"),
            fixtureQuestion(id: "q-other", stem: "Another question"),
        ])
        defer { try? repo.cleanup() }

        let defaults = makeIsolatedUserDefaults()
        let model = AppViewModel(userDefaults: defaults)

        await model.setPreferredRepoRoot(repo.rootURL)
        model.browseSearch = "Keep"
        await model.loadBrowse(page: 1)
        await model.selectQuestion(id: "q-keep")

        XCTAssertEqual(model.browseSnapshot.questions.map(\.id), ["q-keep"])
        XCTAssertEqual(model.selectedQuestion?.id, "q-keep")

        await model.syncNow()

        XCTAssertEqual(model.browseSearch, "Keep")
        XCTAssertEqual(model.browseSnapshot.questions.map(\.id), ["q-keep"])
        XCTAssertEqual(model.selectedQuestionID, "q-keep")
        XCTAssertEqual(model.selectedQuestion?.id, "q-keep")
        XCTAssertNil(model.errorMessage)
    }

    func testSyncNowFallsBackWhenSelectedQuestionDisappears() async throws {
        let repo = try TemporaryRepo(questions: [
            fixtureQuestion(id: "q-1"),
            fixtureQuestion(id: "q-2"),
        ])
        defer { try? repo.cleanup() }

        let defaults = makeIsolatedUserDefaults()
        let model = AppViewModel(userDefaults: defaults)

        await model.setPreferredRepoRoot(repo.rootURL)
        await model.selectQuestion(id: "q-2")

        try FileManager.default.removeItem(at: repo.rootURL.appendingPathComponent("questions/q-2.json"))

        await model.syncNow()

        XCTAssertEqual(model.selectedQuestionID, "q-1")
        XCTAssertEqual(model.selectedQuestion?.id, "q-1")
        XCTAssertTrue(model.infoMessage.contains("selected question no longer available"))
        XCTAssertNil(model.errorMessage)
    }

    func testSubmitAnswerRefreshesSelectedBrowseAndSessionState() async throws {
        let repo = try TemporaryRepo(questions: [
            fixtureQuestion(id: "q-1", stem: "Answer me")
        ])
        defer { try? repo.cleanup() }

        let defaults = makeIsolatedUserDefaults()
        let model = AppViewModel(userDefaults: defaults)

        await model.setPreferredRepoRoot(repo.rootURL)
        await model.startPractice()

        let result = await model.submitAnswer(questionID: "q-1", selectedKey: "B")

        XCTAssertNotNil(result)
        XCTAssertEqual(model.activeSession?.answeredByQuestion["q-1"]?.selectedKey, "B")
        XCTAssertEqual(model.selectedQuestion?.attemptCount, 1)
        XCTAssertEqual(model.selectedQuestion?.correctCount, 1)
        XCTAssertEqual(model.browseSnapshot.questions.first?.attemptCount, 1)
        XCTAssertEqual(model.browseSnapshot.questions.first?.correctCount, 1)
        XCTAssertFalse(model.isBusy)
        XCTAssertNil(model.errorMessage)
    }

    func testPracticeSessionNavigationLocksFutureQuestionsUntilTheyUnlock() async throws {
        let repo = try TemporaryRepo(questions: [
            fixtureQuestion(id: "q-1", createdAt: Date(timeIntervalSince1970: 1_700_000_000)),
            fixtureQuestion(id: "q-2", createdAt: Date(timeIntervalSince1970: 1_700_000_100)),
            fixtureQuestion(id: "q-3", createdAt: Date(timeIntervalSince1970: 1_700_000_200)),
        ])
        defer { try? repo.cleanup() }

        let service = try QBankService(context: repo.context)
        _ = try await service.syncIfNeeded(force: true)

        let sessionID = try await service.startSession(tagID: "general-paediatrics", questionCount: 3)
        let initialSession = try await service.fetchSession(id: sessionID)
        let unwrappedInitialSession = try XCTUnwrap(initialSession)

        XCTAssertEqual(PracticeSessionNavigation.maxUnlockedIndex(for: unwrappedInitialSession), 0)
        XCTAssertTrue(PracticeSessionNavigation.isUnlocked(index: 0, in: unwrappedInitialSession))
        XCTAssertFalse(PracticeSessionNavigation.isUnlocked(index: 1, in: unwrappedInitialSession))
        XCTAssertEqual(PracticeSessionNavigation.clampedIndex(2, for: unwrappedInitialSession), 0)

        _ = try await service.answer(sessionID: sessionID, questionID: "q-1", selectedKey: "B")
        let advancedSession = try await service.fetchSession(id: sessionID)
        let unwrappedAdvancedSession = try XCTUnwrap(advancedSession)

        XCTAssertEqual(PracticeSessionNavigation.maxUnlockedIndex(for: unwrappedAdvancedSession), 1)
        XCTAssertTrue(PracticeSessionNavigation.isUnlocked(index: 1, in: unwrappedAdvancedSession))
        XCTAssertFalse(PracticeSessionNavigation.isUnlocked(index: 2, in: unwrappedAdvancedSession))
        XCTAssertEqual(PracticeSessionNavigation.clampedIndex(2, for: unwrappedAdvancedSession), 1)
    }

    func testPracticeSessionNavigationUnlocksEntireSessionWhenComplete() async throws {
        let repo = try TemporaryRepo(questions: [
            fixtureQuestion(id: "q-1", createdAt: Date(timeIntervalSince1970: 1_700_000_000)),
            fixtureQuestion(id: "q-2", createdAt: Date(timeIntervalSince1970: 1_700_000_100)),
        ])
        defer { try? repo.cleanup() }

        let service = try QBankService(context: repo.context)
        _ = try await service.syncIfNeeded(force: true)

        let sessionID = try await service.startSession(tagID: "general-paediatrics", questionCount: 2)
        _ = try await service.answer(sessionID: sessionID, questionID: "q-1", selectedKey: "B")
        _ = try await service.answer(sessionID: sessionID, questionID: "q-2", selectedKey: "B")
        let completedSession = try await service.fetchSession(id: sessionID)
        let unwrappedCompletedSession = try XCTUnwrap(completedSession)

        XCTAssertEqual(PracticeSessionNavigation.maxUnlockedIndex(for: unwrappedCompletedSession), 1)
        XCTAssertTrue(PracticeSessionNavigation.isUnlocked(index: 1, in: unwrappedCompletedSession))
        XCTAssertEqual(PracticeSessionNavigation.clampedIndex(99, for: unwrappedCompletedSession), 1)
    }

    private func makeIsolatedUserDefaults() -> UserDefaults {
        let suiteName = "AppViewModelTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName) ?? .standard
        defaults.removePersistentDomain(forName: suiteName)
        addTeardownBlock {
            defaults.removePersistentDomain(forName: suiteName)
        }
        return defaults
    }
}

private final class SpyServiceProvider: QBankServiceProviding {
    private let service: QBankService
    var configurations: [RepoLinkConfiguration] = []

    init(context: RepoContext) throws {
        service = try QBankService(context: context)
    }

    func connectedService(configuration: RepoLinkConfiguration) throws -> QBankService {
        configurations.append(configuration)
        return service
    }
}
