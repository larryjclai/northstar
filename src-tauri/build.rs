use std::env;
use std::path::PathBuf;
use std::process::Command;

fn main() {
    // On the macOS *desktop* build (Cargo, not Xcode), compile the Apple
    // Foundation Models Swift bridge into a static lib and link it so Tier 1
    // on-device parsing works on the desktop app too — not just iOS.
    //
    // iOS builds go through Xcode, which compiles the same Swift file as part
    // of the app target, so we must NOT compile/link it here for iOS.
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        link_foundation_models_swift();
    }

    tauri_build::build()
}

fn link_foundation_models_swift() {
    let swift_src = "gen/apple/Sources/northstar/FoundationModels.swift";
    println!("cargo:rerun-if-changed={swift_src}");
    println!("cargo:rerun-if-changed=build.rs");

    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let lib_path = out_dir.join("libnsfoundationmodels.a");

    // Map the Cargo arch to a Swift/clang target triple. Universal builds run
    // build.rs once per arch, so CARGO_CFG_TARGET_ARCH is the slice we want.
    let arch = match env::var("CARGO_CFG_TARGET_ARCH").as_deref() {
        Ok("x86_64") => "x86_64",
        _ => "arm64",
    };
    // Deployment target 13.0 keeps the app launchable on older macOS; the
    // FoundationModels framework is weak-linked (below) and all uses are
    // @available(macOS 26.0)-gated, so pre-26 systems just fall back to Tier 0.
    let target = format!("{arch}-apple-macosx13.0");

    let status = Command::new("swiftc")
        .args([
            "-emit-library",
            "-static",
            "-module-name",
            "nsfoundationmodels",
            "-target",
            &target,
            "-parse-as-library",
            "-O",
            // Suppress the hard `-framework FoundationModels` autolink hint so we
            // can re-add it as a *weak* framework — otherwise the app would fail
            // to launch on macOS < 26 where the framework does not exist.
            "-Xfrontend",
            "-disable-autolink-framework",
            "-Xfrontend",
            "FoundationModels",
            "-o",
        ])
        .arg(&lib_path)
        .arg(swift_src)
        .status()
        .expect("failed to invoke swiftc — is Xcode / the Swift toolchain installed?");
    assert!(status.success(), "swiftc failed to compile {swift_src}");

    // Static lib + its directory.
    println!("cargo:rustc-link-search=native={}", out_dir.display());
    println!("cargo:rustc-link-lib=static=nsfoundationmodels");

    // Swift runtime: OS copy (dylibs, used at runtime via rpath) + toolchain
    // copy (static compatibility archives referenced by autolink at link time).
    println!("cargo:rustc-link-search=native=/usr/lib/swift");
    if let Some(toolchain_swift) = toolchain_swift_lib_dir() {
        println!("cargo:rustc-link-search=native={toolchain_swift}");
    }

    // Re-add FoundationModels as a weak framework + rpath to the OS Swift runtime.
    println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
    println!("cargo:rustc-link-arg=-weak_framework");
    println!("cargo:rustc-link-arg=FoundationModels");
}

/// Resolve `<toolchain>/usr/lib/swift/macosx`, where swiftc lives, e.g.
/// /Applications/Xcode.app/.../XcodeDefault.xctoolchain/usr/lib/swift/macosx
fn toolchain_swift_lib_dir() -> Option<String> {
    let out = Command::new("xcrun").args(["-f", "swiftc"]).output().ok()?;
    if !out.status.success() {
        return None;
    }
    let swiftc = String::from_utf8(out.stdout).ok()?;
    let swiftc = PathBuf::from(swiftc.trim());
    // <toolchain>/usr/bin/swiftc -> <toolchain>/usr/lib/swift/macosx
    let dir = swiftc.parent()?.parent()?.join("lib/swift/macosx");
    dir.to_str().map(|s| s.to_string())
}
