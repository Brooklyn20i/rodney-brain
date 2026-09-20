import Foundation
import CadenceNativeCore

private enum CheckFailure: Error, CustomStringConvertible {
    case failed(String)

    var description: String {
        switch self {
        case .failed(let message): message
        }
    }
}

private func expect(_ condition: @autoclosure () -> Bool, _ message: String) throws {
    guard condition() else { throw CheckFailure.failed(message) }
}

private func expectThrows<Expected: Error & Equatable>(
    _ expected: Expected,
    _ body: () throws -> Void,
    _ message: String
) throws {
    do {
        try body()
        throw CheckFailure.failed("\(message): expected an error")
    } catch let error as Expected {
        try expect(error == expected, "\(message): got \(error)")
    }
}

private func runConfigurationChecks() throws {
    let secureURL = URL(string: "https://example.supabase.co")!
    let configuration = try CadenceConfiguration(
        supabaseURL: secureURL,
        anonKey: "public-anon-key"
    )
    try expect(configuration.supabaseURL == secureURL, "configuration keeps endpoint")
    try expect(configuration.anonKey == "public-anon-key", "configuration keeps public key")

    let insecureURL = URL(string: "http://example.supabase.co")!
    try expectThrows(CadenceConfiguration.Error.insecureURL, {
        _ = try CadenceConfiguration(supabaseURL: insecureURL, anonKey: "public-anon-key")
    }, "configuration rejects insecure endpoints")

    try expectThrows(CadenceConfiguration.Error.missingAnonKey, {
        _ = try CadenceConfiguration(supabaseURL: secureURL, anonKey: "   ")
    }, "configuration rejects empty public keys")
}

private actor RequestRecorder {
    private(set) var request: URLRequest?

    func record(_ request: URLRequest) {
        self.request = request
    }
}

private struct StubTransport: HTTPTransport {
    let recorder: RequestRecorder
    let result: HTTPResult

    func send(_ request: URLRequest) async throws -> HTTPResult {
        await recorder.record(request)
        return result
    }
}

private func runAuthenticationChecks() async throws {
    let configuration = try CadenceConfiguration(
        supabaseURL: URL(string: "https://example.supabase.co")!,
        anonKey: "public-anon-key"
    )
    let response = """
    {
      "access_token": "user-access-token",
      "refresh_token": "user-refresh-token",
      "expires_in": 3600,
      "expires_at": 1790000000,
      "token_type": "bearer",
      "user": {
        "id": "11111111-1111-1111-1111-111111111111",
        "email": "rodney@example.com"
      }
    }
    """
    let recorder = RequestRecorder()
    let client = CadenceClient(
        configuration: configuration,
        transport: StubTransport(
            recorder: recorder,
            result: HTTPResult(statusCode: 200, data: Data(response.utf8))
        )
    )

    let session = try await client.signIn(
        email: "rodney@example.com",
        password: "correct horse battery staple"
    )

    try expect(session.accessToken == "user-access-token", "sign in decodes access token")
    try expect(session.refreshToken == "user-refresh-token", "sign in decodes refresh token")
    try expect(session.expiresAt == 1_790_000_000, "sign in decodes absolute expiry")
    try expect(session.user.email == "rodney@example.com", "sign in decodes the user")

    let request = try await recorder.request.unwrap("sign in request was recorded")
    try expect(request.httpMethod == "POST", "sign in uses POST")
    try expect(
        request.url?.absoluteString == "https://example.supabase.co/auth/v1/token?grant_type=password",
        "sign in targets the Supabase password grant"
    )
    try expect(request.value(forHTTPHeaderField: "apikey") == "public-anon-key", "sign in carries public API key")
    let body = try request.httpBody.unwrap("sign in carries a JSON body")
    let json = try JSONSerialization.jsonObject(with: body) as? [String: String]
    try expect(json?["email"] == "rodney@example.com", "sign in sends email in JSON")
    try expect(json?["password"] == "correct horse battery staple", "sign in sends password in JSON")
    try expect(request.url?.absoluteString.contains("correct horse") == false, "password never appears in URL")

    let refreshRecorder = RequestRecorder()
    let refreshClient = CadenceClient(
        configuration: configuration,
        transport: StubTransport(
            recorder: refreshRecorder,
            result: HTTPResult(statusCode: 200, data: Data(response.utf8))
        )
    )
    _ = try await refreshClient.refreshSession(refreshToken: "user-refresh-token")
    let refreshRequest = try await refreshRecorder.request.unwrap("refresh request was recorded")
    try expect(
        refreshRequest.url?.absoluteString == "https://example.supabase.co/auth/v1/token?grant_type=refresh_token",
        "refresh targets the Supabase refresh grant"
    )
    let refreshBody = try refreshRequest.httpBody.unwrap("refresh carries a JSON body")
    let refreshJSON = try JSONSerialization.jsonObject(with: refreshBody) as? [String: String]
    try expect(refreshJSON?["refresh_token"] == "user-refresh-token", "refresh sends the refresh token in JSON")
    try expect(refreshRequest.url?.absoluteString.contains("user-refresh-token") == false, "refresh token never appears in URL")

    let signOutRecorder = RequestRecorder()
    let signOutClient = CadenceClient(
        configuration: configuration,
        transport: StubTransport(
            recorder: signOutRecorder,
            result: HTTPResult(statusCode: 204, data: Data())
        )
    )
    try await signOutClient.signOut(session: session)
    let signOutRequest = try await signOutRecorder.request.unwrap("sign-out request was recorded")
    try expect(signOutRequest.httpMethod == "POST", "sign out uses POST")
    try expect(signOutRequest.url?.absoluteString == "https://example.supabase.co/auth/v1/logout", "sign out targets Supabase logout")
    try expect(signOutRequest.value(forHTTPHeaderField: "Authorization") == "Bearer user-access-token", "sign out revokes the user session")
}

