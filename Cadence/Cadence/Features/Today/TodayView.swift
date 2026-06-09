import SwiftUI
import SwiftData

struct TodayView: View {
    @State private var viewModel = TodayViewModel()
    @State private var showingCapture = false
    @Environment(\.modelContext) private var modelContext

    var todayString: String {
        Date.now.formatted(.dateTime.weekday(.wide).month(.wide).day())
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: CadenceTheme.Spacing.lg) {
                // Header
                VStack(alignment: .leading, spacing: CadenceTheme.Spacing.xs) {
                    Text("Your Day")
                        .font(CadenceTheme.Typography.largeTitle)
                    Text(todayString)
                        .font(.subheadline)
                        .foregroundStyle(CadenceTheme.Colors.secondaryLabel)
                }
                .padding(.horizontal, CadenceTheme.Spacing.lg)
                .padding(.top, CadenceTheme.Spacing.lg)

                // Top 3
                if !viewModel.top3.isEmpty {
                    todaySection(
                        title: "Top 3 Priorities",
                        systemImage: "star.fill",
                        items: viewModel.top3
                    )
                }

                // Overdue
                if !viewModel.overdue.isEmpty {
                    todaySection(
                        title: "Overdue",
                        systemImage: "exclamationmark.triangle.fill",
                        items: viewModel.overdue,
                        tint: .red
                    )
                }

                // Due today
                if !viewModel.dueToday.isEmpty {
                    todaySection(
                        title: "Due Today",
                        systemImage: "calendar.badge.clock",
                        items: viewModel.dueToday
                    )
                }

                // Waiting for others
                if !viewModel.waitingFor.isEmpty {
                    todaySection(
                        title: "Waiting on Others",
                        systemImage: "clock.arrow.circlepath",
                        items: viewModel.waitingFor
                    )
                }

                // Decisions needed
                if !viewModel.decisionsNeeded.isEmpty {
                    decisionsSection
                }

                // Follow-ups
                if !viewModel.followUps.isEmpty {
                    todaySection(
                        title: "Follow-ups",
                        systemImage: "arrow.turn.up.right",
                        items: viewModel.followUps
                    )
                }

                // Focus block suggestion
                if !viewModel.suggestedFocusBlock.isEmpty {
                    focusBlockCard
                }

                // All clear
                if viewModel.top3.isEmpty && viewModel.overdue.isEmpty &&
                   viewModel.dueToday.isEmpty && viewModel.waitingFor.isEmpty {
                    allClearView
                }

                Spacer(minLength: 80)
            }
        }
        .navigationTitle("Today")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showingCapture = true
                } label: {
                    Label("Quick Capture", systemImage: "camera.viewfinder")
                }
                .keyboardShortcut("k", modifiers: .command)
            }
        }
        .task {
            viewModel.refresh(modelContext: modelContext)
        }
        .onAppear {
            viewModel.refresh(modelContext: modelContext)
        }
        .sheet(isPresented: $showingCapture) {
            CaptureView()
        }
    }

    private func todaySection(title: String, systemImage: String, items: [WorkItem], tint: Color? = nil) -> some View {
        VStack(alignment: .leading, spacing: CadenceTheme.Spacing.sm) {
            SectionHeader(title: title, count: items.count, systemImage: systemImage)
                .padding(.horizontal, CadenceTheme.Spacing.lg)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: CadenceTheme.Spacing.sm) {
                    ForEach(items) { item in
                        WorkItemCard(item: item)
                            .frame(width: 300)
                    }
                }
                .padding(.horizontal, CadenceTheme.Spacing.lg)
            }
        }
    }

    private var decisionsSection: some View {
        VStack(alignment: .leading, spacing: CadenceTheme.Spacing.sm) {
            SectionHeader(
                title: "Decisions Needed",
                count: viewModel.decisionsNeeded.count,
                systemImage: "scale.3d"
            )
            .padding(.horizontal, CadenceTheme.Spacing.lg)

            VStack(spacing: CadenceTheme.Spacing.sm) {
                ForEach(viewModel.decisionsNeeded.prefix(3)) { decision in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(decision.title)
                                .font(CadenceTheme.Typography.label)
                            if let due = decision.dueDate {
                                Text("Due \(due.formatted(date: .abbreviated, time: .omitted))")
                                    .font(.caption)
                                    .foregroundStyle(decision.isOverdue ? .red : CadenceTheme.Colors.secondaryLabel)
                            }
                        }
                        Spacer()
                        DecisionStatusBadge(status: decision.status)
                    }
                    .padding(CadenceTheme.Spacing.md)
                    .background(CadenceTheme.Colors.secondaryBackground, in: RoundedRectangle(cornerRadius: CadenceTheme.Radius.md))
                }
            }
            .padding(.horizontal, CadenceTheme.Spacing.lg)
        }
    }

    private var focusBlockCard: some View {
        HStack(spacing: CadenceTheme.Spacing.md) {
            Image(systemName: "brain.head.profile")
                .font(.title2)
                .foregroundStyle(CadenceTheme.Colors.accent)
            VStack(alignment: .leading) {
                Text("Suggested Focus")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(CadenceTheme.Colors.secondaryLabel)
                Text(viewModel.suggestedFocusBlock)
                    .font(CadenceTheme.Typography.label)
            }
        }
        .padding(CadenceTheme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(CadenceTheme.Colors.accent.opacity(0.08), in: RoundedRectangle(cornerRadius: CadenceTheme.Radius.md))
        .padding(.horizontal, CadenceTheme.Spacing.lg)
    }

    private var allClearView: some View {
        VStack(spacing: CadenceTheme.Spacing.md) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 48))
                .foregroundStyle(.green)
            Text("All clear")
                .font(CadenceTheme.Typography.title)
            Text("Nothing urgent today. Use the time intentionally.")
                .font(.body)
                .foregroundStyle(CadenceTheme.Colors.secondaryLabel)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, CadenceTheme.Spacing.xxl)
    }
}
