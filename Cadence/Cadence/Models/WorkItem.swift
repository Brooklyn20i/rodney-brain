import SwiftData
import Foundation

enum WorkItemType: String, Codable, CaseIterable, Sendable {
    case task
    case followUp = "follow_up"
    case waitingFor = "waiting_for"
    case decision
    case projectNote = "project_note"
    case reminder
    case meetingAction = "meeting_action"
    case risk
    case idea

    var displayName: String {
        switch self {
        case .task: "Task"
        case .followUp: "Follow Up"
        case .waitingFor: "Waiting For"
        case .decision: "Decision"
        case .projectNote: "Project Note"
        case .reminder: "Reminder"
        case .meetingAction: "Meeting Action"
        case .risk: "Risk"
        case .idea: "Idea"
        }
    }

    var systemImage: String {
        switch self {
        case .task: "checkmark.circle"
        case .followUp: "arrow.turn.up.right"
        case .waitingFor: "clock.arrow.circlepath"
        case .decision: "scale.3d"
        case .projectNote: "doc.text"
        case .reminder: "bell"
        case .meetingAction: "person.2"
        case .risk: "exclamationmark.triangle"
        case .idea: "lightbulb"
        }
    }
}

enum WorkItemStatus: String, Codable, CaseIterable, Sendable {
    case inbox
    case scheduled
    case inProgress = "in_progress"
    case waitingFor = "waiting_for"
    case done
    case archived
    case deferred

    var displayName: String {
        switch self {
        case .inbox: "Inbox"
        case .scheduled: "Scheduled"
        case .inProgress: "In Progress"
        case .waitingFor: "Waiting For"
        case .done: "Done"
        case .archived: "Archived"
        case .deferred: "Deferred"
        }
    }
}

enum WorkItemPriority: String, Codable, CaseIterable, Sendable {
    case high, medium, low, none

    var displayName: String { rawValue.capitalized }

    var sortOrder: Int {
        switch self {
        case .high: 0
        case .medium: 1
        case .low: 2
        case .none: 3
        }
    }
}

enum WorkItemSourceType: String, Codable, Sendable {
    case manual, screenshot, share, paste
}

@Model
final class WorkItem {
    var id: UUID
    var title: String
    var detail: String
    var typeRaw: String
    var statusRaw: String
    var priorityRaw: String
    var dueDate: Date?
    var scheduledDate: Date?
    var completedAt: Date?
    var sourceTypeRaw: String
    var sourceScreenshot: ScreenshotCapture?
    var project: Project?
    var person: Person?
    var createdAt: Date
    var updatedAt: Date

    var type: WorkItemType {
        get { WorkItemType(rawValue: typeRaw) ?? .task }
        set { typeRaw = newValue.rawValue; updatedAt = .now }
    }

    var status: WorkItemStatus {
        get { WorkItemStatus(rawValue: statusRaw) ?? .inbox }
        set { statusRaw = newValue.rawValue; updatedAt = .now }
    }

    var priority: WorkItemPriority {
        get { WorkItemPriority(rawValue: priorityRaw) ?? .none }
        set { priorityRaw = newValue.rawValue; updatedAt = .now }
    }

    var sourceType: WorkItemSourceType {
        get { WorkItemSourceType(rawValue: sourceTypeRaw) ?? .manual }
        set { sourceTypeRaw = newValue.rawValue }
    }

    var isOverdue: Bool {
        guard let due = dueDate, status != .done, status != .archived else { return false }
        return due < Calendar.current.startOfDay(for: .now)
    }

    var isDueToday: Bool {
        guard let due = dueDate else { return false }
        return Calendar.current.isDateInToday(due)
    }

    init(
        title: String,
        detail: String = "",
        type: WorkItemType = .task,
        status: WorkItemStatus = .inbox,
        priority: WorkItemPriority = .none,
        dueDate: Date? = nil,
        sourceType: WorkItemSourceType = .manual
    ) {
        self.id = UUID()
        self.title = title
        self.detail = detail
        self.typeRaw = type.rawValue
        self.statusRaw = status.rawValue
        self.priorityRaw = priority.rawValue
        self.dueDate = dueDate
        self.sourceTypeRaw = sourceType.rawValue
        self.createdAt = .now
        self.updatedAt = .now
    }
}
