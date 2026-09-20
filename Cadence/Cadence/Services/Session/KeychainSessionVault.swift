import Foundation
import Security

protocol SessionVault: Sendable {
    func load() throws -> CadenceSession?
    func save(_ session: CadenceSession) throws
    func clear() throws
}

struct KeychainSessionVault: SessionVault {
    enum VaultError: Error {
        case unexpectedStatus(OSStatus)
        case invalidData
    }

    private let service = "com.cadence.app.session"
    private let account = "supabase-user-session"

    func load() throws -> CadenceSession? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else { throw VaultError.unexpectedStatus(status) }
        guard let data = result as? Data else { throw VaultError.invalidData }
        return try JSONDecoder().decode(CadenceSession.self, from: data)
    }

    func save(_ session: CadenceSession) throws {
        let data = try JSONEncoder().encode(session)
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        ]
        let updateStatus = SecItemUpdate(baseQuery as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecSuccess { return }
        guard updateStatus == errSecItemNotFound else {
            throw VaultError.unexpectedStatus(updateStatus)
        }

        var createQuery = baseQuery
        attributes.forEach { createQuery[$0.key] = $0.value }
        let createStatus = SecItemAdd(createQuery as CFDictionary, nil)
        guard createStatus == errSecSuccess else {
            throw VaultError.unexpectedStatus(createStatus)
        }
    }

    func clear() throws {
        let status = SecItemDelete(baseQuery as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw VaultError.unexpectedStatus(status)
        }
    }

    private var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}
