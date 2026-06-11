import XCTest
@testable import Cadence

final class ClassificationTests: XCTestCase {

    private let classifier = LocalHeuristicClassifier()

    // MARK: - Type Classification

    func testFollowUpKeyword() async {
        let result = await classifier.classify(text: "Follow up with Sarah on the budget proposal")
        XCTAssertEqual(result.type, .followUp)
    }

    func testFollowUpChaseKeyword() async {
        let result = await classifier.classify(text: "Chase James on the contract review")
        XCTAssertEqual(result.type, .followUp)
    }

    func testWaitingForKeyword() async {
        let result = await classifier.classify(text: "Waiting for legal sign off on the agreement")
        XCTAssertEqual(result.type, .waitingFor)
    }

    func testDecisionKeyword() async {
        let result = await classifier.classify(text: "Need to decide on the new vendor by Friday")
        XCTAssertEqual(result.type, .decision)
    }

    func testApproveKeyword() async {
        let result = await classifier.classify(text: "Approve the Q3 budget increase")
        XCTAssertEqual(result.type, .decision)
    }

    func testRiskKeyword() async {
        let result = await classifier.classify(text: "Risk: integration deadline may slip")
        XCTAssertEqual(result.type, .risk)
    }

    func testIdeaKeyword() async {
        let result = await classifier.classify(text: "Idea: explore consolidating the two dashboards")
        XCTAssertEqual(result.type, .idea)
    }

    func testDefaultTask() async {
        let result = await classifier.classify(text: "Update the project documentation")
        XCTAssertEqual(result.type, .task)
    }

    // MARK: - Priority Classification

    func testUrgentPriority() async {
        let result = await classifier.classify(text: "Urgent: fix the production outage immediately")
        XCTAssertEqual(result.priority, .high)
    }

    func testHighPriorityKeyword() async {
        let result = await classifier.classify(text: "High priority: review the board deck")
        XCTAssertEqual(result.priority, .high)
    }

    func testLowPriorityKeyword() async {
        let result = await classifier.classify(text: "Low priority: update internal wiki")
        XCTAssertEqual(result.priority, .low)
    }

    func testNoPriorityDefault() async {
        let result = await classifier.classify(text: "Send meeting notes to team")
        XCTAssertEqual(result.priority, .none)
    }

    // MARK: - Due Date Detection

    func testTodayDueDate() async {
        let result = await classifier.classify(text: "Complete the report today")
        XCTAssertNotNil(result.dueDate)
        if let due = result.dueDate {
            XCTAssertTrue(Calendar.current.isDateInToday(due))
        }
    }

    func testTomorrowDueDate() async {
        let result = await classifier.classify(text: "Send the update tomorrow morning")
        XCTAssertNotNil(result.dueDate)
        if let due = result.dueDate {
            XCTAssertTrue(Calendar.current.isDateInTomorrow(due))
        }
    }

    func testNextWeekDueDate() async {
        let result = await classifier.classify(text: "Finish the proposal next week")
        XCTAssertNotNil(result.dueDate)
        if let due = result.dueDate {
            XCTAssertGreaterThan(due, Date.now)
        }
    }

    func testNoDueDateReturnsNil() async {
        let result = await classifier.classify(text: "Review the team structure")
        XCTAssertNil(result.dueDate)
    }

    // MARK: - Person Extraction

    func testPersonExtractedFromText() async {
        let result = await classifier.classify(text: "Follow up with Sarah about the contract")
        XCTAssertEqual(result.suggestedPersonName, "Sarah")
    }

    func testPersonExtractedFromAsk() async {
        let result = await classifier.classify(text: "Ask James to send the revised timeline")
        XCTAssertEqual(result.suggestedPersonName, "James")
    }

    // MARK: - Title Generation

    func testTitleTruncatedAtLimit() async {
        let longText = String(repeating: "word ", count: 30)
        let result = await classifier.classify(text: longText)
        XCTAssertLessThanOrEqual(result.title.count, 83)
    }

    func testTitleNotEmptyForEmptyInput() async {
        let result = await classifier.classify(text: "")
        XCTAssertFalse(result.title.isEmpty)
    }

    // MARK: - Multiple Classification

    func testClassifyMultipleReturnsOnePerLine() async {
        let multiline = """
        Follow up with Sarah on budget
        Waiting for approval from legal
        Decide on vendor by Friday
        """
        let results = await classifier.classifyMultiple(text: multiline)
        XCTAssertEqual(results.count, 3)
    }

    func testClassifyMultipleSingleLine() async {
        let single = "Complete the report"
        let results = await classifier.classifyMultiple(text: single)
        XCTAssertEqual(results.count, 1)
    }

    // MARK: - Confidence

    func testDefaultTaskHasLowerConfidence() async {
        let result = await classifier.classify(text: "Do the thing")
        XCTAssertLessThan(result.confidence, 0.85)
    }

    func testFollowUpHasHigherConfidence() async {
        let result = await classifier.classify(text: "Follow up with Mark on the contract")
        XCTAssertGreaterThan(result.confidence, 0.7)
    }

    // MARK: - Mock Classifier

    func testMockClassifierAlwaysSucceeds() async {
        let mock = MockClassifier()
        let result = await mock.classify(text: "Anything here")
        XCTAssertFalse(result.title.isEmpty)
        XCTAssertEqual(result.confidence, 1.0)
    }

    // MARK: - Protocol Conformance

    func testBothClassifiersConformToProtocol() {
        let _: any WorkItemClassifier = LocalHeuristicClassifier()
        let _: any WorkItemClassifier = MockClassifier()
        let _: any WorkItemClassifier = FutureAIClassifier()
    }

    // MARK: - DateParser

    func testDateParserByFriday() {
        let date = DateParser.parseDueDate(from: "needs to be done by friday")
        XCTAssertNotNil(date)
    }

    func testDateParserNextWeek() {
        let date = DateParser.parseDueDate(from: "submit next week")
        XCTAssertNotNil(date)
        if let date {
            XCTAssertGreaterThan(date, Date.now)
        }
    }

    func testDateParserEndOfMonth() {
        let date = DateParser.parseDueDate(from: "due end of month")
        XCTAssertNotNil(date)
    }

    func testDateParserNoDateReturnsNil() {
        let date = DateParser.parseDueDate(from: "send the email")
        XCTAssertNil(date)
    }

    // MARK: - PersonExtractor

    func testPersonExtractorWithFrom() {
        let name = PersonExtractor.extractName(from: "Email from Sarah about the project")
        XCTAssertEqual(name, "Sarah")
    }

    func testPersonExtractorWithAsk() {
        let name = PersonExtractor.extractName(from: "Ask James to send the report")
        XCTAssertEqual(name, "James")
    }

    func testPersonExtractorNoName() {
        let name = PersonExtractor.extractName(from: "Review the document carefully")
        XCTAssertNil(name)
    }

    func testPersonExtractorMultipleNames() {
        let names = PersonExtractor.extractAllNames(from: "Ask Sarah and talk to James about the timeline")
        XCTAssertTrue(names.contains("Sarah"))
        XCTAssertTrue(names.contains("James"))
    }
}
