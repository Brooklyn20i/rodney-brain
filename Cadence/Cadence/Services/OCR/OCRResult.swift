import Foundation

struct OCRTextBlockResult: Sendable {
    let text: String
    let confidence: Double
    let boundingBoxMinX: Double
    let boundingBoxMinY: Double
    let boundingBoxWidth: Double
    let boundingBoxHeight: Double
    let orderIndex: Int

    init(
        text: String,
        confidence: Double = 1.0,
        boundingBoxMinX: Double = 0,
        boundingBoxMinY: Double = 0,
        boundingBoxWidth: Double = 0,
        boundingBoxHeight: Double = 0,
        orderIndex: Int = 0
    ) {
        self.text = text
        self.confidence = confidence
        self.boundingBoxMinX = boundingBoxMinX
        self.boundingBoxMinY = boundingBoxMinY
        self.boundingBoxWidth = boundingBoxWidth
        self.boundingBoxHeight = boundingBoxHeight
        self.orderIndex = orderIndex
    }
}

struct OCRResult: Sendable {
    let id: UUID
    let fullText: String
    let textBlocks: [OCRTextBlockResult]
    let overallConfidence: Double
    let sourceImageId: UUID?
    let createdAt: Date

    init(
        id: UUID = UUID(),
        fullText: String,
        textBlocks: [OCRTextBlockResult],
        overallConfidence: Double = 1.0,
        sourceImageId: UUID? = nil
    ) {
        self.id = id
        self.fullText = fullText
        self.textBlocks = textBlocks
        self.overallConfidence = overallConfidence
        self.sourceImageId = sourceImageId
        self.createdAt = .now
    }
}

enum OCRError: LocalizedError {
    case invalidImage
    case noResults
    case processingFailed(String)

    var errorDescription: String? {
        switch self {
        case .invalidImage: "The image could not be processed. Please try a different image."
        case .noResults: "No text was found in this image."
        case .processingFailed(let message): "OCR processing failed: \(message)"
        }
    }
}
