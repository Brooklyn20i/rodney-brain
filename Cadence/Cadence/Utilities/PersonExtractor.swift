import Foundation

enum PersonExtractor {
    private static let patterns: [(NSRegularExpression, Int)] = {
        let raw: [(String, Int)] = [
            (#"(?:from|with|ask|tell|speak to|talk to|contact|cc|cc'd|emailed)\s+([A-Z][a-z]+(?: [A-Z][a-z]+)?)"#, 1),
            (#"(?:@)([A-Z][a-z]+(?: [A-Z][a-z]+)?)"#, 1),
        ]
        return raw.compactMap { (pattern, group) in
            guard let regex = try? NSRegularExpression(pattern: pattern, options: []) else { return nil }
            return (regex, group)
        }
    }()

    static func extractName(from text: String) -> String? {
        let nsText = text as NSString
        let range = NSRange(location: 0, length: nsText.length)

        for (regex, groupIndex) in patterns {
            if let match = regex.firstMatch(in: text, options: [], range: range) {
                let nameRange = match.range(at: groupIndex)
                if nameRange.location != NSNotFound {
                    return nsText.substring(with: nameRange)
                }
            }
        }
        return nil
    }

    static func extractAllNames(from text: String) -> [String] {
        let nsText = text as NSString
        let range = NSRange(location: 0, length: nsText.length)
        var names: [String] = []

        for (regex, groupIndex) in patterns {
            let matches = regex.matches(in: text, options: [], range: range)
            for match in matches {
                let nameRange = match.range(at: groupIndex)
                if nameRange.location != NSNotFound {
                    let name = nsText.substring(with: nameRange)
                    if !names.contains(name) { names.append(name) }
                }
            }
        }
        return names
    }
}
