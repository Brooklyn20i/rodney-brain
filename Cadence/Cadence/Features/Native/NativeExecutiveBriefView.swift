import SwiftUI

struct NativeExecutiveBriefView: View {
    @Bindable var model: NativeAppModel

    var body: some View {
        NavigationStack {
            Group {
                if let brief = model.brief {
                    List {
                        if let errorMessage = model.errorMessage {
                            Section {
                                Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                                    .font(.footnote)
                                    .foregroundStyle(.orange)
                            }
                        }

                        summarySection(brief)
                        workSection("Overdue", icon: "exclamationmark.triangle.fill", items: brief.overdue, tint: .red)
                        workSection("Due today", icon: "calendar", items: brief.dueToday, tint: .blue)
                        decisionSection(brief.pendingDecisions)
                        workSection("Waiting on others", icon: "clock.arrow.circlepath", items: brief.waitingOn, tint: .orange)

                        if isEmpty(brief) {
                            ContentUnavailableView(
                                "Nothing needs you",
                                systemImage: "checkmark.circle.fill",
                                description: Text("Cadence will surface decisions, exceptions and commitments here.")
                            )
                        }
                    }
                    .listStyle(.insetGrouped)
                    .refreshable {
                        await model.refreshBrief()
                    }
                } else if model.isRefreshing {
                    ProgressView("Building your brief…")
                } else {
                    ContentUnavailableView(
                        "Brief unavailable",
                        systemImage: "arrow.clockwise",
                        description: Text(model.errorMessage ?? "Pull to refresh Cadence.")
                    )
                }
            }
            .navigationTitle("Needs you")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Sign out") {
                        Task { await model.signOut() }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await model.refreshBrief() }
                    } label: {
                        if model.isRefreshing {
                            ProgressView()
                        } else {
                            Image(systemName: "arrow.clockwise")
                        }
                    }
                    .disabled(model.isRefreshing)
                    .accessibilityLabel("Refresh brief")
                }
            }
        }
    }

    @ViewBuilder
    private func summarySection(_ brief: ExecutiveBrief) -> some View {
        Section {
            HStack(spacing: 10) {
                metric(brief.pendingDecisions.count, "Decide", color: .purple)
                metric(brief.overdue.count, "Overdue", color: .red)
                metric(brief.dueToday.count, "Today", color: .blue)
                metric(brief.waitingOn.count, "Waiting", color: .orange)
            }
            .padding(.vertical, 4)
        } header: {
            Text("Executive brief")
        }
    }

    private func metric(_ value: Int, _ label: String, color: Color) -> some View {
        VStack(spacing: 4) {
            Text(value, format: .number)
                .font(.title2.bold())
                .foregroundStyle(color)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func workSection(
        _ title: String,
        icon: String,
        items: [CadenceWorkItem],
        tint: Color
    ) -> some View {
        if !items.isEmpty {
            Section {
                ForEach(items) { item in
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Image(systemName: icon)
                            .foregroundStyle(tint)
                            .frame(width: 20)

                        VStack(alignment: .leading, spacing: 3) {
                            Text(item.title)
                                .font(.body.weight(.medium))
                            if let dueDate = item.dueDate {
                                Text("Due \(dueDate)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }

                        Spacer(minLength: 8)

                        Button {
                            Task { await model.complete(item) }
                        } label: {
                            Group {
                                if model.completingItemIDs.contains(item.id) {
                                    ProgressView()
                                } else {
                                    Image(systemName: "checkmark.circle")
                                        .font(.title3)
                                }
                            }
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .disabled(model.completingItemIDs.contains(item.id))
                        .accessibilityLabel("Complete \(item.title)")
                    }
                    .padding(.vertical, 3)
                }
            } header: {
                Text(title)
            }
        }
    }

    @ViewBuilder
    private func decisionSection(_ decisions: [CadenceDecision]) -> some View {
        if !decisions.isEmpty {
            Section {
                ForEach(decisions) { decision in
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Image(systemName: "checkmark.seal.fill")
                            .foregroundStyle(.purple)
                            .frame(width: 20)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(decision.title)
                                .font(.body.weight(.medium))
                            if !decision.context.isEmpty {
                                Text(decision.context)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(2)
                            }
                        }
                    }
                    .padding(.vertical, 3)
                }
            } header: {
                Text("Decisions required")
            }
        }
    }

    private func isEmpty(_ brief: ExecutiveBrief) -> Bool {
        brief.overdue.isEmpty &&
            brief.dueToday.isEmpty &&
            brief.waitingOn.isEmpty &&
            brief.pendingDecisions.isEmpty
    }
}
