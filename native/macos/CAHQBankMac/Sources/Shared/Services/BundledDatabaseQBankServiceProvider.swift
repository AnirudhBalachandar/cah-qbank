import Foundation

enum BundledDatabaseBootstrapError: LocalizedError {
    case missingBundledDatabase
    case applicationSupportUnavailable

    var errorDescription: String? {
        switch self {
        case .missingBundledDatabase:
            return "Bundled question library is missing."
        case .applicationSupportUnavailable:
            return "Unable to prepare local question library storage."
        }
    }
}

struct BundledDatabaseQBankServiceProvider: QBankServiceProviding {
    let bundle: Bundle
    let fileManager: FileManager
    let storageDirectoryName: String
    let bundledDatabaseURL: URL?
    let bundledContentVersion: String?

    init(
        bundle: Bundle = .main,
        fileManager: FileManager = .default,
        storageDirectoryName: String = "CAHQBank",
        bundledDatabaseURL: URL? = nil,
        bundledContentVersion: String? = nil
    ) {
        self.bundle = bundle
        self.fileManager = fileManager
        self.storageDirectoryName = storageDirectoryName
        self.bundledDatabaseURL = bundledDatabaseURL
        self.bundledContentVersion = bundledContentVersion
    }

    func connectedService(configuration: RepoLinkConfiguration) throws -> QBankService {
        guard let bundledDatabaseURL = bundledDatabaseURL ?? bundle.url(forResource: "bundled-cah", withExtension: "db") else {
            throw BundledDatabaseBootstrapError.missingBundledDatabase
        }

        guard let supportURL = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
            throw BundledDatabaseBootstrapError.applicationSupportUnavailable
        }

        let storageRoot = supportURL.appendingPathComponent(storageDirectoryName, isDirectory: true)
        let repoRoot = storageRoot.appendingPathComponent("Library", isDirectory: true)
        let databaseURL = storageRoot.appendingPathComponent("cah.db", isDirectory: false)

        try prepareStorageShape(at: repoRoot)
        try fileManager.createDirectory(at: storageRoot, withIntermediateDirectories: true)

        try installBundledDatabaseIfNeeded(from: bundledDatabaseURL, to: databaseURL)

