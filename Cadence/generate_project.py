#!/usr/bin/env python3
"""
Generates Cadence.xcodeproj/project.pbxproj for the Cadence iPadOS app.
Run this script once from the Cadence/ directory before opening in Xcode.
"""

import hashlib
import os
import json

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def uid(seed: str) -> str:
    """Deterministic 24-char uppercase hex UUID from a seed string."""
    return hashlib.md5(seed.encode("utf-8")).hexdigest()[:24].upper()


def pbx_string(s: str) -> str:
    """Quote a string for pbxproj if it contains special characters."""
    safe = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_./")
    if all(c in safe for c in s):
        return s
    escaped = s.replace('"', '\\"')
    return f'"{escaped}"'


# ---------------------------------------------------------------------------
# File inventory
# ---------------------------------------------------------------------------

BUNDLE_ID   = "com.cadence.app"
PRODUCT     = "Cadence"
TESTS       = "CadenceTests"
DEPLOY_VER  = "17.0"
SWIFT_VER   = "5.0"
XCODE_VER   = "1500"

# (path_relative_to_Cadence_source_root, group_path)
APP_SWIFT_FILES = [
    "App/CadenceApp.swift",
    "App/ContentView.swift",
    "Models/WorkItem.swift",
    "Models/Project.swift",
    "Models/Person.swift",
    "Models/Decision.swift",
    "Models/ScreenshotCapture.swift",
    "Models/OCRTextBlock.swift",
    "Models/ReviewSession.swift",
    "Models/UserSettings.swift",
    "Services/OCR/OCRResult.swift",
    "Services/OCR/OCRService.swift",
    "Services/OCR/VisionOCRService.swift",
    "Services/OCR/MockOCRService.swift",
    "Services/Classification/ClassificationResult.swift",
    "Services/Classification/WorkItemClassifier.swift",
    "Services/Classification/LocalHeuristicClassifier.swift",
    "Services/Classification/MockClassifier.swift",
    "Services/Classification/FutureAIClassifier.swift",
    "DesignSystem/CadenceTheme.swift",
    "DesignSystem/Components/TypeBadge.swift",
    "DesignSystem/Components/EmptyStateView.swift",
    "DesignSystem/Components/WorkItemCard.swift",
    "Utilities/DateParser.swift",
    "Utilities/PersonExtractor.swift",
    "Features/Capture/CaptureViewModel.swift",
    "Features/Capture/CaptureView.swift",
    "Features/Capture/OCRReviewView.swift",
    "Features/Capture/CreateItemSheet.swift",
    "Features/Inbox/InboxView.swift",
    "Features/Inbox/WorkItemDetailView.swift",
    "Features/Today/TodayViewModel.swift",
    "Features/Today/TodayView.swift",
    "Features/Projects/ProjectsView.swift",
    "Features/Projects/ProjectDetailView.swift",
    "Features/People/PeopleView.swift",
    "Features/People/PersonDetailView.swift",
    "Features/Decisions/DecisionsView.swift",
    "Features/Decisions/DecisionDetailView.swift",
    "Features/Review/ReviewViewModel.swift",
    "Features/Review/ReviewView.swift",
    "Features/Search/SearchViewModel.swift",
    "Features/Search/SearchView.swift",
    "Features/Settings/SettingsView.swift",
]

RESOURCE_FILES = [
    "Resources/Info.plist",
    "Resources/Assets.xcassets",
]

TEST_SWIFT_FILES = [
    "OCRServiceTests.swift",
    "ClassificationTests.swift",
]

# ---------------------------------------------------------------------------
# UUID seeds (stable across runs)
# ---------------------------------------------------------------------------

PROJECT_UUID            = uid("project_root")
MAIN_GROUP              = uid("main_group")
PRODUCTS_GROUP          = uid("products_group")
CADENCE_GROUP           = uid("cadence_source_group")
TESTS_GROUP             = uid("tests_source_group")
FRAMEWORKS_GROUP        = uid("frameworks_group")

MAIN_TARGET             = uid("target_cadence")
TEST_TARGET             = uid("target_cadencetests")

MAIN_PRODUCT_REF        = uid("product_ref_cadence")
TEST_PRODUCT_REF        = uid("product_ref_cadencetests")