private actor RoutingTransport: HTTPTransport {
    private let resultsByPath: [String: HTTPResult]
    private(set) var requests: [URLRequest] = []

    init(resultsByPath: [String: HTTPResult]) {
        self.resultsByPath = resultsByPath
    }

    func send(_ request: URLRequest) async throws -> HTTPResult {
        requests.append(request)
        guard let path = request.url?.path, let result = resultsByPath[path] else {
            return HTTPResult(statusCode: 404, data: Data("{\"message\":\"Missing stub\"}".utf8))
        }
        return result
    }
}

private func runWorkspaceChecks() async throws {
    let workspaceResponse = """
    [
      {
        "workspace_id":"30000000-0000-0000-0000-000000000001",
        "role":"admin",
        "workspaces":{
          "id":"30000000-0000-0000-0000-000000000001",
          "name":"Rodney's Cadence"
        }
      }
    ]
    """
    let recorder = RequestRecorder()
    let client = CadenceClient(
        configuration: try CadenceConfiguration(
            supabaseURL: URL(string: "https://example.supabase.co")!,
            anonKey: "public-anon-key"
        ),
        transport: StubTransport(
            recorder: recorder,
            result: HTTPResult(statusCode: 200, data: Data(workspaceResponse.utf8))
        )
    )
    let session = CadenceSession(
        accessToken: "user-access-token",
        refreshToken: "user-refresh-token",
        expiresIn: 3600,
        tokenType: "bearer",
        user: CadenceUser(
            id: UUID(uuidString: "11111111-1111-1111-1111-111111111111")!,
            email: "rodney@example.com"
        )
    )

    let membership = try await client.fetchPrimaryWorkspace(session: session)
    try expect(membership.workspace.name == "Rodney's Cadence", "workspace resolution decodes the live workspace")
    try expect(membership.role == "admin", "workspace resolution keeps the user's role")

    let request = try await recorder.request.unwrap("workspace request was recorded")
    try expect(request.url?.path == "/rest/v1/workspace_members", "workspace resolution reads memberships")
    let query = URLComponents(url: try request.url.unwrap("workspace request has URL"), resolvingAgainstBaseURL: false)?.queryItems
    try expect(
        query?.contains(URLQueryItem(name: "user_id", value: "eq.\(session.user.id.uuidString.lowercased())")) == true,
        "workspace resolution targets the authenticated user"
    )
    try expect(query?.contains(URLQueryItem(name: "limit", value: "1")) == true, "workspace resolution chooses one active workspace")
}

private actor AttemptCounter {
    private(set) var count = 0

    func record() {
        count += 1
    }
}

