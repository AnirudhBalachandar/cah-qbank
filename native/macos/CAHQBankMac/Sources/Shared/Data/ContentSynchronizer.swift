import Foundation

struct ContentSynchronizer {
    func sync(using context: RepoContext, database: SQLiteDatabase) throws -> RepoSyncReport {
        try database.ensureSchema()
        let questions = try QuestionFileLoader.loadAll(from: context)
        let tags = TagDescriptorCollector.collect(from: questions)
        let encoder = QuestionFileCodec.encoder()

        return try database.transaction {
            for tag in tags {
                try database.execute(
                    """
                    INSERT INTO Tag (slug, name, kind, parentSlug)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(slug) DO UPDATE SET
                      name = excluded.name,
                      kind = excluded.kind,
                      parentSlug = excluded.parentSlug;
                    """,
                    bindings: [
                        .text(tag.slug),
                        .text(tag.name),
                        .text(tag.kind.rawValue),
                        tag.parentSlug.map(SQLiteBindValue.text) ?? .null,
                    ]
                )
            }

            let nextTagIDs = Set(tags.map(\.slug))
            if nextTagIDs.isEmpty {
                try database.execute("DELETE FROM Tag;")
            } else {
                for chunk in Array(nextTagIDs).chunked(into: 200) {
                    let placeholders = Array(repeating: "?", count: chunk.count).joined(separator: ", ")
                    try database.execute(
                        "DELETE FROM Tag WHERE slug NOT IN (\(placeholders));",
                        bindings: chunk.map(SQLiteBindValue.text)
                    )
                }
            }

            let currentRows = try database.query("SELECT id FROM Question;")
            let currentIDs = Set(try currentRows.map { try $0.string("id") })
            let nextIDs = Set(questions.map(\.id))
            let obsoleteIDs = currentIDs.subtracting(nextIDs)

            for question in questions {
                let optionsJSON = try String(data: encoder.encode(question.options), encoding: .utf8).unwrap("options")
                let citationsJSON = try String(data: encoder.encode(question.citations), encoding: .utf8).unwrap("citations")
                let optionExplanationsJSON = try String(
                    data: encoder.encode(question.optionExplanations ?? [:]),
                    encoding: .utf8
                ).unwrap("option explanations")
                let sourceJSON = try String(
                    data: encoder.encode(question.source ?? [:]),
                    encoding: .utf8
                ).unwrap("source")

                try database.execute(
                    """
                    INSERT INTO Question (
                      id, stem, questionType, options, explanation, citations, curriculum, status, createdBy,
                      createdAt, sourceFingerprint, rationale, optionExplanations, moduleCode, difficulty, ausScore,
                      source, isAnswerable
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                      stem = excluded.stem,
                      questionType = excluded.questionType,
                      options = excluded.options,
                      explanation = excluded.explanation,
                      citations = excluded.citations,
                      curriculum = excluded.curriculum,
                      status = excluded.status,
                      createdBy = excluded.createdBy,
                      createdAt = excluded.createdAt,
                      sourceFingerprint = excluded.sourceFingerprint,
                      rationale = excluded.rationale,
                      optionExplanations = excluded.optionExplanations,
                      moduleCode = excluded.moduleCode,
                      difficulty = excluded.difficulty,
                      ausScore = excluded.ausScore,
                      source = excluded.source,
                      isAnswerable = excluded.isAnswerable;
                    """,
                    bindings: [
                        .text(question.id),
                        .text(question.stem),
                        .text(question.questionType.rawValue),
                        .text(optionsJSON),
                        question.explanation.map(SQLiteBindValue.text) ?? .null,
                        .text(citationsJSON),
                        .text(question.curriculum.rawValue),
                        .text(question.status.rawValue),
                        .text(question.createdBy.rawValue),
                        .text(QuestionFileCodec.formatDate(question.createdAt)),
                        .text(question.sourceFingerprint),
                        question.rationale.map(SQLiteBindValue.text) ?? .null,
                        .text(optionExplanationsJSON),
                        question.moduleCode.map(SQLiteBindValue.text) ?? .null,
                        question.difficulty.map { .text($0.rawValue) } ?? .null,
                        question.ausScore.map { .integer(Int64($0)) } ?? .null,
                        .text(sourceJSON),
                        .integer(question.isAnswerable ? 1 : 0),
                    ]
                )
            }

            let questionIDs = Array(nextIDs)
            for chunk in questionIDs.chunked(into: 200) {
                let placeholders = Array(repeating: "?", count: chunk.count).joined(separator: ", ")
                try database.execute(
                    "DELETE FROM QuestionTag WHERE questionId IN (\(placeholders));",
                    bindings: chunk.map(SQLiteBindValue.text)
                )
            }

            var questionTagCount = 0
            for question in questions {
                for tagID in LearnerTagProjector.projectedSlugs(for: question) {
                    questionTagCount += 1
                    try database.execute(
                        """
                        INSERT INTO QuestionTag (questionId, tagId)
                        VALUES (?, ?)
                        ON CONFLICT(questionId, tagId) DO NOTHING;
                        """,
                        bindings: [.text(question.id), .text(tagID)]
                    )
                }
            }

            for chunk in Array(obsoleteIDs).chunked(into: 200) where !chunk.isEmpty {
                let placeholders = Array(repeating: "?", count: chunk.count).joined(separator: ", ")
                try database.execute(
                    "DELETE FROM Question WHERE id IN (\(placeholders));",
                    bindings: chunk.map(SQLiteBindValue.text)
                )
            }

            return RepoSyncReport(
                databaseURL: context.databaseURL,
                questionCount: questions.count,
                publishedCount: questions.filter { $0.status == .published }.count,
                draftCount: questions.filter { $0.status == .draft }.count,
                answerablePublishedCount: questions.filter { $0.status == .published && $0.isAnswerable }.count,
                tagCount: tags.count,
                questionTagCount: questionTagCount
            )
        }
    }
}

private extension Optional where Wrapped == String {
    func unwrap(_ label: String) throws -> String {
        guard let value = self else {
            throw RepoStoreError.invalidData("Unable to encode \(label) JSON.")
        }
        return value
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
