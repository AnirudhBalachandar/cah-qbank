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
        XCTAssertTrue(model.infoMessage.contains("selected repo"))
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
        XCTAssertEqual(model.infoMessage, "Selected repo unavailable at \(invalidRoot.standardizedFileURL.path)")
        XCTAssertEqual(model.errorMessage, RepoStoreError.invalidConfiguredRepoRoot(invalidRoot.standardizedFileURL.path).localizedDescription)
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
