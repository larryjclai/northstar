// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "northstar",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: [
        .executable(name: "northstar", targets: ["NorthstarApp"])
    ],
    targets: [
        .executableTarget(
            name: "NorthstarApp",
            path: "Sources/NorthstarApp"
        )
    ]
)
