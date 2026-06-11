import SwiftUI

struct TypeBadge: View {
    let type: WorkItemType

    var body: some View {
        Label(type.displayName, systemImage: type.systemImage)
            .font(.caption.weight(.medium))
            .foregroundStyle(type.color)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(type.color.opacity(0.12), in: Capsule())
    }
}

struct PriorityBadge: View {
    let priority: WorkItemPriority

    var body: some View {
        if priority != .none {
            Text(priority.displayName)
                .font(.caption.weight(.semibold))
                .foregroundStyle(priority.color)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(priority.color.opacity(0.12), in: Capsule())
        }
    }
}

struct StatusBadge: View {
    let status: WorkItemStatus

    var body: some View {
        Text(status.displayName)
            .font(.caption.weight(.medium))
            .foregroundStyle(statusColor)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(statusColor.opacity(0.12), in: Capsule())
    }

    private var statusColor: Color {
        switch status {
        case .done: CadenceTheme.Colors.statusDone
        case .waitingFor: CadenceTheme.Colors.statusWaiting
        case .deferred: CadenceTheme.Colors.statusDeferred
        case .archived: .gray
        default: CadenceTheme.Colors.label
        }
    }
}

struct DecisionStatusBadge: View {
    let status: DecisionStatus

    var body: some View {
        Text(status.displayName)
            .font(.caption.weight(.semibold))
            .foregroundStyle(status.color)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(status.color.opacity(0.12), in: Capsule())
    }
}
