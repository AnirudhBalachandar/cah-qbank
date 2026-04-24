import XCTest

@MainActor
final class iOSSmokeUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testBrowseAndPracticeFlow() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--uitest-reset"]
        app.launch()

        XCTAssertTrue(app.staticTexts["CAH QBank"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.buttons["tab-browse"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["tab-practice"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["tab-progress"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["tab-notebook"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["tab-profile"].waitForExistence(timeout: 5))

        app.buttons["tab-practice"].tap()
        XCTAssertTrue(app.staticTexts["Practice Setup"].waitForExistence(timeout: 5))

        let startSession = app.buttons["start-practice-session"]
        XCTAssertTrue(startSession.waitForExistence(timeout: 5))
        XCTAssertTrue(startSession.isEnabled)
        startSession.tap()

        XCTAssertTrue(app.staticTexts["Question 1"].waitForExistence(timeout: 10))

        let firstOption = app.buttons["answer-option-A"]
        XCTAssertTrue(firstOption.waitForExistence(timeout: 5))
        firstOption.tap()

        let submit = app.buttons["submit-answer"]
        XCTAssertTrue(submit.waitForExistence(timeout: 3))
        XCTAssertTrue(submit.isEnabled)
        submit.tap()

        let correct = app.staticTexts["Correct! Well done"]
        let incorrect = app.staticTexts["Incorrect"]
        XCTAssertTrue(correct.waitForExistence(timeout: 10) || incorrect.waitForExistence(timeout: 1))
    }
}
