import SwiftUI

struct EmptyStateView: View {
    let systemImage: String
    let title: String
    let message: String
    var actionTitle: String? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: CadenceTheme.Spacing.lg) {
            Image(systemName: systemImage)
                .font(.system(size: 48, weight: .light))
                .foregroundStyle(CadenceTheme.Colors.tertiaryLabel)

            VStack(spacing: CadenceTheme.Spacing.sm) {
                Text(title)
                    .font(CadenceTheme.Typography.title)
                    .foregroundStyle(CadenceTheme.Colors.label)
                    .multilineTextAlignment(.center)

                Text(message)
                    .font(CadenceTheme.Typography.body)
                    .foregroundStyle(CadenceTheme.Colors.secondaryLabel)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 360)
            }

            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(CadenceTheme.Spacing.xxl)
    }
}
