import Foundation
import Observation

@Observable
@MainActor
final class NativeAppModel {
    enum Phase: Equatable {
        case starting
        case signedOut
        case ready
        case restorationError(String)
        case configurationError(String)
    }

    private(set) var phase: Phase = .starting
    private(set) var brief: ExecutiveBrief?
    private(set) var isSigningIn = false
    private(set) var isRefreshing = false
    private(set) var completingItemIDs: Set<UUID> = []
    var errorMessage: String?

    @ObservationIgnored private var client: CadenceClient?
    @ObservationIgnored private let vault: any SessionVault
    @ObservationIgnored private var session: CadenceSession?
    @ObservationIgnored private var workspaceID: UUID?
    @ObservationIgnored private var hasStarted = false

    init(bundle: Bundle = .main, vault: any SessionVault = KeychainSessionVault()) {
        self.vault = vault
        do {
            self.client = CadenceClient(configuration: try Self.configuration(from: bundle))
        } catch {
            self.phase = .configurationError(
                "Cadence is not configured for this build. Add the Supabase URL and public anon key to Config/Secrets.xcconfig."
            )
        }
    }

    func start() async {
        guard !hasStarted else { return }
        hasStarted = true
        guard let client else { return }

        do {
            guard var restored = try vault.load() else {
                phase = .signedOut
                return
            }
            if restored.expiresAt.map({ $0 <= Date.now.timeIntervalSince1970 + 60 }) ?? true {
                restored = try await client.refreshSession(refreshToken: restored.refreshToken)
            }
            try adopt(restored)
            let workspaceResult = try await client.withRefreshedSession(
                session: restored,
                persistRefreshedSession: { refreshedSession in
                    try await self.adopt(refreshedSession)
                }
            ) { currentSession in
                try await client.fetchPrimaryWorkspace(session: currentSession)
            }
            try adopt(workspaceResult.session)
            workspaceID = workspaceResult.value.workspaceID
            phase = .ready
            await refreshBrief()
        } catch let error as CadenceClientError where error.invalidatesStoredSession {
            clearLocalSession()
            errorMessage = "Your session expired. Sign in again."
        } catch {
            phase = .restorationError("Cadence could not reconnect. Your saved session has been kept.")
        }
    }

    func retryStart() async {
        hasStarted = false
        phase = .starting
        errorMessage = nil
        await start()
    }

    func signIn(email: String, password: String) async {
        guard let client else { return }
        guard !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !password.isEmpty else {
            errorMessage = "Enter your email and password."
            return
        }

        isSigningIn = true
        errorMessage = nil
        defer { isSigningIn = false }

        do {
            let newSession = try await client.signIn(
                email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                password: password
            )
            try adopt(newSession)
            let workspaceResult = try await client.withRefreshedSession(
                session: newSession,
                persistRefreshedSession: { refreshedSession in
                    try await self.adopt(refreshedSession)
                }
            ) { currentSession in
                try await client.fetchPrimaryWorkspace(session: currentSession)
            }
            try adopt(workspaceResult.session)
            workspaceID = workspaceResult.value.workspaceID
            phase = .ready
            await refreshBrief()
        } catch CadenceClientError.sessionExpired {
            clearLocalSession()
            errorMessage = "Your session expired. Sign in again."
        } catch {
            if session == nil {
                errorMessage = "Sign-in failed. Check your details and try again."
            } else {
                phase = .restorationError("You are signed in, but Cadence could not load your workspace. Your session has been kept.")
            }
        }
    }

    func refreshBrief() async {
        guard let client, let session, let workspaceID, !isRefreshing else { return }
        isRefreshing = true
        errorMessage = nil
        defer { isRefreshing = false }

        do {
            let result = try await client.withRefreshedSession(
                session: session,
                persistRefreshedSession: { refreshedSession in
                    try await self.adopt(refreshedSession)
                }
            ) { currentSession in
                try await client.fetchExecutiveBrief(workspaceID: workspaceID, session: currentSession)
            }
            try adopt(result.session)
            brief = result.value
        } catch CadenceClientError.sessionExpired {
            clearLocalSession()
            errorMessage = "Your session expired. Sign in again."
        } catch {
            errorMessage = "Cadence could not refresh. Your existing view has been kept."
        }
    }

    func complete(_ item: CadenceWorkItem) async {
        guard let client, let session, let workspaceID, !completingItemIDs.contains(item.id) else { return }
        completingItemIDs.insert(item.id)
        errorMessage = nil
        defer { completingItemIDs.remove(item.id) }

        do {
            let result = try await client.withRefreshedSession(
                session: session,
                persistRefreshedSession: { refreshedSession in
                    try await self.adopt(refreshedSession)
                }
            ) { currentSession in
                try await client.completeWorkItem(
                    id: item.id,
                    workspaceID: workspaceID,
                    session: currentSession
                )
            }
            try adopt(result.session)
            brief = brief?.removingWorkItem(id: result.value.id)
            await refreshBrief()
        } catch CadenceClientError.sessionExpired {
            clearLocalSession()
            errorMessage = "Your session expired. Sign in again."
        } catch {
            errorMessage = "Cadence did not confirm completion. The item remains open."
        }
    }

    func signOut() async {
        if let client, let session {
            try? await client.signOut(session: session)
        }
        clearLocalSession()
    }

    private func clearLocalSession() {
        try? vault.clear()
        session = nil
        workspaceID = nil
        brief = nil
        errorMessage = nil
        phase = .signedOut
    }

    private func adopt(_ newSession: CadenceSession) throws {
        if session != newSession {
            try vault.save(newSession)
            session = newSession
        }
    }

    private static func configuration(from bundle: Bundle) throws -> CadenceConfiguration {
        guard
            let rawURL = bundle.object(forInfoDictionaryKey: "CADENCE_SUPABASE_URL") as? String,
            !rawURL.contains("$("),
            let url = URL(string: rawURL),
            let anonKey = bundle.object(forInfoDictionaryKey: "CADENCE_SUPABASE_ANON_KEY") as? String,
            !anonKey.contains("$(")
        else {
            throw ConfigurationError.missing
        }
        return try CadenceConfiguration(supabaseURL: url, anonKey: anonKey)
    }

    private enum ConfigurationError: Error {
        case missing
    }
}
