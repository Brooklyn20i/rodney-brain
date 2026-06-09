import Foundation

enum DateParser {
    static func parseDueDate(from text: String) -> Date? {
        let lower = text.lowercased()
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: .now)

        if lower.contains("today") {
            return today
        }
        if lower.contains("tomorrow") {
            return calendar.date(byAdding: .day, value: 1, to: today)
        }
        if lower.contains("next week") {
            return calendar.date(byAdding: .weekOfYear, value: 1, to: today)
        }
        if lower.contains("end of week") || lower.contains("by friday") ||
           lower.contains("this friday") {
            return nextWeekday(.friday, from: today, calendar: calendar)
        }
        if lower.contains("by monday") || lower.contains("this monday") {
            return nextWeekday(.monday, from: today, calendar: calendar)
        }
        if lower.contains("by wednesday") || lower.contains("this wednesday") {
            return nextWeekday(.wednesday, from: today, calendar: calendar)
        }
        if lower.contains("end of month") {
            var components = calendar.dateComponents([.year, .month], from: today)
            components.month = (components.month ?? 1) + 1
            components.day = 1
            guard let firstOfNext = calendar.date(from: components) else { return nil }
            return calendar.date(byAdding: .day, value: -1, to: firstOfNext)
        }

        // Try to parse explicit date patterns like "15 June" or "June 15"
        if let parsed = parseExplicitDate(from: lower, relativeTo: today, calendar: calendar) {
            return parsed
        }

        return nil
    }

    private static func nextWeekday(_ weekday: Weekday, from today: Date, calendar: Calendar) -> Date? {
        var components = DateComponents()
        components.weekday = weekday.calendarWeekday
        return calendar.nextDate(after: today, matching: components, matchingPolicy: .nextTime)
    }

    private static func parseExplicitDate(from text: String, relativeTo today: Date, calendar: Calendar) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US")

        let patterns = ["d MMMM yyyy", "MMMM d yyyy", "d MMM yyyy", "MMM d yyyy",
                        "d/M/yyyy", "M/d/yyyy", "dd/MM/yyyy", "MM/dd/yyyy"]

        let currentYear = calendar.component(.year, from: today)

        for pattern in patterns {
            formatter.dateFormat = pattern
            if let date = formatter.date(from: text) { return date }
        }

        // Month + day without year — assume current or next year
        let shortPatterns = ["d MMMM", "MMMM d", "d MMM", "MMM d"]
        for pattern in shortPatterns {
            formatter.dateFormat = pattern
            if let partial = formatter.date(from: text) {
                var components = calendar.dateComponents([.month, .day], from: partial)
                components.year = currentYear
                if let candidate = calendar.date(from: components), candidate >= today {
                    return candidate
                }
                components.year = currentYear + 1
                return calendar.date(from: components)
            }
        }

        return nil
    }

    enum Weekday {
        case monday, wednesday, friday

        var calendarWeekday: Int {
            switch self {
            case .monday: 2
            case .wednesday: 4
            case .friday: 6
            }
        }
    }
}
