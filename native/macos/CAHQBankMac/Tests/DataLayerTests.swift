import XCTest
@testable import CAHQBankMac

final class DataLayerTests: XCTestCase {
    func testRepoLocatorUsesExplicitRepoAndRelativeDatabaseOverride() throws {
        let repo = try TemporaryRepo(questions: [fixtureQuestion(id: "q-1")])
        defer { try? repo.cleanup() }

        let context = try RepoLocator.locate(environment: [
            "CAH_QBANK_REPO_ROOT": repo.rootURL.path,
            "CAH_QBANK_DATABASE_PATH": "var/test-cah.db",
        ])

        XCTAssertEqual(context.repoRoot.path, repo.rootURL.standardizedFileURL.path)
        XCTAssertEqual(context.databaseURL.path, repo.rootURL.appendingPathComponent("var/test-cah.db").path)
    }

    func testRepoLocatorUsesAppSuppliedExplicitRepoRootWithoutEnvironmentOverride() throws {
        let repo = try TemporaryRepo(questions: [fixtureQuestion(id: "q-1")])
        defer { try? repo.cleanup() }

        let context = try RepoLocator.locate(
            configuration: RepoLinkConfiguration(
                explicitRepoRootURL: repo.rootURL,
                environment: [:]
            )
        )

        XCTAssertEqual(context.repoRoot.path, repo.rootURL.standardizedFileURL.path)
        XCTAssertEqual(context.databaseURL.path, repo.rootURL.appendingPathComponent("cah.db").path)
    }

