import Foundation

final class MockClassifier: WorkItemClassifier {
    func classify(text: String) async -> ClassificationResult {
        ClassificationResult(
            title: text.isEmpty ? "New Task" : String(text.prefix(60)),
            type: .task,
            priority: .medium,
            confidence: 1.0,
            rationale: "Mock classification for preview"
        )
    }

    func classifyMultiple(text: String) async -> [ClassificationResult] {
        [await classify(text: text)]
    }
}
