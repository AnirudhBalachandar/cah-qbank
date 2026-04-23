import Foundation

enum Curriculum: String, Codable, CaseIterable, Sendable {
    case generalPaediatrics = "General Paediatrics"
    case paediatricSubSpecialties = "Paediatric Sub-specialties"
    case paediatricSurgery = "Paediatric Surgery"
    case emergencyPaediatrics = "Emergency Paediatrics"
    case adolescentMedicine = "Adolescent Medicine"
    case communityBasedPaediatrics = "Community-based Paediatrics"
    case unclassified = "Unclassified"
}

enum QuestionStatus: String, Codable, Sendable {
    case draft
    case published
}

enum CreatedBy: String, Codable, Sendable {
    case ai
    case `import`
    case manual
}

enum QuestionType: String, Codable, Sendable {
    case sba = "SBA"
}

enum Difficulty: String, Codable, Sendable {
    case basic = "Basic"
    case intermediate = "Intermediate"
    case hard = "Hard"
}

enum TagKind: String, Codable, Sendable {
    case curriculum
    case topic
    case meta
}

enum PracticeMode: String, Codable, Sendable {
    case revision
    case weakness
    case custom
}

enum JSONValue: Codable, Equatable, Sendable {
    case string(String)
    case number(Double)
    case boolean(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .boolean(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([String: JSONValue].self) {
            self = .object(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported JSON value")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case let .string(value):
            try container.encode(value)
        case let .number(value):
            try container.encode(value)
        case let .boolean(value):
            try container.encode(value)
        case let .object(value):
            try container.encode(value)
        case let .array(value):
            try container.encode(value)
        case .null:
            try container.encodeNil()
        }
    }
}

struct QuestionOption: Codable, Equatable, Sendable {
    let key: String
    let text: String
    let isCorrect: Bool?
}

struct QuestionCitation: Codable, Equatable, Sendable {
    let type: String
    let source: String?
    let page: Int?
    let url: String?
    let title: String?
}

struct QuestionFile: Codable, Equatable, Sendable {
    let id: String
    let stem: String
    let questionType: QuestionType
    let options: [QuestionOption]
    let explanation: String?
    let citations: [QuestionCitation]
    let tags: [String]
    let curriculum: Curriculum
    let status: QuestionStatus
    let createdBy: CreatedBy
    let createdAt: Date
    let sourceFingerprint: String
    let rationale: String?
    let optionExplanations: [String: String]?
    let moduleCode: String?
    let difficulty: Difficulty?
    let ausScore: Int?
    let source: [String: JSONValue]?

    var isAnswerable: Bool {
        options.filter { $0.isCorrect == true }.count == 1
    }
}

struct TagDescriptor: Equatable, Sendable {
    let slug: String
    let name: String
    let kind: TagKind
    let parentSlug: String?
}

struct QuestionTag: Identifiable, Equatable, Sendable {
    let slug: String
    let name: String
    let kind: TagKind

    var id: String { slug }
}

struct AttemptRecord: Identifiable, Equatable, Sendable {
    let id: String
    let questionId: String
    let selectedKey: String?
    let isCorrect: Bool
    let createdAt: Date
}

struct QBankQuestion: Identifiable, Equatable, Sendable {
    let id: String
    let stem: String
    let questionType: QuestionType
    let options: [QuestionOption]
    let explanation: String?
    let citations: [QuestionCitation]
    let rationale: String?
    let optionExplanations: [String: String]
    let curriculum: Curriculum
    let createdBy: CreatedBy
    let createdAt: Date
    let difficulty: Difficulty?
    let ausScore: Int?
    let moduleCode: String?
    let sourceFingerprint: String
    let sourceJSON: String
    let isAnswerable: Bool
    let correctKey: String?
    let tags: [QuestionTag]
    let flagged: Bool
    let noteMarkdown: String
    let attemptCount: Int
    let correctCount: Int
}

struct PracticeTagSummary: Identifiable, Equatable, Sendable {
    let slug: String
    let name: String
    let kind: TagKind
    let questionCount: Int
    let elo: Double

    var id: String { slug }
}

struct WeakTagSnapshot: Identifiable, Equatable, Sendable {
    let slug: String
    let name: String
    let elo: Double
    let attempts: Int

    var id: String { slug }
}

struct RecentSessionSummary: Identifiable, Equatable, Sendable {
    let id: String
    let mode: PracticeMode
    let createdAt: Date
    let completedAt: Date?
    let answered: Int
    let correct: Int
}

struct DashboardSnapshot: Equatable, Sendable {
    let publishedCount: Int
    let answerableCount: Int
    let flaggedCount: Int
    let noteCount: Int
    let weakTags: [WeakTagSnapshot]
    let recentSessions: [RecentSessionSummary]
}

struct BrowseSnapshot: Equatable, Sendable {
    let page: Int
    let total: Int
    let pageCount: Int
    let questions: [QBankQuestion]
    let tagOptions: [PracticeTagSummary]
}

struct SessionSnapshot: Identifiable, Equatable, Sendable {
    let id: String
    let mode: PracticeMode
    let currentIndex: Int
    let createdAt: Date
    let completedAt: Date?
    let questions: [QBankQuestion]
    let answeredByQuestion: [String: AttemptRecord]
}

struct AnswerResult: Equatable, Sendable {
    let isCorrect: Bool
    let correctKey: String?
    let correctText: String?
    let explanation: String?
    let citations: [QuestionCitation]
    let rationale: String?
    let optionExplanations: [String: String]
    let completedAt: Bool
    let nextIndex: Int
}

struct ProgressRow: Identifiable, Equatable, Sendable {
    let slug: String
    let name: String
    let kind: TagKind
    let questionCount: Int
    let elo: Double
    let attemptCount: Int
    let correctCount: Int

    var id: String { slug }
}

struct RepoSyncReport: Equatable, Sendable {
    let databaseURL: URL
    let questionCount: Int
    let publishedCount: Int
    let draftCount: Int
    let answerablePublishedCount: Int
    let tagCount: Int
    let questionTagCount: Int
}
