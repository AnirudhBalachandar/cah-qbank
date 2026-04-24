import XCTest

@MainActor
final class iOSSmokeUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testTodayAndPracticeFlow() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--uitest-reset"]
        app.launch()

        XCTAssertTrue(app.staticTexts["Today"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts["1921 practice-ready questions from 2099 published questions"].waitForExistence(timeout: 10))

        app.buttons["Start practice"].tap()
        XCTAssertTrue(app.staticTexts["Session setup"].waitForExistence(timeout: 5))

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

        let correct = app.staticTexts["Correct"]
        let review = app.staticTexts["Review this answer"]
        XCTAssertTrue(correct.waitForExistence(timeout: 10) || review.waitForExistence(timeout: 1))
    }
}
