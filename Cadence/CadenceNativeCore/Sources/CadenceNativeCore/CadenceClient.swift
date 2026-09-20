import Foundation

public enum CadenceClientError: Swift.Error, Equatable, Sendable {
    case invalidResponse
    case requestFailed(statusCode: Int, message: String)
    case decodingFailed
    case writeNotAcknowledged
    case workspaceUnavailable
    case sessionExpired

    public var invalidatesStoredSession: Bool {
        self == .sessionExpired
    }
}

public struct CadenceSessionResult<Value: Sendable>: Sendable {
    public let value: Value
    public let session: CadenceSession

    public init(value: Value, session: CadenceSession) {
        self.value = value
        self.session = session
    }
}

public struct CadenceClient: Sendable {
    private let configuration: CadenceConfiguration
    private let transport: any HTTPTransport
    private let decoder: JSONDecoder

    public init(
        configuration: CadenceConfiguration,
        transport: any HTTPTransport = URLSessionTransport()
    ) {
        self.configuration = configuration
        self.transport = transport
        self.decoder = JSONDecoder()
    }

    public func signIn(email: String, password: String) async throws -> CadenceSession {
        let endpoint = configuration.supabaseURL
            .appending(path: "auth/v1/token")
            .appending(queryItems: [URLQueryItem(name: "grant_type", value: "password")])
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue(configuration.anonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "email": email,
            "password": password,
        ])

        let result = try await transport.send(request)
        guard (200..<300).contains(result.statusCode) else {
            throw CadenceClientError.requestFailed(
                statusCode: result.statusCode,
                message: Self.errorMessage(from: result.data)
            )
        }

