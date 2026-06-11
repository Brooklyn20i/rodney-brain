import SwiftUI
import SwiftData

struct PersonDetailView: View {
    @Bindable var person: Person

    var openCommitments: [WorkItem] {
        person.workItems.filter { $0.type == .followUp && $0.status != .done && $0.status != .archived }
    }

    var waitingForItems: [WorkItem] {
        person.workItems.filter { ($0.type == .waitingFor || $0.status == .waitingFor) && $0.status != .done }
    }

    var body: some View {
        Form {
            Section {
                TextField("Name", text: $person.name)
                    .font(.title3.weight(.semibold))
                TextField("Role / Title", text: $person.role)
                TextField("Organisation", text: $person.organisation)
            }

            Section("Notes") {
                TextEditor(text: $person.notes)
                    .frame(minHeight: 60)
            }

            Section("Follow-up") {
                Toggle("Has Follow-up Date", isOn: Binding(
                    get: { person.nextFollowUpAt != nil },
                    set: { person.nextFollowUpAt = $0 ? .now : nil }
                ))
                if person.nextFollowUpAt != nil {
                    DatePicker("Follow-up On", selection: Binding(
                        get: { person.nextFollowUpAt ?? .now },
                        set: { person.nextFollowUpAt = $0 }
                    ), displayedComponents: .date)
                }
            }

            if !openCommitments.isEmpty {
                Section("Open Commitments (\(openCommitments.count))") {
                    ForEach(openCommitments) { item in
                        HStack {
                            Image(systemName: item.type.systemImage)
                                .foregroundStyle(item.type.color)
                            Text(item.title).lineLimit(1)
                            Spacer()
                            if item.isOverdue {
                                Image(systemName: "exclamationmark.circle")
                                    .foregroundStyle(.red)
                                    .font(.caption)
                            }
                        }
                    }
                }
            }

            if !waitingForItems.isEmpty {
                Section("Waiting For (\(waitingForItems.count))") {
                    ForEach(waitingForItems) { item in
                        HStack {
                            Text(item.title).lineLimit(1)
                            Spacer()
                            if let due = item.dueDate {
                                Text(due.formatted(date: .abbreviated, time: .omitted))
                                    .font(.caption)
                                    .foregroundStyle(item.isOverdue ? .red : CadenceTheme.Colors.tertiaryLabel)
                            }
                        }
                    }
                }
            }

            Section("Metadata") {
                if let lastInteraction = person.lastInteractionAt {
                    LabeledContent("Last Interaction") {
                        Text(lastInteraction.formatted(date: .abbreviated, time: .omitted))
                    }
                }
                Button("Record Interaction Today") {
                    person.lastInteractionAt = .now
                    person.updatedAt = .now
                }
            }
        }
        .navigationTitle(person.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}