MAIN_SOURCES_PHASE      = uid("sources_phase_cadence")
MAIN_RESOURCES_PHASE    = uid("resources_phase_cadence")
MAIN_FRAMEWORKS_PHASE   = uid("frameworks_phase_cadence")

TEST_SOURCES_PHASE      = uid("sources_phase_tests")
TEST_FRAMEWORKS_PHASE   = uid("frameworks_phase_tests")

PROJECT_CONFIG_LIST     = uid("config_list_project")
MAIN_TARGET_CONFIG_LIST = uid("config_list_main")
TEST_TARGET_CONFIG_LIST = uid("config_list_tests")

PROJECT_DEBUG_CONFIG    = uid("config_project_debug")
PROJECT_RELEASE_CONFIG  = uid("config_project_release")
MAIN_DEBUG_CONFIG       = uid("config_main_debug")
MAIN_RELEASE_CONFIG     = uid("config_main_release")
TEST_DEBUG_CONFIG       = uid("config_tests_debug")
TEST_RELEASE_CONFIG     = uid("config_tests_release")

TEST_HOST_UUID          = uid("test_host_setting")

# Per-file UUIDs
def file_ref_uid(path):    return uid(f"fileref_{path}")
def build_file_uid(path):  return uid(f"buildfile_{path}")
def test_file_ref_uid(p):  return uid(f"testfileref_{p}")
def test_build_file_uid(p):return uid(f"testbuildfile_{p}")

# Group UUIDs for subdirectories
def group_uid(path):       return uid(f"group_{path}")


# ---------------------------------------------------------------------------
# Build helpers
# ---------------------------------------------------------------------------

def collect_groups(files):
    """Return unique directory paths from file list (breadth-first)."""
    dirs = set()
    for f in files:
        parts = f.split("/")
        for i in range(1, len(parts)):
            dirs.add("/".join(parts[:i]))
    return sorted(dirs)


def indent(text, n=2):
    pad = "\t" * n
    return "\n".join(pad + line if line.strip() else line for line in text.split("\n"))


# ---------------------------------------------------------------------------
# pbxproj sections
# ---------------------------------------------------------------------------

def build_file_section(app_files, test_files):
    lines = ["/* Begin PBXBuildFile section */"]
    for f in app_files:
        fname = os.path.basename(f)
        ref = file_ref_uid(f)
        bf  = build_file_uid(f)
        lines.append(f"\t\t{bf} /* {fname} in Sources */ = {{isa = PBXBuildFile; fileRef = {ref} /* {fname} */; }};")
    # Assets
    assets_ref = file_ref_uid("Resources/Assets.xcassets")
    assets_bf  = build_file_uid("Resources/Assets.xcassets")
    lines.append(f"\t\t{assets_bf} /* Assets.xcassets in Resources */ = {{isa = PBXBuildFile; fileRef = {assets_ref} /* Assets.xcassets */; }};")
    for f in test_files:
        fname = os.path.basename(f)
        ref = test_file_ref_uid(f)
        bf  = test_build_file_uid(f)
        lines.append(f"\t\t{bf} /* {fname} in Sources */ = {{isa = PBXBuildFile; fileRef = {ref} /* {fname} */; }};")
    lines.append("/* End PBXBuildFile section */")
    return "\n".join(lines)


