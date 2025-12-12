# Rust Integration

## Overview

This project integrates Rust via React Native JSI to expose native performance for crypto-heavy operations. The flow is:

```
TypeScript (blue_modules/RustJsiBridge.ts)
            ↓
JSI Layer (C++ in android/app/src/main/cpp)
            ↓
Rust FFI (rust_jsi_bridge/src/lib.rs)
```

Key package namespace: `org.bitshala.shroud` (Android `applicationId` and Java package).

## Prerequisites

1. **Rust toolchain**:
   ```bash
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

2. **iOS targets** (macOS only):
   ```bash
   rustup target add aarch64-apple-ios          # iPhone/iPad
   rustup target add aarch64-apple-ios-sim      # M1/M2 Simulator
   rustup target add x86_64-apple-ios           # Intel Simulator
   ```

3. **Android targets**:
   ```bash
   rustup target add aarch64-linux-android      # ARM64 (most devices)
   rustup target add armv7-linux-androideabi    # ARMv7 (older devices)
   rustup target add x86_64-linux-android       # x86_64 emulator
   rustup target add i686-linux-android         # x86 emulator
   ```

4. **Android NDK** (for Android builds):
   - Install via Android Studio SDK Manager
   - Set `ANDROID_NDK_HOME` environment variable

## Contributing

To add new Rust functions:

1. Implement in `rust_jsi_bridge/src/lib.rs` with `#[no_mangle]` and `extern "C"`.
2. Declare in `android/app/src/main/cpp/RustJsiBridge.cpp` and wrap with a JSI host function.
3. Add TypeScript wrappers in `blue_modules/RustJsiBridge.ts`.
4. Build and distribute native libraries (see Build Workflow).
5. Rebuild the React Native app.

## Build Workflow

Use the provided npm scripts (defined in `package.json`) for a streamlined build:

- `npm run rust:build`: Build Rust libs and copy to Android `jniLibs`.
- `npm run rust:rebuild`: Clean Rust, then rebuild.
- `npm run android:rust`: Build Rust, clean Android, run app.
- `npm run android:rust:full`: Full clean + rebuild (Rust and Android).

Daily development:
```bash
npm run android:rust
```

If changes don’t show up:
```bash
npm run android:rust:full
```

## Android Integration Details

- Java module: `RustJsiBridgeModule.java` (package `org.bitshala.shroud`). Loads `System.loadLibrary("rust-jsi-bridge")` and calls native install.
- JNI entry (C++): `android/app/src/main/cpp/rust-jsi-bridge-jni.cpp` must export the symbol:
   ```cpp
   extern "C" JNIEXPORT void JNICALL
   Java_org_bitshala_shroud_RustJsiBridgeModule_nativeInstall(
         JNIEnv* env,
         jobject thiz,
         jlong jsiRuntimePtr
   ) {
         auto* runtime = reinterpret_cast<facebook::jsi::Runtime*>(jsiRuntimePtr);
         if (runtime) { rustjsibridge::installJSIBindings(*runtime); }
   }
   ```
- CMake links the Rust static lib at `${ANDROID_ABI}/librust_jsi_bridge.a` and produces `librust-jsi-bridge.so`.
- Gradle `namespace` and `applicationId` are `org.bitshala.shroud`.

## Using from TypeScript

```ts
import { initializeRustJsiBridge, helloFromRust, multiplyFromRust } from './blue_modules/RustJsiBridge';

initializeRustJsiBridge();
console.log(helloFromRust());       // "Hello Sahil! 🦀"
console.log(multiplyFromRust(6, 7)); // 42
```

## Project Structure (key paths)

```
silent-pay-wallet/
├── rust_jsi_bridge/
│   └── src/lib.rs                      # Rust FFI functions
├── android/
│   ├── CMakeLists.txt                  # Links Rust static lib
│   └── app/src/main/
│       ├── cpp/
│       │   ├── RustJsiBridge.cpp       # JSI bindings
│       │   └── rust-jsi-bridge-jni.cpp # JNI entry (nativeInstall)
│       └── java/org/bitshala/shroud/   # Java/Kotlin RN module (recommended path)
└── blue_modules/
      └── RustJsiBridge.ts                # TS wrapper
```

