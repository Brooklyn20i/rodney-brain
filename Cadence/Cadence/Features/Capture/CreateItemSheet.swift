import SwiftUI
import SwiftData

struct CreateItemSheet: View {
    @State private var result: ClassificationResult
    let sourceCapture: ScreenshotCapture?

    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    @Query private var projects: [Project]
    @Query private var people: [Person]

    init(classificationResult: ClassificationResult, sourceCapture: ScreenshotCapture? = nil) {
        self._result = State(initialValue: classificationResult)
        self.sourceCapture = sourceCapture
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Title") {
                    TextField("Title", text: $result.title, axis: .vertical)
                        .lineLimit(3)
                }

                Section("Classification") {
                    Picker("Type", selection: $result.type) {
                        ForEach(WorkItemType.allCases, id: \.self) { type in
                            Label(type.displayName, systemImage: type.systemImage).tag(type)
                        }
                    }

                    Picker("Priority", selection: $result.priority) {
                        ForEach(WorkItemPriority.allCases, id: \.self) { p in
                            Text(p.displayName).tag(p)
                        }
                    }
                }

                Section("Schedule") {
                    DatePicker(
                        "Due Date",
                        selection: Binding(
                            get: { result.dueDate ?? Date.now },
                            set: { result.dueDate = $0 }
                        ),
                        displayedComponents: .date
                    )
                    Toggle("Has Due Date", isOn: Binding(
                        get: { result.dueDate != nil },
                        set: { result.dueDate = $0 ? .now : nil }
                    ))
                }

                if !projects.isEmpty {
                    Section("Project") {
                        Picker("Project", selection: $result.suggestedProjectName) {
                            Text("None").tag(Optional<String>.none)
                            ForEach(projects) { project in
                                Text(project.title).tag(Optional(project.title))
                            }
                        }
                    }
                }

                if !people.isEmpty {
                    Section("Person") {
                        Picker("Person", selection: $result.suggestedPersonName) {
                            Text("None").tag(Optional<String>.none)
                            ForEach(people) { person in
                                Text(person.name).tag(Optional(person.name))
                            }
                        }
                    }
                }

                if result.confidence < 0.9 {
                    Section {
                        HStack(spacing: CadenceTheme.Spacing.sm) {
                            Image(systemName: "info.circle")
                                .foregroundStyle(.orange)
                            Text(result.rationale)
                                .font(.caption)
                                .foregroundStyle(CadenceTheme.Colors.secondaryLabel)
                        }
                    } header: {
                        Text("Classification Note")
                    }
                }
            }
            .navigationTitle("Create Item")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { saveItem() }
                        .disabled(result.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func saveItem() {
        let item = WorkItem(
            title: result.title,
            type: result.type,
            status: .inbox,
            priority: result.priority,
            dueDate: result.dueDate,
            sourceType: sourceCapture != nil ? .screenshot : .manual
        )
        item.sourceScreenshot = sourceCapture

        if let projectName = result.suggestedProjectName {
            item.project = projects.first { $0.title == projectName }
        }
        if let personName = result.suggestedPersonName {
            item.person = people.first { $0.name == personName }
        }

        modelContext.insert(item)
        dismiss()
    }
}

// MARK: - Create Multiple Items Sheet

struct CreateMultipleItemsSheet: View {
    @Binding var results: [ClassificationResult]
    let sourceCapture: ScreenshotCapture?

    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    var body: some View {
        NavigationStack {
            List {
                ForEach($results) { $result in
                    VStack(alignment: .leading, spacing: CadenceTheme.Spacing.sm) {
                        TextField("Title", text: $result.title)
                            .font(CadenceTheme.Typography.label)

                        HStack {
                            Picker("", selection: $result.type) {
                                ForEach(WorkItemType.allCases, id: \.self) { t in
                                    Text(t.displayName).tag(t)
                                }
                            }
                            .labelsHidden()
                            .pickerStyle(.menu)

                            Picker("", selection: $result.priority) {
                                ForEach(WorkItemPriority.allCases, id: \.self) { p in
                                    Text(p.displayName).tag(p)
                                }
                            }
                            .labelsHidden()
                            .pickerStyle(.menu)
                        }
                    }
                    .padding(.vertical, 4)
                }
                .onDelete { offsets in results.remove(atOffsets: offsets) }
            }
            .navigationTitle("Create \(results.count) Items")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save All") { saveAll() }
                        .disabled(results.isEmpty)
                }
                ToolbarItem(placement: .secondaryAction) {
                    EditButton()
                }
            }
        }
    }

    private func saveAll() {
        for result in results {
            guard !result.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { continue }
            let item = WorkItem(
                title: result.title,
                type: result.type,
                status: .inbox,
                priority: result.priority,
                dueDate: result.dueDate,
                sourceType: sourceCapture != nil ? .screenshot : .manual
            )
            item.sourceScreenshot = sourceCapture
            modelContext.insert(item)
        }
        dismiss()
    }
}
