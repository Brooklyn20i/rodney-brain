import SwiftUI
import SwiftData

struct OCRReviewView: View {
    @Bindable var item: CaptureQueueItem
    let viewModel: CaptureViewModel

    @State private var showCreateItem = false
    @State private var showCreateMultiple = false
    @State private var classificationResult: ClassificationResult?
    @State private var multipleResults: [ClassificationResult] = []
    @Environment(\.modelContext) private var modelContext

    var body: some View {
        GeometryReader { geo in
            HStack(spacing: 0) {
                // Screenshot panel
                screenshotPanel
                    .frame(width: geo.size.width * 0.45)

                Divider()

                // OCR text panel
                ocrTextPanel
                    .frame(maxWidth: .infinity)
            }
        }
        .background(CadenceTheme.Colors.background)
        .toolbar { ocrToolbar }
        .sheet(isPresented: $showCreateItem) {
            if let result = classificationResult {
                CreateItemSheet(
                    classificationResult: result,
                    sourceCapture: item.capture
                )
            }
        }
        .sheet(isPresented: $showCreateMultiple) {
            CreateMultipleItemsSheet(results: $multipleResults, sourceCapture: item.capture)
        }
        .task {
            if item.status == .imported {
                await viewModel.runOCR(on: item)
            }
        }
    }

    // MARK: - Screenshot Panel

    private var screenshotPanel: some View {
        VStack(alignment: .leading, spacing: CadenceTheme.Spacing.md) {
            HStack {
                Text("Original")
                    .font(CadenceTheme.Typography.sectionHeader)
                    .foregroundStyle(CadenceTheme.Colors.secondaryLabel)
                Spacer()
                confidenceIndicator
            }
            .padding(.horizontal, CadenceTheme.Spacing.md)
            .padding(.top, CadenceTheme.Spacing.md)

            ScrollView {
                Image(uiImage: item.image)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: CadenceTheme.Radius.md))
                    .padding(.horizontal, CadenceTheme.Spacing.md)
            }
        }
        .background(CadenceTheme.Colors.secondaryBackground)
    }

    private var confidenceIndicator: some View {
        Group {
            if let result = item.ocrResult {
                let pct = Int(result.overallConfidence * 100)
                Label("\(pct)% confidence", systemImage: "text.viewfinder")
                    .font(.caption)
                    .foregroundStyle(result.overallConfidence > 0.8 ? .green : .orange)
            }
        }
    }

    // MARK: - OCR Text Panel

    private var ocrTextPanel: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Extracted Text")
                    .font(CadenceTheme.Typography.sectionHeader)
                    .foregroundStyle(CadenceTheme.Colors.secondaryLabel)
                Spacer()
            }
            .padding(.horizontal, CadenceTheme.Spacing.md)
            .padding(.vertical, CadenceTheme.Spacing.md)

            Divider()

            switch item.status {
            case .imported:
                processingOverlay("Ready to extract text")
            case .processing:
                processingOverlay("Extracting text…")
            case .failed:
                failedState
            case .processed:
                processedContent
            }
        }
    }

    private var processedContent: some View {
        VStack(spacing: 0) {
            TextEditor(text: $item.editableText)
                .font(.system(.body, design: .monospaced))
                .padding(CadenceTheme.Spacing.md)

            Divider()

            actionBar
                .padding(CadenceTheme.Spacing.md)
        }
    }

    private var actionBar: some View {
        HStack(spacing: CadenceTheme.Spacing.sm) {
            Button {
                Task {
                    classificationResult = await viewModel.classifyText(item.editableText)
                    showCreateItem = true
                }
            } label: {
                Label("Create Item", systemImage: "plus.circle.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)

            Button {
                Task {
                    multipleResults = await viewModel.classifyMultiple(item.editableText)
                    showCreateMultiple = true
                }
            } label: {
                Label("Create Multiple", systemImage: "square.stack.3d.up")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)

            Menu {
                Button("Save as Note") {
                    saveAsNote()
                }
                Divider()
                Button("Keep Screenshot") {
                    viewModel.saveImage(item.image, for: item.capture)
                }
                Button("Discard Screenshot", role: .destructive) {
                    viewModel.removeFromQueue(item, modelContext: modelContext, keepScreenshot: false)
                }
            } label: {
                Image(systemName: "ellipsis.circle")
                    .font(.title3)
            }
            .buttonStyle(.bordered)
        }
    }

    private func processingOverlay(_ message: String) -> some View {
        VStack(spacing: CadenceTheme.Spacing.lg) {
            if item.status == .processing {
                ProgressView()
                    .scaleEffect(1.5)
            } else {
                Image(systemName: "text.viewfinder")
                    .font(.system(size: 40, weight: .light))
                    .foregroundStyle(CadenceTheme.Colors.tertiaryLabel)
            }
            Text(message)
                .font(.body)
                .foregroundStyle(CadenceTheme.Colors.secondaryLabel)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var failedState: some View {
        EmptyStateView(
            systemImage: "exclamationmark.triangle",
            title: "Extraction Failed",
            message: item.capture.errorMessage ?? "Could not extract text from this image.",
            actionTitle: "Try Again"
        ) {
            Task { await viewModel.runOCR(on: item) }
        }
    }

    @ToolbarContentBuilder
    private var ocrToolbar: some ToolbarContent {
        ToolbarItem(placement: .primaryAction) {
            if item.status == .imported || item.status == .failed {
                Button("Extract Text") {
                    Task { await viewModel.runOCR(on: item) }
                }
                .buttonStyle(.borderedProminent)
            }
        }
    }

    private func saveAsNote() {
        let workItem = WorkItem(
            title: "Note from screenshot",
            detail: item.editableText,
            type: .projectNote,
            sourceType: .screenshot
        )
        workItem.sourceScreenshot = item.capture
        modelContext.insert(workItem)
    }
}
