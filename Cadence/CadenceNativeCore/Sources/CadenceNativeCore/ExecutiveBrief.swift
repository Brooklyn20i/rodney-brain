import Foundation

public struct CadenceWorkspace: Codable, Equatable, Identifiable, Sendable {
    public let id: UUID
    public let name: String
}

public struct CadenceWorkspaceMembership: Codable, Equatable, Sendable {
    public let workspaceID: UUID
    public let role: String
    public let workspace: CadenceWorkspace

    enum CodingKeys: String, CodingKey {
        case workspaceID = "workspace_id"
        case role
        case workspace = "workspaces"
    }
}

public struct CadenceWorkItem: Codable, Equatable, Identifiable, Sendable {
    public let id: UUID
    public let ownerID: UUID
    public let workspaceID: UUID?
    public let title: String
    public let type: String
    public let priority: String
    public let dueDate: String?
    public let notes: String
    public let done: Bool
    public let inboxed: Bool
    public let source: String
    public let completedAt: String?
    public let createdAt: String
    public let updatedAt: String
    public let deletedAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case ownerID = "owner_id"
        case workspaceID = "workspace_id"
        case title, type, priority
        case dueDate = "due_date"
        case notes, done, inboxed, source
        case completedAt = "completed_at"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case deletedAt = "deleted_at"
    }
}

public struct CadenceDecision: Codable, Equatable, Identifiable, Sendable {
    public let id: UUID
    public let ownerID: UUID
    public let workspaceID: UUID?
    public let title: String
    public let status: String
    public let dueDate: String?
    public let context: String
    public let outcome: String
    public let createdAt: String
    public let updatedAt: String
    public let deletedAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case ownerID = "owner_id"
        case workspaceID = "workspace_id"
        case title, status
        case dueDate = "due_date"
        case context, outcome
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case deletedAt = "deleted_at"
    }
}

public struct ExecutiveBrief: Equatable, Sendable {
    public let overdue: [CadenceWorkItem]
    public let dueToday: [CadenceWorkItem]
    public let waitingOn: [CadenceWorkItem]
    public let pendingDecisions: [CadenceDecision]

    public init(
        workItems: [CadenceWorkItem],
        pendingDecisions: [CadenceDecision],
        now: Date = .now,
        calendar: Calendar = .current
    ) {
        let startOfToday = calendar.startOfDay(for: now)
        let active = workItems.filter { !$0.done && $0.deletedAt == nil }

        self.overdue = active.filter { item in
            guard let dueDate = Self.date(from: item.dueDate, calendar: calendar) else { return false }
            return dueDate < startOfToday
        }
        self.dueToday = active.filter { item in
            guard let dueDate = Self.date(from: item.dueDate, calendar: calendar) else { return false }
            return calendar.isDate(dueDate, inSameDayAs: now)
        }
        self.waitingOn = active.filter { $0.type == "waitingFor" }
        self.pendingDecisions = pendingDecisions.filter {
            $0.status == "pending" && $0.deletedAt == nil
        }
    }

    public func removingWorkItem(id: UUID) -> ExecutiveBrief {
        ExecutiveBrief(
            overdue: overdue.filter { $0.id != id },
            dueToday: dueToday.filter { $0.id != id },
            waitingOn: waitingOn.filter { $0.id != id },
            pendingDecisions: pendingDecisions
        )
    }

    private init(
        overdue: [CadenceWorkItem],
        dueToday: [CadenceWorkItem],
        waitingOn: [CadenceWorkItem],
        pendingDecisions: [CadenceDecision]
    ) {
        self.overdue = overdue
        self.dueToday = dueToday
        self.waitingOn = waitingOn
        self.pendingDecisions = pendingDecisions
    }

    private static func date(from value: String?, calendar: Calendar) -> Date? {
        guard let value else { return nil }
        let components = value.split(separator: "-").compactMap { Int($0) }
        guard components.count == 3 else { return nil }
        return calendar.date(
            from: DateComponents(year: components[0], month: components[1], day: components[2])
        )
    }
}
