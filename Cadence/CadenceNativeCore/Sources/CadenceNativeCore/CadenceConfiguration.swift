import Foundation

/// Public configuration required by a user-scoped Cadence client.
///
/// The Supabase anon key is designed to be embedded in public clients. It never
/// grants access by itself: every data request must also carry a user's access
/// token and is constrained by Row Level Security.
public struct CadenceConfiguration: Equatable, Sendable {
    public enum Error: Swift.Error, Equatable {
        case insecureURL
        case missingAnonKey
    }

    public let supabaseURL: URL
    public let anonKey: String

    public init(supabaseURL: URL, anonKey: String) throws {
        guard supabaseURL.scheme?.lowercased() == "https" else {
            throw Error.insecureURL
        }

        let trimmedKey = anonKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedKey.isEmpty else {
            throw Error.missingAnonKey
        }

        self.supabaseURL = supabaseURL
        self.anonKey = trimmedKey
    }
}
