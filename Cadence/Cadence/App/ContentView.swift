import SwiftUI

enum SidebarItem: String, CaseIterable, Identifiable {
    case capture = "Capture"
    case inbox = "Inbox"
    case today = "Today"
    case projects = "Projects"
    case people = "People"
    case decisions = "Decisions"
    case review = "Review"
    case search = "Search"
    case settings = "Settings"

    var id: String { rawValue }

    var systemImage: String {
        switch self {
        case .capture: "camera.viewfinder"
        case .inbox: "tray"
        case .today: "sun.max"
        case .projects: "folder"
        case .people: "person.2"
        case .decisions: "scale.3d"
        case .review: "checklist"
        case .search: "magnifyingglass"
        case .settings: "gear"
        }
    }
}

struct ContentView: View {
    @State private var selectedItem: SidebarItem? = .today
    @State private var columnVisibility = NavigationSplitViewVisibility.automatic

    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            List(SidebarItem.allCases, selection: $selectedItem) { item in
                Label(item.rawValue, systemImage: item.systemImage)
                    .tag(item)
            }
            .navigationTitle("Cadence")
            .listStyle(.sidebar)
        } detail: {
            detailView
        }
    }

    @ViewBuilder
    private var detailView: some View {
        switch selectedItem {
        case .capture, nil:
            CaptureView()
        case .inbox:
            InboxView()
        case .today:
            TodayView()
        case .projects:
            ProjectsView()
        case .people:
            PeopleView()
        case .decisions:
            DecisionsView()
        case .review:
            ReviewView()
        case .search:
            SearchView()
        case .settings:
            SettingsView()
        }
    }
}
