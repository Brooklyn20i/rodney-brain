import Foundation

/// Placeholder for a future on-device or cloud AI classifier.
/// This class must NEVER make network calls in the MVP.
/// When a local model becomes available (Core ML, on-device LLM),
/// implement recognizeText(in:) here without changing callers.
final class FutureAIClassifier: WorkItemClassifier {
    func classify(text: String) async -> ClassificationResult {
        // Intentionally falls back to heuristic until an on-device model is integrated.
        await LocalHeuristicClassifier().classify(text: text)
    }

    func classifyMultiple(text: String) async -> [ClassificationResult] {
        await LocalHeuristicClassifier().classifyMultiple(text: text)
    }
}
