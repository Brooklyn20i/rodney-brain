import SwiftUI
import SwiftData
import Observation

@Observable
@MainActor
final class SearchViewModel {
    var itemResults: [WorkItem] = []
    var projectResults: [Project] = []
    var personResults: [Person] = []
    var decisionResults: [Decision] = []
    var isSearching = false

    var hasResults: Bool {
        !itemResults.isEmpty || !projectResults.isEmpty ||
        !personResults.isEmpty || !decisionResults.isEmpty
    }

    func search(query: String, modelContext: ModelContext) async {
        guard !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            clearResults()
            return
        }

        isSearching = true

        // Run fetch on a background-safe context operation
        let q = query.lowercased()

        let allItems = (try? modelContext.fetch(FetchDescriptor<WorkItem>())) ?? []
        let allProjects = (try? modelContext.fetch(FetchDescriptor<Project>())) ?? []
        let allPeople = (try? modelContext.fetch(FetchDescriptor<Person>())) ?? []
        let allDecisions = (try? modelContext.fetch(FetchDescriptor<Decision>())) ?? []

        itemResults = allItems.filter {
            $0.title.lowercased().contains(q) ||
            $0.detail.lowercased().contains(q) ||
            ($0.sourceScreenshot?.ocrText?.lowercased().contains(q) ?? false)
        }

        projectResults = allProjects.filter {
            $0.title.lowercased().contains(q) ||
            $0.desiredOutcome.lowercased().contains(q) ||
            $0.notes.lowercased().contains(q)
        }

        personResults = allPeople.filter {
            $0.name.lowercased().contains(q) ||
            $0.organisation.lowercased().contains(q) ||
            $0.role.lowercased().contains(q) ||
            $0.notes.lowercased().contains(q)
        }

        decisionResults = allDecisions.filter {
            $0.title.lowercased().contains(q) ||
            $0.context.lowercased().contains(q) ||
            $0.notes.lowercased().contains(q)
        }

        isSearching = false
    }

    private func clearResults() {
        itemResults = []
        projectResults = []
        personResults = []
        decisionResults = []
        isSearching = false
    }
}
