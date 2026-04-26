import Foundation

enum QBankServiceError: LocalizedError {
    case sessionNotFound
    case questionNotInSession
    case questionOutOfSequence
    case questionNotFound
    case noQuestionsAvailable

    var errorDescription: String? {
        switch self {
        case .sessionNotFound:
            return "The selected practice session could not be found."
        case .questionNotInSession:
            return "That question does not belong to the current session."
        case .questionOutOfSequence:
            return "Questions must be answered in order."
        case .questionNotFound:
            return "The selected question could not be found."
        case .noQuestionsAvailable:
            return "No answerable published questions matched that selection."
        }
    }
}

enum QBankContentMode: Sendable {
    case repoFiles
    case databaseOnly
}

actor QBankService {
    private let context: RepoContext
    private let contentMode: QBankContentMode
    private let database: SQLiteDatabase
    private let synchronizer = ContentSynchronizer()
    private var hasSynced = false

    private let defaultQuestionCount = 20
    private let questionPageSize = 30
    private let baseRating = 1000.0
    private let kFactor = 32.0
    private let dashboardRecentSessionLimit = 6
    private let dashboardTrendDays = 30
    private let dashboardHeatmapDays = 56
    private let moduleCompletionAccuracyThreshold = 80.0
    private let moduleCompletionEloThreshold = 1100.0

    init(context: RepoContext, contentMode: QBankContentMode = .repoFiles) throws {
        self.context = context
        self.contentMode = contentMode
        self.database = try SQLiteDatabase(path: context.databaseURL.path)
        try self.database.ensureSchema()
        try Self.normalizeLegacyDateColumns(in: self.database)
    }

    static func connectedToLocalRepo(configuration: RepoLinkConfiguration = RepoLinkConfiguration()) throws -> QBankService {
        try QBankService(context: RepoLocator.locate(configuration: configuration))
    }

    func repoRootPath() -> String {
        context.repoRoot.path
    }

    @discardableResult
    func syncIfNeeded(force: Bool = false) throws -> RepoSyncReport {
        if hasSynced && !force {
            return RepoSyncReport(
                databaseURL: context.databaseURL,
                questionCount: 0,
                publishedCount: 0,
                draftCount: 0,
                answerablePublishedCount: 0,
                tagCount: 0,
                questionTagCount: 0
            )
        }
        if contentMode == .databaseOnly {
            hasSynced = true
            return try currentDatabaseReport()
        }
        let report = try synchronizer.sync(using: context, database: database)
        hasSynced = true
        return report
    }

    func fetchDashboard() throws -> DashboardSnapshot {
        let publishedCount = try scalarInt("SELECT COUNT(*) AS count FROM Question WHERE status = 'published';")
        let answerableCount = try scalarInt("SELECT COUNT(*) AS count FROM Question WHERE status = 'published' AND isAnswerable = 1;")
        let flaggedCount = try scalarInt("SELECT COUNT(*) AS count FROM Flag;")
        let noteCount = try scalarInt("SELECT COUNT(*) AS count FROM UserNote;")
        let attempts = try loadDashboardAttempts()
        let sessions = try loadDashboardSessions()
        let topicDistribution = try loadDashboardTopicDistribution()
        let masteryRows = try loadDashboardMasteryRows()

        let weakTagRows = try database.query(
            """
            SELECT tm.tagId, tm.elo, tm.attemptCount, t.name
            FROM TagMastery tm
            JOIN Tag t ON t.slug = tm.tagId
            WHERE EXISTS (
                SELECT 1
                FROM QuestionTag qt
                JOIN Question q ON q.id = qt.questionId
                WHERE qt.tagId = t.slug
                  AND q.status = 'published'
                  AND q.isAnswerable = 1
            )
            ORDER BY tm.elo ASC
            LIMIT 5;
            """
        )
        let weakTags = try weakTagRows.map {
            WeakTagSnapshot(
                slug: try $0.string("tagId"),
                name: try $0.string("name"),
                elo: try $0.double("elo"),
                attempts: try $0.int("attemptCount")
            )
        }

        let recentSessionSlice = Array(sessions.prefix(dashboardRecentSessionLimit))
        let recentSessions = recentSessionSlice.map { session in
            RecentSessionSummary(
                id: session.id,
                mode: session.mode,
                createdAt: session.createdAt,
                completedAt: session.completedAt,
                answered: session.answered,
                correct: session.correct
            )
        }
        let sessionsBarData = recentSessionSlice.reversed().map { session in
            DashboardSessionBarPoint(
                id: session.id,
                mode: session.mode,
                createdAt: session.createdAt,
                completedAt: session.completedAt,
                answered: session.answered,
                correct: session.correct,
                score: computeAccuracyPercent(correct: session.correct, total: session.answered),
                label: formatDashboardSessionLabel(session)
            )
        }
        let correctAttempts = attempts.filter(\.isCorrect).count

        return DashboardSnapshot(
            publishedCount: publishedCount,
            answerableCount: answerableCount,
            flaggedCount: flaggedCount,
            noteCount: noteCount,
            accuracyPercent: computeAccuracyPercent(correct: correctAttempts, total: attempts.count),
            totalTimeSpentMs: computeTotalTimeSpent(attempts: attempts, sessions: sessions),
            currentStreak: computeCurrentStreak(attempts: attempts),
            modulesCompleted: computeModulesCompleted(
                curricula: topicDistribution.map(\.topic),
                attempts: attempts,
                masteryRows: masteryRows
            ),
            trendData: buildTrendData(from: attempts),
            topicDistribution: topicDistribution,
            heatmapData: buildHeatmapData(from: attempts),
            sessionsBarData: sessionsBarData,
            weakTags: weakTags,
            recentSessions: recentSessions
        )
    }

    func fetchPracticeTags() throws -> [PracticeTagSummary] {
        try fetchTagSummaries(kinds: [.curriculum, .topic])
    }

    func fetchPracticeBlueprint() throws -> [PracticeBlueprintNode] {
        let slugs = CAHBlueprint.allSlugs
        guard !slugs.isEmpty else { return [] }
        let placeholders = Array(repeating: "?", count: slugs.count).joined(separator: ", ")
        let rows = try database.query(
            """
            SELECT t.slug, COALESCE(tm.elo, 1000) AS elo, GROUP_CONCAT(q.id) AS questionIDs
            FROM Tag t
            LEFT JOIN TagMastery tm ON tm.tagId = t.slug
            LEFT JOIN QuestionTag qt ON qt.tagId = t.slug
            LEFT JOIN Question q ON q.id = qt.questionId AND q.status = 'published' AND q.isAnswerable = 1
            WHERE t.slug IN (\(placeholders))
            GROUP BY t.slug, tm.elo;
            """,
            bindings: slugs.map(SQLiteBindValue.text)
        )
        var idsBySlug: [String: [String]] = [:]
        var eloBySlug: [String: Double] = [:]
        for row in rows {
            let slug = try row.string("slug")
            eloBySlug[slug] = try row.double("elo")
            let ids = try row.optionalString("questionIDs")?
                .split(separator: ",")
                .map(String.init)
                .sorted() ?? []
            idsBySlug[slug] = ids
        }

        func node(
            slug: String,
            name: String,
            kind: TagKind,
            examQuestionCount: Int?,
            examPercent: Double?,
            children: [PracticeBlueprintNode] = []
        ) -> PracticeBlueprintNode {
            let questionIDs = idsBySlug[slug] ?? []
            return PracticeBlueprintNode(
                slug: slug,
                name: name,
                kind: kind,
                questionCount: questionIDs.count,
                questionIDs: questionIDs,
                elo: eloBySlug[slug] ?? baseRating,
                examQuestionCount: examQuestionCount,
                examPercent: examPercent,
                children: children
            )
        }

        return CAHBlueprint.categories.map { category in
            let children = category.subtopics
                .map { topic in
                    node(slug: topic.slug, name: topic.name, kind: .topic, examQuestionCount: nil, examPercent: nil)
                }
                .filter { $0.questionCount > 0 }
            return node(
                slug: category.slug,
                name: category.name,
                kind: .curriculum,
                examQuestionCount: category.examQuestionCount,
                examPercent: category.examPercent,
                children: children
            )
        }
    }

    func fetchBrowse(search: String?, curriculum: String?, tag: String?, page: Int) throws -> BrowseSnapshot {
        let nextPage = max(1, page)
        var clauses = ["q.status = 'published'"]
        var bindings: [SQLiteBindValue] = []

        if let search, !search.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            clauses.append("q.stem LIKE ? COLLATE NOCASE")
            bindings.append(.text("%\(search.trimmingCharacters(in: .whitespacesAndNewlines))%"))
        }
        if let curriculum, !curriculum.isEmpty {
            clauses.append("q.curriculum = ?")
            bindings.append(.text(curriculum))
        }
        if let tag, !tag.isEmpty {
            clauses.append("EXISTS (SELECT 1 FROM QuestionTag qt WHERE qt.questionId = q.id AND qt.tagId = ?)")
            bindings.append(.text(tag))
        }

        let whereClause = clauses.joined(separator: " AND ")
        let total = try scalarInt("SELECT COUNT(*) AS count FROM Question q WHERE \(whereClause);", bindings: bindings)
        let questions = try loadQuestions(
            whereClause: whereClause,
            bindings: bindings,
            orderBy: "q.createdAt DESC, q.id ASC",
            limit: questionPageSize,
            offset: (nextPage - 1) * questionPageSize
        )

        return BrowseSnapshot(
            page: nextPage,
            total: total,
            pageCount: max(1, Int(ceil(Double(total) / Double(questionPageSize)))),
            questions: questions,
            tagOptions: try fetchTagSummaries(kinds: [.topic])
        )
    }

    func fetchQuestionDetail(id: String) throws -> QBankQuestion? {
        try loadQuestions(whereClause: "q.id = ?", bindings: [.text(id)], orderBy: "q.createdAt DESC", limit: 1, offset: 0).first
    }

    func startSession(tagID: String?, questionCount: Int?) throws -> String {
        try startSession(tagIDs: tagID.map { [$0] } ?? [], questionCount: questionCount)
    }

    func startSession(tagIDs: [String], questionCount: Int?) throws -> String {
        let count = min(max(questionCount ?? defaultQuestionCount, 1), 100)
        var clauses = ["q.status = 'published'", "q.isAnswerable = 1"]
        var bindings: [SQLiteBindValue] = []
        let selectedTagIDs = Array(Set(tagIDs.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty })).sorted()
        if !selectedTagIDs.isEmpty {
            let placeholders = Array(repeating: "?", count: selectedTagIDs.count).joined(separator: ", ")
            clauses.append("EXISTS (SELECT 1 FROM QuestionTag qt WHERE qt.questionId = q.id AND qt.tagId IN (\(placeholders)))")
            bindings.append(contentsOf: selectedTagIDs.map(SQLiteBindValue.text))
        }

        let questions = try loadQuestions(
            whereClause: clauses.joined(separator: " AND "),
            bindings: bindings,
            orderBy: "q.createdAt ASC",
            limit: 1500,
            offset: 0
        )
        if questions.isEmpty {
            throw QBankServiceError.noQuestionsAvailable
        }

        let masteryRows = try database.query("SELECT tagId, elo FROM TagMastery;")
        let masteryByTag = Dictionary(uniqueKeysWithValues: try masteryRows.map { row in
            (try row.string("tagId"), try row.double("elo"))
        })

        let orderedQuestions = questions
            .sorted { left, right in
                let leftScore = rank(question: left, masteryByTag: masteryByTag)
                let rightScore = rank(question: right, masteryByTag: masteryByTag)
                if leftScore != rightScore {
                    return leftScore > rightScore
                }
                if left.createdAt != right.createdAt {
                    return left.createdAt < right.createdAt
                }
                return left.id < right.id
            }
            .prefix(count)

        let sessionID = UUID().uuidString
        let encoder = QuestionFileCodec.encoder()
        let questionIDs = orderedQuestions.map(\.id)
        let questionIDsJSON = try String(data: encoder.encode(questionIDs), encoding: .utf8).unwrap("session question ids")

        try database.execute(
            """
            INSERT INTO PracticeSession (id, mode, questionIds, currentIndex, createdAt, completedAt)
            VALUES (?, ?, ?, 0, ?, NULL);
            """,
            bindings: [
                .text(sessionID),
                .text((selectedTagIDs.isEmpty ? PracticeMode.revision : PracticeMode.custom).rawValue),
                .text(questionIDsJSON),
                .text(QuestionFileCodec.formatDate(Date())),
            ]
        )
        return sessionID
    }

    func fetchSession(id: String) throws -> SessionSnapshot? {
        let sessionRows = try database.query(
            "SELECT id, mode, questionIds, currentIndex, createdAt, completedAt FROM PracticeSession WHERE id = ?;",
            bindings: [.text(id)]
        )
        guard let sessionRow = sessionRows.first else {
            return nil
        }

        let questionIDs = try decodeJSON([String].self, from: sessionRow.string("questionIds"))
        let questions = try loadQuestionsByIDs(questionIDs)
        let orderedQuestions = questionIDs.compactMap { id in
            questions.first { $0.id == id }
        }
        guard orderedQuestions.count == questionIDs.count else {
            return nil
        }

        let attemptRows = try database.query(
            """
            SELECT id, questionId, selectedKey, isCorrect, createdAt
            FROM Attempt
            WHERE sessionId = ?
            ORDER BY createdAt ASC;
            """,
            bindings: [.text(id)]
        )
        var answeredByQuestion: [String: AttemptRecord] = [:]
        for row in attemptRows {
            let attempt = AttemptRecord(
                id: try row.string("id"),
                questionId: try row.string("questionId"),
                selectedKey: try row.optionalString("selectedKey"),
                isCorrect: try row.bool("isCorrect"),
                createdAt: try parseDatabaseDate(row.string("createdAt"))
            )
            answeredByQuestion[attempt.questionId] = attempt
        }

        return SessionSnapshot(
            id: try sessionRow.string("id"),
            mode: try PracticeMode(rawValue: sessionRow.string("mode")).unwrap("practice mode"),
            currentIndex: try sessionRow.int("currentIndex"),
            createdAt: try parseDatabaseDate(sessionRow.string("createdAt")),
            completedAt: try sessionRow.optionalString("completedAt").flatMap(parseDatabaseDate),
            questions: orderedQuestions,
            answeredByQuestion: answeredByQuestion
        )
    }

    func answer(sessionID: String, questionID: String, selectedKey: String) throws -> AnswerResult {
        try database.transaction {
            let sessionRows = try database.query(
                "SELECT id, questionIds, currentIndex, completedAt FROM PracticeSession WHERE id = ?;",
                bindings: [.text(sessionID)]
            )
            guard let sessionRow = sessionRows.first else {
                throw QBankServiceError.sessionNotFound
            }

            let questionIDs = try decodeJSON([String].self, from: sessionRow.string("questionIds"))
            guard questionIDs.contains(questionID) else {
                throw QBankServiceError.questionNotInSession
            }

            let existingAttemptRows = try database.query(
                """
                SELECT id, selectedKey, isCorrect
                FROM Attempt
                WHERE sessionId = ? AND questionId = ?;
                """,
                bindings: [.text(sessionID), .text(questionID)]
            )
            let currentIndex = try sessionRow.int("currentIndex")
            let currentQuestionID = questionIDs[min(currentIndex, max(questionIDs.count - 1, 0))]

            if existingAttemptRows.isEmpty && currentQuestionID != questionID {
                throw QBankServiceError.questionOutOfSequence
            }

            guard let question = try fetchQuestionDetail(id: questionID) else {
                throw QBankServiceError.questionNotFound
            }

            if let existing = existingAttemptRows.first {
                let existingResult = try existing.bool("isCorrect")
                let correctText = question.options.first { $0.isCorrect == true }?.text
                return AnswerResult(
                    isCorrect: existingResult,
                    correctKey: question.correctKey,
                    correctText: correctText,
                    explanation: question.explanation,
                    citations: question.citations,
                    rationale: question.rationale,
                    optionExplanations: question.optionExplanations,
                    completedAt: try sessionRow.optionalString("completedAt") != nil,
                    nextIndex: currentIndex
                )
            }

            let isCorrect = question.correctKey == selectedKey
            try database.execute(
                """
                INSERT INTO Attempt (id, questionId, sessionId, selectedKey, isCorrect, createdAt)
                VALUES (?, ?, ?, ?, ?, ?);
                """,
                bindings: [
                    .text(UUID().uuidString),
                    .text(questionID),
                    .text(sessionID),
                    .text(selectedKey),
                    .integer(isCorrect ? 1 : 0),
                    .text(QuestionFileCodec.formatDate(Date())),
                ]
            )

            let answeredCount = try scalarInt(
                "SELECT COUNT(*) AS count FROM Attempt WHERE sessionId = ?;",
                bindings: [.text(sessionID)]
            )
            let nextIndex = min(answeredCount, max(questionIDs.count - 1, 0))
            let completed = answeredCount >= questionIDs.count

            try database.execute(
                """
                UPDATE PracticeSession
                SET currentIndex = ?, completedAt = ?
                WHERE id = ?;
                """,
                bindings: [
                    .integer(Int64(nextIndex)),
                    completed ? .text(QuestionFileCodec.formatDate(Date())) : .null,
                    .text(sessionID),
                ]
            )

            try updateTagMastery(for: question, isCorrect: isCorrect)
            let correctText = question.options.first { $0.isCorrect == true }?.text
            return AnswerResult(
                isCorrect: isCorrect,
                correctKey: question.correctKey,
                correctText: correctText,
                explanation: question.explanation,
                citations: question.citations,
                rationale: question.rationale,
                optionExplanations: question.optionExplanations,
                completedAt: completed,
                nextIndex: nextIndex
            )
        }
    }

    func toggleFlag(questionID: String) throws -> Bool {
        let existing = try scalarInt(
            "SELECT COUNT(*) AS count FROM Flag WHERE questionId = ?;",
            bindings: [.text(questionID)]
        )
        if existing > 0 {
            try database.execute("DELETE FROM Flag WHERE questionId = ?;", bindings: [.text(questionID)])
            return false
        }

        try database.execute(
            "INSERT INTO Flag (questionId, createdAt) VALUES (?, ?);",
            bindings: [.text(questionID), .text(QuestionFileCodec.formatDate(Date()))]
        )
        return true
    }

    func saveNote(questionID: String, noteMarkdown: String) throws -> String {
        let trimmed = noteMarkdown.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            try database.execute("DELETE FROM UserNote WHERE questionId = ?;", bindings: [.text(questionID)])
            return ""
        }

        try database.execute(
            """
            INSERT INTO UserNote (questionId, noteMarkdown, updatedAt)
            VALUES (?, ?, ?)
            ON CONFLICT(questionId) DO UPDATE SET
              noteMarkdown = excluded.noteMarkdown,
              updatedAt = excluded.updatedAt;
            """,
            bindings: [
                .text(questionID),
                .text(trimmed),
                .text(QuestionFileCodec.formatDate(Date())),
            ]
        )
        return trimmed
    }

    func endSession(id: String) throws {
        try database.execute(
            "UPDATE PracticeSession SET completedAt = ? WHERE id = ?;",
            bindings: [.text(QuestionFileCodec.formatDate(Date())), .text(id)]
        )
    }

    func fetchProgress() throws -> [ProgressRow] {
        let rows = try database.query(
            """
            SELECT t.slug, t.name, t.kind,
                   COUNT(q.id) AS questionCount,
                   COALESCE(tm.elo, 1000) AS elo,
                   COALESCE(tm.attemptCount, 0) AS attemptCount,
                   COALESCE(tm.correctCount, 0) AS correctCount
            FROM Tag t
            LEFT JOIN QuestionTag qt ON qt.tagId = t.slug
            LEFT JOIN Question q ON q.id = qt.questionId
              AND q.status = 'published'
              AND q.isAnswerable = 1
            LEFT JOIN TagMastery tm ON tm.tagId = t.slug
            WHERE t.kind IN ('curriculum', 'topic')
            GROUP BY t.slug, t.name, t.kind, tm.elo, tm.attemptCount, tm.correctCount
            HAVING questionCount > 0
            ORDER BY t.kind ASC, t.name ASC;
            """
        )
        return try rows.map { row in
            ProgressRow(
                slug: try row.string("slug"),
                name: try row.string("name"),
                kind: try TagKind(rawValue: row.string("kind")).unwrap("tag kind"),
                questionCount: try row.int("questionCount"),
                elo: try row.double("elo"),
                attemptCount: try row.int("attemptCount"),
                correctCount: try row.int("correctCount")
            )
        }
    }

    private func loadDashboardAttempts() throws -> [DashboardAttemptMetric] {
        let rows = try database.query(
            """
            SELECT a.isCorrect, a.timeSpentMs, a.createdAt, q.curriculum
            FROM Attempt a
            JOIN Question q ON q.id = a.questionId
            ORDER BY a.createdAt ASC;
            """
        )

        return try rows.map { row in
            DashboardAttemptMetric(
                isCorrect: try row.bool("isCorrect"),
                timeSpentMs: try row.optionalString("timeSpentMs").flatMap(Int.init),
                createdAt: try parseDatabaseDate(row.string("createdAt")),
                curriculum: try row.string("curriculum")
            )
        }
    }

    private func loadDashboardSessions() throws -> [DashboardSessionMetric] {
        let rows = try database.query(
            """
            SELECT ps.id, ps.mode, ps.createdAt, ps.completedAt,
                   (SELECT COUNT(*) FROM Attempt a WHERE a.sessionId = ps.id) AS answered,
                   (SELECT COUNT(*) FROM Attempt a WHERE a.sessionId = ps.id AND a.isCorrect = 1) AS correct
            FROM PracticeSession ps
            ORDER BY ps.createdAt DESC;
            """
        )

        return try rows.map { row in
            DashboardSessionMetric(
                id: try row.string("id"),
                mode: try PracticeMode(rawValue: row.string("mode")).unwrap("practice mode"),
                createdAt: try parseDatabaseDate(row.string("createdAt")),
                completedAt: try row.optionalString("completedAt").flatMap(parseDatabaseDate),
                answered: try row.int("answered"),
                correct: try row.int("correct")
            )
        }
    }

    private func loadDashboardTopicDistribution() throws -> [DashboardTopicDistributionPoint] {
        let rows = try database.query(
            """
            SELECT curriculum, COUNT(*) AS count
            FROM Question
            WHERE status = 'published'
              AND isAnswerable = 1
            GROUP BY curriculum
            ORDER BY count DESC, curriculum ASC;
            """
        )
        let total = try rows.reduce(0) { partialResult, row in
            partialResult + (try row.int("count"))
        }

        return try rows.map { row in
            let count = try row.int("count")
            return DashboardTopicDistributionPoint(
                topic: try row.string("curriculum"),
                count: count,
                percentage: total == 0 ? 0 : roundPercentage(Double(count) / Double(total) * 100)
            )
        }
    }

    private func loadDashboardMasteryRows() throws -> [DashboardMasteryMetric] {
        let rows = try database.query(
            """
            SELECT tm.tagId, tm.elo, t.name, t.kind
            FROM TagMastery tm
            JOIN Tag t ON t.slug = tm.tagId;
            """
        )

        return try rows.map { row in
            DashboardMasteryMetric(
                tagID: try row.string("tagId"),
                elo: try row.double("elo"),
                name: try row.string("name"),
                kind: try TagKind(rawValue: row.string("kind")).unwrap("tag kind")
            )
        }
    }

    private func computeAccuracyPercent(correct: Int, total: Int) -> Double {
        guard total > 0 else { return 0 }
        return roundPercentage(Double(correct) / Double(total) * 100)
    }

    private func roundPercentage(_ value: Double) -> Double {
        (value * 10).rounded() / 10
    }

    private func computeTotalTimeSpent(attempts: [DashboardAttemptMetric], sessions: [DashboardSessionMetric]) -> Int {
        let trackedAttemptTime = attempts.reduce(0) { partialResult, attempt in
            partialResult + max(attempt.timeSpentMs ?? 0, 0)
        }
        if trackedAttemptTime > 0 {
            return trackedAttemptTime
        }

        return sessions.reduce(0) { partialResult, session in
            guard let completedAt = session.completedAt else {
                return partialResult
            }
            let duration = max(Int(completedAt.timeIntervalSince(session.createdAt) * 1000), 0)
            return partialResult + duration
        }
    }

    private func computeCurrentStreak(attempts: [DashboardAttemptMetric]) -> Int {
        var streak = 0
        for attempt in attempts.sorted(by: { $0.createdAt > $1.createdAt }) {
            if !attempt.isCorrect {
                break
            }
            streak += 1
        }
        return streak
    }

    private func computeModulesCompleted(
        curricula: [String],
        attempts: [DashboardAttemptMetric],
        masteryRows: [DashboardMasteryMetric]
    ) -> Int {
        var attemptsByCurriculum: [String: (total: Int, correct: Int)] = [:]
        for attempt in attempts {
            var stats = attemptsByCurriculum[attempt.curriculum] ?? (0, 0)
            stats.total += 1
            if attempt.isCorrect {
                stats.correct += 1
            }
            attemptsByCurriculum[attempt.curriculum] = stats
        }

        let eloByCurriculum = Dictionary(
            uniqueKeysWithValues: masteryRows
                .filter { $0.kind == .curriculum }
                .map { ($0.name, $0.elo) }
        )

        var completedCount = 0
        for curriculum in curricula {
            guard let stats = attemptsByCurriculum[curriculum], stats.total > 0 else {
                continue
            }
            let accuracy = computeAccuracyPercent(correct: stats.correct, total: stats.total)
            let elo = eloByCurriculum[curriculum] ?? 0
            if accuracy >= moduleCompletionAccuracyThreshold, elo >= moduleCompletionEloThreshold {
                completedCount += 1
            }
        }
        return completedCount
    }

    private func buildTrendData(from attempts: [DashboardAttemptMetric]) -> [DashboardTrendPoint] {
        let today = startOfUTCDay(Date())
        let dayStarts = (0..<dashboardTrendDays).map { offset in
            addUTCDays(offset - (dashboardTrendDays - 1), to: today)
        }

        var attemptsByDay: [Date: (total: Int, correct: Int)] = [:]
        for attempt in attempts {
            let day = startOfUTCDay(attempt.createdAt)
            var stats = attemptsByDay[day] ?? (0, 0)
            stats.total += 1
            if attempt.isCorrect {
                stats.correct += 1
            }
            attemptsByDay[day] = stats
        }

        return dayStarts.map { day in
            let stats = attemptsByDay[day]
            return DashboardTrendPoint(
                date: day,
                score: stats.map { computeAccuracyPercent(correct: $0.correct, total: $0.total) },
                attempts: stats?.total ?? 0
            )
        }
    }

    private func buildHeatmapData(from attempts: [DashboardAttemptMetric]) -> [DashboardHeatmapPoint] {
        let today = startOfUTCDay(Date())
        let dayStarts = (0..<dashboardHeatmapDays).map { offset in
            addUTCDays(offset - (dashboardHeatmapDays - 1), to: today)
        }

        var countsByDay: [Date: Int] = [:]
        for attempt in attempts {
            let day = startOfUTCDay(attempt.createdAt)
            countsByDay[day, default: 0] += 1
        }

        return dayStarts.map { day in
            DashboardHeatmapPoint(date: day, value: countsByDay[day] ?? 0)
        }
    }

    private func startOfUTCDay(_ date: Date) -> Date {
        Self.utcCalendar.startOfDay(for: date)
    }

    private func addUTCDays(_ days: Int, to date: Date) -> Date {
        Self.utcCalendar.date(byAdding: .day, value: days, to: date) ?? date
    }

    private func formatDashboardSessionLabel(_ session: DashboardSessionMetric) -> String {
        let date = session.createdAt.formatted(
            .dateTime
                .month(.abbreviated)
                .day()
        )
        return "\(session.mode.rawValue.capitalized) · \(date)"
    }

    private func scalarInt(_ sql: String, bindings: [SQLiteBindValue] = []) throws -> Int {
        try database.query(sql, bindings: bindings).first?.int("count") ?? 0
    }

    private func currentDatabaseReport() throws -> RepoSyncReport {
        try RepoSyncReport(
            databaseURL: context.databaseURL,
            questionCount: scalarInt("SELECT COUNT(*) AS count FROM Question;"),
            publishedCount: scalarInt("SELECT COUNT(*) AS count FROM Question WHERE status = 'published';"),
            draftCount: scalarInt("SELECT COUNT(*) AS count FROM Question WHERE status = 'draft';"),
            answerablePublishedCount: scalarInt("SELECT COUNT(*) AS count FROM Question WHERE status = 'published' AND isAnswerable = 1;"),
            tagCount: scalarInt("SELECT COUNT(*) AS count FROM Tag;"),
            questionTagCount: scalarInt("SELECT COUNT(*) AS count FROM QuestionTag;")
        )
    }

    private func fetchTagSummaries(kinds: [TagKind]) throws -> [PracticeTagSummary] {
        guard !kinds.isEmpty else { return [] }
        let kindsSQL = kinds.map { "'\($0.rawValue)'" }.joined(separator: ", ")
        let rows = try database.query(
            """
            SELECT t.slug, t.name, t.kind, COALESCE(tm.elo, 1000) AS elo, COUNT(q.id) AS questionCount
            FROM Tag t
            JOIN QuestionTag qt ON qt.tagId = t.slug
            JOIN Question q ON q.id = qt.questionId
            LEFT JOIN TagMastery tm ON tm.tagId = t.slug
            WHERE t.kind IN (\(kindsSQL))
              AND q.status = 'published'
              AND q.isAnswerable = 1
            GROUP BY t.slug, t.name, t.kind, tm.elo
            ORDER BY t.kind ASC, t.name ASC;
            """
        )

        return try rows.compactMap { row in
            let slug = try row.string("slug")
            guard !LearnerTagProjector.isHiddenLearnerSlug(slug) else { return nil }
            return PracticeTagSummary(
                slug: slug,
                name: try row.string("name"),
                kind: try TagKind(rawValue: row.string("kind")).unwrap("tag kind"),
                questionCount: try row.int("questionCount"),
                elo: try row.double("elo")
            )
        }
    }

    private func loadQuestions(
        whereClause: String,
        bindings: [SQLiteBindValue],
        orderBy: String,
        limit: Int,
        offset: Int
    ) throws -> [QBankQuestion] {
        let rows = try database.query(
            """
            SELECT q.id, q.stem, q.questionType, q.options, q.explanation, q.citations, q.curriculum,
                   q.createdBy, q.createdAt, q.sourceFingerprint, q.rationale, q.optionExplanations,
                   q.moduleCode, q.difficulty, q.ausScore, q.source, q.isAnswerable,
                   EXISTS(SELECT 1 FROM Flag f WHERE f.questionId = q.id) AS flagged,
                   COALESCE((SELECT noteMarkdown FROM UserNote n WHERE n.questionId = q.id), '') AS noteMarkdown,
                   (SELECT COUNT(*) FROM Attempt a WHERE a.questionId = q.id) AS attemptCount,
                   (SELECT COUNT(*) FROM Attempt a WHERE a.questionId = q.id AND a.isCorrect = 1) AS correctCount
            FROM Question q
            WHERE \(whereClause)
            ORDER BY \(orderBy)
            LIMIT \(limit) OFFSET \(offset);
            """,
            bindings: bindings
        )
        return try hydrateQuestions(from: rows)
    }

    private func loadQuestionsByIDs(_ ids: [String]) throws -> [QBankQuestion] {
        guard !ids.isEmpty else { return [] }
        var results: [QBankQuestion] = []
        for chunk in ids.chunked(into: 200) {
            let placeholders = Array(repeating: "?", count: chunk.count).joined(separator: ", ")
            let rows = try database.query(
                """
                SELECT q.id, q.stem, q.questionType, q.options, q.explanation, q.citations, q.curriculum,
                       q.createdBy, q.createdAt, q.sourceFingerprint, q.rationale, q.optionExplanations,
                       q.moduleCode, q.difficulty, q.ausScore, q.source, q.isAnswerable,
                       EXISTS(SELECT 1 FROM Flag f WHERE f.questionId = q.id) AS flagged,
                       COALESCE((SELECT noteMarkdown FROM UserNote n WHERE n.questionId = q.id), '') AS noteMarkdown,
                       (SELECT COUNT(*) FROM Attempt a WHERE a.questionId = q.id) AS attemptCount,
                       (SELECT COUNT(*) FROM Attempt a WHERE a.questionId = q.id AND a.isCorrect = 1) AS correctCount
                FROM Question q
                WHERE q.id IN (\(placeholders));
                """,
                bindings: chunk.map(SQLiteBindValue.text)
            )
            results.append(contentsOf: try hydrateQuestions(from: rows))
        }
        return results
    }

    private func hydrateQuestions(from rows: [SQLiteRow]) throws -> [QBankQuestion] {
        let ids = try rows.map { try $0.string("id") }
        let tagsByQuestion = try loadTagsByQuestionID(ids)
        return try rows.map { row in
            let id = try row.string("id")
            let options = try decodeJSON([QuestionOption].self, from: row.string("options"))
            let citations = try decodeJSON([QuestionCitation].self, from: row.string("citations"))
            let optionExplanations = try decodeJSON([String: String].self, from: row.string("optionExplanations"))
            let createdAt = try parseDatabaseDate(row.string("createdAt"))
            let curriculum = try Curriculum(rawValue: row.string("curriculum")).unwrap("curriculum")
            let createdBy = try CreatedBy(rawValue: row.string("createdBy")).unwrap("created by")
            let difficulty = try row.optionalString("difficulty").flatMap(Difficulty.init(rawValue:))
            let correctKey = options.first { $0.isCorrect == true }?.key

            return QBankQuestion(
                id: id,
                stem: try row.string("stem"),
                questionType: try QuestionType(rawValue: row.string("questionType")).unwrap("question type"),
                options: options,
                explanation: try row.optionalString("explanation"),
                citations: citations,
                rationale: try row.optionalString("rationale"),
                optionExplanations: optionExplanations,
                curriculum: curriculum,
                createdBy: createdBy,
                createdAt: createdAt,
                difficulty: difficulty,
                ausScore: try row.optionalString("ausScore").flatMap(Int.init),
                moduleCode: try row.optionalString("moduleCode"),
                sourceFingerprint: try row.string("sourceFingerprint"),
                sourceJSON: try row.string("source"),
                isAnswerable: try row.bool("isAnswerable"),
                correctKey: correctKey,
                tags: tagsByQuestion[id] ?? [],
                flagged: try row.bool("flagged"),
                noteMarkdown: try row.string("noteMarkdown"),
                attemptCount: try row.int("attemptCount"),
                correctCount: try row.int("correctCount")
            )
        }
    }

    private func loadTagsByQuestionID(_ ids: [String]) throws -> [String: [QuestionTag]] {
        guard !ids.isEmpty else { return [:] }
        var byQuestion: [String: [QuestionTag]] = [:]
        for chunk in ids.chunked(into: 200) {
            let placeholders = Array(repeating: "?", count: chunk.count).joined(separator: ", ")
            let rows = try database.query(
                """
                SELECT qt.questionId, t.slug, t.name, t.kind
                FROM QuestionTag qt
                JOIN Tag t ON t.slug = qt.tagId
                WHERE qt.questionId IN (\(placeholders))
                ORDER BY t.name ASC;
                """,
                bindings: chunk.map(SQLiteBindValue.text)
            )
            for row in rows {
                let questionID = try row.string("questionId")
                let slug = try row.string("slug")
                guard !LearnerTagProjector.isHiddenLearnerSlug(slug) else { continue }
                let tag = QuestionTag(
                    slug: slug,
                    name: try row.string("name"),
                    kind: try TagKind(rawValue: row.string("kind")).unwrap("tag kind")
                )
                byQuestion[questionID, default: []].append(tag)
            }
        }
        return byQuestion
    }

    private func rank(question: QBankQuestion, masteryByTag: [String: Double]) -> Double {
        let relevantTags = question.tags.filter { $0.kind != .meta }
        let weaknessScores = relevantTags.map { baseRating - (masteryByTag[$0.slug] ?? baseRating) }
        let averageWeakness = weaknessScores.isEmpty ? 0 : weaknessScores.reduce(0, +) / Double(weaknessScores.count)
        let incorrectRate = question.attemptCount == 0 ? 0.6 : Double(question.attemptCount - question.correctCount) / Double(question.attemptCount)
        let unseenBoost = question.attemptCount == 0 ? 50.0 : 0.0
        return averageWeakness + incorrectRate * 30.0 + unseenBoost
    }

    private func updateTagMastery(for question: QBankQuestion, isCorrect: Bool) throws {
        for tag in question.tags where tag.kind != .meta {
            let rows = try database.query(
                "SELECT elo, attemptCount, correctCount FROM TagMastery WHERE tagId = ?;",
                bindings: [.text(tag.slug)]
            )
            let currentElo = try rows.first?.double("elo") ?? baseRating
            let nextRating = updatedElo(currentRating: currentElo, difficulty: question.difficulty, isCorrect: isCorrect)
            try database.execute(
                """
                INSERT INTO TagMastery (tagId, elo, attemptCount, correctCount, updatedAt)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(tagId) DO UPDATE SET
                  elo = excluded.elo,
                  attemptCount = TagMastery.attemptCount + 1,
                  correctCount = TagMastery.correctCount + excluded.correctCount,
                  updatedAt = excluded.updatedAt;
                """,
                bindings: [
                    .text(tag.slug),
                    .double(nextRating),
                    .integer(1),
                    .integer(isCorrect ? 1 : 0),
                    .text(QuestionFileCodec.formatDate(Date())),
                ]
            )
        }
    }

    private func updatedElo(currentRating: Double, difficulty: Difficulty?, isCorrect: Bool) -> Double {
        let opponentRating: Double
        switch difficulty {
        case .basic:
            opponentRating = 920
        case .hard:
            opponentRating = 1080
        default:
            opponentRating = baseRating
        }
        let expected = 1 / (1 + pow(10, (opponentRating - currentRating) / 400))
        let actual = isCorrect ? 1.0 : 0.0
        let next = currentRating + kFactor * (actual - expected)
        return (next * 100).rounded() / 100
    }

    private func decodeJSON<T: Decodable>(_ type: T.Type, from string: String) throws -> T {
        let data = Data(string.utf8)
        return try QuestionFileCodec.decoder().decode(type, from: data)
    }

    private func parseDatabaseDate(_ string: String) throws -> Date {
        if let date = QuestionFileCodec.parseDate(string) {
            return date
        }
        throw RepoStoreError.invalidData("Unable to parse database date: \(string)")
    }

    private static func normalizeLegacyDateColumns(in database: SQLiteDatabase) throws {
        try database.transaction {
            try normalizeLegacyDateColumn(in: database, table: "PracticeSession", column: "createdAt")
            try normalizeLegacyDateColumn(in: database, table: "PracticeSession", column: "completedAt")
            try normalizeLegacyDateColumn(in: database, table: "Attempt", column: "createdAt")
            try normalizeLegacyDateColumn(in: database, table: "Question", column: "createdAt")
            try normalizeLegacyDateColumn(in: database, table: "Flag", column: "createdAt")
            try normalizeLegacyDateColumn(in: database, table: "UserNote", column: "updatedAt")
            try normalizeLegacyDateColumn(in: database, table: "TagMastery", column: "updatedAt")
        }
    }

    private static func normalizeLegacyDateColumn(in database: SQLiteDatabase, table: String, column: String) throws {
        let rows = try database.query(
            """
            SELECT rowid, CAST(\(column) AS TEXT) AS value
            FROM \(table)
            WHERE \(column) IS NOT NULL
              AND TRIM(CAST(\(column) AS TEXT)) <> ''
              AND CAST(\(column) AS TEXT) NOT LIKE '%-%';
            """
        )

        for row in rows {
            let rowID = try row.int("rowid")
            let rawValue = try row.string("value")
            guard let normalizedDate = QuestionFileCodec.parseDate(rawValue) else {
                continue
            }
            try database.execute(
                "UPDATE \(table) SET \(column) = ? WHERE rowid = ?;",
                bindings: [
                    .text(QuestionFileCodec.formatDate(normalizedDate)),
                    .integer(Int64(rowID)),
                ]
            )
        }
    }

    private static let utcCalendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .current
        return calendar
    }()
}

private struct DashboardAttemptMetric {
    let isCorrect: Bool
    let timeSpentMs: Int?
    let createdAt: Date
    let curriculum: String
}

private struct DashboardSessionMetric {
    let id: String
    let mode: PracticeMode
    let createdAt: Date
    let completedAt: Date?
    let answered: Int
    let correct: Int
}

private struct DashboardMasteryMetric {
    let tagID: String
    let elo: Double
    let name: String
    let kind: TagKind
}

private extension Optional {
    func unwrap(_ label: String) throws -> Wrapped {
        guard let self else {
            throw RepoStoreError.invalidData("Missing \(label).")
        }
        return self
    }
}

private extension Array {
    func chunked(into size: Int) -> [[Element]] {
        guard size > 0, !isEmpty else { return isEmpty ? [] : [self] }
        var results: [[Element]] = []
        var index = startIndex
        while index < endIndex {
            let end = self.index(index, offsetBy: size, limitedBy: endIndex) ?? endIndex
            results.append(Array(self[index..<end]))
            index = end
        }
        return results
    }
}
