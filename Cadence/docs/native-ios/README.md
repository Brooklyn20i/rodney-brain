# Cadence Native iPhone

This is the native SwiftUI client for Cadence. Supabase remains the server-authoritative source of truth shared with the web app and agents.

## Current vertical slice

- iPhone and iPad target.
- Native Supabase email/password authentication.
- User session persisted in the iOS Keychain.
- Active workspace resolved from `workspace_members`; every brief read and completion write is explicitly workspace-scoped as well as RLS-protected.
- Expired runtime sessions refresh once and retry once; rotated tokens are persisted back to Keychain.
- Native executive brief for pending decisions, overdue work, due-today work and waiting-on commitments.
- Server-acknowledged work-item completion. The UI does not mark an item complete unless Supabase returns the exact completed row.
- Pull-to-refresh, explicit loading/error/empty states and sign-out.

## Configure a local build

1. Copy `Config/Secrets.xcconfig.example` to `Config/Secrets.xcconfig`.
2. Add the public Supabase URL and public anon/publishable key used by the web client.
3. Never add a service-role key, agent password, MCP token or other privileged credential.
4. `Secrets.xcconfig` is ignored by Git.

## Run the core verification

```bash
cd CadenceNativeCore
swift run CadenceNativeCoreChecks
```

The checks exercise configuration validation, password and refresh-token request construction, workspace resolution/scoping, runtime 401 recovery, live-schema decoding, executive-brief classification, user-scoped headers, and fail-closed completion acknowledgement. The Command Line Tools installation does not include either `Testing` or `XCTest`, so this package uses a deterministic executable check target until full Xcode is installed.

## Build the iPhone target

Full Xcode is required:

```bash
xcodebuild \
  -project Cadence.xcodeproj \
  -scheme Cadence \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  build
```

Keep Xcode's local simulator signing enabled. Cadence reads the Keychain during startup, and an unsigned simulator build does not receive the simulated entitlements required by Security.framework.

The same command runs in `.github/workflows/cadence-native.yml` on native-code pull requests.

## Release gates

A TestFlight build requires:

- full Xcode and an installed iOS simulator;
- an Apple Developer team selected for `com.cadence.app`;
- release Supabase public-client configuration;
- an archive signed with the approved team;
- simulator/device QA of sign-in, refresh, brief rendering, completion acknowledgement and sign-out;
- App Store Connect privacy declarations and release approval.

No TestFlight upload or App Store submission should occur without Rodney's explicit approval.
