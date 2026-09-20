import SwiftUI

struct NativeRootView: View {
    @State private var model = NativeAppModel()

    var body: some View {
        Group {
            switch model.phase {
            case .starting:
                ProgressView("Starting Cadence…")
            case .signedOut:
                NativeLoginView(model: model)
            case .ready:
                NativeExecutiveBriefView(model: model)
            case .restorationError(let message):
                VStack(spacing: 20) {
                    ContentUnavailableView(
                        "Cadence is temporarily unavailable",
                        systemImage: "wifi.exclamationmark",
                        description: Text(message)
                    )
                    Button("Try again") {
                        Task { await model.retryStart() }
                    }
                    .buttonStyle(.borderedProminent)
                    Button("Sign out", role: .destructive) {
                        Task { await model.signOut() }
                    }
                }
                .padding()
            case .configurationError(let message):
                ContentUnavailableView(
                    "Configuration required",
                    systemImage: "gear.badge.xmark",
                    description: Text(message)
                )
            }
        }
        .task {
            await model.start()
        }
    }
}