        guard let authResponse = try? decoder.decode(SupabaseAuthResponse.self, from: result.data) else {
            throw CadenceClientError.decodingFailed
        }
        return authResponse.session
    }

    public func refreshSession(refreshToken: String) async throws -> CadenceSession {
        let endpoint = configuration.supabaseURL
            .appending(path: "auth/v1/token")
            .appending(queryItems: [URLQueryItem(name: "grant_type", value: "refresh_token")])
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue(configuration.anonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "refresh_token": refreshToken,
        ])

        let result = try await transport.send(request)
        if result.statusCode == 400 || result.statusCode == 401 {
            throw CadenceClientError.sessionExpired
        }
        guard (200..<300).contains(result.statusCode) else {
            throw CadenceClientError.requestFailed(
                statusCode: result.statusCode,
                message: Self.errorMessage(from: result.data)
            )
        }
        guard let authResponse = try? decoder.decode(SupabaseAuthResponse.self, from: result.data) else {
            throw CadenceClientError.decodingFailed
        }
        return authResponse.session
    }

    public func signOut(session: CadenceSession) async throws {
        let endpoint = configuration.supabaseURL.appending(path: "auth/v1/logout")
        var request = authorizedRequest(url: endpoint, session: session)
        request.httpMethod = "POST"

        let result = try await transport.send(request)
        guard (200..<300).contains(result.statusCode) else {
            throw CadenceClientError.requestFailed(
                statusCode: result.statusCode,
                message: Self.errorMessage(from: result.data)
            )
        }
    }

    public func withRefreshedSession<Value: Sendable>(
        session: CadenceSession,
        persistRefreshedSession: @Sendable (CadenceSession) async throws -> Void,
        operation: @Sendable (CadenceSession) async throws -> Value
    ) async throws -> CadenceSessionResult<Value> {
        do {
            return CadenceSessionResult(
                value: try await operation(session),
                session: session
            )
        } catch {
            guard case CadenceClientError.requestFailed(statusCode: 401, message: _) = error else {
                throw error
            }

            let refreshed: CadenceSession
            do {
                refreshed = try await refreshSession(refreshToken: session.refreshToken)
            } catch {
                if case CadenceClientError.requestFailed(let statusCode, _) = error,
                   statusCode == 400 || statusCode == 401 {
                    throw CadenceClientError.sessionExpired
                }
                throw error
            }
            try await persistRefreshedSession(refreshed)
            let value: Value
            do {
                value = try await operation(refreshed)
            } catch CadenceClientError.requestFailed(statusCode: 401, message: _) {
                throw CadenceClientError.sessionExpired
            }
            return CadenceSessionResult(
                value: value,
                session: refreshed
            )
        }
    }

    public func fetchPrimaryWorkspace(session: CadenceSession) async throws -> CadenceWorkspaceMembership {
        let memberships: [CadenceWorkspaceMembership] = try await get(
            path: "rest/v1/workspace_members",
            queryItems: [
                URLQueryItem(name: "select", value: "workspace_id,role,workspaces(id,name)"),
                URLQueryItem(name: "user_id", value: "eq.\(session.user.id.uuidString.lowercased())"),
                URLQueryItem(name: "order", value: "joined_at.asc"),
                URLQueryItem(name: "limit", value: "1"),
            ],
            session: session
        )
        guard let membership = memberships.first else {
            throw CadenceClientError.workspaceUnavailable
        }
        return membership
    }

    public func fetchExecutiveBrief(
        workspaceID: UUID,
        session: CadenceSession,
        now: Date = .now,
        calendar: Calendar = .current
    ) async throws -> ExecutiveBrief {
        let workItems: [CadenceWorkItem] = try await get(
            path: "rest/v1/work_items",
            queryItems: [
                URLQueryItem(
                    name: "select",
                    value: "id,owner_id,workspace_id,title,type,priority,due_date,notes,done,inboxed,source,completed_at,created_at,updated_at,deleted_at"
                ),
                URLQueryItem(name: "deleted_at", value: "is.null"),
                URLQueryItem(name: "done", value: "eq.false"),
                URLQueryItem(name: "workspace_id", value: "eq.\(workspaceID.uuidString.lowercased())"),
                URLQueryItem(name: "order", value: "due_date.asc.nullslast"),
            ],
            session: session
        )
        let decisions: [CadenceDecision] = try await get(
            path: "rest/v1/decisions",
            queryItems: [
                URLQueryItem(
                    name: "select",
                    value: "id,owner_id,workspace_id,title,status,due_date,context,outcome,created_at,updated_at,deleted_at"
                ),
                URLQueryItem(name: "deleted_at", value: "is.null"),
                URLQueryItem(name: "status", value: "eq.pending"),
                URLQueryItem(name: "workspace_id", value: "eq.\(workspaceID.uuidString.lowercased())"),
                URLQueryItem(name: "order", value: "due_date.asc.nullslast"),
            ],
            session: session
        )

        return ExecutiveBrief(
            workItems: workItems,
            pendingDecisions: decisions,
            now: now,
            calendar: calendar
        )
    }

    public func completeWorkItem(
        id: UUID,
        workspaceID: UUID,
        session: CadenceSession,
        completedAt: Date = .now
    ) async throws -> CadenceWorkItem {
        let endpoint = configuration.supabaseURL
            .appending(path: "rest/v1/work_items")
            .appending(queryItems: [
                URLQueryItem(name: "id", value: "eq.\(id.uuidString.lowercased())"),
                URLQueryItem(name: "workspace_id", value: "eq.\(workspaceID.uuidString.lowercased())"),
            ])
        var request = authorizedRequest(url: endpoint, session: session)
        request.httpMethod = "PATCH"
        request.setValue("public", forHTTPHeaderField: "Content-Profile")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("return=representation", forHTTPHeaderField: "Prefer")

        let timestamp = ISO8601DateFormatter().string(from: completedAt)
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "done": true,
            "inboxed": false,
            "completed_at": timestamp,
            "updated_at": timestamp,
        ])

        let result = try await transport.send(request)
        guard (200..<300).contains(result.statusCode) else {
            throw CadenceClientError.requestFailed(
                statusCode: result.statusCode,
                message: Self.errorMessage(from: result.data)
            )
        }
        guard let rows = try? decoder.decode([CadenceWorkItem].self, from: result.data) else {
            throw CadenceClientError.decodingFailed
        }
        guard
            rows.count == 1,
            let completed = rows.first,
            completed.id == id,
            completed.workspaceID == workspaceID,
            completed.done,
            !completed.inboxed,
            completed.deletedAt == nil,
            let acknowledgedTimestamp = completed.completedAt,
            Self.representsSameInstant(acknowledgedTimestamp, as: timestamp)
        else {
            throw CadenceClientError.writeNotAcknowledged
        }
        return completed
    }

    private static func representsSameInstant(_ lhs: String, as rhs: String) -> Bool {
        guard let leftDate = iso8601Date(from: lhs), let rightDate = iso8601Date(from: rhs) else {
            return false
        }
        return leftDate == rightDate
    }

    private static func iso8601Date(from value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        if let date = formatter.date(from: value) {
            return date
        }
        formatter.formatOptions.insert(.withFractionalSeconds)
        return formatter.date(from: value)
    }

    private func get<Response: Decodable>(
        path: String,
        queryItems: [URLQueryItem],
        session: CadenceSession
    ) async throws -> Response {
        let endpoint = configuration.supabaseURL
            .appending(path: path)
            .appending(queryItems: queryItems)
        var request = authorizedRequest(url: endpoint, session: session)
        request.httpMethod = "GET"

        let result = try await transport.send(request)
        guard (200..<300).contains(result.statusCode) else {
            throw CadenceClientError.requestFailed(
                statusCode: result.statusCode,
                message: Self.errorMessage(from: result.data)
            )
        }
        guard let response = try? decoder.decode(Response.self, from: result.data) else {
            throw CadenceClientError.decodingFailed
        }
        return response
    }

    private func authorizedRequest(url: URL, session: CadenceSession) -> URLRequest {
        var request = URLRequest(url: url)
        request.setValue(configuration.anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("public", forHTTPHeaderField: "Accept-Profile")
        return request
    }

    private static func errorMessage(from data: Data) -> String {
        guard
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let message = object["msg"] as? String ?? object["message"] as? String
        else {
            return "Request failed"
        }
        return message
    }
}
