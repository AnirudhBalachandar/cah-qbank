import Foundation

enum RepoStoreError: LocalizedError {
    case repoRootNotFound
    case invalidConfiguredRepoRoot(String)
    case missingQuestionsDirectory(String)
    case sqliteFailure(String)
    case missingColumn(String)
    case invalidData(String)

    var errorDescription: String? {
        switch self {
        case .repoRootNotFound:
            return "Unable to locate the cah-qbank repo root."
        case let .invalidConfiguredRepoRoot(path):
            return "The configured repo root is invalid: \(path)"
        case let .missingQuestionsDirectory(path):
            return "The configured repo is missing its questions directory: \(path)"
        case let .sqliteFailure(message):
            return message
        case let .missingColumn(column):
            return "Missing SQLite column: \(column)"
        case let .invalidData(message):
            return message
        }
    }
}

struct RepoLinkOptions: Sendable {
    let repoRootOverridePath: String?
    let databasePathOverride: String?
    let databaseURLOverride: String?

    init(environment: [String: String] = ProcessInfo.processInfo.environment) {
        repoRootOverridePath = Self.sanitize(environment["CAH_QBANK_REPO_ROOT"])
        databasePathOverride = Self.sanitize(environment["CAH_QBANK_DATABASE_PATH"])
        databaseURLOverride = Self.sanitize(environment["DATABASE_URL"])
    }

    private static func sanitize(_ value: String?) -> String? {
        guard var value else { return nil }
        value = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.hasPrefix("\""), value.hasSuffix("\""), value.count > 1 {
            value.removeFirst()
            value.removeLast()
        }
        return value.isEmpty ? nil : value
    }
}

struct RepoLinkConfiguration: Sendable {
    let explicitRepoRootURL: URL?
    let searchStartURL: URL?
    let environment: [String: String]

    init(
        explicitRepoRootURL: URL? = nil,
        searchStartURL: URL? = nil,
        environment: [String: String] = ProcessInfo.processInfo.environment
    ) {
        self.explicitRepoRootURL = explicitRepoRootURL?.standardizedFileURL
        self.searchStartURL = searchStartURL
        self.environment = environment
    }
}

struct RepoContext: Sendable {
    let repoRoot: URL
    let questionsDirectory: URL
    let draftsDirectory: URL
    let databaseURL: URL

    init(
        repoRoot: URL,
        databaseURL: URL? = nil,
        environment: [String: String] = ProcessInfo.processInfo.environment
    ) throws {
        let standardizedRoot = repoRoot.standardizedFileURL
        let questionsDirectory = standardizedRoot.appendingPathComponent("questions", isDirectory: true)
        guard FileManager.default.directoryExists(at: questionsDirectory) else {
            throw RepoStoreError.missingQuestionsDirectory(standardizedRoot.path)
        }

        self.repoRoot = standardizedRoot
        self.questionsDirectory = questionsDirectory
        self.draftsDirectory = standardizedRoot.appendingPathComponent("drafts", isDirectory: true)
        self.databaseURL = databaseURL ?? RepoLocator.resolveDatabaseURL(
            repoRoot: standardizedRoot,
            environment: environment
        )
    }
}

enum RepoLocator {
    private static let sourceFileURL = URL(fileURLWithPath: #filePath)

    static func locate(
        searchStartURL: URL? = nil,
        environment: [String: String] = ProcessInfo.processInfo.environment
    ) throws -> RepoContext {
        try locate(
            configuration: RepoLinkConfiguration(
                searchStartURL: searchStartURL,
                environment: environment
            )
        )
    }

    static func locate(
        configuration: RepoLinkConfiguration
    ) throws -> RepoContext {
        let fileManager = FileManager.default
        let environment = configuration.environment
        let options = RepoLinkOptions(environment: environment)

        if let explicitRepoRootURL = configuration.explicitRepoRootURL {
            guard isRepoRoot(explicitRepoRootURL, fileManager: fileManager) else {
                throw RepoStoreError.invalidConfiguredRepoRoot(explicitRepoRootURL.path)
            }
            return try RepoContext(repoRoot: explicitRepoRootURL, environment: environment)
        }

        return try locateFromEnvironmentOrHeuristics(
            searchStartURL: configuration.searchStartURL,
            environment: environment,
            options: options,
            fileManager: fileManager
        )
    }

    private static func locateFromEnvironmentOrHeuristics(
        searchStartURL: URL? = nil,
        environment: [String: String],
        options: RepoLinkOptions,
        fileManager: FileManager
    ) throws -> RepoContext {
        if let overridePath = options.repoRootOverridePath {
            let overrideURL = URL(fileURLWithPath: overridePath).standardizedFileURL
            guard isRepoRoot(overrideURL, fileManager: fileManager) else {
                throw RepoStoreError.invalidConfiguredRepoRoot(overrideURL.path)
            }
            return try RepoContext(repoRoot: overrideURL, environment: environment)
        }

        var candidates = [
            searchStartURL,
            sourceFileURL,
            URL(fileURLWithPath: fileManager.currentDirectoryPath),
            Bundle.main.bundleURL,
        ]

        #if os(macOS)
        candidates.append(
            fileManager.homeDirectoryForCurrentUser.appendingPathComponent("Projects/cah-qbank", isDirectory: true)
        )
        #endif

        for candidate in candidates.compactMap({ $0 }) {
            for ancestor in ancestors(of: candidate) where isRepoRoot(ancestor, fileManager: fileManager) {
                return try RepoContext(repoRoot: ancestor, environment: environment)
            }
        }

        throw RepoStoreError.repoRootNotFound
    }

    static func resolveDatabaseURL(
        repoRoot: URL,
        environment: [String: String] = ProcessInfo.processInfo.environment
    ) -> URL {
        let options = RepoLinkOptions(environment: environment)

        if let override = options.databasePathOverride {
            if override.hasPrefix("/") {
                return URL(fileURLWithPath: override).standardizedFileURL
            }
            return repoRoot.appendingPathComponent(override).standardizedFileURL
        }

        if let databaseURL = options.databaseURLOverride, databaseURL.hasPrefix("file:") {
            let rawPath = String(databaseURL.dropFirst("file:".count))
                .split(separator: "?")
                .first
                .map(String.init) ?? ""
            let baseURL = repoRoot.appendingPathComponent("app/prisma", isDirectory: true)
            return URL(fileURLWithPath: rawPath, relativeTo: baseURL).standardizedFileURL
        }

        return repoRoot.appendingPathComponent("cah.db", isDirectory: false)
    }

    private static func ancestors(of url: URL) -> [URL] {
        var results: [URL] = []
        var current = url.hasDirectoryPath ? url.standardizedFileURL : url.deletingLastPathComponent().standardizedFileURL
        while true {
            results.append(current)
            let parent = current.deletingLastPathComponent()
            if parent.path == current.path {
                break
            }
            current = parent
        }
        return results
    }

    private static func isRepoRoot(_ url: URL, fileManager: FileManager) -> Bool {
        let questionsDirectory = url.appendingPathComponent("questions", isDirectory: true)
        let appDirectory = url.appendingPathComponent("app", isDirectory: true)
        let nativeDirectory = url.appendingPathComponent("native", isDirectory: true)
        return fileManager.directoryExists(at: questionsDirectory)
            && fileManager.directoryExists(at: appDirectory)
            && fileManager.directoryExists(at: nativeDirectory)
    }
}

private extension FileManager {
    func directoryExists(at url: URL) -> Bool {
        var isDirectory = ObjCBool(false)
        return fileExists(atPath: url.path, isDirectory: &isDirectory) && isDirectory.boolValue
    }
}
