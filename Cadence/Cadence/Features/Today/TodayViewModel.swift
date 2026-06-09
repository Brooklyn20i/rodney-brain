import SwiftUI
import SwiftData
import Observation

@Observable
@MainActor
final class TodayViewModel {
    var top3: [WorkItem] = []
    var dueToday: [WorkItem] = []
    var overdue: [WorkItem] = []
    var waitingFor: [WorkItem] = []
    var decisionsNeeded: [Decision] = []
    var followUps: [WorkItem] = []
    var suggestedFocusBlock: String = ""

    func refresh(modelContext: ModelContext) {
        let allItems = (try? modelContext.fetch(FetchDescriptor<WorkItem>())) ?? []
        let allDecisions = (try? modelContext.fetch(FetchDescriptor<Decision>())) ?? []

        let active = allItems.filter { $0.status != .done && $0.status != .archived }
        let today = Calendar.current.startOfDay(for: .now)

        overdue = active.filter { item in
            guard let due = item.dueDate else { return false }
            return due < today
        }

        dueToday = active.filter { item in
            guard let due = item.dueDate else { return false }
            return Calendar.current.isDateInToday(due)
        }

        waitingFor = active.filter { $0.type == .waitingFor || $0.status == .waitingFor }

        followUps = active.filter { $0.type == .followUp }

        decisionsNeeded = allDecisions.filter { $0.status == .open }

        top3 = computeTop3(from: active, overdue: overdue, dueToday: dueToday)

        suggestedFocusBlock = computeFocusBlock(top3: top3)
    }

    private func computeTop3(from items: [WorkItem], overdue: [WorkItem], dueToday: [WorkItem]) -> [WorkItem] {
        let scored = items.map { item -> (WorkItem, Int) in
            var score = 0

            // Overdue items score highest
            if overdue.contains(where: { $0.id == item.id }) { score += 100 }

            // Due today
            if dueToday.contains(where: { $0.id == item.id }) { score += 50 }

            // Priority
            score += (3 - item.priority.sortOrder) * 20

            // Due date proximity (within 3 days)
            if let due = item.dueDate {
                let days = Calendar.current.dateComponents([.day], from: .now, to: due).day ?? 99
                if days <= 3 { score += max(0, (3 - days) * 10) }
            }

            // Decisions and risks get a boost
            if item.type == .decision || item.type == .risk { score += 15 }

            return (item, score)
        }

        return scored
            .sorted { $0.1 > $1.1 }
            .prefix(3)
            .map(\.0)
    }

    private func computeFocusBlock(top3: [WorkItem]) -> String {
        guard let first = top3.first else { return "" }
        return "Focus on: \(first.title)"
    }
}
