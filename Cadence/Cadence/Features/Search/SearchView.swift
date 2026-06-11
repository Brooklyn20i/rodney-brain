import SwiftUI
import SwiftData

struct SearchView: View {
    @State private var query = ""
    @State private var viewModel = SearchViewModel()
    @Environment(\.modelContext) private var modelContext

    var body: some View {
        NavigationStack {
            Group {
                if query.isEmpty {
                    searchPrompt
                } else if viewModel.isSearching {
                    ProgressView("Searching…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if viewModel.hasResults {
                    resultsList
                } else {
                    EmptyStateView(
                        systemImage: "magnifyingglass",
                        title: "No Results",
                        message: "No items, projects, people, or decisions match \"\(query)\"."
                    )
                }
            }
            .navigationTitle("Search")
            .searchable(text: $query, prompt: "Search everything")
            .onChange(of: query) { _, new in
                Task { await viewModel.search(query: new, modelContext: modelContext) }
            }
        }
    }

    private var searchPrompt: some View {
        VStack(spacing: CadenceTheme.Spacing.lg) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 48, weight: .light))
                .foregroundStyle(CadenceTheme.Colors.tertiaryLabel)
            Text("Search across all items")
                .font(CadenceTheme.Typography.title)
            Text("Find work items, projects, people, decisions, and notes.")
                .font(.body)
                .foregroundStyle(CadenceTheme.Colors.secondaryLabel)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(CadenceTheme.Spacing.xl)
    }

    private var resultsList: some View {
        List {
            if !viewModel.itemResults.isEmpty {
                Section("Work Items (\(viewModel.itemResults.count))") {
                    ForEach(viewModel.itemResults) { item in
                        NavigationLink {
                            WorkItemDetailView(item: item)
                        } label: {
                            searchResultRow(
                                title: item.title,
                                subtitle: item.type.displayName,
                                systemImage: item.type.systemImage,
                                color: item.type.color
                            )
                        }
                    }
                }
            }

            if !viewModel.projectResults.isEmpty {
                Section("Projects (\(viewModel.projectResults.count))") {
                    ForEach(viewModel.projectResults) { project in
                        NavigationLink {
                            ProjectDetailView(project: project)
                        } label: {
                            searchResultRow(
                                title: project.title,
                                subtitle: project.status.displayName,
                                systemImage: "folder",
                                color: .blue
                            )
                        }
                    }
                }
            }

            if !viewModel.personResults.isEmpty {
                Section("People (\(viewModel.personResults.count))") {
                    ForEach(viewModel.personResults) { person in
                        NavigationLink {
                            PersonDetailView(person: person)
                        } label: {
                            searchResultRow(
                                title: person.name,
                                subtitle: [person.role, person.organisation].filter { !$0.isEmpty }.joined(separator: " · "),
                                systemImage: "person",
                                color: .teal
                            )
                        }
                    }
                }
            }

            if !viewModel.decisionResults.isEmpty {
                Section("Decisions (\(viewModel.decisionResults.count))") {
                    ForEach(viewModel.decisionResults) { decision in
                        NavigationLink {
                            DecisionDetailView(decision: decision)
                        } label: {
                            searchResultRow(
                                title: decision.title,
                                subtitle: decision.status.displayName,
                                systemImage: "scale.3d",
                                color: .indigo
                            )
                        }
                    }
                }
            }
        }
        .listStyle(.plain)
    }

    private func searchResultRow(title: String, subtitle: String, systemImage: String, color: Color) -> some View {
        HStack(spacing: CadenceTheme.Spacing.sm) {
            Image(systemName: systemImage)
                .foregroundStyle(color)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(CadenceTheme.Typography.label)
                    .lineLimit(1)
                if !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(CadenceTheme.Colors.secondaryLabel)
                }
            }
        }
        .padding(.vertical, 4)
    }
}
