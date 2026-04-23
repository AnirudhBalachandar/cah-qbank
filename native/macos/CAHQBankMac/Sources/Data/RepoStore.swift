import Foundation

actor RepoStore {
    let context: RepoContext

    private let database: SQLiteDatabase
    private let synchronizer = ContentSynchronizer()

    init(
        context: RepoContext? = nil,
        configuration: RepoLinkConfiguration? = nil,
        repoRoot: URL? = nil,
        databaseURL: URL? = nil,
        searchStartURL: URL? = nil,
        environment: [String: String] = ProcessInfo.processInfo.environment
    ) throws {
        if let context {
            self.context = context
        } else if let repoRoot {
            self.context = try RepoContext(
                repoRoot: repoRoot,
                databaseURL: databaseURL,
                environment: environment
            )
        } else {
            let resolvedContext = if let configuration {
                try RepoLocator.locate(configuration: configuration)
            } else {
                try RepoLocator.locate(
                    searchStartURL: searchStartURL,
                    environment: environment
                )
            }
            self.context = try RepoContext(
                repoRoot: resolvedContext.repoRoot,
                databaseURL: databaseURL ?? resolvedContext.databaseURL,
                environment: environment
            )
        }

        self.database = try SQLiteDatabase(path: self.context.databaseURL.path)
    }

    static func resolveRepoRoot(
        configuration: RepoLinkConfiguration
    ) throws -> URL {
        try RepoLocator.locate(configuration: configuration).repoRoot
    }

    static func resolveRepoRoot(
        searchStartURL: URL? = nil,
        environment: [String: String] = ProcessInfo.processInfo.environment
    ) throws -> URL {
        try RepoLocator.locate(searchStartURL: searchStartURL, environment: environment).repoRoot
    }

    static func resolveDatabaseURL(
        repoRoot: URL,
        environment: [String: String] = ProcessInfo.processInfo.environment
    ) -> URL {
        RepoLocator.resolveDatabaseURL(repoRoot: repoRoot, environment: environment)
    }

    func ensureSchema() throws {
        try database.ensureSchema()
    }

    func syncQuestionsFromRepo() throws -> RepoSyncReport {
        try synchronizer.sync(using: context, database: database)
    }

    func execute(_ sql: String, bindings: [SQLiteBindValue] = []) throws {
        try database.execute(sql, bindings: bindings)
    }

    func query(_ sql: String, bindings: [SQLiteBindValue] = []) throws -> [SQLiteRow] {
        try database.query(sql, bindings: bindings)
    }
}