private actor SessionRecorder {
    private(set) var sessions: [CadenceSession] = []

    func record(_ session: CadenceSession) {
        sessions.append(session)
    }
}

private func runRuntimeRefreshChecks() async throws {
    let refreshedResponse = """
    {
      "access_token": "fresh-access-token",
      "refresh_token": "fresh-refresh-token",
      "expires_in": 3600,
      "expires_at": 1790003600,
      "token_type": "bearer",
      "user": {
        "id": "11111111-1111-1111-1111-111111111111",
        "email": "rodney@example.com"
      }
    }
    """
    let recorder = RequestRecorder()
    let client = CadenceClient(
        configuration: try CadenceConfiguration(
            supabaseURL: URL(string: "https://example.supabase.co")!,
            anonKey: "public-anon-key"
        ),
        transport: StubTransport(
            recorder: recorder,
            result: HTTPResult(statusCode: 200, data: Data(refreshedResponse.utf8))
        )
    )
    let staleSession = CadenceSession(
        accessToken: "stale-access-token",
        refreshToken: "stale-refresh-token",
        expiresIn: 3600,
        tokenType: "bearer",
        user: CadenceUser(
            id: UUID(uuidString: "11111111-1111-1111-1111-111111111111")!,
            email: "rodney@example.com"
        )
    )
    let attempts = AttemptCounter()

    let successfulRefreshPersistence = SessionRecorder()
    let result = try await client.withRefreshedSession(
        session: staleSession,
        persistRefreshedSession: { refreshedSession in
            await successfulRefreshPersistence.record(refreshedSession)
        }
    ) { currentSession in
        await attempts.record()
        if currentSession.accessToken == "stale-access-token" {
            throw CadenceClientError.requestFailed(statusCode: 401, message: "JWT expired")
        }
        return currentSession.accessToken
    }

    try expect(result.value == "fresh-access-token", "runtime 401 retries with the refreshed access token")
    try expect(result.session.refreshToken == "fresh-refresh-token", "runtime refresh returns the rotated refresh token")
    let successfullyPersistedSessions = await successfulRefreshPersistence.sessions
    try expect(
        successfullyPersistedSessions.map(\.refreshToken) == ["fresh-refresh-token"],
        "runtime refresh persists the rotated session before retry"
    )
    let attemptCount = await attempts.count
    try expect(attemptCount == 2, "runtime 401 retries exactly once")
    let refreshRequest = try await recorder.request.unwrap("runtime refresh request was recorded")
    try expect(
        refreshRequest.url?.absoluteString == "https://example.supabase.co/auth/v1/token?grant_type=refresh_token",
        "runtime 401 uses the refresh-token grant"
    )

    let persistedSessions = SessionRecorder()
    let transientRetryAttempts = AttemptCounter()
    do {
        let _: CadenceSessionResult<String> = try await client.withRefreshedSession(
            session: staleSession,
            persistRefreshedSession: { refreshedSession in
                await persistedSessions.record(refreshedSession)
            }
        ) { currentSession in
            await transientRetryAttempts.record()
            if currentSession.accessToken == "stale-access-token" {
                throw CadenceClientError.requestFailed(statusCode: 401, message: "JWT expired")
            }
            throw CadenceClientError.requestFailed(statusCode: 503, message: "Temporarily unavailable")
        }
        throw CheckFailure.failed("a transient retry failure is returned after refresh")
    } catch CadenceClientError.requestFailed(let statusCode, _) {
        try expect(statusCode == 503, "the retry's transient failure is preserved")
    }
    let sessionsPersistedBeforeFailure = await persistedSessions.sessions
    try expect(
        sessionsPersistedBeforeFailure.map(\.refreshToken) == ["fresh-refresh-token"],
        "rotated tokens are persisted before a retried operation can fail"
    )
    let transientAttemptCount = await transientRetryAttempts.count
    try expect(transientAttemptCount == 2, "a transient retry failure still performs exactly one retry")

    let rejectedAfterRefreshAttempts = AttemptCounter()
    do {
        _ = try await client.withRefreshedSession(
            session: staleSession,
            persistRefreshedSession: { _ in }
        ) { _ in
            await rejectedAfterRefreshAttempts.record()
            throw CadenceClientError.requestFailed(statusCode: 401, message: "JWT still rejected")
        }
        throw CheckFailure.failed("a second 401 after refresh terminates the session")
    } catch CadenceClientError.sessionExpired {
        let rejectedAttemptCount = await rejectedAfterRefreshAttempts.count
        try expect(rejectedAttemptCount == 2, "a repeatedly rejected session is attempted exactly twice")
    }

    let expiredClient = CadenceClient(
        configuration: try CadenceConfiguration(
            supabaseURL: URL(string: "https://example.supabase.co")!,
            anonKey: "public-anon-key"
        ),
        transport: StubTransport(
            recorder: RequestRecorder(),
            result: HTTPResult(statusCode: 400, data: Data("{\"message\":\"Invalid Refresh Token\"}".utf8))
        )
    )
    do {
        _ = try await expiredClient.refreshSession(refreshToken: staleSession.refreshToken)
        throw CheckFailure.failed("an invalid proactive refresh terminates the session")
    } catch CadenceClientError.sessionExpired {
        // Expected: startup refresh rejection also requires a fresh sign-in.
    }
    do {
        _ = try await expiredClient.withRefreshedSession(
            session: staleSession,
            persistRefreshedSession: { _ in }
        ) { _ in
            throw CadenceClientError.requestFailed(statusCode: 401, message: "JWT expired")
        }
        throw CheckFailure.failed("an invalid refresh token terminates the session")
    } catch CadenceClientError.sessionExpired {
        // Expected: a permanently invalid refresh token requires a fresh sign-in.
    }

    try expect(
        CadenceClientError.sessionExpired.invalidatesStoredSession,
        "definitive session expiry invalidates the stored session"
    )
    try expect(
        !CadenceClientError.requestFailed(statusCode: 503, message: "Unavailable").invalidatesStoredSession,
        "transient request failures preserve the stored session for retry"
    )
}

