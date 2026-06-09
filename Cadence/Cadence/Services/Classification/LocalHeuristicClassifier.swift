import Foundation

final class LocalHeuristicClassifier: WorkItemClassifier {

    func classify(text: String) async -> ClassificationResult {
        let lower = text.lowercased()

        let type = detectType(lower)
        let priority = detectPriority(lower)
        let dueDate = DateParser.parseDueDate(from: lower)
        let personName = PersonExtractor.extractName(from: text)
        let title = generateTitle(from: text, type: type)
        let (confidence, rationale) = computeConfidence(lower, type: type)

        return ClassificationResult(
            title: title,
            type: type,
            priority: priority,
            dueDate: dueDate,
            suggestedPersonName: personName,
            suggestedNextAction: suggestNextAction(for: type, title: title),
            confidence: confidence,
            rationale: rationale
        )
    }

    func classifyMultiple(text: String) async -> [ClassificationResult] {
        let lines = text.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        guard lines.count > 1 else {
            return [await classify(text: text)]
        }

        var results: [ClassificationResult] = []
        for line in lines {
            let result = await classify(text: line)
            results.append(result)
        }
        return results
    }

    // MARK: - Private

    private func detectType(_ lower: String) -> WorkItemType {
        if lower.contains("follow up") || lower.contains("follow-up") ||
           lower.contains("chase") || lower.contains("check with") ||
           lower.contains("speak to") || lower.contains("reach out") {
            return .followUp
        }
        if lower.contains("waiting for") || lower.contains("pending") ||
           lower.contains("awaiting") || lower.contains("blocked on") {
            return .waitingFor
        }
        if lower.contains("decide") || lower.contains("decision") ||
           lower.contains("approve") || lower.contains("sign off") ||
           lower.contains("sign-off") || lower.contains("authorise") ||
           lower.contains("authorize") {
            return .decision
        }
        if lower.contains("risk") || lower.contains("concern") ||
           lower.contains("issue") || lower.contains("blocker") {
            return .risk
        }
        if lower.contains("idea") || lower.contains("consider") ||
           lower.contains("explore") || lower.contains("what if") {
            return .idea
        }
        if lower.contains("remind") || lower.contains("don't forget") ||
           lower.contains("remember to") {
            return .reminder
        }
        if lower.contains("action:") || lower.contains("to do:") ||
           lower.contains("ai:") || lower.contains("action item") {
            return .meetingAction
        }
        if lower.contains("note:") || lower.contains("noted:") ||
           lower.contains("fyi") || lower.contains("background") {
            return .projectNote
        }
        return .task
    }

    private func detectPriority(_ lower: String) -> WorkItemPriority {
        if lower.contains("urgent") || lower.contains("critical") ||
           lower.contains("asap") || lower.contains("immediately") ||
           lower.contains("high priority") || lower.contains("p1") {
            return .high
        }
        if lower.contains("important") || lower.contains("priority") ||
           lower.contains("medium") || lower.contains("p2") {
            return .medium
        }
        if lower.contains("low priority") || lower.contains("nice to have") ||
           lower.contains("eventually") || lower.contains("p3") {
            return .low
        }
        return .none
    }

    private func generateTitle(from text: String, type: WorkItemType) -> String {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let firstLine = trimmed.components(separatedBy: .newlines).first ?? trimmed
        let capped = firstLine.count > 80 ? String(firstLine.prefix(77)) + "..." : firstLine
        return capped.isEmpty ? "New \(type.displayName)" : capped
    }

    private func suggestNextAction(for type: WorkItemType, title: String) -> String {
        switch type {
        case .followUp: return "Send follow-up message"
        case .waitingFor: return "Check status"
        case .decision: return "Review options and decide"
        case .risk: return "Assess impact and mitigation"
        case .meetingAction: return "Complete and confirm"
        default: return ""
        }
    }

    private func computeConfidence(_ lower: String, type: WorkItemType) -> (Double, String) {
        if type == .task {
            return (0.6, "Defaulted to task — no strong type signal found. Please confirm.")
        }

        let signals: [String: String] = [
            "follow up": "follow-up keyword",
            "waiting for": "waiting-for keyword",
            "decide": "decision keyword",
            "approve": "approval keyword",
            "risk": "risk keyword",
        ]

        for (keyword, reason) in signals where lower.contains(keyword) {
            return (0.88, "Classified as \(type.displayName) based on '\(reason)'")
        }

        return (0.75, "Classified as \(type.displayName)")
    }
}
