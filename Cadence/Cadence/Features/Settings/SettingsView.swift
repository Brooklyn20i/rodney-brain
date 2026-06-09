import SwiftUI
import SwiftData

struct SettingsView: View {
    @Query private var settingsArray: [UserSettings]
    @Environment(\.modelContext) private var modelContext

    private var settings: UserSettings? { settingsArray.first }

    var body: some View {
        NavigationStack {
            Group {
                if let settings {
                    SettingsForm(settings: settings)
                } else {
                    ProgressView("Loading settings…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .navigationTitle("Settings")
        }
        .task {
            if settingsArray.isEmpty {
                modelContext.insert(UserSettings())
            }
        }
    }
}

private struct SettingsForm: View {
    @Bindable var settings: UserSettings

    var body: some View {
        Form {
            screenshotSection
            ocrSection
            reviewSection
            privacySection
            aboutSection
        }
    }

    private var screenshotSection: some View {
        Section {
            Toggle(isOn: $settings.keepOriginalScreenshots) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Keep Original Screenshots")
                    Text("Screenshots are saved to the app's local storage.")
                        .font(.caption)
                        .foregroundStyle(CadenceTheme.Colors.secondaryLabel)
                }
            }
            .onChange(of: settings.keepOriginalScreenshots) { _, _ in settings.updatedAt = .now }

            Toggle(isOn: $settings.deleteScreenshotAfterOCR) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Delete Screenshot After OCR")
                    Text("Original image is deleted once text has been extracted.")
                        .font(.caption)
                        .foregroundStyle(CadenceTheme.Colors.secondaryLabel)
                }
            }
            .onChange(of: settings.deleteScreenshotAfterOCR) { _, _ in settings.updatedAt = .now }
        } header: {
            Text("Screenshot Storage")
        } footer: {
            Text("Screenshots are stored locally on this device only and are never uploaded.")
        }
    }

    private var ocrSection: some View {
        Section {
            Toggle(isOn: $settings.keepOCRText) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Keep Extracted Text")
                    Text("OCR text is retained in the capture record.")
                        .font(.caption)
                        .foregroundStyle(CadenceTheme.Colors.secondaryLabel)
                }
            }
            .onChange(of: settings.keepOCRText) { _, _ in settings.updatedAt = .now }

            Toggle(isOn: $settings.deleteOCRTextAfterItemCreation) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Delete OCR Text After Item Creation")
                    Text("Extracted text is removed once work items have been created from it.")
                        .font(.caption)
                        .foregroundStyle(CadenceTheme.Colors.secondaryLabel)
                }
            }
            .onChange(of: settings.deleteOCRTextAfterItemCreation) { _, _ in settings.updatedAt = .now }
        } header: {
            Text("OCR Text")
        } footer: {
            Text("OCR runs entirely on-device using Apple Vision. Text is never sent to any server.")
        }
    }

    private var reviewSection: some View {
        Section {
            Picker("Default Review", selection: $settings.defaultReviewCadenceRaw) {
                ForEach(ReviewType.allCases, id: \.rawValue) { type in
                    Text(type.displayName).tag(type.rawValue)
                }
            }
            .onChange(of: settings.defaultReviewCadenceRaw) { _, _ in settings.updatedAt = .now }
        } header: {
            Text("Review")
        }
    }

    private var privacySection: some View {
        Section {
            HStack(spacing: CadenceTheme.Spacing.sm) {
                Image(systemName: "lock.shield.fill")
                    .foregroundStyle(.green)
                    .font(.title3)
                VStack(alignment: .leading, spacing: 2) {
                    Text("All data is local")
                        .font(.subheadline.weight(.medium))
                    Text("No data is shared with any service. OCR, classification, and storage all happen on this device.")
                        .font(.caption)
                        .foregroundStyle(CadenceTheme.Colors.secondaryLabel)
                }
            }
            .padding(.vertical, 4)
        } header: {
            Text("Privacy")
        }
    }

    private var aboutSection: some View {
        Section {
            LabeledContent("Version", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0")
            LabeledContent("Build", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1")
        } header: {
            Text("About Cadence")
        }
    }
}