    func testRepoLocatorExplicitConfigurationOverridesBrokenEnvironment() throws {
        let repo = try TemporaryRepo(questions: [fixtureQuestion(id: "q-1")])
        defer { try? repo.cleanup() }

        let invalidRoot = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: invalidRoot, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: invalidRoot) }

        let context = try RepoLocator.locate(
            configuration: RepoLinkConfiguration(
                explicitRepoRootURL: repo.rootURL,
                environment: ["CAH_QBANK_REPO_ROOT": invalidRoot.path]
            )
        )

        XCTAssertEqual(context.repoRoot.path, repo.rootURL.standardizedFileURL.path)
    }

    func testRepoLocatorRejectsInvalidConfiguredRepoRoot() throws {
        let invalidRoot = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: invalidRoot, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: invalidRoot) }

        XCTAssertThrowsError(
            try RepoLocator.locate(environment: ["CAH_QBANK_REPO_ROOT": invalidRoot.path])
        ) { error in
            guard case let RepoStoreError.invalidConfiguredRepoRoot(path) = error else {
                return XCTFail("Unexpected error: \(error)")
            }
            XCTAssertEqual(path, invalidRoot.standardizedFileURL.path)
        }
    }

    func testRepoStoreResolvesExplicitConfiguration() throws {
        let repo = try TemporaryRepo(questions: [fixtureQuestion(id: "q-1")])
        defer { try? repo.cleanup() }

        let resolvedRoot = try RepoStore.resolveRepoRoot(
            configuration: RepoLinkConfiguration(
                explicitRepoRootURL: repo.rootURL,
                environment: [:]
            )
        )

        XCTAssertEqual(resolvedRoot.path, repo.rootURL.standardizedFileURL.path)
    }

    func testTagDescriptorCollectorMarksCurriculumAndTopicHierarchy() throws {
        let question = fixtureQuestion(
            id: "q-1",
            tags: ["paediatric-sub-specialties/respiratory"]
        )

        let descriptors = TagDescriptorCollector.collect(from: [question])

        XCTAssertTrue(descriptors.contains(where: { $0.slug == "paediatric-sub-specialties" && $0.kind == .curriculum }))
        XCTAssertTrue(descriptors.contains(where: { $0.slug == "paediatric-sub-specialties/respiratory" && $0.kind == .topic }))
    }

    func testTagDescriptorCollectorCanonicalizesBlueprintCurriculumTags() throws {
        let question = fixtureQuestion(
            id: "q-1",
            tags: [
                "cah-exam-blueprint/cah-kat",
                "cah-exam-blueprint/cah-kat/paediatric-sub-specialties",
                "notebooklm",
            ],
            curriculum: .paediatricSubSpecialties
        )

        let descriptors = TagDescriptorCollector.collect(from: [question])

        XCTAssertTrue(descriptors.contains(where: { $0.slug == "paediatric-sub-specialties" && $0.kind == .curriculum }))
        XCTAssertFalse(descriptors.contains(where: { $0.slug == "notebooklm" }))
        XCTAssertFalse(descriptors.contains(where: { $0.slug.contains("cah-exam-blueprint") }))
    }

    func testQuestionFileLoaderRejectsFilenameIDMismatch() throws {
        let repo = try TemporaryRepo(questions: [fixtureQuestion(id: "q-1")])
        defer { try? repo.cleanup() }

        let originalURL = repo.rootURL.appendingPathComponent("questions/q-1.json")
        let renamedURL = repo.rootURL.appendingPathComponent("questions/not-q-1.json")
        try FileManager.default.moveItem(at: originalURL, to: renamedURL)

        XCTAssertThrowsError(try QuestionFileLoader.loadAll(from: repo.context)) { error in
            guard case let RepoStoreError.invalidData(message) = error else {
                return XCTFail("Unexpected error: \(error)")
            }
            XCTAssertTrue(message.contains("questions/not-q-1.json"))
            XCTAssertTrue(message.contains("Expected filename id not-q-1 but found q-1"))
        }
    }

    func testQuestionFileLoaderRejectsStatusMismatchForDirectory() throws {
        let repo = try TemporaryRepo(questions: [
            fixtureQuestion(id: "q-1", status: .draft),
        ])
        defer { try? repo.cleanup() }

        XCTAssertThrowsError(try QuestionFileLoader.loadAll(from: repo.context)) { error in
            guard case let RepoStoreError.invalidData(message) = error else {
                return XCTFail("Unexpected error: \(error)")
            }
            XCTAssertTrue(message.contains("questions/q-1.json"))
            XCTAssertTrue(message.contains("Expected status published but found draft"))
        }
    }

    func testQuestionFileLoaderRejectsDuplicateQuestionIDsAcrossDirectories() throws {
        let repo = try TemporaryRepo(
            questions: [
                fixtureQuestion(id: "shared-id", sourceFingerprint: "fingerprint-published"),
            ],
            drafts: [
                fixtureQuestion(id: "shared-id", status: .draft, sourceFingerprint: "fingerprint-draft"),
            ]
        )
        defer { try? repo.cleanup() }

        XCTAssertThrowsError(try QuestionFileLoader.loadAll(from: repo.context)) { error in
            guard case let RepoStoreError.invalidData(message) = error else {
                return XCTFail("Unexpected error: \(error)")
            }
            XCTAssertTrue(message.contains("drafts/shared-id.json") || message.contains("questions/shared-id.json"))
            XCTAssertTrue(message.contains("Duplicate question id detected: shared-id"))
        }
    }

    func testQuestionFileLoaderRejectsDuplicateSourceFingerprintsAcrossDirectories() throws {
        let repo = try TemporaryRepo(
            questions: [
                fixtureQuestion(id: "q-1", sourceFingerprint: "shared-fingerprint"),
            ],
            drafts: [
                fixtureQuestion(id: "q-2", status: .draft, sourceFingerprint: "shared-fingerprint"),
            ]
        )
        defer { try? repo.cleanup() }

        XCTAssertThrowsError(try QuestionFileLoader.loadAll(from: repo.context)) { error in
            guard case let RepoStoreError.invalidData(message) = error else {
                return XCTFail("Unexpected error: \(error)")
            }
            XCTAssertTrue(message.contains("Duplicate sourceFingerprint detected: shared-fingerprint"))
        }
    }

    func testContentSyncReturnsClearInvalidDataFailureForMalformedQuestionFile() throws {
        let repo = try TemporaryRepo(questions: [fixtureQuestion(id: "q-1")])
        defer { try? repo.cleanup() }

        let invalidURL = repo.rootURL.appendingPathComponent("drafts/bad.json")
        try "{ invalid json".write(to: invalidURL, atomically: true, encoding: .utf8)

        let database = try SQLiteDatabase(path: repo.context.databaseURL.path)
        let synchronizer = ContentSynchronizer()

        XCTAssertThrowsError(try synchronizer.sync(using: repo.context, database: database)) { error in
            guard case let RepoStoreError.invalidData(message) = error else {
                return XCTFail("Unexpected error: \(error)")
            }
            XCTAssertTrue(message.contains("drafts/bad.json"))
        }

        let rows = try? database.query("SELECT COUNT(*) AS count FROM Question;")
        XCTAssertEqual(try rows?.first?.int("count"), 0)
    }

    func testContentSyncRefreshesProjectionWithoutDeletingExistingNote() throws {
        let repo = try TemporaryRepo(questions: [
            fixtureQuestion(id: "q-1", stem: "Original question"),
        ])
        defer { try? repo.cleanup() }

        let database = try SQLiteDatabase(path: repo.context.databaseURL.path)
        let synchronizer = ContentSynchronizer()

        _ = try synchronizer.sync(using: repo.context, database: database)
        try database.execute(
            """
            INSERT INTO UserNote (questionId, noteMarkdown, updatedAt)
            VALUES (?, ?, ?);
            """,
            bindings: [.text("q-1"), .text("Keep me"), .text(QuestionFileCodec.formatDate(Date()))]
        )

        let replacement = fixtureQuestion(id: "q-1", stem: "Updated question")
        let encoder = QuestionFileCodec.encoder()
        try encoder.encode(replacement).write(to: repo.rootURL.appendingPathComponent("questions/q-1.json"))

        let report = try synchronizer.sync(using: repo.context, database: database)
        let noteRows = try database.query("SELECT noteMarkdown FROM UserNote WHERE questionId = ?;", bindings: [.text("q-1")])
        let questionRows = try database.query("SELECT stem FROM Question WHERE id = ?;", bindings: [.text("q-1")])

        XCTAssertEqual(report.questionCount, 1)
        XCTAssertEqual(try noteRows.first?.string("noteMarkdown"), "Keep me")
        XCTAssertEqual(try questionRows.first?.string("stem"), "Updated question")
    }

    func testContentSyncRemovesObsoleteQuestionProjectionRows() throws {
        let repo = try TemporaryRepo(questions: [
            fixtureQuestion(id: "q-1"),
            fixtureQuestion(id: "q-2"),
        ])
        defer { try? repo.cleanup() }

        let database = try SQLiteDatabase(path: repo.context.databaseURL.path)
        let synchronizer = ContentSynchronizer()
        _ = try synchronizer.sync(using: repo.context, database: database)

        try FileManager.default.removeItem(at: repo.rootURL.appendingPathComponent("questions/q-2.json"))

        let report = try synchronizer.sync(using: repo.context, database: database)
        let questionRows = try database.query("SELECT id FROM Question ORDER BY id;")

        XCTAssertEqual(report.questionCount, 1)
        XCTAssertEqual(try questionRows.map { try $0.string("id") }, ["q-1"])
    }

    func testContentSyncRemovesObsoleteTagsAndTagMastery() throws {
        let repo = try TemporaryRepo(questions: [
            fixtureQuestion(id: "q-1", tags: ["general-paediatrics", "respiratory"]),
        ])
        defer { try? repo.cleanup() }

        let database = try SQLiteDatabase(path: repo.context.databaseURL.path)
        let synchronizer = ContentSynchronizer()
        _ = try synchronizer.sync(using: repo.context, database: database)

        try database.execute(
            """
            INSERT INTO TagMastery (tagId, elo, attemptCount, correctCount, updatedAt)
            VALUES ('respiratory', 930, 3, 1, ?);
            """,
            bindings: [.text(QuestionFileCodec.formatDate(Date()))]
        )

        let replacement = fixtureQuestion(id: "q-1", tags: ["general-paediatrics", "cardiology"])
        let encoder = QuestionFileCodec.encoder()
        try encoder.encode(replacement).write(to: repo.rootURL.appendingPathComponent("questions/q-1.json"))

        _ = try synchronizer.sync(using: repo.context, database: database)

        let tagRows = try database.query("SELECT slug FROM Tag ORDER BY slug;")
        let masteryRows = try database.query("SELECT tagId FROM TagMastery ORDER BY tagId;")

        XCTAssertEqual(try tagRows.map { try $0.string("slug") }, ["cardiology", "general-paediatrics"])
        XCTAssertTrue(try masteryRows.map { try $0.string("tagId") }.isEmpty)
    }

    func testContentSyncProjectsBlueprintTagsIntoCanonicalLearnerTags() throws {
        let repo = try TemporaryRepo(questions: [
            fixtureQuestion(
                id: "q-1",
                tags: [
                    "cah-exam-blueprint/cah-kat",
                    "cah-exam-blueprint/cah-kat/general-paediatrics",
                    "notebooklm",
                ],
                curriculum: .generalPaediatrics
            ),
        ])
        defer { try? repo.cleanup() }

        let database = try SQLiteDatabase(path: repo.context.databaseURL.path)
        let synchronizer = ContentSynchronizer()
        _ = try synchronizer.sync(using: repo.context, database: database)

        let tagRows = try database.query("SELECT slug, kind FROM Tag ORDER BY slug;")
        let questionTagRows = try database.query("SELECT tagId FROM QuestionTag ORDER BY tagId;")

        XCTAssertEqual(
            try tagRows.map { row in
                try row.string("slug") + "|" + row.string("kind")
            },
            ["general-paediatrics|curriculum"]
        )
        XCTAssertEqual(try questionTagRows.map { try $0.string("tagId") }, ["general-paediatrics"])
    }
}
