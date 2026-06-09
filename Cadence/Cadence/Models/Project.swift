import SwiftData
import Foundation

enum ProjectStatus: String, Codable, CaseIterable, Sendable {
    case active
    case onHold = "on_hold"
    case completed
    case cancelled

    var displayName: String {
        switch self {
        case .active: "Active"
        case .onHold: "On Hold"
        case .completed: "Completed"
        case .cancelled: "Cancelled"
        }
    }
}

enum ProjectPriority: String, Codable, CaseIterable, Sendable {
    case high, medium, low

    var displayName: String { rawValue.capitalized }
    var sortOrder: Int { ["high", "medium", "low"].firstIndex(of: rawValue) ?? 99 }
}

@Model
final class Project {
    var id: UUID
    var title: String
    var desiredOutcome: String
    var statusRaw: String
    var priorityRaw: String
    var dueDate: Date?
    var nextAction: String
    var owner: String
    var notes: String
    var lastReviewedAt: Date?
    var createdAt: Date
    var updatedAt: Date

    @Relationship(deleteRule: .nullify) var workItems: [WorkItem]
    @Relationship(deleteRule: .nullify) var decisions: [Decision]

    var status: ProjectStatus {
        get { ProjectStatus(rawValue: statusRaw) ?? .active }
        set { statusRaw = newValue.rawValue; updatedAt = .now }
    }

    var priority: ProjectPriority {
        get { ProjectPriority(rawValue: priorityRaw) ?? .medium }
        set { priorityRaw = newValue.rawValue; updatedAt = .now }
    }

    var hasNextAction: Bool { !nextAction.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    var isStale: Bool {
        guard let reviewed = lastReviewedAt else { return true }
        return Date.now.timeIntervalSince(reviewed) > 14 * 86400
    }

    init(
        title: String,
        desiredOutcome: String = "",
        status: ProjectStatus = .active,
        priority: ProjectPriority = .medium,
        dueDate: Date? = nil,
        nextAction: String = "",
        owner: String = "",
        notes: String = ""
    ) {
        self.id = UUID()
        self.title = title
        self.desiredOutcome = desiredOutcome
        self.statusRaw = status.rawValue
        self.priorityRaw = priority.rawValue
        self.dueDate = dueDate
        self.nextAction = nextAction
        self.owner = owner
        self.notes = notes
        self.workItems = []
        self.decisions = []
        self.createdAt = .now
        self.updatedAt = .now
    }
}
