import XCTest
@testable import CAHQBankiOS

@MainActor
final class iOSBootstrapTests: XCTestCase {
    func testBundledDatabaseProviderBootstrapsPublishedContent() async throws {
        let storageName = "CAHQBankiOSTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: storageName))
        defer {
            defaults.removePersistentDomain(forName: storageName)
        }

        let model = AppViewModel(
            userDefaults: defaults,
            serviceProvider: BundledDatabaseQBankServiceProvider(storageDirectoryName: storageName)
        )

        await model.bootstrapIfNeeded()

        XCTAssertTrue(model.hasLinkedRepo)
        XCTAssertEqual(model.dashboard?.publishedCount, 2_099)
        XCTAssertEqual(model.dashboard?.answerableCount, 1_921)
        XCTAssertEqual(model.practiceTags.isEmpty, false)
        XCTAssertNil(model.errorMessage)
    }

    func testUnavailableProviderBootstrapsWithoutMacRepoPath() async {
        let model = AppViewModel(serviceProvider: UnavailableQBankServiceProvider())

        await model.bootstrapIfNeeded()

        XCTAssertFalse(model.hasLinkedRepo)
        XCTAssertEqual(model.repoRootPath, "")
        XCTAssertEqual(model.infoMessage, "Unable to load the local question library")
        XCTAssertEqual(model.errorMessage, RepoStoreError.repoRootNotFound.localizedDescription)
    }
}
