// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "CadenceNativeCore",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        .library(name: "CadenceNativeCore", targets: ["CadenceNativeCore"]),
        .executable(name: "CadenceNativeCoreChecks", targets: ["CadenceNativeCoreChecks"]),
    ],
    targets: [
        .target(name: "CadenceNativeCore"),
        .executableTarget(
            name: "CadenceNativeCoreChecks",
            dependencies: ["CadenceNativeCore"]
        ),
    ]
)