def file_ref_section(app_files, test_files):
    lines = ["/* Begin PBXFileReference section */"]
    for f in app_files:
        fname = os.path.basename(f)
        ref = file_ref_uid(f)
        lines.append(f"\t\t{ref} /* {fname} */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = {pbx_string(fname)}; sourceTree = \"<group>\"; }};")
    # Info.plist
    plist_ref = file_ref_uid("Resources/Info.plist")
    lines.append(f"\t\t{plist_ref} /* Info.plist */ = {{isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = Info.plist; sourceTree = \"<group>\"; }};")
    # Assets
    assets_ref = file_ref_uid("Resources/Assets.xcassets")
    lines.append(f"\t\t{assets_ref} /* Assets.xcassets */ = {{isa = PBXFileReference; lastKnownFileType = folder.assetcatalog; path = Assets.xcassets; sourceTree = \"<group>\"; }};")
    # Products
    lines.append(f"\t\t{MAIN_PRODUCT_REF} /* Cadence.app */ = {{isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = Cadence.app; sourceTree = BUILT_PRODUCTS_DIR; }};")
    lines.append(f"\t\t{TEST_PRODUCT_REF} /* CadenceTests.xctest */ = {{isa = PBXFileReference; explicitFileType = wrapper.cfbundle; includeInIndex = 0; path = CadenceTests.xctest; sourceTree = BUILT_PRODUCTS_DIR; }};")
    for f in test_files:
        fname = os.path.basename(f)
        ref = test_file_ref_uid(f)
        lines.append(f"\t\t{ref} /* {fname} */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = {pbx_string(fname)}; sourceTree = \"<group>\"; }};")
    lines.append("/* End PBXFileReference section */")
    return "\n".join(lines)


def build_group_tree(files):
    """Build a tree: { dir_path: [child_path_or_file] }"""
    tree = {}  # dir -> list of (name, is_dir, full_path)

    def ensure(path):
        if path not in tree:
            tree[path] = []

    ensure("")  # root group for Cadence/
    for f in files:
        parts = f.split("/")
        for i in range(len(parts)):
            if i == 0:
                parent = ""
                child  = parts[0]
                full   = parts[0]
            else:
                parent = "/".join(parts[:i])
                child  = parts[i]
                full   = "/".join(parts[:i+1])
            ensure(parent)
            is_dir = (i < len(parts) - 1)
            entry = (child, is_dir, full)
            if entry not in tree[parent]:
                tree[parent].append(entry)
    return tree


def group_section(app_files):
    lines = ["/* Begin PBXGroup section */"]

    # Root group
    lines.append(f"\t\t{MAIN_GROUP} = {{")
    lines.append(f"\t\t\tisa = PBXGroup;")
    lines.append(f"\t\t\tchildren = (")
    lines.append(f"\t\t\t\t{CADENCE_GROUP} /* Cadence */,")
    lines.append(f"\t\t\t\t{TESTS_GROUP} /* CadenceTests */,")
    lines.append(f"\t\t\t\t{PRODUCTS_GROUP} /* Products */,")
    lines.append(f"\t\t\t);")
    lines.append(f"\t\t\tsourceTree = \"<group>\";")
    lines.append(f"\t\t}};")

    # Products group
    lines.append(f"\t\t{PRODUCTS_GROUP} /* Products */ = {{")
    lines.append(f"\t\t\tisa = PBXGroup;")
    lines.append(f"\t\t\tchildren = (")
    lines.append(f"\t\t\t\t{MAIN_PRODUCT_REF} /* Cadence.app */,")
    lines.append(f"\t\t\t\t{TEST_PRODUCT_REF} /* CadenceTests.xctest */,")
    lines.append(f"\t\t\t);")
    lines.append(f"\t\t\tname = Products;")
    lines.append(f"\t\t\tsourceTree = \"<group>\";")
    lines.append(f"\t\t}};")

    # Build the tree for app files
    tree = build_group_tree(app_files + ["Resources/Info.plist", "Resources/Assets.xcassets"])

    def emit_group(path, folder_name, source_root):
        gid = CADENCE_GROUP if path == "" else group_uid(path)
        children = tree.get(path, [])
        lines.append(f"\t\t{gid} /* {folder_name} */ = {{")
        lines.append(f"\t\t\tisa = PBXGroup;")
        lines.append(f"\t\t\tchildren = (")
        for (name, is_dir, full) in children:
            if is_dir:
                child_gid = group_uid(full)
                lines.append(f"\t\t\t\t{child_gid} /* {name} */,")
            else:
                # Map to correct ref
                if name == "Info.plist":
                    ref = file_ref_uid("Resources/Info.plist")
                elif name == "Assets.xcassets":
                    ref = file_ref_uid("Resources/Assets.xcassets")
                else:
                    ref = file_ref_uid(full)
                lines.append(f"\t\t\t\t{ref} /* {name} */,")
        lines.append(f"\t\t\t);")
        if path == "":
            lines.append(f"\t\t\tname = {pbx_string(folder_name)};")
            lines.append(f"\t\t\tpath = {pbx_string(folder_name)};")
        else:
            lines.append(f"\t\t\tpath = {pbx_string(folder_name)};")
        lines.append(f"\t\t\tsourceTree = \"<group>\";")
        lines.append(f"\t\t}};")

        # Recursively emit subdirectories
        for (name, is_dir, full) in children:
            if is_dir:
                emit_group(full, name, source_root)

    emit_group("", "Cadence", "Cadence")

    # Tests group
    lines.append(f"\t\t{TESTS_GROUP} /* CadenceTests */ = {{")
    lines.append(f"\t\t\tisa = PBXGroup;")
    lines.append(f"\t\t\tchildren = (")
    for f in TEST_SWIFT_FILES:
        ref = test_file_ref_uid(f)
        fname = os.path.basename(f)
        lines.append(f"\t\t\t\t{ref} /* {fname} */,")
    lines.append(f"\t\t\t);")
    lines.append(f"\t\t\tname = CadenceTests;")
    lines.append(f"\t\t\tpath = CadenceTests;")
    lines.append(f"\t\t\tsourceTree = \"<group>\";")
    lines.append(f"\t\t}};")

    lines.append("/* End PBXGroup section */")
    return "\n".join(lines)