        let context = try RepoContext(repoRoot: repoRoot, databaseURL: databaseURL, environment: [:])
        return try QBankService(context: context, contentMode: .databaseOnly)
    }

    private func prepareStorageShape(at libraryRoot: URL) throws {
        for child in ["questions", "app", "native"] {
            try fileManager.createDirectory(
                at: libraryRoot.appendingPathComponent(child, isDirectory: true),
                withIntermediateDirectories: true
            )
        }
    }

    private func installBundledDatabaseIfNeeded(from bundledDatabaseURL: URL, to databaseURL: URL) throws {
        let bundledSignature = try BundledContentSignature.load(from: bundledDatabaseURL)
        let contentVersion = resolvedBundledContentVersion(
            bundledDatabaseURL: bundledDatabaseURL,
            signature: bundledSignature
        )

        guard fileManager.fileExists(atPath: databaseURL.path) else {
            try fileManager.copyItem(at: bundledDatabaseURL, to: databaseURL)
            let localDatabase = try SQLiteDatabase(path: databaseURL.path)
            try localDatabase.ensureSchema()
            try recordInstalledBundle(
                in: localDatabase,
                signature: bundledSignature,
                contentVersion: contentVersion
            )
            return
        }

        let localDatabase = try SQLiteDatabase(path: databaseURL.path)
        try localDatabase.ensureSchema()

        let localSignature = try BundledContentSignature.load(from: localDatabase)
        if localSignature == bundledSignature {
            try recordInstalledBundle(
                in: localDatabase,
                signature: bundledSignature,
                contentVersion: contentVersion
            )
            return
        }

        let installedVersion = try metadataValue(for: MetadataKey.contentVersion, in: localDatabase)
        if shouldSkipDowngrade(currentVersion: contentVersion, installedVersion: installedVersion) {
            return
        }

        try refreshLocalContent(
            in: localDatabase,
            from: bundledDatabaseURL,
            signature: bundledSignature,
            contentVersion: contentVersion
        )
    }

    private func refreshLocalContent(
        in database: SQLiteDatabase,
        from bundledDatabaseURL: URL,
        signature: BundledContentSignature,
        contentVersion: String
    ) throws {
        try database.execute(
            "ATTACH DATABASE ? AS bundled_content;",
            bindings: [.text(readOnlyDatabaseURI(for: bundledDatabaseURL))]
        )
        defer {
            try? database.execute("DETACH DATABASE bundled_content;")
        }

        try database.transaction {
            try backupUserTables(in: database)

            try database.execute("DELETE FROM Attempt;")
            try database.execute("DELETE FROM Flag;")
            try database.execute("DELETE FROM UserNote;")
            try database.execute("DELETE FROM TagMastery;")
            try database.execute("DELETE FROM PracticeSession;")
            try database.execute("DELETE FROM QuestionTag;")
            try database.execute("DELETE FROM Question;")
            try database.execute("DELETE FROM Tag;")

            try database.execute(
                """
                INSERT INTO Tag (slug, name, kind, parentSlug)
                SELECT slug, name, kind, parentSlug
                FROM bundled_content.Tag
                ORDER BY CASE WHEN parentSlug IS NULL THEN 0 ELSE 1 END, slug;
                """
            )
            try database.execute(
                """
                INSERT INTO Question (
                  id, stem, questionType, options, explanation, citations, curriculum, status, createdBy,
                  createdAt, sourceFingerprint, rationale, optionExplanations, moduleCode, difficulty, ausScore,
                  source, isAnswerable
                )
                SELECT
                  id, stem, questionType, options, explanation, citations, curriculum, status, createdBy,
                  createdAt, sourceFingerprint, rationale, optionExplanations, moduleCode, difficulty, ausScore,
                  source, isAnswerable
                FROM bundled_content.Question;
                """
            )
            try database.execute(
                """
                INSERT INTO QuestionTag (questionId, tagId)
                SELECT questionId, tagId
                FROM bundled_content.QuestionTag;
                """
            )

            try restoreUserTables(in: database)
            try recordInstalledBundle(
                in: database,
                signature: signature,
                contentVersion: contentVersion
            )
        }
    }

    private func backupUserTables(in database: SQLiteDatabase) throws {
        try database.execute(
            """
            CREATE TEMP TABLE __cah_PracticeSession_backup AS
            SELECT id, mode, questionIds, currentIndex, createdAt, completedAt
            FROM PracticeSession;
            """
        )
        try database.execute(
            """
            CREATE TEMP TABLE __cah_Attempt_backup AS
            SELECT id, questionId, sessionId, selectedKey, isCorrect, timeSpentMs, confidence, createdAt
            FROM Attempt;
            """
        )
        try database.execute(
            """
            CREATE TEMP TABLE __cah_Flag_backup AS
            SELECT questionId, createdAt
            FROM Flag;
            """
        )
        try database.execute(
            """
            CREATE TEMP TABLE __cah_UserNote_backup AS
            SELECT questionId, noteMarkdown, updatedAt
            FROM UserNote;
            """
        )
        try database.execute(
            """
            CREATE TEMP TABLE __cah_TagMastery_backup AS
            SELECT tagId, elo, attemptCount, correctCount, updatedAt
            FROM TagMastery;
            """
        )
    }

    private func restoreUserTables(in database: SQLiteDatabase) throws {
        try database.execute(
            """
            INSERT INTO PracticeSession (id, mode, questionIds, currentIndex, createdAt, completedAt)
            SELECT id, mode, questionIds, currentIndex, createdAt, completedAt
            FROM __cah_PracticeSession_backup;
            """
        )
        try database.execute(
            """
            INSERT INTO Attempt (id, questionId, sessionId, selectedKey, isCorrect, timeSpentMs, confidence, createdAt)
            SELECT id, questionId, sessionId, selectedKey, isCorrect, timeSpentMs, confidence, createdAt
            FROM __cah_Attempt_backup
            WHERE EXISTS (SELECT 1 FROM Question WHERE Question.id = __cah_Attempt_backup.questionId)
              AND EXISTS (SELECT 1 FROM PracticeSession WHERE PracticeSession.id = __cah_Attempt_backup.sessionId);
            """
        )
        try database.execute(
            """
            INSERT INTO Flag (questionId, createdAt)
            SELECT questionId, createdAt
            FROM __cah_Flag_backup
            WHERE EXISTS (SELECT 1 FROM Question WHERE Question.id = __cah_Flag_backup.questionId);
            """
        )
        try database.execute(
            """
            INSERT INTO UserNote (questionId, noteMarkdown, updatedAt)
            SELECT questionId, noteMarkdown, updatedAt
            FROM __cah_UserNote_backup
            WHERE EXISTS (SELECT 1 FROM Question WHERE Question.id = __cah_UserNote_backup.questionId);
            """
        )
        try database.execute(
            """
            INSERT INTO TagMastery (tagId, elo, attemptCount, correctCount, updatedAt)
            SELECT tagId, elo, attemptCount, correctCount, updatedAt
            FROM __cah_TagMastery_backup
            WHERE EXISTS (SELECT 1 FROM Tag WHERE Tag.slug = __cah_TagMastery_backup.tagId);
            """
        )
        try database.execute("DROP TABLE __cah_PracticeSession_backup;")
        try database.execute("DROP TABLE __cah_Attempt_backup;")
        try database.execute("DROP TABLE __cah_Flag_backup;")
        try database.execute("DROP TABLE __cah_UserNote_backup;")
        try database.execute("DROP TABLE __cah_TagMastery_backup;")
    }

    private func recordInstalledBundle(
        in database: SQLiteDatabase,
        signature: BundledContentSignature,
        contentVersion: String
    ) throws {
        let values: [(String, String)] = [
            (MetadataKey.contentVersion, contentVersion),
            (MetadataKey.contentFingerprint, signature.digest),
            (MetadataKey.questionCount, "\(signature.questionCount)"),
            (MetadataKey.publishedCount, "\(signature.publishedCount)"),
            (MetadataKey.answerablePublishedCount, "\(signature.answerablePublishedCount)"),
        ]

        for (key, value) in values {
            try database.execute(
                """
                INSERT INTO LibraryMetadata (key, value)
                VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value;
                """,
                bindings: [.text(key), .text(value)]
            )
        }
    }

    private func metadataValue(for key: String, in database: SQLiteDatabase) throws -> String? {
        try database.query(
            "SELECT value FROM LibraryMetadata WHERE key = ?;",
            bindings: [.text(key)]
        ).first?.string("value")
    }

    private func resolvedBundledContentVersion(
        bundledDatabaseURL: URL,
        signature: BundledContentSignature
    ) -> String {
        if let bundledContentVersion {
            return bundledContentVersion
        }
        if let bundleVersion = bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String,
           !bundleVersion.isEmpty {
            return bundleVersion
        }
        if let fileVersion = try? bundledDatabaseURL.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate {
            return "\(fileVersion.timeIntervalSince1970)"
        }
        return "content-\(signature.digest)"
    }

    private func shouldSkipDowngrade(currentVersion: String, installedVersion: String?) -> Bool {
        guard let installedVersion,
              let comparison = Self.compareDottedNumericVersion(currentVersion, installedVersion) else {
            return false
        }
        return comparison == .orderedAscending
    }

    private static func compareDottedNumericVersion(_ lhs: String, _ rhs: String) -> ComparisonResult? {
        let lhsParts = lhs.split(separator: ".").map(String.init)
        let rhsParts = rhs.split(separator: ".").map(String.init)
        guard lhsParts.allSatisfy({ Int($0) != nil }),
              rhsParts.allSatisfy({ Int($0) != nil }) else {
            return nil
        }

        let maxCount = max(lhsParts.count, rhsParts.count)
        for index in 0..<maxCount {
            let lhsValue = index < lhsParts.count ? Int(lhsParts[index]) ?? 0 : 0
            let rhsValue = index < rhsParts.count ? Int(rhsParts[index]) ?? 0 : 0
            if lhsValue < rhsValue { return .orderedAscending }
            if lhsValue > rhsValue { return .orderedDescending }
        }
        return .orderedSame
    }

    private func readOnlyDatabaseURI(for url: URL) -> String {
        "\(url.absoluteString)?mode=ro"
    }
}

