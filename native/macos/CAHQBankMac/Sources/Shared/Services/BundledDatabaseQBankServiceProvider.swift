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

    init(
        bundle: Bundle = .main,
        fileManager: FileManager = .default,
        storageDirectoryName: String = "CAHQBank"
    ) {
        self.bundle = bundle
        self.fileManager = fileManager
        self.storageDirectoryName = storageDirectoryName
    }

    func connectedService(configuration: RepoLinkConfiguration) throws -> QBankService {
        guard let bundledDatabaseURL = bundle.url(forResource: "bundled-cah", withExtension: "db") else {
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

        if !fileManager.fileExists(atPath: databaseURL.path) {
            try fileManager.copyItem(at: bundledDatabaseURL, to: databaseURL)
        }

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
}