def sources_build_phase(uid_phase, files, file_ref_fn, build_file_fn):
    lines = []
    lines.append(f"\t\t{uid_phase} /* Sources */ = {{")
    lines.append(f"\t\t\tisa = PBXSourcesBuildPhase;")
    lines.append(f"\t\t\tbuildActionMask = 2147483647;")
    lines.append(f"\t\t\tfiles = (")
    for f in files:
        fname = os.path.basename(f)
        bf = build_file_fn(f)
        lines.append(f"\t\t\t\t{bf} /* {fname} in Sources */,")
    lines.append(f"\t\t\t);")
    lines.append(f"\t\t\trunOnlyForDeploymentPostprocessing = 0;")
    lines.append(f"\t\t}};")
    return "\n".join(lines)


def resources_build_phase():
    lines = []
    assets_bf = build_file_uid("Resources/Assets.xcassets")
    lines.append(f"\t\t{MAIN_RESOURCES_PHASE} /* Resources */ = {{")
    lines.append(f"\t\t\tisa = PBXResourcesBuildPhase;")
    lines.append(f"\t\t\tbuildActionMask = 2147483647;")
    lines.append(f"\t\t\tfiles = (")
    lines.append(f"\t\t\t\t{assets_bf} /* Assets.xcassets in Resources */,")
    lines.append(f"\t\t\t);")
    lines.append(f"\t\t\trunOnlyForDeploymentPostprocessing = 0;")
    lines.append(f"\t\t}};")
    return "\n".join(lines)


def frameworks_build_phase(uid_phase):
    lines = []
    lines.append(f"\t\t{uid_phase} /* Frameworks */ = {{")
    lines.append(f"\t\t\tisa = PBXFrameworksBuildPhase;")
    lines.append(f"\t\t\tbuildActionMask = 2147483647;")
    lines.append(f"\t\t\tfiles = (")
    lines.append(f"\t\t\t);")
    lines.append(f"\t\t\trunOnlyForDeploymentPostprocessing = 0;")
    lines.append(f"\t\t}};")
    return "\n".join(lines)


