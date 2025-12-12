#!/usr/bin/env bash

# exit on error, pipe failure, or undefined variables (prevents silent failures)
set -euo pipefail

PROJECT_NAME="rust_jsi_bridge"
LIB_NAME="librust_jsi_bridge.a"
IOS_DEST="../ios/lib"
ANDROID_DEST_BASE="../android/app/src/main/jniLibs"

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