private func runExecutiveBriefChecks() async throws {
    let workItems = """
    [
      {
        "id":"20000000-0000-0000-0000-000000000001",
        "owner_id":"11111111-1111-1111-1111-111111111111",
        "workspace_id":"30000000-0000-0000-0000-000000000001",
        "title":"Resolve overdue commitment",
        "type":"task",
        "priority":"high",
        "due_date":"2026-09-19",
        "notes":"",
        "done":false,
        "inboxed":false,
        "source":"you",
        "completed_at":null,
        "created_at":"2026-09-18T08:00:00Z",
        "updated_at":"2026-09-18T08:00:00Z",
        "deleted_at":null
      },
      {
        "id":"20000000-0000-0000-0000-000000000002",
        "owner_id":"11111111-1111-1111-1111-111111111111",
        "workspace_id":"30000000-0000-0000-0000-000000000001",
        "title":"Approve today",
        "type":"decision",
        "priority":"medium",
        "due_date":"2026-09-20",
        "notes":"",
        "done":false,
        "inboxed":false,
        "source":"you",
        "completed_at":null,
        "created_at":"2026-09-18T08:00:00Z",
        "updated_at":"2026-09-18T08:00:00Z",
        "deleted_at":null
      },
      {
        "id":"20000000-0000-0000-0000-000000000003",
        "owner_id":"11111111-1111-1111-1111-111111111111",
        "workspace_id":"30000000-0000-0000-0000-000000000001",
        "title":"Waiting for supplier",
        "type":"waitingFor",
        "priority":"low",
        "due_date":null,
        "notes":"",
        "done":false,
        "inboxed":false,
        "source":"you",
        "completed_at":null,
        "created_at":"2026-09-18T08:00:00Z",
        "updated_at":"2026-09-18T08:00:00Z",
        "deleted_at":null
      },
      {
        "id":"20000000-0000-0000-0000-000000000004",
        "owner_id":"11111111-1111-1111-1111-111111111111",
        "workspace_id":"30000000-0000-0000-0000-000000000001",
        "title":"Delegated to Kobe",
        "type":"task",
        "priority":"high",
        "due_date":"2026-09-19",
        "notes":"",
        "done":false,
        "inboxed":false,
        "source":"for:kobe",
        "completed_at":null,
        "created_at":"2026-09-18T08:00:00Z",
        "updated_at":"2026-09-18T08:00:00Z",
        "deleted_at":null
      },
      {
        "id":"20000000-0000-0000-0000-000000000005",
        "owner_id":"11111111-1111-1111-1111-111111111111",
        "workspace_id":"30000000-0000-0000-0000-000000000001",
        "title":"Untriaged capture",
        "type":"waitingFor",
        "priority":"medium",
        "due_date":"2026-09-20",
        "notes":"",
        "done":false,
        "inboxed":true,
        "source":"you",
        "completed_at":null,
        "created_at":"2026-09-18T08:00:00Z",
        "updated_at":"2026-09-18T08:00:00Z",
        "deleted_at":null
      },
      {
        "id":"20000000-0000-0000-0000-000000000006",
        "owner_id":"11111111-1111-1111-1111-111111111111",
        "workspace_id":"30000000-0000-0000-0000-000000000001",
        "title":"Agent-created user work",
        "type":"task",
        "priority":"medium",
        "due_date":"2026-09-20",
        "notes":"",
        "done":false,
        "inboxed":false,
        "source":"agent:kobe",
        "completed_at":null,
        "created_at":"2026-09-18T08:00:00Z",
        "updated_at":"2026-09-18T08:00:00Z",
        "deleted_at":null
      }
    ]
    """
    let decisions = """
    [
      {
        "id":"40000000-0000-0000-0000-000000000001",
        "owner_id":"11111111-1111-1111-1111-111111111111",
        "workspace_id":"30000000-0000-0000-0000-000000000001",
        "title":"Choose launch path",
        "status":"pending",
        "due_date":"2026-09-20",
        "context":"Two viable paths",
        "outcome":"",
        "created_at":"2026-09-18T08:00:00Z",
        "updated_at":"2026-09-18T08:00:00Z",
        "deleted_at":null
      }
    ]
    """
    let transport = RoutingTransport(resultsByPath: [
        "/rest/v1/work_items": HTTPResult(statusCode: 200, data: Data(workItems.utf8)),
        "/rest/v1/decisions": HTTPResult(statusCode: 200, data: Data(decisions.utf8)),
    ])
    let client = CadenceClient(
        configuration: try CadenceConfiguration(
            supabaseURL: URL(string: "https://example.supabase.co")!,
            anonKey: "public-anon-key"
        ),
        transport: transport
    )
    let session = CadenceSession(
        accessToken: "user-access-token",
        refreshToken: "user-refresh-token",
        expiresIn: 3600,
        tokenType: "bearer",
        user: CadenceUser(
            id: UUID(uuidString: "11111111-1111-1111-1111-111111111111")!,
            email: "rodney@example.com"
        )
    )
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    let now = calendar.date(from: DateComponents(year: 2026, month: 9, day: 20, hour: 12))!
    let workspaceID = UUID(uuidString: "30000000-0000-0000-0000-000000000001")!

    let brief = try await client.fetchExecutiveBrief(
        workspaceID: workspaceID,
        session: session,
        now: now,
        calendar: calendar
    )

    try expect(brief.overdue.map(\.title) == ["Resolve overdue commitment"], "brief excludes delegated for:* work from overdue")
    try expect(
        brief.dueToday.map(\.title) == ["Approve today", "Agent-created user work"],
        "brief excludes inbox captures while retaining filed agent-created user work"
    )
    try expect(brief.waitingOn.map(\.title) == ["Waiting for supplier"], "brief excludes inbox captures from waiting-on")
    try expect(brief.pendingDecisions.map(\.title) == ["Choose launch path"], "brief includes pending decisions")

    let acknowledged = brief.removingWorkItem(
        id: UUID(uuidString: "20000000-0000-0000-0000-000000000001")!
    )
    try expect(acknowledged.overdue.isEmpty, "acknowledged completion is removed before a follow-up refresh")
    try expect(acknowledged.dueToday.count == 2, "completion removal preserves unrelated user and agent-created work")

    let requests = await transport.requests
    try expect(requests.count == 2, "brief performs the two required reads")
    for request in requests {
        try expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer user-access-token", "brief uses user-scoped auth")
        try expect(request.value(forHTTPHeaderField: "apikey") == "public-anon-key", "brief carries public API key")
        try expect(request.value(forHTTPHeaderField: "Accept-Profile") == "public", "brief reads the public schema")
        let query = URLComponents(url: try request.url.unwrap("brief request has URL"), resolvingAgainstBaseURL: false)?.queryItems
        try expect(
            query?.contains(URLQueryItem(name: "workspace_id", value: "eq.\(workspaceID.uuidString.lowercased())")) == true,
            "brief explicitly scopes every read to the active workspace"
        )
    }
}

