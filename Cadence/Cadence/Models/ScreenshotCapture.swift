import SwiftData
import Foundation

enum CaptureSourceType: String, Codable, Sendable {
    case photos, file, share, paste, camera, unknown

    var displayName: String {
        switch self {
        case .photos: "Photos Library"
        case .file: "File Import"
        case .share: "Share Sheet"
        case .paste: "Pasted"
        case .camera: "Camera"
        case .unknown: "Unknown"
        }
    }
}

enum CaptureProcessingStatus: String, Codable, Sendable {
    case imported, processing, processed, failed

    var displayName: String { rawValue.capitalized }
}

@Model
final class ScreenshotCapture {
    var id: UUID
    var localImagePath: String?
    var thumbnailData: Data?
    var originalFileName: String
    var sourceTypeRaw: String
    var processingStatusRaw: String
    var ocrText: String?
    var errorMessage: String?
    var createdAt: Date
    var processedAt: Date?

    @Relationship(deleteRule: .cascade) var textBlocks: [OCRTextBlock]
    @Relationship(deleteRule: .nullify) var workItems: [WorkItem]

    var sourceType: CaptureSourceType {
        get { CaptureSourceType(rawValue: sourceTypeRaw) ?? .unknown }
        set { sourceTypeRaw = newValue.rawValue }
    }

    var processingStatus: CaptureProcessingStatus {
        get { CaptureProcessingStatus(rawValue: processingStatusRaw) ?? .imported }
        set { processingStatusRaw = newValue.rawValue }
    }

    var hasOCRText: Bool { !(ocrText?.isEmpty ?? true) }

    init(
        originalFileName: String = "",
        sourceType: CaptureSourceType = .unknown
    ) {
        self.id = UUID()
        self.originalFileName = originalFileName
        self.sourceTypeRaw = sourceType.rawValue
        self.processingStatusRaw = CaptureProcessingStatus.imported.rawValue
        self.textBlocks = []
        self.workItems = []
        self.createdAt = .now
    }
}
