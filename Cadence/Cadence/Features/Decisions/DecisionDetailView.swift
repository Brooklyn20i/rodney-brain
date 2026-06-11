import SwiftUI
import SwiftData

struct DecisionDetailView: View {
    @Bindable var decision: Decision
    @Query private var projects: [Project]

    var body: some View {
        Form {
            Section("Decision") {
                TextField("Title", text: $decision.title, axis: .vertical)
                    .font(.title3.weight(.semibold))
                    .lineLimit(3)
            }

            Section("Context") {
                TextEditor(text: $decision.context)
                    .frame(minHeight: 80)
            }

            Section("Options") {
                TextEditor(text: $decision.optionsText)
                    .frame(minHeight: 60)
            }

            Section("Decision Details") {
                Picker("Status", selection: $decision.status) {
                    ForEach(DecisionStatus.allCases, id: \.self) { s in
                        Text(s.displayName).tag(s)
                    }
                }

                TextField("Owner", text: $decision.owner)

                Toggle("Has Deadline", isOn: Binding(
                    get: { decision.dueDate != nil },
                    set: { decision.dueDate = $0 ? .now : nil }
                ))
                if decision.dueDate != nil {
                    DatePicker("Due Date", selection: Binding(
                        get: { decision.dueDate ?? .now },
                        set: { decision.dueDate = $0 }
                    ), displayedComponents: .date)
                }
            }

            if decision.status == .decided {
                Section("Outcome") {
                    TextEditor(text: $decision.outcome)
                        .frame(minHeight: 60)
                }
            }

            Section("Notes") {
                TextEditor(text: $decision.notes)
                    .frame(minHeight: 60)
            }

            if !projects.isEmpty {
                Section("Linked Project") {
                    Picker("Project", selection: $decision.project) {
                        Text("None").tag(Optional<Project>.none)
                        ForEach(projects) { project in
                            Text(project.title).tag(Optional(project))
                        }
                    }
                }
            }

            if decision.status == .open {
                Section {
                    Button("Mark as Decided") {
                        decision.status = .decided
                        decision.updatedAt = .now
                    }
                    .foregroundStyle(.green)

                    Button("Defer") {
                        decision.status = .deferred
                        decision.updatedAt = .now
                    }
                    .foregroundStyle(.orange)
                }
            }
        }
        .navigationTitle(decision.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}
