import SwiftUI
import SwiftData

struct ReviewView: View {
    @State private var selectedTab: ReviewType = .daily
    @State private var viewModel = ReviewViewModel()
    @Environment(\.modelContext) private var modelContext

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Review Type", selection: $selectedTab) {
                    Text("Daily").tag(ReviewType.daily)
                    Text("Weekly").tag(ReviewType.weekly)
                }
                .pickerStyle(.segmented)
                .padding(CadenceTheme.Spacing.md)

                Divider()

                ScrollView {
                    switch selectedTab {
                    case .daily:
                        DailyReviewContent(viewModel: viewModel)
                    case .weekly:
                        WeeklyReviewContent(viewModel: viewModel)
                    }
                }
            }
            .navigationTitle("Review")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button("Complete Review") {
                        viewModel.completeReview(type: selectedTab, modelContext: modelContext)
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            .task {
                viewModel.refresh(modelContext: modelContext)
            }
            .onAppear {
                viewModel.refresh(modelContext: modelContext)
            }
        }
    }
}

struct DailyReviewContent: View {
    let viewModel: ReviewViewModel

    var body: some View {
        LazyVStack(alignment: .leading, spacing: CadenceTheme.Spacing.lg) {
            if !viewModel.overdueItems.isEmpty {
                reviewSection(
                    title: "Overdue",
                    systemImage: "exclamationmark.triangle.fill",
                    items: viewModel.overdueItems,
                    color: .red
                )
            }

            if !viewModel.dueTodayItems.isEmpty {
                reviewSection(
                    title: "Due Today",
                    systemImage: "calendar",
                    items: viewModel.dueTodayItems,
                    color: .blue
                )
            }

            if !viewModel.waitingForItems.isEmpty {
                reviewSection(
                    title: "Waiting On",
                    systemImage: "clock.arrow.circlepath",
                    items: viewModel.waitingForItems,
                    color: .purple
                )
            }

            if !viewModel.openDecisions.isEmpty {
                decisionsSection(decisions: viewModel.openDecisions)
            }

            if viewModel.overdueItems.isEmpty && viewModel.dueTodayItems.isEmpty {
                dailyClearView
            }

            recentSessionsSection
        }
        .padding(CadenceTheme.Spacing.lg)
    }

    private func reviewSection(title: String, systemImage: String, items: [WorkItem], color: Color) -> some View {
        VStack(alignment: .leading, spacing: CadenceTheme.Spacing.sm) {
            SectionHeader(title: title, count: items.count, systemImage: systemImage)

            ForEach(items) { item in
                HStack {
                    Image(systemName: item.type.systemImage)
                        .foregroundStyle(item.type.color)
                    Text(item.title)
                        .lineLimit(2)
                    Spacer()
                    if item.isOverdue {
                        Text("Overdue")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.red)
                    }
                }
                .padding(CadenceTheme.Spacing.sm)
                .background(CadenceTheme.Colors.secondaryBackground, in: RoundedRectangle(cornerRadius: CadenceTheme.Radius.sm))
            }
        }
    }

    private func decisionsSection(decisions: [Decision]) -> some View {
        VStack(alignment: .leading, spacing: CadenceTheme.Spacing.sm) {
            SectionHeader(title: "Decisions Needed", count: decisions.count, systemImage: "scale.3d")
            ForEach(decisions) { decision in
                HStack {
                    Text(decision.title).lineLimit(2)
                    Spacer()
                    DecisionStatusBadge(status: decision.status)
                }
                .padding(CadenceTheme.Spacing.sm)
                .background(CadenceTheme.Colors.secondaryBackground, in: RoundedRectangle(cornerRadius: CadenceTheme.Radius.sm))
            }
        }
    }

    private var dailyClearView: some View {
        VStack(spacing: CadenceTheme.Spacing.sm) {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 36))
                .foregroundStyle(.green)
            Text("Daily review looks good")
                .font(CadenceTheme.Typography.title)
            Text("No overdue or due-today items. Well managed.")
                .font(.body)
                .foregroundStyle(CadenceTheme.Colors.secondaryLabel)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, CadenceTheme.Spacing.xl)
    }

    private var recentSessionsSection: some View {
        EmptyView()
    }
}

struct WeeklyReviewContent: View {
    let viewModel: ReviewViewModel

    var body: some View {
        LazyVStack(alignment: .leading, spacing: CadenceTheme.Spacing.lg) {
            projectsWithoutNextAction

            staleProjects

            if !viewModel.overdueFollowUps.isEmpty {
                overdueFollowUpsSection
            }

            if !viewModel.openDecisions.isEmpty {
                openDecisionsSection
            }

            if !viewModel.oldWaitingFor.isEmpty {
                oldWaitingForSection
            }

            completedThisWeek
        }
        .padding(CadenceTheme.Spacing.lg)
    }

