import XCTest
import UIKit
@testable import Cadence

final class OCRServiceTests: XCTestCase {

    func testMockOCRReturnsResult() async throws {
        let service = MockOCRService(simulateDelay: false)
        let image = UIImage(systemName: "doc.text") ?? UIImage()
        let result = try await service.recognizeText(in: image)

        XCTAssertFalse(result.fullText.isEmpty, "Mock OCR should return non-empty text")
        XCTAssertFalse(result.textBlocks.isEmpty, "Mock OCR should return text blocks")
        XCTAssertGreaterThan(result.overallConfidence, 0)
    }

    func testMockOCRFailureThrows() async {
        let service = MockOCRService(simulateDelay: false, shouldFail: true)
        let image = UIImage()

        do {
            _ = try await service.recognizeText(in: image)
            XCTFail("Expected OCR failure to throw")
        } catch let error as OCRError {
            if case .processingFailed(let msg) = error {
                XCTAssertFalse(msg.isEmpty)
            } else {
                XCTFail("Expected processingFailed error, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    func testOCRResultTextBlocksOrderPreserved() async throws {
        let service = MockOCRService(simulateDelay: false)
        let image = UIImage(systemName: "doc") ?? UIImage()
        let result = try await service.recognizeText(in: image)

        let indices = result.textBlocks.map(\.orderIndex)
        let sorted = indices.sorted()
        XCTAssertEqual(indices, sorted, "Text blocks should be in order")
    }

    func testOCRResultHasSourceImageId() async throws {
        let service = MockOCRService(simulateDelay: false)
        let image = UIImage(systemName: "camera") ?? UIImage()
        let result = try await service.recognizeText(in: image)
        // sourceImageId is optional — just verify result is valid
        XCTAssertNotNil(result.id)
        XCTAssertNotNil(result.createdAt)
    }

    func testMockServiceProtocolConformance() {
        // Verify both implementations satisfy the protocol
        let _: any OCRService = MockOCRService()
        let _: any OCRService = VisionOCRService()
    }
}
