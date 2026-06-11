import SwiftData
import Foundation

@Model
final class UserSettings {
    var id: UUID
    var keepOriginalScreenshots: Bool
    var deleteScreenshotAfterOCR: Bool
    var keepOCRText: Bool
    var deleteOCRTextAfterItemCreation: Bool
    var defaultReviewCadenceRaw: String
    var createdAt: Date
    var updatedAt: Date

    var defaultReviewCadence: ReviewType {
        get { ReviewType(rawValue: defaultReviewCadenceRaw) ?? .daily }
        set { defaultReviewCadenceRaw = newValue.rawValue; updatedAt = .now }
    }

    init() {
        self.id = UUID()
        self.keepOriginalScreenshots = true
        self.deleteScreenshotAfterOCR = false
        self.keepOCRText = true
        self.deleteOCRTextAfterItemCreation = false
        self.defaultReviewCadenceRaw = ReviewType.daily.rawValue
        self.createdAt = .now
        self.updatedAt = .now
    }
}
