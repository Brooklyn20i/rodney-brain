import SwiftData
import Foundation

@Model
final class Person {
    var id: UUID
    var name: String
    var role: String
    var organisation: String
    var notes: String
    var lastInteractionAt: Date?
    var nextFollowUpAt: Date?
    var createdAt: Date
    var updatedAt: Date

    @Relationship(deleteRule: .nullify) var workItems: [WorkItem]

    var needsFollowUp: Bool {
        guard let next = nextFollowUpAt else { return false }
        return next <= .now
    }

    var openCommitmentsCount: Int {
        workItems.filter { $0.type == .followUp && $0.status != .done && $0.status != .archived }.count
    }

    var waitingForCount: Int {
        workItems.filter { $0.type == .waitingFor && $0.status != .done && $0.status != .archived }.count
    }

    init(
        name: String,
        role: String = "",
        organisation: String = "",
        notes: String = ""
    ) {
        self.id = UUID()
        self.name = name
        self.role = role
        self.organisation = organisation
        self.notes = notes
        self.workItems = []
        self.createdAt = .now
        self.updatedAt = .now
    }
}
