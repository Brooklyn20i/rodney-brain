import SwiftUI

enum CadenceTheme {
    enum Colors {
        static let accent = Color.accentColor
        static let background = Color(UIColor.systemBackground)
        static let secondaryBackground = Color(UIColor.secondarySystemBackground)
        static let tertiaryBackground = Color(UIColor.tertiarySystemBackground)
        static let label = Color(UIColor.label)
        static let secondaryLabel = Color(UIColor.secondaryLabel)
        static let tertiaryLabel = Color(UIColor.tertiaryLabel)
        static let separator = Color(UIColor.separator)

        static let highPriority = Color.red
        static let mediumPriority = Color.orange
        static let lowPriority = Color.blue
        static let noPriority = Color(UIColor.systemGray3)

        static let statusDone = Color.green
        static let statusWaiting = Color.purple
        static let statusDeferred = Color.gray
        static let statusOverdue = Color.red
    }

    enum Typography {
        static let largeTitle = Font.largeTitle.weight(.semibold)
        static let title = Font.title2.weight(.semibold)
        static let sectionHeader = Font.headline.weight(.semibold)
        static let body = Font.body
        static let caption = Font.caption.weight(.medium)
        static let label = Font.subheadline.weight(.medium)
    }

    enum Spacing {
        static let xs: CGFloat = 4
        static let sm: CGFloat = 8
        static let md: CGFloat = 16
        static let lg: CGFloat = 24
        static let xl: CGFloat = 32
        static let xxl: CGFloat = 48
    }

    enum Radius {
        static let sm: CGFloat = 8
        static let md: CGFloat = 12
        static let lg: CGFloat = 16
    }
}

extension WorkItemPriority {
    var color: Color {
        switch self {
        case .high: CadenceTheme.Colors.highPriority
        case .medium: CadenceTheme.Colors.mediumPriority
        case .low: CadenceTheme.Colors.lowPriority
        case .none: CadenceTheme.Colors.noPriority
        }
    }
}

extension WorkItemType {
    var color: Color {
        switch self {
        case .task: .blue
        case .followUp: .orange
        case .waitingFor: .purple
        case .decision: .indigo
        case .projectNote: .gray
        case .reminder: .yellow
        case .meetingAction: .teal
        case .risk: .red
        case .idea: .green
        }
    }
}

extension DecisionStatus {
    var color: Color {
        switch self {
        case .open: .orange
        case .decided: .green
        case .deferred: .gray
        }
    }
}

extension ProjectStatus {
    var color: Color {
        switch self {
        case .active: .blue
        case .onHold: .orange
        case .completed: .green
        case .cancelled: .gray
        }
    }
}
