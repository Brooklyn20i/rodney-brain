import SwiftUI
import SwiftData
import Observation

@Observable
@MainActor
final class ReviewViewModel {
    var overdueItems: [WorkItem] = []
    var dueTodayItems: [WorkItem] = []
    var waitingForItems: [WorkItem] = []
    var openDecisions: [Decision] = []
    var projectsWithoutNextAction: [Project] = []
    var staleProjects: [Project] = []
    var overdueFollowUps: [WorkItem] = []
    var oldWaitingFor: [WorkItem] = []
    var completedThisWeek: [WorkItem] = []
    var recentSessions: [ReviewSession] = []

    func refresh(modelContext: ModelContext) {
        let allItems = (try? modelContext.fetch(FetchDescriptor<WorkItem>())) ?? []
        let allProjects = (try? modelContext.fetch(FetchDescriptor<Project>())) ?? []
        let allDecisions = (try? modelContext.fetch(FetchDescriptor<Decision>())) ?? []
        let allSessions = (try? modelContext.fetch(FetchDescriptor<ReviewSession>(
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        ))) ?? []

        let today = Calendar.current.startOfDay(for: .now)
        let sevenDaysAgo = Calendar.current.date(byAdding: .day, value: -7, to: today)!
        let weekStart = Calendar.current.date(byAdding: .weekOfYear, value: -1, to: today)!

        let activeItems = allItems.filter { $0.status != .done && $0.status != .archived }

        overdueItems = activeItems.filter {
            guard let due = $0.dueDate else { return false }
            return due < today
        }

        dueTodayItems = activeItems.filter {
            guard let due = $0.dueDate else { return false }
            return Calendar.current.isDateInToday(due)
        }

        waitingForItems = activeItems.filter { $0.type == .waitingFor || $0.status == .waitingFor }

        openDecisions = allDecisions.filter { $0.status == .open }

        let activeProjects = allProjects.filter { $0.status == .active }
        projectsWithoutNextAction = activeProjects.filter { !$0.hasNextAction }
        staleProjects = activeProjects.filter { $0.isStale }

        overdueFollowUps = activeItems.filter {
            $0.type == .followUp &&
            ($0.dueDate.map { $0 < today } ?? false)
        }

        oldWaitingFor = activeItems.filter {
            ($0.type == .waitingFor || $0.status == .waitingFor) &&
            $0.createdAt < sevenDaysAgo
        }

        completedThisWeek = allItems.filter {
            $0.status == .done &&
            ($0.completedAt.map { $0 >= weekStart } ?? false)
        }

        recentSessions = Array(allSessions.prefix(5))
    }

    func completeReview(type: ReviewType, modelContext: ModelContext) {
        let session = ReviewSession(type: type)
        session.completedAt = .now
        modelContext.insert(session)
        refresh(modelContext: modelContext)
    }
}
