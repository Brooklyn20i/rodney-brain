import SwiftData
import Foundation

enum DecisionStatus: String, Codable, CaseIterable, Sendable {
    case open
    case decided
    case deferred

    var displayName: String { rawValue.capitalized }
}

@Model
final class Decision {
    var id: UUID
    var title: String
    var context: String
    var optionsText: String
    var statusRaw: String
    var outcome: String
    var dueDate: Date?
    var owner: String
    var notes: String
    var project: Project?
    var sourceItemId: UUID?
    var createdAt: Date
    var updatedAt: Date

    var status: DecisionStatus {
        get { DecisionStatus(rawValue: statusRaw) ?? .open }
        set { statusRaw = newValue.rawValue; updatedAt = .now }
    }

    var isOverdue: Bool {
        guard let due = dueDate, status == .open else { return false }
        return due < Calendar.current.startOfDay(for: .now)
    }

    init(
        title: String,
        context: String = "",
        optionsText: String = "",
        status: DecisionStatus = .open,
        dueDate: Date? = nil,
        owner: String = "",
        notes: String = ""
    ) {
        self.id = UUID()
        self.title = title
        self.context = context
        self.optionsText = optionsText
        self.statusRaw = status.rawValue
        self.outcome = ""
        self.dueDate = dueDate
        self.owner = owner
        self.notes = notes
        self.createdAt = .now
        self.updatedAt = .now
    }
}
