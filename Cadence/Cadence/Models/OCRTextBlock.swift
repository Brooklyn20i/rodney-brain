import SwiftData
import Foundation

@Model
final class OCRTextBlock {
    var id: UUID
    var text: String
    var confidence: Double
    var boundingBoxMinX: Double
    var boundingBoxMinY: Double
    var boundingBoxWidth: Double
    var boundingBoxHeight: Double
    var orderIndex: Int
    var screenshotCapture: ScreenshotCapture?

    init(
        text: String,
        confidence: Double = 1.0,
        boundingBoxMinX: Double = 0,
        boundingBoxMinY: Double = 0,
        boundingBoxWidth: Double = 0,
        boundingBoxHeight: Double = 0,
        orderIndex: Int = 0
    ) {
        self.id = UUID()
        self.text = text
        self.confidence = confidence
        self.boundingBoxMinX = boundingBoxMinX
        self.boundingBoxMinY = boundingBoxMinY
        self.boundingBoxWidth = boundingBoxWidth
        self.boundingBoxHeight = boundingBoxHeight
        self.orderIndex = orderIndex
    }
}