def native_targets():
    lines = ["/* Begin PBXNativeTarget section */"]
    # Main target
    lines.append(f"\t\t{MAIN_TARGET} /* Cadence */ = {{")
    lines.append(f"\t\t\tisa = PBXNativeTarget;")
    lines.append(f"\t\t\tbuildConfigurationList = {MAIN_TARGET_CONFIG_LIST} /* Build configuration list for PBXNativeTarget \"Cadence\" */;")
    lines.append(f"\t\t\tbuildPhases = (")
    lines.append(f"\t\t\t\t{MAIN_SOURCES_PHASE} /* Sources */,")
    lines.append(f"\t\t\t\t{MAIN_RESOURCES_PHASE} /* Resources */,")
    lines.append(f"\t\t\t\t{MAIN_FRAMEWORKS_PHASE} /* Frameworks */,")
    lines.append(f"\t\t\t);")
    lines.append(f"\t\t\tbuildRules = (")
    lines.append(f"\t\t\t);")
    lines.append(f"\t\t\tdependencies = (")
    lines.append(f"\t\t\t);")
    lines.append(f"\t\t\tname = Cadence;")
    lines.append(f"\t\t\tproductName = Cadence;")
    lines.append(f"\t\t\tproductReference = {MAIN_PRODUCT_REF} /* Cadence.app */;")
    lines.append(f"\t\t\tproductType = \"com.apple.product-type.application\";")
    lines.append(f"\t\t}};")
    # Test target
    lines.append(f"\t\t{TEST_TARGET} /* CadenceTests */ = {{")
    lines.append(f"\t\t\tisa = PBXNativeTarget;")
    lines.append(f"\t\t\tbuildConfigurationList = {TEST_TARGET_CONFIG_LIST} /* Build configuration list for PBXNativeTarget \"CadenceTests\" */;")
    lines.append(f"\t\t\tbuildPhases = (")
    lines.append(f"\t\t\t\t{TEST_SOURCES_PHASE} /* Sources */,")
    lines.append(f"\t\t\t\t{TEST_FRAMEWORKS_PHASE} /* Frameworks */,")
    lines.append(f"\t\t\t);")
    lines.append(f"\t\t\tbuildRules = (")
    lines.append(f"\t\t\t);")
    lines.append(f"\t\t\tdependencies = (")
    lines.append(f"\t\t\t);")
    lines.append(f"\t\t\tname = CadenceTests;")
    lines.append(f"\t\t\tproductName = CadenceTests;")
    lines.append(f"\t\t\tproductReference = {TEST_PRODUCT_REF} /* CadenceTests.xctest */;")
    lines.append(f"\t\t\tproductType = \"com.apple.product-type.bundle.unit-test\";")
    lines.append(f"\t\t}};")
    lines.append("/* End PBXNativeTarget section */")
    return "\n".join(lines)


def project_section():
    lines = ["/* Begin PBXProject section */"]
    lines.append(f"\t\t{PROJECT_UUID} /* Project object */ = {{")
    lines.append(f"\t\t\tisa = PBXProject;")
    lines.append(f"\t\t\tattributes = {{")
    lines.append(f"\t\t\t\tBuildIndependentTargetsInParallel = 1;")
    lines.append(f"\t\t\t\tLastSwiftUpdateCheck = {XCODE_VER};")
    lines.append(f"\t\t\t\tLastUpgradeCheck = {XCODE_VER};")
    lines.append(f"\t\t\t\tTargetAttributes = {{")
    lines.append(f"\t\t\t\t\t{MAIN_TARGET} = {{")
    lines.append(f"\t\t\t\t\t\tCreatedOnToolsVersion = 15.0;")
    lines.append(f"\t\t\t\t\t}};")
    lines.append(f"\t\t\t\t\t{TEST_TARGET} = {{")
    lines.append(f"\t\t\t\t\t\tCreatedOnToolsVersion = 15.0;")
    lines.append(f"\t\t\t\t\t\tTestTargetID = {MAIN_TARGET};")
    lines.append(f"\t\t\t\t\t}};")
    lines.append(f"\t\t\t\t}};")
    lines.append(f"\t\t\t}};")
    lines.append(f"\t\t\tbuildConfigurationList = {PROJECT_CONFIG_LIST} /* Build configuration list for PBXProject \"Cadence\" */;")
    lines.append(f"\t\t\tcompatibilityVersion = \"Xcode 14.0\";")
    lines.append(f"\t\t\tdevelopmentRegion = en;")
    lines.append(f"\t\t\thasScannedForEncodings = 0;")
    lines.append(f"\t\t\tknownRegions = (")
    lines.append(f"\t\t\t\ten,")
    lines.append(f"\t\t\t\tBase,")
    lines.append(f"\t\t\t);")
    lines.append(f"\t\t\tmainGroup = {MAIN_GROUP};")
    lines.append(f"\t\t\tproductRefGroup = {PRODUCTS_GROUP} /* Products */;")
    lines.append(f"\t\t\tprojectDirPath = \"\";")
    lines.append(f"\t\t\tprojectRoot = \"\";")
    lines.append(f"\t\t\ttargets = (")
    lines.append(f"\t\t\t\t{MAIN_TARGET} /* Cadence */,")
    lines.append(f"\t\t\t\t{TEST_TARGET} /* CadenceTests */,")
    lines.append(f"\t\t\t);")
    lines.append(f"\t\t}};")
    lines.append("/* End PBXProject section */")
    return "\n".join(lines)


