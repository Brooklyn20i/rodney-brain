import Vision
import UIKit

final class VisionOCRService: OCRService {
    func recognizeText(in image: UIImage) async throws -> OCRResult {
        guard let cgImage = image.cgImage else {
            throw OCRError.invalidImage
        }

        return try await withCheckedThrowingContinuation { continuation in
            let request = VNRecognizeTextRequest { request, error in
                if let error {
                    continuation.resume(throwing: OCRError.processingFailed(error.localizedDescription))
                    return
                }

                guard let observations = request.results as? [VNRecognizedTextObservation],
                      !observations.isEmpty else {
                    continuation.resume(throwing: OCRError.noResults)
                    return
                }

                var blocks: [OCRTextBlockResult] = []
                for (index, observation) in observations.enumerated() {
                    guard let candidate = observation.topCandidates(1).first else { continue }
                    let box = observation.boundingBox
                    blocks.append(OCRTextBlockResult(
                        text: candidate.string,
                        confidence: Double(candidate.confidence),
                        boundingBoxMinX: box.minX,
                        boundingBoxMinY: box.minY,
                        boundingBoxWidth: box.width,
                        boundingBoxHeight: box.height,
                        orderIndex: index
                    ))
                }

                let fullText = blocks.map(\.text).joined(separator: "\n")
                let avgConfidence = blocks.isEmpty ? 0.0 :
                    blocks.map(\.confidence).reduce(0, +) / Double(blocks.count)

                continuation.resume(returning: OCRResult(
                    fullText: fullText,
                    textBlocks: blocks,
                    overallConfidence: avgConfidence
                ))
            }

            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            request.recognitionLanguages = ["en-US"]

            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
            do {
                try handler.perform([request])
            } catch {
                continuation.resume(throwing: OCRError.processingFailed(error.localizedDescription))
            }
        }
    }
}
