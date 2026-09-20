import Foundation

public struct CadenceUser: Codable, Equatable, Sendable {
    public let id: UUID
    public let email: String

    public init(id: UUID, email: String) {
        self.id = id
        self.email = email
    }
}

public struct CadenceSession: Codable, Equatable, Sendable {
    public let accessToken: String
    public let refreshToken: String
    public let expiresIn: TimeInterval
    public let expiresAt: TimeInterval?
    public let tokenType: String
    public let user: CadenceUser

    public init(
        accessToken: String,
        refreshToken: String,
        expiresIn: TimeInterval,
        expiresAt: TimeInterval? = nil,
        tokenType: String,
        user: CadenceUser
    ) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.expiresIn = expiresIn
        self.expiresAt = expiresAt
        self.tokenType = tokenType
        self.user = user
    }
}

struct SupabaseAuthResponse: Decodable {
    let accessToken: String
    let refreshToken: String
    let expiresIn: TimeInterval
    let expiresAt: TimeInterval?
    let tokenType: String
    let user: CadenceUser

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresIn = "expires_in"
        case expiresAt = "expires_at"
        case tokenType = "token_type"
        case user
    }

    var session: CadenceSession {
        CadenceSession(
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresIn: expiresIn,
            expiresAt: expiresAt,
            tokenType: tokenType,
            user: user
        )
    }
}