private enum MetadataKey {
    static let contentVersion = "bundledContentVersion"
    static let contentFingerprint = "bundledContentFingerprint"
    static let questionCount = "bundledContentQuestionCount"
    static let publishedCount = "bundledContentPublishedCount"
    static let answerablePublishedCount = "bundledContentAnswerablePublishedCount"
}

private struct BundledContentSignature: Equatable {
    let questionCount: Int
    let publishedCount: Int
    let answerablePublishedCount: Int
    let browseOnlyPublishedCount: Int
    let tagCount: Int
    let questionTagCount: Int
    let digest: String

    static func load(from url: URL) throws -> BundledContentSignature {
        let database = try SQLiteDatabase(path: url.path, readOnly: true)
        return try load(from: database)
    }

    static func load(from database: SQLiteDatabase) throws -> BundledContentSignature {
        let questionCount = try scalarInt("SELECT COUNT(*) AS count FROM Question;", in: database)
        let publishedCount = try scalarInt("SELECT COUNT(*) AS count FROM Question WHERE status = 'published';", in: database)
        let answerablePublishedCount = try scalarInt(
            "SELECT COUNT(*) AS count FROM Question WHERE status = 'published' AND isAnswerable = 1;",
            in: database
        )
        let browseOnlyPublishedCount = try scalarInt(
            "SELECT COUNT(*) AS count FROM Question WHERE status = 'published' AND isAnswerable = 0;",
            in: database
        )
        let tagCount = try scalarInt("SELECT COUNT(*) AS count FROM Tag;", in: database)
        let questionTagCount = try scalarInt("SELECT COUNT(*) AS count FROM QuestionTag;", in: database)

        var hasher = StableContentHasher()
        try hashRows(
            query: """
            SELECT id, stem, questionType, options, COALESCE(explanation, '') AS explanation,
                   citations, curriculum, status, createdBy, createdAt, sourceFingerprint,
                   COALESCE(rationale, '') AS rationale, optionExplanations,
                   COALESCE(moduleCode, '') AS moduleCode, COALESCE(difficulty, '') AS difficulty,
                   COALESCE(CAST(ausScore AS TEXT), '') AS ausScore, source,
                   CAST(isAnswerable AS TEXT) AS isAnswerable
            FROM Question
            ORDER BY id;
            """,
            columns: [
                "id", "stem", "questionType", "options", "explanation", "citations", "curriculum", "status",
                "createdBy", "createdAt", "sourceFingerprint", "rationale", "optionExplanations",
                "moduleCode", "difficulty", "ausScore", "source", "isAnswerable",
            ],
            database: database,
            hasher: &hasher
        )
        try hashRows(
            query: "SELECT slug, name, kind, COALESCE(parentSlug, '') AS parentSlug FROM Tag ORDER BY slug;",
            columns: ["slug", "name", "kind", "parentSlug"],
            database: database,
            hasher: &hasher
        )
        try hashRows(
            query: "SELECT questionId, tagId FROM QuestionTag ORDER BY questionId, tagId;",
            columns: ["questionId", "tagId"],
            database: database,
            hasher: &hasher
        )

        return BundledContentSignature(
            questionCount: questionCount,
            publishedCount: publishedCount,
            answerablePublishedCount: answerablePublishedCount,
            browseOnlyPublishedCount: browseOnlyPublishedCount,
            tagCount: tagCount,
            questionTagCount: questionTagCount,
            digest: hasher.digest
        )
    }

    private static func scalarInt(_ sql: String, in database: SQLiteDatabase) throws -> Int {
        try database.query(sql).first?.int("count") ?? 0
    }

    private static func hashRows(
        query: String,
        columns: [String],
        database: SQLiteDatabase,
        hasher: inout StableContentHasher
    ) throws {
        let rows = try database.query(query)
        hasher.appendField("\(rows.count)")
        for row in rows {
            for column in columns {
                hasher.appendField(try row.string(column))
            }
        }
    }
}

private struct StableContentHasher {
    private var hash: UInt64 = 14_695_981_039_346_656_037
    private let prime: UInt64 = 1_099_511_628_211

    var digest: String {
        String(format: "%016llx", hash)
    }

    mutating func appendField(_ value: String) {
        append("\(value.utf8.count):")
        append(value)
        append(";")
    }

    private mutating func append(_ value: String) {
        for byte in value.utf8 {
            hash ^= UInt64(byte)
            hash = hash &* prime
        }
    }
}
