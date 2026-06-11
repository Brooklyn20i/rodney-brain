import SwiftUI
import SwiftData

struct ProjectDetailView: View {
    @Bindable var project: Project
    @Environment(\.modelContext) private var modelContext

    @State private var showingAddItem = false

    var body: some View {
        Form {
            Section("Project") {
                TextField("Title", text: $project.title)
                    .font(.title3.weight(.semibold))

                TextField("Desired Outcome", text: $project.desiredOutcome, axis: .vertical)
                    .lineLimit(4)
                    .foregroundStyle(CadenceTheme.Colors.secondaryLabel)
            }

            Section("Next Action") {
                TextField("What's the next physical action?", text: $project.nextAction, axis: .vertical)
                    .lineLimit(2)
                if project.nextAction.isEmpty {
                    Label("Add a next action to keep this project moving.", systemImage: "exclamationmark.triangle")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            }

            Section {
                Picker("Status", selection: $project.status) {
                    ForEach(ProjectStatus.allCases, id: \.self) { s in
                        Text(s.displayName).tag(s)
                    }
                }

                Picker("Priority", selection: $project.priority) {
                    ForEach(ProjectPriority.allCases, id: \.self) { p in
                        Text(p.displayName).tag(p)
                    }
                }

                Toggle("Has Due Date", isOn: Binding(
                    get: { project.dueDate != nil },
                    set: { project.dueDate = $0 ? .now : nil }
                ))
                if project.dueDate != nil {
                    DatePicker("Due Date", selection: Binding(
                        get: { project.dueDate ?? .now },
                        set: { project.dueDate = $0 }
                    ), displayedComponents: .date)
                }

                TextField("Owner / Stakeholder", text: $project.owner)
            } header: {
                Text("Details")
            }

            Section("Notes") {
                TextEditor(text: $project.notes)
                    .frame(minHeight: 80)
            }

            if !project.workItems.isEmpty {
                Section("Work Items (\(project.workItems.count))") {
                    ForEach(project.workItems.filter { $0.status != .archived }.prefix(10)) { item in
                        HStack {
                            Image(systemName: item.type.systemImage)
                                .foregroundStyle(item.type.color)
                                .frame(width: 20)
                            Text(item.title)
                                .lineLimit(1)
                            Spacer()
                            if item.status == .done {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(.green)
                                    .font(.caption)
                            }
                        }
                    }
                    Button("Add Item") { showingAddItem = true }
                        .foregroundStyle(CadenceTheme.Colors.accent)
                }
            } else {
                Section {
                    Button("Add First Item") { showingAddItem = true }
                        .foregroundStyle(CadenceTheme.Colors.accent)
                } header: {
                    Text("Work Items")
                }
            }

            if !project.decisions.isEmpty {
                Section("Decisions (\(project.decisions.count))") {
                    ForEach(project.decisions) { decision in
                        HStack {
                            Text(decision.title).lineLimit(1)
                            Spacer()
                            DecisionStatusBadge(status: decision.status)
                        }
                    }
                }
            }

            Section("Review") {
                if let reviewed = project.lastReviewedAt {
                    LabeledContent("Last Reviewed") {
                        Text(reviewed.formatted(date: .abbreviated, time: .omitted))
                    }
                }
                Button("Mark Reviewed") {
                    project.lastReviewedAt = .now
                    project.updatedAt = .now
                }
            }
        }
        .navigationTitle(project.title)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showingAddItem) {
            CreateItemSheet(
                classificationResult: ClassificationResult(title: "")
            )
        }
    }
}
