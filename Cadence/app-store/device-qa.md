# Cadence physical iPhone and TestFlight QA

Record device model and iOS version without recording the device UDID.

## Development/device build

- Install and launch from Xcode on a trusted physical iPhone.
- Confirm the app opens to the Cadence sign-in screen without a configuration or Keychain error.
- Sign in with a dedicated normal QA user, never an administrator or service-role credential.
- Confirm the expected workspace and executive-brief sections load.
- Background and reopen the app; confirm the Keychain-backed session restores.
- Enable Airplane Mode, refresh, and confirm a recoverable network error without session destruction.
- Restore networking and confirm Retry recovers.
- Complete one disposable QA work item and verify it disappears only after server acknowledgement.
- Sign out and confirm reopening returns to sign-in.
- Verify Dynamic Type, VoiceOver labels, portrait safe areas and keyboard dismissal.

## TestFlight build

Repeat every item above using the processed TestFlight build. Also confirm:

- The installed version/build matches App Store Connect.
- No development-only data or placeholder Supabase configuration is present.
- TestFlight crash feedback shows no launch crash.
- The disposable QA item is soft-deleted and absent from active work after the test.

Physical-device and TestFlight QA are separate evidence gates. Simulator evidence does not satisfy them.
