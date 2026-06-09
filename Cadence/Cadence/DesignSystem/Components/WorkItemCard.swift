import SwiftUI

struct WorkItemCard: View {
    let item: WorkItem
    var onTap: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: CadenceTheme.Spacing.sm) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.title)
                        .font(CadenceTheme.Typography.label)
                        .foregroundStyle(item.status == .done ? CadenceTheme.Colors.tertiaryLabel : CadenceTheme.Colors.label)
                        .strikethrough(item.status == .done)
                        .lineLimit(2)

                    if !item.detail.isEmpty {
                        Text(item.detail)
                            .font(.caption)
                            .foregroundStyle(CadenceTheme.Colors.secondaryLabel)
                            .lineLimit(1)
                    }
                }
                Spacer()
                PriorityBadge(priority: item.priority)
            }

            HStack(spacing: CadenceTheme.Spacing.sm) {
                TypeBadge(type: item.type)

                if let due = item.dueDate {
                    Label(due.formatted(date: .abbreviated, time: .omitted), systemImage: "calendar")
                        .font(.caption)
                        .foregroundStyle(item.isOverdue ? CadenceTheme.Colors.statusOverdue : CadenceTheme.Colors.secondaryLabel)
                }

                Spacer()

                if item.sourceType == .screenshot {
                    Image(systemName: "camera.viewfinder")
                        .font(.caption)
                        .foregroundStyle(CadenceTheme.Colors.tertiaryLabel)
                }
            }
        }
        .padding(CadenceTheme.Spacing.md)
        .background(CadenceTheme.Colors.secondaryBackground, in: RoundedRectangle(cornerRadius: CadenceTheme.Radius.md))
        .contentShape(RoundedRectangle(cornerRadius: CadenceTheme.Radius.md))
        .onTapGesture { onTap?() }
    }
}

struct SectionHeader: View {
    let title: String
    var count: Int? = nil
    var systemImage: String? = nil

    var body: some View {
        HStack {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(CadenceTheme.Typography.sectionHeader)
                    .foregroundStyle(CadenceTheme.Colors.secondaryLabel)
            }
            Text(title)
                .font(CadenceTheme.Typography.sectionHeader)
                .foregroundStyle(CadenceTheme.Colors.secondaryLabel)
                .textCase(nil)
            if let count, count > 0 {
                Text("\(count)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(CadenceTheme.Colors.accent, in: Capsule())
            }
            Spacer()
        }
        .padding(.top, CadenceTheme.Spacing.sm)
    }
}
