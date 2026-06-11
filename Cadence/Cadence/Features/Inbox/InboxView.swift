import SwiftUI
import SwiftData

struct InboxView: View {
    @Query(filter: #Predicate<WorkItem> { $0.statusRaw == "inbox" },
           sort: \WorkItem.createdAt, order: .reverse)
    private var items: [WorkItem]

    @Environment(\.modelContext) private var modelContext
    @State private var selectedItem: WorkItem?
    @State private var showingAddItem = false
    @State private var searchText = ""

    var filteredItems: [WorkItem] {
        guard !searchText.isEmpty else { return items }
        return items.filter { $0.title.localizedCaseInsensitiveContains(searchText) }
    }

    var body: some View {
        NavigationSplitView {
            Group {
                if items.isEmpty {
                    EmptyStateView(
                        systemImage: "tray",
                        title: "Inbox is clear",
                        message: "Import screenshots or add items manually to begin processing your work.",
                        actionTitle: "Add Item"
                    ) {
                        showingAddItem = true
                    }
                } else {
                    inboxList
                }
            }
            .navigationTitle("Inbox")
            .searchable(text: $searchText, prompt: "Search inbox")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showingAddItem = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .keyboardShortcut("n", modifiers: .command)
                }
            }
        } detail: {
            if let item = selectedItem {
                WorkItemDetailView(item: item)
            } else {
                EmptyStateView(
                    systemImage: "tray.and.arrow.down",
                    title: "Select an Item",
                    message: "Choose an item from the inbox to review and process it."
                )
            }
        }
        .sheet(isPresented: $showingAddItem) {
            CreateItemSheet(classificationResult: ClassificationResult(title: ""))
        }
    }

    private var inboxList: some View {
        List(filteredItems, selection: $selectedItem) { item in
            WorkItemCard(item: item)
                .tag(item)
                .listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                .swipeActions(edge: .leading) {
                    Button {
                        item.status = .done
                        item.completedAt = .now
                    } label: {
                        Label("Done", systemImage: "checkmark")
                    }
                    .tint(.green)
                }
                .swipeActions(edge: .trailing) {
                    Button(role: .destructive) {
                        item.status = .archived
                    } label: {
                        Label("Archive", systemImage: "archivebox")
                    }
                    Button {
                        item.status = .deferred
                    } label: {
                        Label("Defer", systemImage: "clock")
                    }
                    .tint(.orange)
                }
                .contextMenu {
                    inboxContextMenu(for: item)
                }
        }
        .listStyle(.plain)
    }

    @ViewBuilder
    private func inboxContextMenu(for item: WorkItem) -> some View {
        Button {
            item.status = .done
            item.completedAt = .now
        } label: {
            Label("Mark Done", systemImage: "checkmark.circle")
        }

        Button {
            item.status = .waitingFor
        } label: {
            Label("Mark Waiting For", systemImage: "clock.arrow.circlepath")
        }

        Button {
            item.status = .deferred
        } label: {
            Label("Defer", systemImage: "clock")
        }

        Divider()

        Button {
            item.status = .archived
        } label: {
            Label("Archive", systemImage: "archivebox")
        }

        Button(role: .destructive) {
            modelContext.delete(item)
        } label: {
            Label("Delete", systemImage: "trash")
        }
    }
}
