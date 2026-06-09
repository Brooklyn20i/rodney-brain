import SwiftUI
import SwiftData

struct ProjectsView: View {
    @Query(sort: \Project.priorityRaw) private var projects: [Project]
    @Environment(\.modelContext) private var modelContext

    @State private var selectedProject: Project?
    @State private var showingNewProject = false
    @State private var searchText = ""

    var filteredProjects: [Project] {
        guard !searchText.isEmpty else { return projects }
        return projects.filter { $0.title.localizedCaseInsensitiveContains(searchText) }
    }

    var body: some View {
        NavigationSplitView {
            Group {
                if projects.isEmpty {
                    EmptyStateView(
                        systemImage: "folder.badge.plus",
                        title: "No Projects",
                        message: "Create a project to organise your work items, decisions, and goals.",
                        actionTitle: "New Project"
                    ) { showingNewProject = true }
                } else {
                    List(filteredProjects, selection: $selectedProject) { project in
                        ProjectRow(project: project)
                            .tag(project)
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) {
                                    modelContext.delete(project)
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                    }
                    .listStyle(.plain)
                    .searchable(text: $searchText, prompt: "Search projects")
                }
            }
            .navigationTitle("Projects")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showingNewProject = true } label: {
                        Image(systemName: "plus")
                    }
                    .keyboardShortcut("n", modifiers: .command)
                }
            }
        } detail: {
            if let project = selectedProject {
                ProjectDetailView(project: project)
            } else {
                EmptyStateView(
                    systemImage: "folder",
                    title: "Select a Project",
                    message: "Choose a project to view its details, next actions, and related items."
                )
            }
        }
        .sheet(isPresented: $showingNewProject) {
            NewProjectSheet()
        }
    }
}

struct ProjectRow: View {
    let project: Project

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(project.title)
                    .font(CadenceTheme.Typography.label)
                Spacer()
                Circle()
                    .fill(project.status.color)
                    .frame(width: 8, height: 8)
            }

            if !project.nextAction.isEmpty {
                Text("→ \(project.nextAction)")
                    .font(.caption)
                    .foregroundStyle(CadenceTheme.Colors.secondaryLabel)
                    .lineLimit(1)
            } else {
                Text("No next action")
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            HStack(spacing: CadenceTheme.Spacing.sm) {
                Text(project.status.displayName)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(project.status.color)

                if let due = project.dueDate {
                    Text(due.formatted(date: .abbreviated, time: .omitted))
                        .font(.caption)
                        .foregroundStyle(CadenceTheme.Colors.tertiaryLabel)
                }

                if project.isStale {
                    Label("Stale", systemImage: "clock.badge.exclamationmark")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

struct NewProjectSheet: View {
    @State private var title = ""
    @State private var desiredOutcome = ""
    @State private var priority = ProjectPriority.medium
    @State private var nextAction = ""

    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    var body: some View {
        NavigationStack {
            Form {
                Section("Project") {
                    TextField("Title", text: $title)
                    TextField("Desired Outcome", text: $desiredOutcome, axis: .vertical)
                        .lineLimit(3)
                }
                Section("Priority") {
                    Picker("Priority", selection: $priority) {
                        ForEach(ProjectPriority.allCases, id: \.self) { p in
                            Text(p.displayName).tag(p)
                        }
                    }
                    .pickerStyle(.segmented)
                }
                Section("Next Action") {
                    TextField("What's the next physical action?", text: $nextAction)
                }
            }
            .navigationTitle("New Project")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") { save() }
                        .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func save() {
        let project = Project(
            title: title,
            desiredOutcome: desiredOutcome,
            priority: priority,
            nextAction: nextAction
        )
        modelContext.insert(project)
        dismiss()
    }
}
