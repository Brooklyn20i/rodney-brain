import SwiftUI
import PhotosUI
import SwiftData

struct CaptureView: View {
    @State private var viewModel = CaptureViewModel()
    @State private var photoItems: [PhotosPickerItem] = []
    @Environment(\.modelContext) private var modelContext

    var body: some View {
        NavigationStack {
            GeometryReader { geo in
                HStack(spacing: 0) {
                    // Queue panel (fixed width)
                    queuePanel
                        .frame(width: min(320, geo.size.width * 0.33))
                        .background(CadenceTheme.Colors.secondaryBackground)

                    Divider()

                    // Review panel (flexible)
                    Group {
                        if let selected = viewModel.selectedQueueItem {
                            OCRReviewView(item: selected, viewModel: viewModel)
                        } else {
                            EmptyStateView(
                                systemImage: "camera.viewfinder",
                                title: "Select a Screenshot",
                                message: "Choose a screenshot from the queue to review extracted text and convert it into actions."
                            )
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .navigationTitle("Capture")
            .toolbar { toolbar }
        }
        .photosPicker(
            isPresented: $viewModel.showPhotoPicker,
            selection: $photoItems,
            maxSelectionCount: 10,
            matching: .images
        )
        .onChange(of: photoItems) { _, new in
            handlePhotoPickerSelection(new)
        }
        .fileImporter(
            isPresented: $viewModel.showFileImporter,
            allowedContentTypes: [.image, .jpeg, .png],
            allowsMultipleSelection: true
        ) { result in
            handleFileImport(result)
        }
        .alert("Error", isPresented: Binding(
            get: { viewModel.errorMessage != nil },
            set: { if !$0 { viewModel.errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) { viewModel.errorMessage = nil }
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
    }

    // MARK: - Queue Panel

    private var queuePanel: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Queue")
                    .font(CadenceTheme.Typography.sectionHeader)
                    .foregroundStyle(CadenceTheme.Colors.secondaryLabel)
                Spacer()
                if !viewModel.captureQueue.isEmpty {
                    Text("\(viewModel.captureQueue.count)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(CadenceTheme.Colors.accent, in: Capsule())
                }
            }
            .padding(.horizontal, CadenceTheme.Spacing.md)
            .padding(.vertical, CadenceTheme.Spacing.sm)

            Divider()

            if viewModel.captureQueue.isEmpty {
                queueEmptyState
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(viewModel.captureQueue) { item in
                            CaptureQueueRow(item: item, isSelected: viewModel.selectedQueueItem?.id == item.id)
                                .onTapGesture {
                                    viewModel.selectedQueueItem = item
                                }
                                .contextMenu {
                                    Button("Process Now") {
                                        Task { await viewModel.runOCR(on: item) }
                                    }
                                    Button("Remove", role: .destructive) {
                                        viewModel.removeFromQueue(item, modelContext: modelContext, keepScreenshot: false)
                                    }
                                }

                            Divider()
                        }
                    }
                }
            }
        }
    }

    private var queueEmptyState: some View {
        VStack(spacing: CadenceTheme.Spacing.lg) {
            Image(systemName: "photo.stack")
                .font(.system(size: 36, weight: .light))
                .foregroundStyle(CadenceTheme.Colors.tertiaryLabel)
            Text("No Screenshots")
                .font(CadenceTheme.Typography.title)
            Text("Tap a button above to import screenshots.")
                .font(.caption)
                .foregroundStyle(CadenceTheme.Colors.secondaryLabel)
                .multilineTextAlignment(.center)
        }
        .padding(CadenceTheme.Spacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Toolbar

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItemGroup(placement: .primaryAction) {
            Button {
                viewModel.showPhotoPicker = true
            } label: {
                Label("From Photos", systemImage: "photo.on.rectangle")
            }
            .keyboardShortcut("i", modifiers: [.command])

            Button {
                viewModel.showFileImporter = true
            } label: {
                Label("Import File", systemImage: "folder")
            }
        }

        ToolbarItem(placement: .secondaryAction) {
            if !viewModel.captureQueue.isEmpty {
                Button("Process All") {
                    Task {
                        for item in viewModel.captureQueue where item.status == .imported {
                            await viewModel.runOCR(on: item)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Handlers

    private func handlePhotoPickerSelection(_ items: [PhotosPickerItem]) {
        guard !items.isEmpty else { return }
        Task {
            var images: [UIImage] = []
            for item in items {
                if let data = try? await item.loadTransferable(type: Data.self),
                   let image = UIImage(data: data) {
                    images.append(image)
                }
            }
            viewModel.addImages(images, sourceType: .photos, modelContext: modelContext)
            photoItems = []
            if viewModel.selectedQueueItem == nil {
                viewModel.selectedQueueItem = viewModel.captureQueue.first
            }
        }
    }

    private func handleFileImport(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            var images: [UIImage] = []
            for url in urls {
                _ = url.startAccessingSecurityScopedResource()
                defer { url.stopAccessingSecurityScopedResource() }
                if let image = UIImage(contentsOfFile: url.path) {
                    images.append(image)
                }
            }
            if !images.isEmpty {
                viewModel.addImages(images, sourceType: .file, modelContext: modelContext)
                if viewModel.selectedQueueItem == nil {
                    viewModel.selectedQueueItem = viewModel.captureQueue.first
                }
            }
        case .failure(let error):
            viewModel.errorMessage = error.localizedDescription
        }
    }
}

struct CaptureQueueRow: View {
    let item: CaptureQueueItem
    let isSelected: Bool

    var body: some View {
        HStack(spacing: CadenceTheme.Spacing.sm) {
            Image(uiImage: item.image)
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: 52, height: 52)
                .clipShape(RoundedRectangle(cornerRadius: CadenceTheme.Radius.sm))

            VStack(alignment: .leading, spacing: 4) {
                Text(item.capture.originalFileName.isEmpty ? "Screenshot" : item.capture.originalFileName)
                    .font(CadenceTheme.Typography.label)
                    .lineLimit(1)

                statusLabel
            }

            Spacer()
        }
        .padding(.horizontal, CadenceTheme.Spacing.md)
        .padding(.vertical, CadenceTheme.Spacing.sm)
        .background(isSelected ? CadenceTheme.Colors.accent.opacity(0.1) : Color.clear)
    }

    private var statusLabel: some View {
        Group {
            switch item.status {
            case .imported:
                Text("Ready to process")
                    .font(.caption)
                    .foregroundStyle(CadenceTheme.Colors.secondaryLabel)
            case .processing:
                HStack(spacing: 4) {
                    ProgressView().scaleEffect(0.7)
                    Text("Processing…")
                        .font(.caption)
                        .foregroundStyle(CadenceTheme.Colors.secondaryLabel)
                }
            case .processed:
                Label("Text extracted", systemImage: "checkmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(.green)
            case .failed:
                Label("Failed", systemImage: "xmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
    }
}
