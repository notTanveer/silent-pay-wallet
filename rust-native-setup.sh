#!/usr/bin/env bash

# exit on error, pipe failure, or undefined variables (prevents silent failures)
set -euo pipefail

PROJECT_NAME="rust_jsi_bridge"
LIB_NAME="librust_jsi_bridge.a"
IOS_DEST="../ios/lib"
ANDROID_DEST_BASE="../android/app/src/main/jniLibs"
API_LEVEL=21 # Minimum API level for Android builds (Android 5.0+, Lollipop)

detect_ndk_home() {
    if [ -n "${ANDROID_NDK_HOME:-}" ]; then
        return 0
    fi

    if [ -d "${ANDROID_HOME:-}/ndk" ]; then
        local ndk_version
        ndk_version=$(ls -1 "${ANDROID_HOME}/ndk" | sort -V | tail -1)
        export ANDROID_NDK_HOME="${ANDROID_HOME}/ndk/${ndk_version}"
        echo "ℹ️  Setting ANDROID_NDK_HOME to ${ANDROID_NDK_HOME}"
    else
        echo "❌ Error: ANDROID_NDK_HOME not set and NDK not found in ANDROID_HOME"
        echo "Please set ANDROID_NDK_HOME environment variable to your NDK installation path"
        echo "Example: export ANDROID_NDK_HOME=~/Android/Sdk/ndk/27.1.12297006"
        exit 1
    fi
}

configure_android_toolchain() {
    detect_ndk_home

    local toolchain="${ANDROID_NDK_HOME}/toolchains/llvm/prebuilt/linux-x86_64/bin"

    if [ ! -d "$toolchain" ]; then
        error "NDK toolchain not found at $toolchain"
    fi

    export PATH="$toolchain:${PATH}"

    # NDK 28+ uses llvm-ar for all architectures instead of architecture-specific ar tools
    # align with .cargo/config.toml linker settings
    export CC_aarch64_linux_android="${toolchain}/aarch64-linux-android${API_LEVEL}-clang"
    export AR_aarch64_linux_android="${toolchain}/llvm-ar"

    export CC_armv7_linux_androideabi="${toolchain}/armv7a-linux-androideabi${API_LEVEL}-clang"
    export AR_armv7_linux_androideabi="${toolchain}/llvm-ar"

    export CC_x86_64_linux_android="${toolchain}/x86_64-linux-android${API_LEVEL}-clang"
    export AR_x86_64_linux_android="${toolchain}/llvm-ar"

    export CC_i686_linux_android="${toolchain}/i686-linux-android${API_LEVEL}-clang"
    export AR_i686_linux_android="${toolchain}/llvm-ar"

    success "Android NDK toolchain configured"
}

# map rust targets to descriptive names and destination paths
# format: "target_triple|display_name|destination_subdir"
ANDROID_TARGETS=(
    "aarch64-linux-android|Android ARM64|arm64-v8a"
    "armv7-linux-androideabi|Android ARMv7|armeabi-v7a"
    "x86_64-linux-android|Android x86_64|x86_64"
    "i686-linux-android|Android x86|x86"
)

IOS_TARGETS=(
    "aarch64-apple-ios|iOS Device (ARM64)|librust_jsi_bridge_device.a"
    "aarch64-apple-ios-sim|iOS Simulator (ARM64)|librust_jsi_bridge_sim_arm.a"
    "x86_64-apple-ios|iOS Simulator (Intel)|librust_jsi_bridge_sim_x86.a"
)


log() { echo -e "\033[1;34m$1\033[0m"; }
success() { echo -e "\033[1;32m  ✅ $1\033[0m"; }
warn() { echo -e "\033[1;33m  ⚠️  $1\033[0m"; }
error() { echo -e "\033[1;31m❌ $1\033[0m"; exit 1; }

ensure_rust_targets() {
    log "Checking Rust targets..."
    
    local targets=(
        "aarch64-apple-ios"
        "aarch64-apple-ios-sim"
        "x86_64-apple-ios"
        "aarch64-linux-android"
        "armv7-linux-androideabi"
        "x86_64-linux-android"
        "i686-linux-android"
    )
    
    local installed_targets
    installed_targets=$(rustup target list --installed)
    
    local missing_targets=()
    
    for target in "${targets[@]}"; do
        if ! echo "$installed_targets" | grep -q "^${target}$"; then
            missing_targets+=("$target")
        fi
    done
    
    if [ ${#missing_targets[@]} -gt 0 ]; then
        log "Installing missing targets: ${missing_targets[*]}"
        for target in "${missing_targets[@]}"; do
            rustup target add "$target" || warn "Failed to install $target"
        done
    else
        success "All Rust targets already installed"
    fi
}

build_and_copy_android() {
    IFS='|' read -r target name subdir <<< "$1"
    log "Building $name ($target)..."
    
    if cargo build --release --target "$target"; then
        mkdir -p "$ANDROID_DEST_BASE/$subdir"
        cp "target/$target/release/$LIB_NAME" "$ANDROID_DEST_BASE/$subdir/"
        success "$name built and deployed"
    else
        warn "$name build failed. Try: rustup target add $target"
    fi
}

build_and_copy_ios() {
    IFS='|' read -r target name filename <<< "$1"
    log "Building $name ($target)..."
    
    if cargo build --release --target "$target"; then
        mkdir -p "$IOS_DEST"
        cp "target/$target/release/$LIB_NAME" "$IOS_DEST/$filename"
        success "$name built and deployed"
    else
        warn "$name build failed. Try: rustup target add $target"
    fi
}


main() {
    if [[ ! -f "Cargo.toml" && -d "$PROJECT_NAME" ]]; then
        cd "$PROJECT_NAME"
    fi

    if [[ ! -f "Cargo.toml" ]]; then
        error "Must run from the root or the $PROJECT_NAME directory."
    fi

    echo "🦀 Starting Rust JSI Bridge Build System"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    configure_android_toolchain
    ensure_rust_targets
    
    echo -e "\n🤖 Android Targets:"
    for item in "${ANDROID_TARGETS[@]}"; do
        build_and_copy_android "$item"
    done

    # TODO: yet to test iOS build process
    # echo -e "\n📱 iOS Targets:"
    # for item in "${IOS_TARGETS[@]}"; do
    #     build_and_copy_ios "$item"
    # done

    echo -e "\n✅ Build and Distribution Complete!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    log "Final Assets Statistics:"
    find "$ANDROID_DEST_BASE" "$IOS_DEST" -name "*.a" -exec ls -lh {} + 2>/dev/null | awk '{print "  " $5 "\t" $9}' || echo "  No artifacts found."
}

main "$@"