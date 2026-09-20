# Cadence iOS release checklist

## Automated locally and in PR before Apple credentials

- Native core deterministic checks pass.
- Signed clean-simulator build/install/launch evidence passes.
- Generic iOS Release archive builds with code signing disabled under Xcode 26.3 and an iOS 26 SDK.
- Archive contains bundle ID `com.cadence.app`, version 1.0, iOS 17 minimum, privacy manifest and exempt-encryption declaration.
- App Store copy and conservative privacy answers are version controlled.
- Privacy and support pages are staged, built and locally verified. Production privacy and support URLs are a post-merge gate.

## Owner/account gates

These steps must be completed inside Apple's authenticated systems. Never put passwords, 2FA codes, certificates, private keys or review-account credentials in chat or source control.

1. Accept any current Apple Developer agreements and confirm paid membership.
2. Confirm the legal seller/developer name and the Apple Developer team ID.
3. Register or confirm bundle ID `com.cadence.app`.
4. Create an Apple Distribution certificate and App Store provisioning profile.
5. Create a least-privilege App Store Connect API key able to upload builds.
6. Configure GitHub environment `app-store` with the values documented below.
7. Create the Cadence App Store Connect record and enter App Review credentials in the dedicated Sign-in information fields.
8. After merge and production deployment, verify `https://cadence-agent.com/privacy` and `https://cadence-agent.com/support` return the published policy/support content.
9. Run `Cadence native release` with `release_action=validate`; inspect the validation result.
10. Run it with `release_action=upload`; wait for TestFlight processing.
11. Install the processed TestFlight build on a physical iPhone and execute `device-qa.md`.
12. Complete age rating, availability, category, copyright, privacy answers and screenshots in App Store Connect.
13. Submit for review. Do not claim App Store availability until Apple approves and publishes the app.

## GitHub environment values

Environment: `app-store`

Secrets:
- `APPLE_TEAM_ID`
- `ASC_KEY_ID`
- `ASC_ISSUER_ID`
- `ASC_PRIVATE_KEY_BASE64`
- `APPLE_DISTRIBUTION_CERTIFICATE_BASE64`
- `APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD`
- `APPLE_PROVISIONING_PROFILE_BASE64`
- `CADENCE_SUPABASE_ANON_KEY`

Variable:
- `CADENCE_SUPABASE_URL`

The API private key, certificate and profile must be base64-encoded before being stored in GitHub. They are decoded only on the ephemeral macOS runner and removed during cleanup.
