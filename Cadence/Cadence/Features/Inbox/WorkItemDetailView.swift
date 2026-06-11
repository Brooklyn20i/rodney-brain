import SwiftUI
import SwiftData

struct WorkItemDetailView: View {
    @Bindable var item: WorkItem

    @Query private var projects: [Project]
    @Query private var people: [Person]
    @Environment(\.modelContext) private var modelContext

    var body: some View {
        Form {
            Section("Title") {
                TextField("Title", text: $item.title, axis: .vertical)
                    .lineLimit(3)
                    .font(.title3.weight(.semibold))
            }

            Section("Detail") {
                TextEditor(text: $item.detail)
                    .frame(minHeight: 80)
            }

            Section("Classification") {
                Picker("Type", selection: $item.type) {
                    ForEach(WorkItemType.allCases, id: \.self) { type in
                        Label(type.displayName, systemImage: type.systemImage).tag(type)
                    }
                }

                Picker("Status", selection: $item.status) {
                    ForEach(WorkItemStatus.allCases, id: \.self) { s in
                        Text(s.displayName).tag(s)
                    }
                }

                Picker("Priority", selection: $item.priority) {
                    ForEach(WorkItemPriority.allCases, id: \.self) { p in
                        Text(p.displayName).tag(p)
                    }
                }
            }

            Section("Schedule") {
                Toggle("Has Due Date", isOn: Binding(
                    get: { item.dueDate != nil },
                    set: { item.dueDate = $0 ? .now : nil }
                ))
                if item.dueDate != nil {
                    DatePicker("Due Date", selection: Binding(
                        get: { item.dueDate ?? .now },
                        set: { item.dueDate = $0 }
                    ), displayedComponents: .date)
                }

                Toggle("Has Scheduled Date", isOn: Binding(
                    get: { item.scheduledDate != nil },
                    set: { item.scheduledDate = $0 ? .now : nil }
                ))
                if item.scheduledDate != nil {
                    DatePicker("Scheduled", selection: Binding(
                        get: { item.scheduledDate ?? .now },
                        set: { item.scheduledDate = $0 }
                    ), displayedComponents: .date)
                }
            }

            if !projects.isEmpty {
                Section("Project") {
                    Picker("Project", selection: $item.project) {
                        Text("None").tag(Optional<Project>.none)
                        ForEach(projects) { project in
                            Text(project.title).tag(Optional(project))
                        }
                    }
                }
            }

            if !people.isEmpty {
                Section("Person") {
                    Picker("Person", selection: $item.person) {
                        Text("None").tag(Optional<Person>.none)
                        ForEach(people) { person in
                            Text(person.name).tag(Optional(person))
                        }
                    }
                }
            }

            Section("Metadata") {
                LabeledContent("Source") { Text(item.sourceType.rawValue.capitalized) }
                LabeledContent("Created") { Text(item.createdAt.formatted(date: .abbreviated, time: .shortened)) }
                LabeledContent("Updated") { Text(item.updatedAt.formatted(date: .abbreviated, time: .shortened)) }
            }

            if item.status != .done {
                Section {
                    Button("Mark as Done") {
                        item.status = .done
                        item.completedAt = .now
                    }
                    .foregroundStyle(.green)
                }
            }
        }
        .navigationTitle(item.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}
