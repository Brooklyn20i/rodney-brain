import Foundation

struct ClassificationResult: Sendable, Identifiable {
    var id: UUID
    var title: String
    var type: WorkItemType
    var priority: WorkItemPriority
    var dueDate: Date?
    var suggestedPersonName: String?
    var suggestedProjectName: String?
    var suggestedNextAction: String
    var confidence: Double
    var rationale: String

    init(
        id: UUID = UUID(),
        title: String,
        type: WorkItemType = .task,
        priority: WorkItemPriority = .none,
        dueDate: Date? = nil,
        suggestedPersonName: String? = nil,
        suggestedProjectName: String? = nil,
        suggestedNextAction: String = "",
        confidence: Double = 0.5,
        rationale: String = ""
    ) {
        self.id = id
        self.title = title
        self.type = type
        self.priority = priority
        self.dueDate = dueDate
        self.suggestedPersonName = suggestedPersonName
        self.suggestedProjectName = suggestedProjectName
        self.suggestedNextAction = suggestedNextAction
        self.confidence = confidence
        self.rationale = rationale
    }
}