def build_config(uid_val, name, is_test=False, is_project=False):
    lines = []
    lines.append(f"\t\t{uid_val} /* {name} */ = {{")
    lines.append(f"\t\t\tisa = XCBuildConfiguration;")
    lines.append(f"\t\t\tbuildSettings = {{")

    if is_project:
        lines.append(f"\t\t\t\tALWAYS_SEARCH_USER_PATHS = NO;")
        lines.append(f"\t\t\t\tCLANG_ANALYZER_NONNULL = YES;")
        lines.append(f"\t\t\t\tCLANG_ANALYZER_NUMBER_OBJECT_CONVERSION = YES_AGGRESSIVE;")
        lines.append(f"\t\t\t\tCLANG_CXX_LANGUAGE_STANDARD = \"gnu++20\";")
        lines.append(f"\t\t\t\tCLANG_ENABLE_MODULES = YES;")
        lines.append(f"\t\t\t\tCLANG_ENABLE_OBJC_ARC = YES;")
        lines.append(f"\t\t\t\tCLANG_ENABLE_OBJC_WEAK = YES;")
        lines.append(f"\t\t\t\tCOPY_PHASE_STRIP = NO;")
        lines.append(f"\t\t\t\tDEBUG_INFORMATION_FORMAT = dwarf;") if name == "Debug" else lines.append(f"\t\t\t\tDEBUG_INFORMATION_FORMAT = \"dwarf-with-dsym\";")
        lines.append(f"\t\t\t\tENABLE_STRICT_OBJC_MSGSEND = YES;")
        lines.append(f"\t\t\t\tENABLE_TESTABILITY = YES;") if name == "Debug" else None
        lines.append(f"\t\t\t\tGCC_C_LANGUAGE_STANDARD = gnu11;")
        lines.append(f"\t\t\t\tGCC_DYNAMIC_NO_PIC = NO;") if name == "Debug" else lines.append(f"\t\t\t\tGCC_DYNAMIC_NO_PIC = YES;")
        lines.append(f"\t\t\t\tGCC_NO_COMMON_BLOCKS = YES;")
        lines.append(f"\t\t\t\tGCC_OPTIMIZATION_LEVEL = 0;") if name == "Debug" else lines.append(f"\t\t\t\tGCC_OPTIMIZATION_LEVEL = s;")
        lines.append(f"\t\t\t\tGCC_PREPROCESSOR_DEFINITIONS = (\"DEBUG=1\", \"$(inherited)\",);") if name == "Debug" else None
        lines.append(f"\t\t\t\tINFOPLIST_PREPROCESS = YES;")
        lines.append(f"\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = {DEPLOY_VER};")
        lines.append(f"\t\t\t\tMTL_ENABLE_DEBUG_INFO = INCLUDE_SOURCE;") if name == "Debug" else lines.append(f"\t\t\t\tMTL_ENABLE_DEBUG_INFO = NO;")
        lines.append(f"\t\t\t\tONLY_ACTIVE_ARCH = YES;") if name == "Debug" else lines.append(f"\t\t\t\tONLY_ACTIVE_ARCH = NO;")
        lines.append(f"\t\t\t\tSDKROOT = iphoneos;")
        lines.append(f"\t\t\t\tSWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG;") if name == "Debug" else None
        lines.append(f"\t\t\t\tSWIFT_OPTIMIZATION_LEVEL = \"-Onone\";") if name == "Debug" else lines.append(f"\t\t\t\tSWIFT_OPTIMIZATION_LEVEL = \"-O\";")
        lines.append(f"\t\t\t\tSWIFT_VERSION = {SWIFT_VER};")
        lines.append(f"\t\t\t\tTARGETED_DEVICE_FAMILY = 2;")
        lines.append(f"\t\t\t\tVALIDATE_PRODUCT = YES;") if name == "Release" else None
    elif is_test:
        lines.append(f"\t\t\t\tBUNDLE_LOADER = \"$(TEST_HOST)\";")
        lines.append(f"\t\t\t\tGCC_PREPROCESSOR_DEFINITIONS = (\"DEBUG=1\", \"$(inherited)\",);") if name == "Debug" else None
        lines.append(f"\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = {DEPLOY_VER};")
        lines.append(f"\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = {BUNDLE_ID}.Tests;")
        lines.append(f"\t\t\t\tPRODUCT_NAME = \"$(TARGET_NAME)\";")
        lines.append(f"\t\t\t\tSDKROOT = iphoneos;")
        lines.append(f"\t\t\t\tSWIFT_VERSION = {SWIFT_VER};")
        lines.append(f"\t\t\t\tTARGETED_DEVICE_FAMILY = 2;")
        lines.append(f"\t\t\t\tTEST_HOST = \"$(BUILT_PRODUCTS_DIR)/Cadence.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/Cadence\";")
    else:
        # Main target
        lines.append(f"\t\t\t\tCODE_SIGN_STYLE = Automatic;")
        lines.append(f"\t\t\t\tCURRENT_PROJECT_VERSION = 1;")
        lines.append(f"\t\t\t\tDEVELOPMENT_TEAM = \"\";")
        lines.append(f"\t\t\t\tGCC_PREPROCESSOR_DEFINITIONS = (\"DEBUG=1\", \"$(inherited)\",);") if name == "Debug" else None
        lines.append(f"\t\t\t\tGENERATE_INFOPLIST_FILE = NO;")
        lines.append(f"\t\t\t\tINFOPLIST_FILE = \"Cadence/Resources/Info.plist\";")
        lines.append(f"\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = {DEPLOY_VER};")
        lines.append(f"\t\t\t\tMARKETING_VERSION = 1.0;")
        lines.append(f"\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = {BUNDLE_ID};")
        lines.append(f"\t\t\t\tPRODUCT_NAME = \"$(TARGET_NAME)\";")
        lines.append(f"\t\t\t\tSDKROOT = iphoneos;")
        lines.append(f"\t\t\t\tSUPPORTS_MACCATALYST = NO;")
        lines.append(f"\t\t\t\tSWIFT_EMIT_LOC_STRINGS = YES;")
        lines.append(f"\t\t\t\tSWIFT_VERSION = {SWIFT_VER};")
        lines.append(f"\t\t\t\tTARGETED_DEVICE_FAMILY = 2;")

    # Remove None entries
    lines = [l for l in lines if l is not None]
    lines.append(f"\t\t\t}};")
    lines.append(f"\t\t\tname = {name};")
    lines.append(f"\t\t}};")
    return "\n".join(lines)


