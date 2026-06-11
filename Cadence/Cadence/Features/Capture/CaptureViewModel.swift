import SwiftUI
import SwiftData
import PhotosUI
import Observation

@Observable
@MainActor
final class CaptureViewModel {
    var captureQueue: [CaptureQueueItem] = []
    var selectedQueueItem: CaptureQueueItem?
    var isImporting = false
    var showPhotoPicker = false
    var showFileImporter = false
    var errorMessage: String?

    private let ocrService: any OCRService
    private let classifier: any WorkItemClassifier

    init(
        ocrService: any OCRService = VisionOCRService(),
        classifier: any WorkItemClassifier = LocalHeuristicClassifier()
    ) {
        self.ocrService = ocrService
        self.classifier = classifier
    }

    func addImages(_ images: [UIImage], sourceType: CaptureSourceType, modelContext: ModelContext) {
        for image in images {
            let capture = ScreenshotCapture(originalFileName: "capture_\(Date.now.timeIntervalSince1970)", sourceType: sourceType)
            modelContext.insert(capture)

            let item = CaptureQueueItem(image: image, capture: capture)
            captureQueue.append(item)
        }
    }

    func runOCR(on item: CaptureQueueItem) async {
        guard let index = captureQueue.firstIndex(where: { $0.id == item.id }) else { return }

        captureQueue[index].status = .processing
        captureQueue[index].capture.processingStatus = .processing

        do {
            let result = await Task.detached(priority: .userInitiated) { [ocrService] in
                try await ocrService.recognizeText(in: item.image)
            }.value

            captureQueue[index].ocrResult = result
            captureQueue[index].editableText = result.fullText
            captureQueue[index].status = .processed
            captureQueue[index].capture.processingStatus = .processed
            captureQueue[index].capture.ocrText = result.fullText

        } catch let error as OCRError {
            captureQueue[index].status = .failed
            captureQueue[index].capture.processingStatus = .failed
            captureQueue[index].capture.errorMessage = error.errorDescription
            errorMessage = error.errorDescription

        } catch {
            captureQueue[index].status = .failed
            captureQueue[index].capture.processingStatus = .failed
            let msg = "OCR failed: \(error.localizedDescription)"
            captureQueue[index].capture.errorMessage = msg
            errorMessage = msg
        }
    }

    func classifyText(_ text: String) async -> ClassificationResult {
        await classifier.classify(text: text)
    }

    func classifyMultiple(_ text: String) async -> [ClassificationResult] {
        await classifier.classifyMultiple(text: text)
    }

    func removeFromQueue(_ item: CaptureQueueItem, modelContext: ModelContext, keepScreenshot: Bool) {
        if !keepScreenshot {
            modelContext.delete(item.capture)
        }
        captureQueue.removeAll { $0.id == item.id }
        if selectedQueueItem?.id == item.id {
            selectedQueueItem = captureQueue.first
        }
    }

    func saveImage(_ image: UIImage, for capture: ScreenshotCapture) {
        guard let data = image.jpegData(compressionQuality: 0.8) else { return }
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let fileName = "\(capture.id.uuidString).jpg"
        let url = dir.appendingPathComponent(fileName)
        try? data.write(to: url, options: .atomic)
        capture.localImagePath = fileName

        if let thumb = image.preparingThumbnail(of: CGSize(width: 200, height: 200)),
           let thumbData = thumb.jpegData(compressionQuality: 0.7) {
            capture.thumbnailData = thumbData
        }
    }
}

@Observable
final class CaptureQueueItem: Identifiable {
    let id = UUID()
    let image: UIImage
    let capture: ScreenshotCapture
    var ocrResult: OCRResult?
    var editableText: String = ""
    var status: CaptureProcessingStatus = .imported
    var classificationResult: ClassificationResult?

    init(image: UIImage, capture: ScreenshotCapture) {
        self.image = image
        self.capture = capture
    }
}
