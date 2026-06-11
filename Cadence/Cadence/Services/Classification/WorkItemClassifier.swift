import Foundation

protocol WorkItemClassifier: Sendable {
    func classify(text: String) async -> ClassificationResult
    func classifyMultiple(text: String) async -> [ClassificationResult]
}
