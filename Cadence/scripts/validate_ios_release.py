#!/usr/bin/env python3
"""Validate Cadence iOS release assets without Apple credentials."""
from __future__ import annotations

import json
import plistlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "Cadence"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def read(path: Path) -> str:
    require(path.is_file(), f"Missing required release file: {path.relative_to(ROOT)}")
    return path.read_text(encoding="utf-8")


workflow = read(ROOT / ".github/workflows/cadence-native-release.yml")
for marker in (
    "generic/platform=iOS",
    "CODE_SIGNING_ALLOWED=NO",
    "workflow_dispatch:",
    "APPLE_TEAM_ID",
    "ASC_KEY_ID",
    "ASC_ISSUER_ID",
    "APPLE_DISTRIBUTION_CERTIFICATE_BASE64",
    "APPLE_PROVISIONING_PROFILE_BASE64",
    "xcrun altool --validate-app",
    "xcrun altool --upload-app",
):
    require(marker in workflow, f"Release workflow is missing: {marker}")
require(
    "/Applications/Xcode_26.3.app/Contents/Developer" in workflow,
    "Release workflow must use the current App Store submission toolchain (Xcode 26.3).",
)
require("Xcode_16.4" not in workflow, "Release workflow must not use an App Store-ineligible Xcode version.")
require("pull_request_target" not in workflow, "Release workflow must not expose secrets to pull_request_target.")
require(
    "github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'" in workflow,
    "Signed release job must run only by manual dispatch from main.",
)
require(" -A " not in workflow, "Certificate import must not grant every process private-key access.")
require(
    'rm -f "$HOME/Library/MobileDevice/Provisioning Profiles/"*.mobileprovision' not in workflow,
    "Cleanup must remove only the profile installed by this workflow.",
)
require(
    'profile_path=%s' in workflow,
    "Signing setup must persist the exact installed provisioning-profile path for cleanup.",
)

info_path = IOS / "Cadence/Resources/Info.plist"
with info_path.open("rb") as handle:
    info = plistlib.load(handle)
require(info.get("ITSAppUsesNonExemptEncryption") is False, "Info.plist must declare standard/exempt encryption only.")

privacy_path = IOS / "Cadence/Resources/PrivacyInfo.xcprivacy"
with privacy_path.open("rb") as handle:
    privacy = plistlib.load(handle)
require(privacy.get("NSPrivacyTracking") is False, "Privacy manifest must disable tracking.")
require(privacy.get("NSPrivacyTrackingDomains") == [], "Privacy manifest must not declare tracking domains.")
collected = {item.get("NSPrivacyCollectedDataType") for item in privacy.get("NSPrivacyCollectedDataTypes", [])}
for data_type in (
    "NSPrivacyCollectedDataTypeEmailAddress",
    "NSPrivacyCollectedDataTypeUserID",
    "NSPrivacyCollectedDataTypeOtherUserContent",
):
    require(data_type in collected, f"Privacy manifest is missing {data_type}.")

project = read(IOS / "Cadence.xcodeproj/project.pbxproj")
require("PrivacyInfo.xcprivacy in Resources" in project, "PrivacyInfo.xcprivacy must be in the app resources phase.")
require("PRODUCT_BUNDLE_IDENTIFIER = com.cadence.app;" in project, "Expected production bundle identifier is missing.")

metadata = IOS / "app-store/metadata/en-US"
limits = {
    "name.txt": 30,
    "subtitle.txt": 30,
    "promotional_text.txt": 170,
    "keywords.txt": 100,
}
for filename, maximum in limits.items():
    value = read(metadata / filename).strip()
    require(value, f"{filename} must not be empty.")
    require(len(value) <= maximum, f"{filename} exceeds {maximum} characters ({len(value)}).")
for filename in ("description.txt", "privacy_url.txt", "support_url.txt", "marketing_url.txt", "review_notes.txt"):
    require(bool(read(metadata / filename).strip()), f"{filename} must not be empty.")

privacy_answers = read(IOS / "app-store/app-privacy.json")
answers = json.loads(privacy_answers)
require(answers.get("tracking") is False, "App Store privacy answers must declare no tracking.")
require(answers.get("data_linked_to_user") is True, "Collected account/workspace data is linked to the user.")
require(answers.get("data_used_for_tracking") is False, "Collected data must not be used for tracking.")

checklist = read(IOS / "app-store/release-checklist.md")
require(
    "Production privacy and support URLs are a post-merge gate" in checklist,
    "Release checklist must not claim staged privacy/support pages are already deployed.",
)

print("Cadence iOS release assets passed")
