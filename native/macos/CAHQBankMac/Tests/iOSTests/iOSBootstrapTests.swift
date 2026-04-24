import XCTest
@testable import CAHQBankiOS

@MainActor
final class iOSBootstrapTests: XCTestCase {
    func testUnavailableProviderBootstrapsWithoutMacRepoPath() async {
        let model = AppViewModel(serviceProvider: UnavailableQBankServiceProvider())

        await model.bootstrapIfNeeded()

        XCTAssertFalse(model.hasLinkedRepo)
        XCTAssertEqual(model.repoRootPath, "")
        XCTAssertEqual(model.infoMessage, "Unable to link a local repo automatically")
        XCTAssertEqual(model.errorMessage, RepoStoreError.repoRootNotFound.localizedDescription)
    }
}
