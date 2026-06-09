import SwiftUI
import SwiftData

@main
struct CadenceApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(for: [
            WorkItem.self,
            Project.self,
            Person.self,
            Decision.self,
            ScreenshotCapture.self,
            OCRTextBlock.self,
            ReviewSession.self,
            UserSettings.self,
        ])
    }
}
