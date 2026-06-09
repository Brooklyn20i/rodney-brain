import SwiftUI
import SwiftData

struct DecisionsView: View {
    @Query(sort: \Decision.createdAt, order: .reverse) private var decisions: [Decision]
    @Environment(\.modelContext) private var modelContext

    @State private var selectedDecision: Decision?
    @State private var showingNewDecision = false
    @State private var filterStatus: DecisionStatus? = nil

    var filteredDecisions: [Decision] {
        guard let filter = filterStatus else { return decisions }
        return decisions.filter { $0.status == filter }
    }

    var openDecisions: [Decision] { decisions.filter { $0.status == .open } }
    var overdueDecisions: [Decision] { decisions.filter { $0.isOverdue } }

    var body: some View {
        NavigationSplitView {
            Group {
                if decisions.isEmpty {
                    EmptyStateView(
                        systemImage: "scale.3d",
                        title: "No Decisions",
                        message: "Track decisions that need to be made, who owns them, and when they're needed.",
                        actionTitle: "New Decision"
                    ) { showingNewDecision = true }
                } else {
                    decisionsList
                }
            }
            .navigationTitle("Decisions")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showingNewDecision = true } label: {
                        Image(systemName: "plus")
                    }
                }
                ToolbarItem(placement: .secondaryAction) {
                    filterMenu
                }
            }
        } detail: {
            if let decision = selectedDecision {
                DecisionDetailView(decision: decision)
            } else {
                EmptyStateView(
                    systemImage: "scale.3d",
                    title: "Select a Decision",
                    message: "View context, options, and outcome for each decision."
                )
            }
        }
        .sheet(isPresented: $showingNewDecision) {
            NewDecisionSheet()
        }
    }

    private var decisionsList: some View {
        List(filteredDecisions, selection: $selectedDecision) { decision in
            DecisionRow(decision: decision)
                .tag(decision)
                .swipeActions(edge: .trailing) {
                    Button(role: .destructive) {
                        modelContext.delete(decision)
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
        }
        .listStyle(.plain)
    }

    private var filterMenu: some View {
        Menu {
            Button("All") { filterStatus = nil }
            Divider()
            ForEach(DecisionStatus.allCases, id: \.self) { status in
                Button(status.displayName) { filterStatus = status }
            }
        } label: {
            Label(filterStatus?.displayName ?? "Filter", systemImage: "line.3.horizontal.decrease.circle")
        }
    }
}

struct DecisionRow: View {
    let decision: Decision

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(decision.title)
                    .font(CadenceTheme.Typography.label)
                    .lineLimit(2)
                Spacer()
                DecisionStatusBadge(status: decision.status)
            }

            HStack(spacing: CadenceTheme.Spacing.sm) {
                if let due = decision.dueDate {
                    Label(due.formatted(date: .abbreviated, time: .omitted), systemImage: "calendar")
                        .font(.caption)
                        .foregroundStyle(decision.isOverdue ? .red : CadenceTheme.Colors.secondaryLabel)
                }
                if !decision.owner.isEmpty {
                    Label(decision.owner, systemImage: "person")
                        .font(.caption)
                        .foregroundStyle(CadenceTheme.Colors.secondaryLabel)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

struct NewDecisionSheet: View {
    @State private var title = ""
    @State private var context = ""
    @State private var owner = ""
    @State private var hasDueDate = false
    @State private var dueDate = Date.now

    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    var body: some View {
        NavigationStack {
            Form {
                Section("Decision") {
                    TextField("What needs to be decided?", text: $title, axis: .vertical)
                        .lineLimit(3)
                    TextField("Context / Background", text: $context, axis: .vertical)
                        .lineLimit(4)
                }
                Section("Owner & Deadline") {
                    TextField("Owner", text: $owner)
                    Toggle("Has Deadline", isOn: $hasDueDate)
                    if hasDueDate {
                        DatePicker("Due Date", selection: $dueDate, displayedComponents: .date)
                    }
                }
            }
            .navigationTitle("New Decision")
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
        .presentationDetents([.medium, .large])
    }

    private func save() {
        let decision = Decision(
            title: title,
            context: context,
            dueDate: hasDueDate ? dueDate : nil,
            owner: owner
        )
        modelContext.insert(decision)
        dismiss()
    }
}
