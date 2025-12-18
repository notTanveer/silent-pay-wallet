#!/usr/bin/env bash

# exit on error, pipe failure, or undefined variables (prevents silent failures)
set -euo pipefail

PROJECT_NAME="rust_jsi_bridge"
LIB_NAME="librust_jsi_bridge.a"
IOS_DEST="../ios/lib"
ANDROID_DEST_BASE="../android/app/src/main/jniLibs"

# Setup Android NDK environment if not already set
if [ -z "${ANDROID_NDK_HOME:-}" ]; then
    # Try to find NDK in Android SDK
    if [ -d "${ANDROID_HOME:-}/ndk" ]; then
        # Use the latest NDK version available
        NDK_VERSION=$(ls -1 "${ANDROID_HOME}/ndk" | sort -V | tail -1)
        export ANDROID_NDK_HOME="${ANDROID_HOME}/ndk/${NDK_VERSION}"
        echo "ℹ️  Setting ANDROID_NDK_HOME to ${ANDROID_NDK_HOME}"
    else
        echo "❌ Error: ANDROID_NDK_HOME not set and NDK not found in ANDROID_HOME"
        echo "Please set ANDROID_NDK_HOME environment variable to your NDK installation path"
        echo "Example: export ANDROID_NDK_HOME=~/Android/Sdk/ndk/27.1.12297006"
        exit 1
    fi
fi

# Add NDK toolchain to PATH
export PATH="${ANDROID_NDK_HOME}/toolchains/llvm/prebuilt/linux-x86_64/bin:${PATH}"

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

build_and_copy_android() {
    IFS='|' read -r target name subdir <<< "$1"
    log "Building $name ($target)..."
    
    # Ensure NDK toolchain is in PATH for this cargo invocation
    if PATH="${ANDROID_NDK_HOME}/toolchains/llvm/prebuilt/linux-x86_64/bin:${PATH}" \
       cargo build --release --target "$target"; then
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