private func runCompletionChecks() async throws {
    let completedItem = """
    [
      {
        "id":"20000000-0000-0000-0000-000000000001",
        "owner_id":"11111111-1111-1111-1111-111111111111",
        "workspace_id":"30000000-0000-0000-0000-000000000001",
        "title":"Resolve overdue commitment",
        "type":"task",
        "priority":"high",
        "due_date":"2026-09-19",
        "notes":"",
        "done":true,
        "inboxed":false,
        "source":"you",
        "completed_at":"2026-09-20T12:00:00Z",
        "created_at":"2026-09-18T08:00:00Z",
        "updated_at":"2026-09-20T12:00:00Z",
        "deleted_at":null
      }
    ]
    """
    let recorder = RequestRecorder()
    let client = CadenceClient(
        configuration: try CadenceConfiguration(
            supabaseURL: URL(string: "https://example.supabase.co")!,
            anonKey: "public-anon-key"
        ),
        transport: StubTransport(
            recorder: recorder,
            result: HTTPResult(statusCode: 200, data: Data(completedItem.utf8))
        )
    )
    let session = CadenceSession(
        accessToken: "user-access-token",
        refreshToken: "user-refresh-token",
        expiresIn: 3600,
        tokenType: "bearer",
        user: CadenceUser(
            id: UUID(uuidString: "11111111-1111-1111-1111-111111111111")!,
            email: "rodney@example.com"
        )
    )
    let itemID = UUID(uuidString: "20000000-0000-0000-0000-000000000001")!
    let workspaceID = UUID(uuidString: "30000000-0000-0000-0000-000000000001")!
    let completedAt = ISO8601DateFormatter().date(from: "2026-09-20T12:00:00Z")!

    let item = try await client.completeWorkItem(
        id: itemID,
        workspaceID: workspaceID,
        session: session,
        completedAt: completedAt
    )

    try expect(item.done, "completion returns only a server-acknowledged completed row")
    let request = try await recorder.request.unwrap("completion request was recorded")
    try expect(request.httpMethod == "PATCH", "completion uses PATCH")
    try expect(request.value(forHTTPHeaderField: "Prefer") == "return=representation", "completion requires a returned row")
    try expect(request.value(forHTTPHeaderField: "Content-Profile") == "public", "completion writes to the public schema")
    let query = URLComponents(url: try request.url.unwrap("completion has URL"), resolvingAgainstBaseURL: false)?.queryItems
    try expect(query?.contains(URLQueryItem(name: "id", value: "eq.\(itemID.uuidString.lowercased())")) == true, "completion targets exactly one item")
    try expect(
        query?.contains(URLQueryItem(name: "workspace_id", value: "eq.\(workspaceID.uuidString.lowercased())")) == true,
        "completion is scoped to the active workspace"
    )

    let body = try request.httpBody.unwrap("completion sends a JSON body")
    let json = try JSONSerialization.jsonObject(with: body) as? [String: Any]
    try expect(json?["done"] as? Bool == true, "completion body marks the item done")
    try expect(json?["inboxed"] as? Bool == false, "completion removes the item from the inbox")

    let unacknowledged = completedItem.replacingOccurrences(of: "\"done\":true", with: "\"done\":false")
    let failedClient = CadenceClient(
        configuration: try CadenceConfiguration(
            supabaseURL: URL(string: "https://example.supabase.co")!,
            anonKey: "public-anon-key"
        ),
        transport: StubTransport(
            recorder: RequestRecorder(),
            result: HTTPResult(statusCode: 200, data: Data(unacknowledged.utf8))
        )
    )
    do {
        _ = try await failedClient.completeWorkItem(
            id: itemID,
            workspaceID: workspaceID,
            session: session,
            completedAt: completedAt
        )
        throw CheckFailure.failed("completion rejects an unacknowledged write")
    } catch CadenceClientError.writeNotAcknowledged {
        // Expected: a 2xx response is insufficient unless the returned row is complete.
    }

    let stillInboxed = completedItem.replacingOccurrences(of: "\"inboxed\":false", with: "\"inboxed\":true")
    let inboxFailureClient = CadenceClient(
        configuration: try CadenceConfiguration(
            supabaseURL: URL(string: "https://example.supabase.co")!,
            anonKey: "public-anon-key"
        ),
        transport: StubTransport(
            recorder: RequestRecorder(),
            result: HTTPResult(statusCode: 200, data: Data(stillInboxed.utf8))
        )
    )
    do {
        _ = try await inboxFailureClient.completeWorkItem(
            id: itemID,
            workspaceID: workspaceID,
            session: session,
            completedAt: completedAt
        )
        throw CheckFailure.failed("completion rejects a row that remains inboxed")
    } catch CadenceClientError.writeNotAcknowledged {
        // Expected: the server must acknowledge the entire completion contract.
    }

    func expectRejectedAcknowledgement(_ response: String, _ message: String) async throws {
        let rejectionClient = CadenceClient(
            configuration: try CadenceConfiguration(
                supabaseURL: URL(string: "https://example.supabase.co")!,
                anonKey: "public-anon-key"
            ),
            transport: StubTransport(
                recorder: RequestRecorder(),
                result: HTTPResult(statusCode: 200, data: Data(response.utf8))
            )
        )
        do {
            _ = try await rejectionClient.completeWorkItem(
                id: itemID,
                workspaceID: workspaceID,
                session: session,
                completedAt: completedAt
            )
            throw CheckFailure.failed(message)
        } catch CadenceClientError.writeNotAcknowledged {
            // Expected: malformed, ambiguous, mismatched, or deleted rows are not acknowledgement.
        }
    }

    try await expectRejectedAcknowledgement("[]", "completion rejects an empty returned row set")
    let duplicatedRows = completedItem
        .replacingOccurrences(of: "[\n", with: "[\n", options: [], range: completedItem.startIndex..<completedItem.index(after: completedItem.startIndex))
        .replacingOccurrences(of: "\n]", with: ",\n\(completedItem.dropFirst(2).dropLast(2))\n]")
    try await expectRejectedAcknowledgement(duplicatedRows, "completion rejects multiple returned rows")
    try await expectRejectedAcknowledgement(
        completedItem.replacingOccurrences(
            of: "20000000-0000-0000-0000-000000000001",
            with: "20000000-0000-0000-0000-000000000099"
        ),
        "completion rejects a mismatched item id"
    )
    try await expectRejectedAcknowledgement(
        completedItem.replacingOccurrences(
            of: "30000000-0000-0000-0000-000000000001",
            with: "30000000-0000-0000-0000-000000000099"
        ),
        "completion rejects a mismatched workspace id"
    )
    try await expectRejectedAcknowledgement(
        completedItem.replacingOccurrences(
            of: "\"completed_at\":\"2026-09-20T12:00:00Z\"",
            with: "\"completed_at\":null"
        ),
        "completion rejects a missing completion timestamp"
    )
    try await expectRejectedAcknowledgement(
        completedItem.replacingOccurrences(
            of: "\"completed_at\":\"2026-09-20T12:00:00Z\"",
            with: "\"completed_at\":\"2026-09-20T12:01:00Z\""
        ),
        "completion rejects a mismatched completion timestamp"
    )
    try await expectRejectedAcknowledgement(
        completedItem.replacingOccurrences(
            of: "\"deleted_at\":null",
            with: "\"deleted_at\":\"2026-09-20T12:00:01Z\""
        ),
        "completion rejects a deleted returned row"
    )
}

private extension Optional {
    func unwrap(_ message: String) throws -> Wrapped {
        guard let value = self else { throw CheckFailure.failed(message) }
        return value
    }
}

do {
    try runConfigurationChecks()
    try await runAuthenticationChecks()
    try await runWorkspaceChecks()
    try await runRuntimeRefreshChecks()
    try await runExecutiveBriefChecks()
    try await runCompletionChecks()
    print("PASS CadenceNativeCoreChecks")
} catch {
    fputs("FAIL CadenceNativeCoreChecks: \(error)\n", stderr)
    exit(1)
}