    private var projectsWithoutNextAction: some View {
        VStack(alignment: .leading, spacing: CadenceTheme.Spacing.sm) {
            SectionHeader(
                title: "Projects Without Next Action",
                count: viewModel.projectsWithoutNextAction.count,
                systemImage: "folder.badge.questionmark"
            )

            if viewModel.projectsWithoutNextAction.isEmpty {
                reviewOKRow("All active projects have a next action")
            } else {
                ForEach(viewModel.projectsWithoutNextAction) { project in
                    HStack {
                        Text(project.title)
                        Spacer()
                        Text("Add next action →")
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }
                    .padding(CadenceTheme.Spacing.sm)
                    .background(CadenceTheme.Colors.secondaryBackground, in: RoundedRectangle(cornerRadius: CadenceTheme.Radius.sm))
                }
            }
        }
    }

    private var staleProjects: some View {
        VStack(alignment: .leading, spacing: CadenceTheme.Spacing.sm) {
            SectionHeader(
                title: "Stale Projects (>14 days)",
                count: viewModel.staleProjects.count,
                systemImage: "clock.badge.exclamationmark"
            )

            if viewModel.staleProjects.isEmpty {
                reviewOKRow("No stale projects")
            } else {
                ForEach(viewModel.staleProjects) { project in
                    HStack {
                        Text(project.title)
                        Spacer()
                        Text(project.lastReviewedAt.map { "Last: \($0.formatted(date: .abbreviated, time: .omitted))" } ?? "Never reviewed")
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }
                    .padding(CadenceTheme.Spacing.sm)
                    .background(CadenceTheme.Colors.secondaryBackground, in: RoundedRectangle(cornerRadius: CadenceTheme.Radius.sm))
                }
            }
        }
    }

    private var overdueFollowUpsSection: some View {
        VStack(alignment: .leading, spacing: CadenceTheme.Spacing.sm) {
            SectionHeader(title: "Overdue Follow-ups", count: viewModel.overdueFollowUps.count, systemImage: "arrow.turn.up.right")
            ForEach(viewModel.overdueFollowUps) { item in
                itemRow(item)
            }
        }
    }

    private var openDecisionsSection: some View {
        VStack(alignment: .leading, spacing: CadenceTheme.Spacing.sm) {
            SectionHeader(title: "Open Decisions", count: viewModel.openDecisions.count, systemImage: "scale.3d")
            ForEach(viewModel.openDecisions) { decision in
                HStack {
                    Text(decision.title).lineLimit(1)
                    Spacer()
                    if decision.isOverdue {
                        Text("Overdue").font(.caption).foregroundStyle(.red)
                    }
                }
                .padding(CadenceTheme.Spacing.sm)
                .background(CadenceTheme.Colors.secondaryBackground, in: RoundedRectangle(cornerRadius: CadenceTheme.Radius.sm))
            }
        }
    }

    private var oldWaitingForSection: some View {
        VStack(alignment: .leading, spacing: CadenceTheme.Spacing.sm) {
            SectionHeader(title: "Waiting >7 Days", count: viewModel.oldWaitingFor.count, systemImage: "clock.arrow.circlepath")
            ForEach(viewModel.oldWaitingFor) { item in
                itemRow(item)
            }
        }
    }

    private var completedThisWeek: some View {
        VStack(alignment: .leading, spacing: CadenceTheme.Spacing.sm) {
            SectionHeader(title: "Completed This Week", count: viewModel.completedThisWeek.count, systemImage: "checkmark.circle")
            if viewModel.completedThisWeek.isEmpty {
                reviewOKRow("Nothing completed this week yet")
            } else {
                ForEach(viewModel.completedThisWeek.prefix(10)) { item in
                    HStack {
                        Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                        Text(item.title).lineLimit(1)
                    }
                    .padding(.vertical, 2)
                }
            }
        }
    }

    private func itemRow(_ item: WorkItem) -> some View {
        HStack {
            Image(systemName: item.type.systemImage)
                .foregroundStyle(item.type.color)
            Text(item.title).lineLimit(1)
            Spacer()
        }
        .padding(CadenceTheme.Spacing.sm)
        .background(CadenceTheme.Colors.secondaryBackground, in: RoundedRectangle(cornerRadius: CadenceTheme.Radius.sm))
    }

    private func reviewOKRow(_ text: String) -> some View {
        HStack {
            Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
            Text(text).font(.subheadline).foregroundStyle(CadenceTheme.Colors.secondaryLabel)
        }
        .padding(CadenceTheme.Spacing.sm)
    }
}
