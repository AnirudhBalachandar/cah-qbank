import Foundation

enum QuestionFileCodec {
    static func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let string = try container.decode(String.self)
            if let date = parseDate(string) {
                return date
            }
            throw RepoStoreError.invalidData("Invalid date string: \(string)")
        }
        return decoder
    }

    static func encoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(formatDate(date))
        }
        return encoder
    }

    static func parseDate(_ string: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let value = fractional.date(from: string) {
            return value
        }
        let standard = ISO8601DateFormatter()
        standard.formatOptions = [.withInternetDateTime]
        return standard.date(from: string)
    }

    static func formatDate(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }
}

enum QuestionFileLoader {
    static func loadAll(from context: RepoContext) throws -> [QuestionFile] {
        let fileManager = FileManager.default
        let decoder = QuestionFileCodec.decoder()
        let directories = [
            DirectoryValidationContext(url: context.questionsDirectory, expectedStatus: .published),
            DirectoryValidationContext(url: context.draftsDirectory, expectedStatus: .draft),
        ]
        var state = QuestionFileValidationState()

        let files = try directories
            .flatMap { directory -> [QuestionFileCandidate] in
                guard fileManager.fileExists(atPath: directory.url.path) else {
                    return []
                }
                return try fileManager
                    .contentsOfDirectory(at: directory.url, includingPropertiesForKeys: nil)
                    .filter { $0.pathExtension == "json" }
                    .map { QuestionFileCandidate(url: $0, expectedStatus: directory.expectedStatus) }
            }
            .sorted { $0.url.path < $1.url.path }

        return try files.map { file in
            let data: Data
            do {
                data = try Data(contentsOf: file.url)
            } catch {
                throw fileError(file.url, message: "Unable to read question file: \(error.localizedDescription)")
            }

            let question: QuestionFile
            do {
                question = try decoder.decode(QuestionFile.self, from: data)
            } catch let error as RepoStoreError {
                throw fileError(file.url, message: error.localizedDescription)
            } catch {
                throw fileError(file.url, message: describe(error))
            }

            try validate(question, from: file, state: &state)
            return question
        }
    }

    private static func validate(
        _ question: QuestionFile,
        from file: QuestionFileCandidate,
        state: inout QuestionFileValidationState
    ) throws {
        let expectedID = file.url.deletingPathExtension().lastPathComponent
        guard question.id == expectedID else {
            throw fileError(file.url, message: "Expected filename id \(expectedID) but found \(question.id)")
        }

        guard question.status == file.expectedStatus else {
            throw fileError(
                file.url,
                message: "Expected status \(file.expectedStatus.rawValue) but found \(question.status.rawValue)"
            )
        }

        if let firstPath = state.seenIDs[question.id] {
            throw fileError(
                file.url,
                message: "Duplicate question id detected: \(question.id) (already seen in \(firstPath.lastPathComponent))"
            )
        }

        if let firstPath = state.seenFingerprints[question.sourceFingerprint] {
            throw fileError(
                file.url,
                message: """
                Duplicate sourceFingerprint detected: \(question.sourceFingerprint) \
                (already seen in \(firstPath.lastPathComponent))
                """
            )
        }

        state.seenIDs[question.id] = file.url
        state.seenFingerprints[question.sourceFingerprint] = file.url
    }

    private static func fileError(_ fileURL: URL, message: String) -> RepoStoreError {
        RepoStoreError.invalidData("\(fileURL.path)\n\(message)")
    }

    private static func describe(_ error: Error) -> String {
        switch error {
        case let DecodingError.dataCorrupted(context):
            return "Invalid question JSON: \(context.debugDescription)"
        case let DecodingError.keyNotFound(key, context):
            return "Invalid question JSON: missing key '\(key.stringValue)' (\(context.debugDescription))"
        case let DecodingError.typeMismatch(type, context):
            return "Invalid question JSON: expected \(type) (\(context.debugDescription))"
        case let DecodingError.valueNotFound(type, context):
            return "Invalid question JSON: missing \(type) value (\(context.debugDescription))"
        default:
            return error.localizedDescription
        }
    }
}

