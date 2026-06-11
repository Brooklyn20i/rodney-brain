import UIKit

final class MockOCRService: OCRService {
    let simulateDelay: Bool
    let shouldFail: Bool

    init(simulateDelay: Bool = true, shouldFail: Bool = false) {
        self.simulateDelay = simulateDelay
        self.shouldFail = shouldFail
    }

    func recognizeText(in image: UIImage) async throws -> OCRResult {
        if simulateDelay {
            try await Task.sleep(for: .milliseconds(800))
        }

        if shouldFail {
            throw OCRError.processingFailed("Mock failure for testing")
        }

        let mockBlocks = [
            OCRTextBlockResult(text: "Follow up with Sarah on the Q3 budget proposal", confidence: 0.98, orderIndex: 0),
            OCRTextBlockResult(text: "Waiting for sign off from legal by Friday", confidence: 0.95, orderIndex: 1),
            OCRTextBlockResult(text: "Decision needed: approve new vendor contract", confidence: 0.97, orderIndex: 2),
            OCRTextBlockResult(text: "Meeting action: James to send revised timeline", confidence: 0.93, orderIndex: 3),
            OCRTextBlockResult(text: "Risk: integration deadline may slip to next week", confidence: 0.91, orderIndex: 4),
        ]

        return OCRResult(
            fullText: mockBlocks.map(\.text).joined(separator: "\n"),
            textBlocks: mockBlocks,
            overallConfidence: 0.95
        )
    }
}
