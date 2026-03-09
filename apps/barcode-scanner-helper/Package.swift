// swift-tools-version:5.5
import PackageDescription

let package = Package(
    name: "BarcodeScannerHelper",
    platforms: [.macOS(.v10_15)],
    products: [
        .executable(name: "BarcodeScannerHelper", targets: ["BarcodeScannerHelper"]),
    ],
    targets: [
        .executableTarget(
            name: "BarcodeScannerHelper",
            path: "Sources/BarcodeScannerHelper",
            linkerSettings: [
                .linkedFramework("IOKit"),
                .linkedFramework("CoreFoundation"),
                .linkedFramework("Foundation"),
                .linkedFramework("Network"),
            ]
        ),
    ]
)