private struct DirectoryValidationContext {
    let url: URL
    let expectedStatus: QuestionStatus
}

private struct QuestionFileCandidate {
    let url: URL
    let expectedStatus: QuestionStatus
}

private struct QuestionFileValidationState {
    var seenIDs: [String: URL] = [:]
    var seenFingerprints: [String: URL] = [:]
}

enum LearnerTagProjector {
    private static let blueprintNamespace = "cah-exam-blueprint"
    private static let hiddenScaffoldTags: Set<String> = [
        blueprintNamespace,
        "\(blueprintNamespace)/cah-kat",
        "notebooklm",
    ]

    static func projectedSlugs(for question: QuestionFile) -> [String] {
        var slugs: Set<String> = []
        if let curriculumSlug = curriculumSlug(for: question.curriculum) {
            slugs.insert(curriculumSlug)
        }

        for rawTag in question.tags {
            guard let projected = project(rawTag: rawTag) else { continue }
            if isCurriculumSlug(projected) {
                continue
            }
            slugs.insert(projected)
        }

        return slugs.sorted()
    }

    static func displayName(for slug: String) -> String {
        if let curriculum = curriculum(for: slug) {
            return curriculum.rawValue
        }
        return humanizeTagSlug(slug)
    }

    static func curriculum(for slug: String) -> Curriculum? {
        Curriculum.allCases.first { curriculumSlug(for: $0) == slug }
    }

    static func isCurriculumSlug(_ slug: String) -> Bool {
        curriculum(for: slug) != nil
    }

    private static func project(rawTag: String) -> String? {
        let slug = rawTag
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()

        guard !slug.isEmpty else { return nil }
        if hiddenScaffoldTags.contains(slug) {
            return nil
        }
        let parts = slug.split(separator: "/").map(String.init)
        if parts.first == blueprintNamespace {
            guard parts.count > 2 else { return nil }
            let remainder = parts.dropFirst(2).joined(separator: "/")
            return remainder.isEmpty ? nil : remainder
        }

        return slug
    }

    private static func curriculumSlug(for curriculum: Curriculum) -> String? {
        guard curriculum != .unclassified else { return nil }
        return curriculum.rawValue
            .lowercased()
            .replacingOccurrences(of: "&", with: " and ")
            .replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
            .replacingOccurrences(of: "-+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    }
}

enum TagDescriptorCollector {
    static func collect(from questions: [QuestionFile]) -> [TagDescriptor] {
        var descriptors: [String: TagDescriptor] = [:]
        for question in questions {
            for slug in LearnerTagProjector.projectedSlugs(for: question) {
                let parts = slug.split(separator: "/").map(String.init)
                for index in parts.indices {
                    let currentSlug = parts[0...index].joined(separator: "/")
                    guard descriptors[currentSlug] == nil else { continue }
                    descriptors[currentSlug] = TagDescriptor(
                        slug: currentSlug,
                        name: LearnerTagProjector.displayName(for: currentSlug),
                        kind: inferKind(for: currentSlug),
                        parentSlug: index == 0 ? nil : parts[0..<index].joined(separator: "/")
                    )
                }
            }
        }
        return descriptors.values.sorted { $0.slug < $1.slug }
    }

    private static func inferKind(for slug: String) -> TagKind {
        if slug.hasPrefix("cah-exam-blueprint") {
            return .meta
        }
        if LearnerTagProjector.isCurriculumSlug(slug) {
            return .curriculum
        }
        return .topic
    }
}

private func humanizeTagSlug(_ slug: String) -> String {
    let lastSegment = slug.split(separator: "/").last.map(String.init) ?? slug
    return lastSegment
        .split(separator: "-")
        .map { part in
            let text = String(part)
            return text.prefix(1).uppercased() + text.dropFirst()
        }
        .joined(separator: " ")
}
