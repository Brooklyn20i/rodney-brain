import SwiftData
import Foundation

enum ReviewType: String, Codable, CaseIterable, Sendable {
    case daily, weekly

    var displayName: String { rawValue.capitalized }
}

@Model
final class ReviewSession {
    var id: UUID
    var typeRaw: String
    var summary: String
    var createdAt: Date
    var completedAt: Date?

    var type: ReviewType {
        get { ReviewType(rawValue: typeRaw) ?? .daily }
        set { typeRaw = newValue.rawValue }
    }

    var isComplete: Bool { completedAt != nil }

    init(type: ReviewType, summary: String = "") {
        self.id = UUID()
        self.typeRaw = type.rawValue
        self.summary = summary
        self.createdAt = .now
    }
}
