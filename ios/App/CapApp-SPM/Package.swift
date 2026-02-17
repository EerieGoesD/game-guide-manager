// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.1.0"),
<<<<<<< Updated upstream
        .package(name: "CapacitorFilesystem", path: "..\..\..\node_modules\@capacitor\filesystem"),
        .package(name: "CapacitorStatusBar", path: "..\..\..\node_modules\@capacitor\status-bar"),
        .package(name: "CapgoCapacitorFilePicker", path: "..\..\..\node_modules\@capgo\capacitor-file-picker")
=======
        .package(name: "CapacitorFilesystem", path: "../../../node_modules/@capacitor/filesystem"),
        .package(name: "CapacitorShare", path: "../../../node_modules/@capacitor/share"),
        .package(name: "CapacitorStatusBar", path: "../../../node_modules/@capacitor/status-bar")
>>>>>>> Stashed changes
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorFilesystem", package: "CapacitorFilesystem"),
<<<<<<< Updated upstream
                .product(name: "CapacitorStatusBar", package: "CapacitorStatusBar"),
                .product(name: "CapgoCapacitorFilePicker", package: "CapgoCapacitorFilePicker")
=======
                .product(name: "CapacitorShare", package: "CapacitorShare"),
                .product(name: "CapacitorStatusBar", package: "CapacitorStatusBar")
>>>>>>> Stashed changes
            ]
        )
    ]
)
