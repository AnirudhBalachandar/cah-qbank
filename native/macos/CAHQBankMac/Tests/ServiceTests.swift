import Foundation
import XCTest
@testable import CAHQBankMac

final class ServiceTests: XCTestCase {
    func testConnectedToLocalRepoUsesAppSuppliedExplicitRepoRoot() async throws {
        let repo = try TemporaryRepo(questions: [fixtureQuestion(id: "q-1")])
        defer { try? repo.cleanup() }

        let service = try QBankService.connectedToLocalRepo(
            configuration: RepoLinkConfiguration(
                explicitRepoRootURL: repo.rootURL,
                environment: [:]
            )
        )
        _ = try await service.syncIfNeeded(force: true)

        let dashboard = try await service.fetchDashboard()
        XCTAssertEqual(dashboard.publishedCount, 1)
    }

    func testConnectedToLocalRepoExplicitConfigurationOverridesInvalidEnvironment() async throws {
        let repo = try TemporaryRepo(questions: [fixtureQuestion(id: "q-1")])
        defer { try? repo.cleanup() }

        let invalidRoot = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: invalidRoot, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: invalidRoot) }

        let service = try QBankService.connectedToLocalRepo(
            configuration: RepoLinkConfiguration(
                explicitRepoRootURL: repo.rootURL,
                environment: ["CAH_QBANK_REPO_ROOT": invalidRoot.path]
            )
        )
        _ = try await service.syncIfNeeded(force: true)

        let resolvedRepoRoot = await service.repoRootPath()
        XCTAssertEqual(resolvedRepoRoot, repo.rootURL.standardizedFileURL.path)
    }

    func testQuestionFileCodecParsesLegacyUnixMillisecondTimestampStrings() {
        let parsed = QuestionFileCodec.parseDate("1776918231084")

        guard let parsed else {
            return XCTFail("Expected legacy unix millisecond timestamp to parse")
        }
        XCTAssertEqual(parsed.timeIntervalSince1970, 1_776_918_231.084, accuracy: 0.000_1)
    }

    func testServiceNormalizesLegacyNumericSessionDatesOnStartup() async throws {
        let repo = try TemporaryRepo(questions: [fixtureQuestion(id: "q-1")])
        defer { try? repo.cleanup() }

        let database = try SQLiteDatabase(path: repo.context.databaseURL.path)
        try database.ensureSchema()
        try database.execute(
            """
            INSERT INTO PracticeSession (id, mode, questionIds, currentIndex, createdAt, completedAt)
            VALUES
              ('legacy-latest', 'custom', '[]', 0, 1776918231084, NULL),
              ('legacy-earlier', 'revision', '[]', 0, 1776918074105, NULL),
              ('iso-middle', 'revision', '[]', 0, ?, NULL);
            """,
            bindings: [
                .text("2026-04-22T23:03:50.087Z"),
            ]
        )

        let service = try QBankService(context: repo.context)
        let dashboard = try await service.fetchDashboard()
        let normalizedRows = try database.query(
            """
            SELECT id, createdAt, typeof(createdAt) AS valueType
            FROM PracticeSession
            ORDER BY createdAt DESC;
            """
        )

        XCTAssertEqual(dashboard.recentSessions.map(\.id), ["legacy-latest", "legacy-earlier", "iso-middle"])
        XCTAssertEqual(try normalizedRows.map { try $0.string("valueType") }, ["text", "text", "text"])
        XCTAssertEqual(
            try normalizedRows.map { try $0.string("createdAt") },
            [
                "2026-04-23T04:23:51.084Z",
                "2026-04-23T04:21:14.105Z",
                "2026-04-22T23:03:50.087Z",
            ]
        )
    }

    func testDashboardAnalyticsExposeTrendHeatmapAndCompletionSignals() async throws {
        let repo = try TemporaryRepo(questions: [
            fixtureQuestion(
                id: "q-general-1",
                tags: ["general-paediatrics"],
                curriculum: .generalPaediatrics
            ),
            fixtureQuestion(
                id: "q-general-2",
                tags: ["general-paediatrics"],
                curriculum: .generalPaediatrics,
                createdAt: Date(timeIntervalSince1970: 1_700_000_100)
            ),
            fixtureQuestion(
                id: "q-emergency-1",
                tags: ["emergency-paediatrics"],
                curriculum: .emergencyPaediatrics,
                createdAt: Date(timeIntervalSince1970: 1_700_000_200)
            ),
        ])
        defer { try? repo.cleanup() }

        let service = try QBankService(context: repo.context)
        _ = try await service.syncIfNeeded(force: true)

        let database = try SQLiteDatabase(path: repo.context.databaseURL.path)
        let today = utcDate(daysFromToday: 0, hour: 11, minute: 0)
        let yesterday = utcDate(daysFromToday: -1, hour: 10, minute: 0)
        let twoDaysAgo = utcDate(daysFromToday: -2, hour: 9, minute: 0)

        try database.execute(
            """
            INSERT INTO PracticeSession (id, mode, questionIds, currentIndex, createdAt, completedAt)
            VALUES
              ('session-old', 'revision', '["q-emergency-1"]', 1, ?, ?),
              ('session-mid', 'revision', '["q-general-1"]', 1, ?, ?),
              ('session-new', 'custom', '["q-general-2"]', 1, ?, ?);
            """,
            bindings: [
                .text(QuestionFileCodec.formatDate(twoDaysAgo)),
                .text(QuestionFileCodec.formatDate(twoDaysAgo.addingTimeInterval(30 * 60))),
                .text(QuestionFileCodec.formatDate(yesterday)),
                .text(QuestionFileCodec.formatDate(yesterday.addingTimeInterval(45 * 60))),
                .text(QuestionFileCodec.formatDate(today)),
                .text(QuestionFileCodec.formatDate(today.addingTimeInterval(20 * 60))),
            ]
        )
        try database.execute(
            """
            INSERT INTO Attempt (id, questionId, sessionId, selectedKey, isCorrect, createdAt)
            VALUES
              ('attempt-old', 'q-emergency-1', 'session-old', 'A', 0, ?),
              ('attempt-mid', 'q-general-1', 'session-mid', 'B', 1, ?),
              ('attempt-new', 'q-general-2', 'session-new', 'B', 1, ?);
            """,
            bindings: [
                .text(QuestionFileCodec.formatDate(twoDaysAgo.addingTimeInterval(15 * 60))),
                .text(QuestionFileCodec.formatDate(yesterday.addingTimeInterval(10 * 60))),
                .text(QuestionFileCodec.formatDate(today.addingTimeInterval(5 * 60))),
            ]
        )
        try database.execute(
            """
            INSERT INTO Flag (questionId, createdAt)
            VALUES ('q-general-1', ?);
            """,
            bindings: [.text(QuestionFileCodec.formatDate(today))]
        )
        try database.execute(
            """
            INSERT INTO UserNote (questionId, noteMarkdown, updatedAt)
            VALUES ('q-general-2', 'Review this explanation', ?);
            """,
            bindings: [.text(QuestionFileCodec.formatDate(today))]
        )
        try database.execute(
            """
            INSERT INTO TagMastery (tagId, elo, attemptCount, correctCount, updatedAt)
            VALUES
              ('general-paediatrics', 1120, 2, 2, ?),
              ('emergency-paediatrics', 1080, 1, 0, ?);
            """,
            bindings: [
                .text(QuestionFileCodec.formatDate(today)),
                .text(QuestionFileCodec.formatDate(today)),
            ]
        )

        let dashboard = try await service.fetchDashboard()
        let todayStart = utcStartOfDay(today)
        let yesterdayStart = utcStartOfDay(yesterday)
        let twoDaysAgoStart = utcStartOfDay(twoDaysAgo)
        let generalDistribution = try XCTUnwrap(dashboard.topicDistribution.first)
        let emergencyDistribution = try XCTUnwrap(dashboard.topicDistribution.dropFirst().first)
        let oldestSessionBar = try XCTUnwrap(dashboard.sessionsBarData.first)
        let middleSessionBar = try XCTUnwrap(dashboard.sessionsBarData.dropFirst().first)
        let newestSessionBar = try XCTUnwrap(dashboard.sessionsBarData.last)
        let todayTrend = try XCTUnwrap(dashboard.trendData.first(where: { $0.date == todayStart }))
        let yesterdayTrend = try XCTUnwrap(dashboard.trendData.first(where: { $0.date == yesterdayStart }))
        let twoDaysAgoTrend = try XCTUnwrap(dashboard.trendData.first(where: { $0.date == twoDaysAgoStart }))
        let todayScore = try XCTUnwrap(todayTrend.score)
        let yesterdayScore = try XCTUnwrap(yesterdayTrend.score)
        let twoDaysAgoScore = try XCTUnwrap(twoDaysAgoTrend.score)

        XCTAssertEqual(dashboard.publishedCount, 3)
        XCTAssertEqual(dashboard.answerableCount, 3)
        XCTAssertEqual(dashboard.flaggedCount, 1)
        XCTAssertEqual(dashboard.noteCount, 1)
        XCTAssertEqual(dashboard.accuracyPercent, 66.7, accuracy: 0.01)
        XCTAssertEqual(dashboard.totalTimeSpentMs, 95 * 60 * 1000)
        XCTAssertEqual(dashboard.currentStreak, 2)
        XCTAssertEqual(dashboard.modulesCompleted, 1)
        XCTAssertEqual(dashboard.topicDistribution.map(\.topic), [
            Curriculum.generalPaediatrics.rawValue,
            Curriculum.emergencyPaediatrics.rawValue,
        ])
        XCTAssertEqual(dashboard.topicDistribution.map(\.count), [2, 1])
        XCTAssertEqual(generalDistribution.percentage, 66.7, accuracy: 0.01)
        XCTAssertEqual(emergencyDistribution.percentage, 33.3, accuracy: 0.01)
        XCTAssertEqual(dashboard.recentSessions.map(\.id), ["session-new", "session-mid", "session-old"])
        XCTAssertEqual(dashboard.sessionsBarData.map(\.id), ["session-old", "session-mid", "session-new"])
        XCTAssertEqual(oldestSessionBar.score, 0, accuracy: 0.01)
        XCTAssertEqual(middleSessionBar.score, 100, accuracy: 0.01)
        XCTAssertEqual(newestSessionBar.score, 100, accuracy: 0.01)
        XCTAssertEqual(dashboard.trendData.count, 30)
        XCTAssertEqual(dashboard.heatmapData.count, 56)
        XCTAssertEqual(todayTrend.attempts, 1)
        XCTAssertEqual(todayScore, 100, accuracy: 0.01)
        XCTAssertEqual(yesterdayScore, 100, accuracy: 0.01)
        XCTAssertEqual(twoDaysAgoScore, 0, accuracy: 0.01)
        XCTAssertEqual(dashboard.heatmapData.first(where: { $0.date == todayStart })?.value, 1)
        XCTAssertEqual(dashboard.heatmapData.first(where: { $0.date == yesterdayStart })?.value, 1)
        XCTAssertEqual(dashboard.heatmapData.first(where: { $0.date == twoDaysAgoStart })?.value, 1)
    }

    func testSessionOrderingAndAnsweringUpdatesMastery() async throws {
        let repo = try TemporaryRepo(questions: [
            fixtureQuestion(
                id: "q-a",
                stem: "A",
                tags: ["general-paediatrics"],
                createdAt: Date(timeIntervalSince1970: 1_700_000_100)
            ),
            fixtureQuestion(
                id: "q-b",
                stem: "B",
                tags: ["general-paediatrics", "weak-lane"],
                createdAt: Date(timeIntervalSince1970: 1_700_000_000)
            ),
            fixtureQuestion(
                id: "q-c",
                stem: "C",
                tags: ["general-paediatrics", "strong-lane"],
                createdAt: Date(timeIntervalSince1970: 1_700_000_200)
            ),
        ])
        defer { try? repo.cleanup() }

        let service = try QBankService(context: repo.context)
        _ = try await service.syncIfNeeded(force: true)

        let database = try SQLiteDatabase(path: repo.context.databaseURL.path)
        try database.execute(
            """
            INSERT INTO TagMastery (tagId, elo, attemptCount, correctCount, updatedAt)
            VALUES
              ('general-paediatrics', 1000, 4, 2, ?),
              ('weak-lane', 860, 4, 1, ?),
              ('strong-lane', 1140, 4, 4, ?);
            """,
            bindings: [
                .text(QuestionFileCodec.formatDate(Date())),
                .text(QuestionFileCodec.formatDate(Date())),
                .text(QuestionFileCodec.formatDate(Date())),
            ]
        )

        let sessionID = try await service.startSession(tagID: "general-paediatrics", questionCount: 3)
        let session = try await service.fetchSession(id: sessionID)
        XCTAssertEqual(session?.questions.map(\.id), ["q-b", "q-a", "q-c"])

        let result = try await service.answer(sessionID: sessionID, questionID: "q-b", selectedKey: "B")
        XCTAssertTrue(result.isCorrect)

        let progress = try await service.fetchProgress()
        let weakLane = progress.first(where: { $0.slug == "weak-lane" })
        XCTAssertNotNil(weakLane)
        XCTAssertEqual(weakLane?.attemptCount, 5)
    }

    func testSessionOrderingUsesIncorrectRateThenCreatedAtThenIdentifier() async throws {
        let repo = try TemporaryRepo(questions: [
            fixtureQuestion(
                id: "q-alpha",
                stem: "Alpha",
                tags: ["general-paediatrics"],
                createdAt: Date(timeIntervalSince1970: 1_700_000_000)
            ),
            fixtureQuestion(
                id: "q-beta",
                stem: "Beta",
                tags: ["general-paediatrics"],
                createdAt: Date(timeIntervalSince1970: 1_700_000_000)
            ),
            fixtureQuestion(
                id: "q-gamma",
                stem: "Gamma",
                tags: ["general-paediatrics"],
                createdAt: Date(timeIntervalSince1970: 1_700_000_100)
            ),
        ])
        defer { try? repo.cleanup() }

        let service = try QBankService(context: repo.context)
        _ = try await service.syncIfNeeded(force: true)

        let database = try SQLiteDatabase(path: repo.context.databaseURL.path)
        let now = QuestionFileCodec.formatDate(Date())
        try database.execute(
            """
            INSERT INTO PracticeSession (id, mode, questionIds, currentIndex, createdAt, completedAt)
            VALUES ('seed-session', 'revision', '[]', 0, ?, NULL);
            """,
            bindings: [.text(now)]
        )
        try database.execute(
            """
            INSERT INTO Attempt (id, questionId, sessionId, selectedKey, isCorrect, createdAt)
            VALUES
              ('attempt-1', 'q-beta', 'seed-session', 'A', 0, ?),
              ('attempt-2', 'q-gamma', 'seed-session', 'B', 1, ?);
            """,
            bindings: [.text(now), .text(now)]
        )

        let sessionID = try await service.startSession(tagID: "general-paediatrics", questionCount: 3)
        let session = try await service.fetchSession(id: sessionID)

        XCTAssertEqual(session?.questions.map(\.id), ["q-alpha", "q-beta", "q-gamma"])
    }

    func testStartSessionExcludesDraftAndUnanswerableQuestions() async throws {
        let repo = try TemporaryRepo(
            questions: [
                fixtureQuestion(id: "published-answerable", tags: ["general-paediatrics"]),
                fixtureQuestion(id: "published-unanswerable", tags: ["general-paediatrics"], correctKey: "Z"),
            ],
            drafts: [
                fixtureQuestion(id: "draft-answerable", tags: ["general-paediatrics"], status: .draft),
            ]
        )
        defer { try? repo.cleanup() }

        let service = try QBankService(context: repo.context)
        _ = try await service.syncIfNeeded(force: true)

        let sessionID = try await service.startSession(tagID: "general-paediatrics", questionCount: 10)
        let session = try await service.fetchSession(id: sessionID)

        XCTAssertEqual(session?.questions.map(\.id), ["published-answerable"])
    }

    func testAnswerRejectsOutOfSequenceQuestion() async throws {
        let repo = try TemporaryRepo(questions: [
            fixtureQuestion(id: "q-1", stem: "First", tags: ["general-paediatrics"]),
            fixtureQuestion(id: "q-2", stem: "Second", tags: ["general-paediatrics"], createdAt: Date(timeIntervalSince1970: 1_700_000_100)),
        ])
        defer { try? repo.cleanup() }

        let service = try QBankService(context: repo.context)
        _ = try await service.syncIfNeeded(force: true)

        let sessionID = try await service.startSession(tagID: "general-paediatrics", questionCount: 2)

        do {
            _ = try await service.answer(sessionID: sessionID, questionID: "q-2", selectedKey: "B")
            XCTFail("Expected out-of-sequence answer to fail")
        } catch let error as QBankServiceError {
            guard case .questionOutOfSequence = error else {
                return XCTFail("Expected questionOutOfSequence, received \(error)")
            }
        }
    }

    func testRepeatAnswerReturnsExistingAttemptWithoutAdvancingSession() async throws {
        let repo = try TemporaryRepo(questions: [
            fixtureQuestion(id: "q-1", stem: "First", tags: ["general-paediatrics"]),
            fixtureQuestion(id: "q-2", stem: "Second", tags: ["general-paediatrics"], createdAt: Date(timeIntervalSince1970: 1_700_000_100)),
        ])
        defer { try? repo.cleanup() }

        let service = try QBankService(context: repo.context)
        _ = try await service.syncIfNeeded(force: true)

        let sessionID = try await service.startSession(tagID: "general-paediatrics", questionCount: 2)
        let first = try await service.answer(sessionID: sessionID, questionID: "q-1", selectedKey: "B")
        let repeatAttempt = try await service.answer(sessionID: sessionID, questionID: "q-1", selectedKey: "A")
        let session = try await service.fetchSession(id: sessionID)

        XCTAssertTrue(first.isCorrect)
        XCTAssertTrue(repeatAttempt.isCorrect)
        XCTAssertEqual(repeatAttempt.nextIndex, 1)
        XCTAssertEqual(session?.currentIndex, 1)
        XCTAssertEqual(session?.answeredByQuestion.count, 1)
    }

    func testBrowseFiltersPaginateAndExcludeDrafts() async throws {
        let drafts: [QuestionFile] = [
            fixtureQuestion(
                id: "draft-hidden",
                stem: "Target hidden draft",
                tags: ["general-paediatrics", "respiratory"],
                curriculum: .generalPaediatrics,
                status: .draft,
                createdAt: Date(timeIntervalSince1970: 1_699_999_000)
            )
        ]
        var questions: [QuestionFile] = []

        for index in 0..<35 {
            questions.append(
                fixtureQuestion(
                    id: String(format: "q-%02d", index),
                    stem: index < 31 ? "Target question \(index)" : "Other question \(index)",
                    tags: index < 31 ? ["general-paediatrics", "respiratory"] : ["emergency-paediatrics", "trauma"],
                    curriculum: index < 31 ? .generalPaediatrics : .emergencyPaediatrics,
                    createdAt: Date(timeIntervalSince1970: 1_700_000_000 + TimeInterval(index))
                )
            )
        }

        let repo = try TemporaryRepo(questions: questions, drafts: drafts)
        defer { try? repo.cleanup() }

        let service = try QBankService(context: repo.context)
        _ = try await service.syncIfNeeded(force: true)

        let pageOne = try await service.fetchBrowse(
            search: "  target  ",
            curriculum: Curriculum.generalPaediatrics.rawValue,
            tag: "respiratory",
            page: 1
        )
        let pageTwo = try await service.fetchBrowse(
            search: "Target",
            curriculum: Curriculum.generalPaediatrics.rawValue,
            tag: "respiratory",
            page: 2
        )

        XCTAssertEqual(pageOne.total, 31)
        XCTAssertEqual(pageOne.pageCount, 2)
        XCTAssertEqual(pageOne.questions.count, 30)
        XCTAssertEqual(pageOne.questions.first?.id, "q-30")
        XCTAssertEqual(pageOne.questions.last?.id, "q-01")
        XCTAssertEqual(pageTwo.questions.map(\.id), ["q-00"])
        XCTAssertTrue(pageOne.questions.allSatisfy { $0.curriculum == .generalPaediatrics })
        XCTAssertTrue(pageOne.questions.allSatisfy { $0.tags.contains(where: { $0.slug == "respiratory" }) })
        XCTAssertFalse(pageOne.questions.contains(where: { $0.id == "draft-hidden" }))
    }

    func testBlueprintPracticeTagsHideScaffoldingAndDeduplicateCurriculumBuckets() async throws {
        let repo = try TemporaryRepo(questions: [
            fixtureQuestion(
                id: "q-blueprint-1",
                tags: [
                    "cah-exam-blueprint/cah-kat",
                    "cah-exam-blueprint/cah-kat/general-paediatrics",
                    "notebooklm",
                ],
                curriculum: .generalPaediatrics
            ),
            fixtureQuestion(
                id: "q-blueprint-2",
                tags: [
                    "cah-exam-blueprint/cah-kat",
                    "cah-exam-blueprint/cah-kat/general-paediatrics",
                ],
                curriculum: .generalPaediatrics,
                createdAt: Date(timeIntervalSince1970: 1_700_000_100)
            ),
            fixtureQuestion(
                id: "q-topic",
                tags: ["general-paediatrics", "respiratory"],
                curriculum: .generalPaediatrics,
                createdAt: Date(timeIntervalSince1970: 1_700_000_200)
            ),
        ])
        defer { try? repo.cleanup() }

        let service = try QBankService(context: repo.context)
        _ = try await service.syncIfNeeded(force: true)

        let practiceTags = try await service.fetchPracticeTags()
        let browse = try await service.fetchBrowse(search: nil, curriculum: nil, tag: nil, page: 1)
        let detail = try await service.fetchQuestionDetail(id: "q-blueprint-1")

        XCTAssertEqual(practiceTags.filter { $0.kind == .curriculum }.map(\.slug), ["general-paediatrics"])
        XCTAssertEqual(practiceTags.first(where: { $0.slug == "general-paediatrics" })?.questionCount, 3)
        XCTAssertNil(practiceTags.first(where: { $0.slug == "cah-exam-blueprint" }))
        XCTAssertNil(practiceTags.first(where: { $0.slug == "cah-exam-blueprint/cah-kat" }))
        XCTAssertEqual(browse.tagOptions.map(\.slug), ["respiratory"])
        XCTAssertFalse(detail?.tags.contains(where: { $0.slug.contains("cah-exam-blueprint") }) ?? true)
    }

    func testFlagsNotesAndBrowseRoundTrip() async throws {
        let repo = try TemporaryRepo(questions: [
            fixtureQuestion(id: "q-1", stem: "Alpha question"),
        ])
        defer { try? repo.cleanup() }

        let service = try QBankService(context: repo.context)
        _ = try await service.syncIfNeeded(force: true)

        _ = try await service.toggleFlag(questionID: "q-1")
        _ = try await service.saveNote(questionID: "q-1", noteMarkdown: "Local note")

        let browse = try await service.fetchBrowse(search: "Alpha", curriculum: nil, tag: nil, page: 1)
        let detail = try await service.fetchQuestionDetail(id: "q-1")

        XCTAssertEqual(browse.total, 1)
        XCTAssertEqual(detail?.flagged, true)
        XCTAssertEqual(detail?.noteMarkdown, "Local note")
    }

    func testFetchSessionReturnsNilWhenSyncedContentRemovesSessionQuestion() async throws {
        let repo = try TemporaryRepo(questions: [
            fixtureQuestion(id: "q-1", createdAt: Date(timeIntervalSince1970: 1_700_000_000)),
            fixtureQuestion(id: "q-2", createdAt: Date(timeIntervalSince1970: 1_700_000_100)),
        ])
        defer { try? repo.cleanup() }

        let service = try QBankService(context: repo.context)
        _ = try await service.syncIfNeeded(force: true)

        let sessionID = try await service.startSession(tagID: "general-paediatrics", questionCount: 2)
        try FileManager.default.removeItem(at: repo.rootURL.appendingPathComponent("questions/q-2.json"))
        _ = try await service.syncIfNeeded(force: true)

        let session = try await service.fetchSession(id: sessionID)
        XCTAssertNil(session)
    }

    func testProgressExcludesDraftAndBrowseOnlyQuestionCounts() async throws {
        let repo = try TemporaryRepo(
            questions: [
                fixtureQuestion(id: "published-answerable", tags: ["general-paediatrics", "respiratory"]),
                fixtureQuestion(id: "browse-only", tags: ["general-paediatrics", "browse-only"], correctKey: "Z"),
            ],
            drafts: [
                fixtureQuestion(id: "draft-only", tags: ["general-paediatrics", "draft-tag"], status: .draft),
            ]
        )
        defer { try? repo.cleanup() }

        let service = try QBankService(context: repo.context)
        _ = try await service.syncIfNeeded(force: true)

        let progress = try await service.fetchProgress()

        XCTAssertNotNil(progress.first(where: { $0.slug == "respiratory" && $0.questionCount == 1 }))
        XCTAssertNil(progress.first(where: { $0.slug == "draft-tag" }))
        XCTAssertNil(progress.first(where: { $0.slug == "browse-only" }))
    }
}

private func utcDate(daysFromToday: Int, hour: Int, minute: Int) -> Date {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .current
    let today = calendar.startOfDay(for: Date())
    return calendar.date(byAdding: .day, value: daysFromToday, to: today)?
        .addingTimeInterval(TimeInterval((hour * 60 * 60) + (minute * 60)))
        ?? today
}

private func utcStartOfDay(_ date: Date) -> Date {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .current
    return calendar.startOfDay(for: date)
}
