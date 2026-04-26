import Foundation
@testable import CAHQBankMac

struct TemporaryRepo {
    let rootURL: URL
    let context: RepoContext

    init(questions: [QuestionFile], drafts: [QuestionFile] = []) throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: root.appendingPathComponent("questions"), withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: root.appendingPathComponent("drafts"), withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: root.appendingPathComponent("app"), withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: root.appendingPathComponent("native"), withIntermediateDirectories: true)
        try "{}".write(to: root.appendingPathComponent("package.json"), atomically: true, encoding: .utf8)

        let encoder = QuestionFileCodec.encoder()
        for question in questions {
            let data = try encoder.encode(question)
            try data.write(to: root.appendingPathComponent("questions/\(question.id).json"))
        }
        for question in drafts {
            let data = try encoder.encode(question)
            try data.write(to: root.appendingPathComponent("drafts/\(question.id).json"))
        }

        self.rootURL = root
        self.context = try RepoContext(repoRoot: root)
    }

    func cleanup() throws {
        try FileManager.default.removeItem(at: rootURL)
    }
}

func fixtureQuestion(
    id: String,
    stem: String = "Question stem",
    tags: [String] = ["general-paediatrics"],
    curriculum: Curriculum = .generalPaediatrics,
    status: QuestionStatus = .published,
    difficulty: Difficulty? = .intermediate,
    correctKey: String = "B",
    createdAt: Date = Date(timeIntervalSince1970: 1_700_000_000),
    sourceFingerprint: String? = nil
) -> QuestionFile {
    QuestionFile(
        id: id,
        stem: stem,
        questionType: .sba,
        options: [
            QuestionOption(key: "A", text: "Option A", isCorrect: correctKey == "A"),
            QuestionOption(key: "B", text: "Option B", isCorrect: correctKey == "B"),
            QuestionOption(key: "C", text: "Option C", isCorrect: correctKey == "C"),
            QuestionOption(key: "D", text: "Option D", isCorrect: correctKey == "D"),
            QuestionOption(key: "E", text: "Option E", isCorrect: correctKey == "E"),
        ],
        explanation: "Explanation for \(id)",
        citations: [QuestionCitation(type: "internal", source: "source-\(id)", page: 1, url: nil, title: "Source \(id)")],
        tags: tags,
        curriculum: curriculum,
        status: status,
        createdBy: .manual,
        createdAt: createdAt,
        sourceFingerprint: sourceFingerprint ?? "fingerprint-\(id)",
        rationale: "Rationale for \(id)",
        optionExplanations: ["A": "Why A", "B": "Why B", "C": "Why C", "D": "Why D", "E": "Why E"],
        moduleCode: nil,
        difficulty: difficulty,
        ausScore: 3,
        source: ["kind": .string("fixture")]
    )
}

func writeProjectedDatabase(at databaseURL: URL, questions: [QuestionFile]) throws {
    let repo = try TemporaryRepo(questions: questions)
    defer { try? repo.cleanup() }

    let database = try SQLiteDatabase(path: databaseURL.path)
    let synchronizer = ContentSynchronizer()
    _ = try synchronizer.sync(using: repo.context, database: database)
}
