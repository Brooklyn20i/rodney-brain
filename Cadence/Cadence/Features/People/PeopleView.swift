import SwiftUI
import SwiftData

struct PeopleView: View {
    @Query(sort: \Person.name) private var people: [Person]
    @Environment(\.modelContext) private var modelContext

    @State private var selectedPerson: Person?
    @State private var showingNewPerson = false
    @State private var searchText = ""

    var followUpNeeded: [Person] {
        people.filter { $0.needsFollowUp }
    }

    var waitingOn: [Person] {
        people.filter { $0.waitingForCount > 0 }
    }

    var filteredPeople: [Person] {
        guard !searchText.isEmpty else { return people }
        return people.filter {
            $0.name.localizedCaseInsensitiveContains(searchText) ||
            $0.organisation.localizedCaseInsensitiveContains(searchText)
        }
    }

    var body: some View {
        NavigationSplitView {
            Group {
                if people.isEmpty {
                    EmptyStateView(
                        systemImage: "person.2",
                        title: "No People",
                        message: "Add people you work with to track commitments, follow-ups, and waiting-for items.",
                        actionTitle: "Add Person"
                    ) { showingNewPerson = true }
                } else {
                    peopleList
                }
            }
            .navigationTitle("People")
            .searchable(text: $searchText, prompt: "Search people")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showingNewPerson = true } label: {
                        Image(systemName: "plus")
                    }
                }
            }
        } detail: {
            if let person = selectedPerson {
                PersonDetailView(person: person)
            } else {
                EmptyStateView(
                    systemImage: "person.circle",
                    title: "Select a Person",
                    message: "View commitments, follow-ups, and waiting-for items for each person."
                )
            }
        }
        .sheet(isPresented: $showingNewPerson) {
            NewPersonSheet()
        }
    }

    private var peopleList: some View {
        List(filteredPeople, selection: $selectedPerson) { person in
            PersonRow(person: person)
                .tag(person)
                .swipeActions(edge: .trailing) {
                    Button(role: .destructive) {
                        modelContext.delete(person)
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
        }
        .listStyle(.plain)
    }
}

struct PersonRow: View {
    let person: Person

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(person.name)
                    .font(CadenceTheme.Typography.label)
                Spacer()
                if person.needsFollowUp {
                    Image(systemName: "exclamationmark.circle.fill")
                        .foregroundStyle(.orange)
                        .font(.caption)
                }
            }

            HStack(spacing: CadenceTheme.Spacing.sm) {
                if !person.role.isEmpty {
                    Text(person.role)
                        .font(.caption)
                        .foregroundStyle(CadenceTheme.Colors.secondaryLabel)
                }
                if !person.organisation.isEmpty {
                    Text("·")
                        .foregroundStyle(CadenceTheme.Colors.tertiaryLabel)
                    Text(person.organisation)
                        .font(.caption)
                        .foregroundStyle(CadenceTheme.Colors.tertiaryLabel)
                }
            }

            HStack(spacing: CadenceTheme.Spacing.sm) {
                if person.openCommitmentsCount > 0 {
                    Label("\(person.openCommitmentsCount) follow-up\(person.openCommitmentsCount == 1 ? "" : "s")", systemImage: "arrow.turn.up.right")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
                if person.waitingForCount > 0 {
                    Label("\(person.waitingForCount) waiting", systemImage: "clock.arrow.circlepath")
                        .font(.caption)
                        .foregroundStyle(.purple)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

struct NewPersonSheet: View {
    @State private var name = ""
    @State private var role = ""
    @State private var organisation = ""

    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    var body: some View {
        NavigationStack {
            Form {
                Section("Person") {
                    TextField("Full Name", text: $name)
                    TextField("Role / Title", text: $role)
                    TextField("Organisation", text: $organisation)
                }
            }
            .navigationTitle("New Person")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") { save() }
                        .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func save() {
        let person = Person(name: name, role: role, organisation: organisation)
        modelContext.insert(person)
        dismiss()
    }
}