def config_list(uid_val, target_name, debug_uid, release_uid):
    lines = []
    lines.append(f"\t\t{uid_val} /* Build configuration list for {target_name} */ = {{")
    lines.append(f"\t\t\tisa = XCConfigurationList;")
    lines.append(f"\t\t\tbuildConfigurations = (")
    lines.append(f"\t\t\t\t{debug_uid} /* Debug */,")
    lines.append(f"\t\t\t\t{release_uid} /* Release */,")
    lines.append(f"\t\t\t);")
    lines.append(f"\t\t\tdefaultConfigurationIsVisible = 0;")
    lines.append(f"\t\t\tdefaultConfigurationName = Release;")
    lines.append(f"\t\t}};")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Assemble pbxproj
# ---------------------------------------------------------------------------

def generate():
    sections = []
    sections.append("// !$*UTF8*$!")
    sections.append("{")
    sections.append("\tarchiveVersion = 1;")
    sections.append("\tclasses = {")
    sections.append("\t};")
    sections.append("\tobjectVersion = 56;")
    sections.append("\tobjects = {")
    sections.append("")

    sections.append(build_file_section(APP_SWIFT_FILES, TEST_SWIFT_FILES))
    sections.append("")
    sections.append(file_ref_section(APP_SWIFT_FILES, TEST_SWIFT_FILES))
    sections.append("")
    sections.append(group_section(APP_SWIFT_FILES))
    sections.append("")

    # Build phases
    sections.append("/* Begin PBXSourcesBuildPhase section */")
    sections.append(sources_build_phase(MAIN_SOURCES_PHASE, APP_SWIFT_FILES, file_ref_uid, build_file_uid))
    sections.append(sources_build_phase(TEST_SOURCES_PHASE, TEST_SWIFT_FILES, test_file_ref_uid, test_build_file_uid))
    sections.append("/* End PBXSourcesBuildPhase section */")
    sections.append("")

    sections.append("/* Begin PBXResourcesBuildPhase section */")
    sections.append(resources_build_phase())
    sections.append("/* End PBXResourcesBuildPhase section */")
    sections.append("")

    sections.append("/* Begin PBXFrameworksBuildPhase section */")
    sections.append(frameworks_build_phase(MAIN_FRAMEWORKS_PHASE))
    sections.append(frameworks_build_phase(TEST_FRAMEWORKS_PHASE))
    sections.append("/* End PBXFrameworksBuildPhase section */")
    sections.append("")

    sections.append(native_targets())
    sections.append("")
    sections.append(project_section())
    sections.append("")

    # Build configurations
    sections.append("/* Begin XCBuildConfiguration section */")
    sections.append(build_config(PROJECT_DEBUG_CONFIG,   "Debug",   is_project=True))
    sections.append(build_config(PROJECT_RELEASE_CONFIG, "Release", is_project=True))
    sections.append(build_config(MAIN_DEBUG_CONFIG,      "Debug"))
    sections.append(build_config(MAIN_RELEASE_CONFIG,    "Release"))
    sections.append(build_config(TEST_DEBUG_CONFIG,      "Debug",   is_test=True))
    sections.append(build_config(TEST_RELEASE_CONFIG,    "Release", is_test=True))
    sections.append("/* End XCBuildConfiguration section */")
    sections.append("")

    sections.append("/* Begin XCConfigurationList section */")
    sections.append(config_list(
        PROJECT_CONFIG_LIST,
        "PBXProject \"Cadence\"",
        PROJECT_DEBUG_CONFIG, PROJECT_RELEASE_CONFIG
    ))
    sections.append(config_list(
        MAIN_TARGET_CONFIG_LIST,
        "PBXNativeTarget \"Cadence\"",
        MAIN_DEBUG_CONFIG, MAIN_RELEASE_CONFIG
    ))
    sections.append(config_list(
        TEST_TARGET_CONFIG_LIST,
        "PBXNativeTarget \"CadenceTests\"",
        TEST_DEBUG_CONFIG, TEST_RELEASE_CONFIG
    ))
    sections.append("/* End XCConfigurationList section */")
    sections.append("")

    sections.append("\t};")
    sections.append(f"\trootObject = {PROJECT_UUID} /* Project object */;")
    sections.append("}")

    return "\n".join(sections)


# ---------------------------------------------------------------------------
# Write files
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))

    # Create workspace
    ws_dir = os.path.join(script_dir, "Cadence.xcodeproj", "project.xcworkspace")
    os.makedirs(ws_dir, exist_ok=True)

    ws_data = """<?xml version="1.0" encoding="UTF-8"?>
<Workspace
   version = "1.0">
   <FileRef
      location = "self:">
   </FileRef>
</Workspace>
"""
    with open(os.path.join(ws_dir, "contents.xcworkspacedata"), "w") as f:
        f.write(ws_data)

    # Write pbxproj
    pbxproj_path = os.path.join(script_dir, "Cadence.xcodeproj", "project.pbxproj")
    content = generate()
    with open(pbxproj_path, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"✓ Generated {pbxproj_path}")
    print(f"✓ Generated {os.path.join(ws_dir, 'contents.xcworkspacedata')}")
    print()
    print("Next steps:")
    print("  1. Open Cadence/Cadence.xcodeproj in Xcode")
    print("  2. Select your Development Team in Signing & Capabilities")
    print("  3. Choose an iPad simulator or connected device")
    print("  4. Build and run (⌘R)")