## Future: Silent Payments

Replace example functions with SP operations when ready. Benefits:
- Faster crypto, memory safety, no GC pauses.
- Leverage well-tested Rust crypto libraries.

## Development Workflow

1. Modify Rust code in `rust_jsi_bridge/src/lib.rs`.
2. `npm run android:rust` to rebuild Rust + Android and run.
3. If still stale, `npm run android:rust:full`.

### Testing Rust Functions

In your React Native JavaScript/TypeScript:

```typescript
import { initializeRustJsiBridge, helloFromRust, multiplyFromRust } from './blue_modules/RustJsiBridge';

// Initialize JSI bridge (once, on app start)
initializeRustJsiBridge();

// Call Rust functions
console.log(helloFromRust());              // "Hello from Rust! 🦀"
console.log(multiplyFromRust(6, 7));       // 42
```

## Project Structure

```
silent-pay-wallet/
├── rust_jsi_bridge/              # Rust workspace
│   ├── .cargo/config.toml        # Build aliases and linker flags
│   ├── Cargo.toml                # Rust dependencies and lib config
│   └── src/lib.rs                # Rust functions (FFI exports)
│
├── ios/
│   ├── RustJsiBridge/             # iOS C++ JSI wrapper
│   │   ├── RustJsiBridge.cpp      # JSI function bindings
│   │   ├── RustJsiBridge.h
│   │   ├── RustJsiBridgeModule.h
│   │   └── RustJsiBridgeModule.mm # React Native module
│   └── RustJsiBridge.podspec      # CocoaPods spec
│
├── android/
│   ├── CMakeLists.txt                   # CMake build config
│   └── app/src/main/
│       ├── cpp/
│       │   ├── RustJsiBridge.cpp        # JSI function bindings
│       │   ├── RustJsiBridge.h
│       │   └── rust-jsi-bridge-jni.cpp  # JNI entry point
│       └── java/.../
│           ├── RustJsiBridgeModule.java # React Native module
│           └── RustJsiBridgePackage.java
│
└── blue_modules/
    └── RustJsiBridge.ts          # TypeScript wrapper for JS
```

## Future Integration: Silent Payments

### Planned Rust Functions

Replace the example functions with Silent Payment cryptographic operations:

```rust
// Silent Payment address derivation
pub extern "C" fn sp_derive_address(scan_key: *const u8, spend_key: *const u8) -> *const c_char;

// Scan transaction for outputs
pub extern "C" fn sp_scan_transaction(
    scan_privkey: *const u8,
    spend_pubkey: *const u8, 
    scan_tweak: *const u8,
    outputs: *const u8,
    outputs_len: usize
) -> *const c_char; // Returns JSON with matched outputs

```

### Benefits Over Pure JavaScript

- Faster cryptographic operations
- No GC pauses during sensitive work
- Memory safety with Rust
- Leverage battle-tested libraries (e.g., `secp256k1`, `bitcoin-rs`)

## Performance Benchmarks

| Operation | JavaScript | Rust (JSI) | Speedup |
|-----------|-----------|------------|---------|
| ECDH shared secret | ~15ms | ~0.5ms | 30x |
| Block scan (100 txs) | ~2000ms | ~50ms | 40x |
| Signature generation | ~8ms | ~0.3ms | 27x |

*Benchmarks are estimates based on typical crypto library performance*

## References

- [Bridging React Native and Rust via JSI](https://www.ditto.com/blog/bridging-react-native-and-rust-via-jsi)
- [React Native JSI Documentation](https://github.com/react-native-community/discussions-and-proposals/blob/main/proposals/0264-jsi-in-c.md)
- [Rust FFI Guide](https://doc.rust-lang.org/nomicon/ffi.html)
- [Cargo Build Targets](https://doc.rust-lang.org/cargo/reference/build-targets.html)
