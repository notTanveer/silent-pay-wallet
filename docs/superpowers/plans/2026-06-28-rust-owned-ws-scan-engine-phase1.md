# Rust-Owned WS Scan Engine — Phase 1: CallInvoker + Async Fallback Scan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plumb a JS CallInvoker into the Rust JSI bridge on both platforms and add an off-the-JS-thread (`Promise`-returning) binary silent-block scan, so the HTTP fallback scan path stops freezing the UI — and the CallInvoker infrastructure the later Rust WS engine needs exists and is proven.

**Architecture:** Add one async JSI host function, `spScanSilentBlockRangeAsync`, that copies its inputs on the JS thread, runs the *existing* `sp_scan_silent_block_range` Rust FFI on a detached worker thread, and resolves a JS `Promise` via the React Native `CallInvoker`. The bridge's `install` path is extended to capture the `jsCallInvoker` on iOS and the `CallInvokerHolderImpl` on Android. JS callers switch from the synchronous wrapper to the async one, with a runtime fallback to the sync call so the JS change is safe to ship before the native change.

**Tech Stack:** React Native 0.78 (bridge/old architecture), JSI (`facebook::jsi`), `facebook::react::CallInvoker`, Objective-C++ (`RCTCxxBridge`), fbjni / JNI, existing Rust `cdylib`/staticlib FFI (`rust_jsi_bridge`), TypeScript, Jest + ts-jest.

## Global Constraints

- Platforms: **both iOS and Android** must build and pass; neither may regress.
- **No Rust source changes in Phase 1.** Reuse the existing `extern "C" sp_scan_silent_block_range(scan_privkey_hex, spend_pubkey_hex, frames_ptr, frames_len)` and `free_rust_string`.
- The JSI `ArrayBuffer` is valid **only on the JS thread**. Its bytes MUST be copied into native-owned memory on the JS thread before any worker thread touches them.
- The scan key (`scanPrivkeyHex`) already crosses the bridge today; copying it into a `std::string` for the worker is acceptable. Do not log it.
- The bridge is **pure JSI** (host functions installed on `global`). Do not introduce a TurboModule or NativeEventEmitter in this phase.
- `ios/RustJsiBridge/RustJsiBridge.cpp` and `android/app/src/main/cpp/RustJsiBridge.cpp` are **separate, duplicated files** — every C++ binding change must be applied to **both**.
- Commit after each task with the exact message given.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `modules/RustJsiBridge.ts` | TS wrappers over JSI globals | Add `spScanSilentBlockRangeAsync` wrapper (with sync fallback) |
| `helpers/silent-payments/RustTransactionProcessor.ts` | Wallet-facing scan processor | `processSilentBlockFrames` awaits the async wrapper |
| `tests/unit/rustScanAsync.test.ts` | Unit test for the async path | Create |
| `ios/RustJsiBridge/RustJsiBridge.h` | iOS install signature | Add `CallInvoker` param |
| `ios/RustJsiBridge/RustJsiBridge.cpp` | iOS JSI bindings | Capture CallInvoker; add async host fn |
| `ios/RustJsiBridge/RustJsiBridgeModule.mm` | iOS install entry | Pass `cxxBridge.jsCallInvoker` |
| `android/app/src/main/cpp/RustJsiBridge.h` | Android install signature | Add `CallInvoker` param |
| `android/app/src/main/cpp/RustJsiBridge.cpp` | Android JSI bindings | Capture CallInvoker; add async host fn |
| `android/app/src/main/cpp/rust-jsi-bridge-jni.cpp` | JNI install entry | Unwrap `CallInvokerHolder`, pass CallInvoker |
| `android/app/src/main/java/org/bitshala/shroud/RustJsiBridgeModule.java` | Android RN module | Pass `CallInvokerHolderImpl` to `nativeInstall` |
| `android/CMakeLists.txt` | Native build | Confirm/added link to RN call-invoker (consolidated target) |

---

## Task 1: JS — async scan wrapper + processor switch (safe before native lands)

**Files:**
- Modify: `modules/RustJsiBridge.ts`
- Modify: `helpers/silent-payments/RustTransactionProcessor.ts:99-103`
- Test: `tests/unit/rustScanAsync.test.ts` (create)

**Interfaces:**
- Consumes: existing `RustBatchScanResult`, `isInstalled`, `getGlobal()` in `modules/RustJsiBridge.ts`.
- Produces: `spScanSilentBlockRangeAsync(scanPrivkeyHex: string, spendPubkeyHex: string, framesBuffer: ArrayBuffer): Promise<RustBatchScanResult>` — exported from `modules/RustJsiBridge.ts`. When the native async global is absent (older binary), it transparently falls back to the synchronous `spScanSilentBlockRange` global so callers never break.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/rustScanAsync.test.ts`:

```typescript
// Verifies the binary scan goes through the async (off-JS-thread) JSI global when
// present, and transparently falls back to the synchronous global on older native
// binaries. The RustJsiBridge module is mocked at its boundary so no native code runs.

describe('spScanSilentBlockRangeAsync', () => {
  const realModulePath = '../../modules/RustJsiBridge';

  afterEach(() => {
    jest.resetModules();
    // @ts-ignore
    delete (global as any).spScanSilentBlockRangeAsync;
    // @ts-ignore
    delete (global as any).spScanSilentBlockRange;
  });

  function loadInstalled() {
    // Force isInstalled=true by stubbing the native install before first import.
    jest.doMock('react-native', () => ({
      NativeModules: { RustJsiBridge: { install: () => true } },
      Platform: { select: () => '', OS: 'ios' },
    }));
    const mod = require(realModulePath);
    mod.initializeRustJsiBridge();
    return mod;
  }

  it('uses the async global when it exists', async () => {
    const mod = loadInstalled();
    const result = { matchedUtxos: [], transactionsScanned: 3, outputsScanned: 7 };
    const asyncFn = jest.fn().mockResolvedValue(JSON.stringify(result));
    // @ts-ignore
    (global as any).spScanSilentBlockRangeAsync = asyncFn;

    const buf = new Uint8Array([0, 1, 2]).buffer;
    const out = await mod.spScanSilentBlockRangeAsync('aa', 'bb', buf);

    expect(asyncFn).toHaveBeenCalledWith('aa', 'bb', buf);
    expect(out).toEqual(result);
  });

  it('falls back to the sync global when async is missing', async () => {
    const mod = loadInstalled();
    const result = { matchedUtxos: [], transactionsScanned: 1, outputsScanned: 1 };
    const syncFn = jest.fn().mockReturnValue(JSON.stringify(result));
    // @ts-ignore
    (global as any).spScanSilentBlockRange = syncFn;

    const buf = new Uint8Array([9]).buffer;
    const out = await mod.spScanSilentBlockRangeAsync('aa', 'bb', buf);

    expect(syncFn).toHaveBeenCalledWith('aa', 'bb', buf);
    expect(out).toEqual(result);
  });

  it('throws when Rust returns an error payload', async () => {
    const mod = loadInstalled();
    // @ts-ignore
    (global as any).spScanSilentBlockRangeAsync = jest.fn().mockResolvedValue(JSON.stringify({ error: 'boom' }));
    await expect(mod.spScanSilentBlockRangeAsync('aa', 'bb', new Uint8Array([0]).buffer)).rejects.toThrow('boom');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/rustScanAsync.test.ts`
Expected: FAIL — `mod.spScanSilentBlockRangeAsync is not a function`.

- [ ] **Step 3: Add the async wrapper to `modules/RustJsiBridge.ts`**

Extend the `RustJsiBridgeGlobal` interface (after the existing `spScanSilentBlockRange` line, ~line 50):

```typescript
  // Async (off-JS-thread) variant — resolves via the native CallInvoker.
  spScanSilentBlockRangeAsync?: (scanPrivkeyHex: string, spendPubkeyHex: string, framesBuffer: ArrayBuffer) => Promise<string>;
```

Add this exported function at the end of the file (after `spScanSilentBlockRange`):

```typescript
/**
 * Off-the-JS-thread variant of {@link spScanSilentBlockRange}. The native side copies
 * the inputs, runs the scan on a worker thread, and resolves via the CallInvoker, so
 * the JS thread stays free to render. Falls back to the synchronous global on older
 * native binaries that predate the async function.
 */
export async function spScanSilentBlockRangeAsync(
  scanPrivkeyHex: string,
  spendPubkeyHex: string,
  framesBuffer: ArrayBuffer,
): Promise<RustBatchScanResult> {
  if (!isInstalled) {
    throw new Error('RustJsiBridge not installed. Call initializeRustJsiBridge() first.');
  }

  const g = getGlobal();
  const resultJson: string =
    typeof g.spScanSilentBlockRangeAsync === 'function'
      ? await g.spScanSilentBlockRangeAsync(scanPrivkeyHex, spendPubkeyHex, framesBuffer)
      : g.spScanSilentBlockRange(scanPrivkeyHex, spendPubkeyHex, framesBuffer); // sync fallback (older binary)

  const result: RustBatchScanResult | RustErrorResult = JSON.parse(resultJson);
  if ('error' in result) {
    throw new Error(`Rust scan error: ${(result as RustErrorResult).error}`);
  }
  return result as RustBatchScanResult;
}
```

- [ ] **Step 4: Switch the processor to the async wrapper**

In `helpers/silent-payments/RustTransactionProcessor.ts`, update the import (line 6-11) to add `spScanSilentBlockRangeAsync`:

```typescript
import {
  spScanTransactions,
  spScanSingleTransaction,
  spScanSilentBlockRange,
  spScanSilentBlockRangeAsync,
  RustMatchedUTXO,
  RustBatchScanResult,
} from '../../modules/RustJsiBridge';
```

Replace the synchronous call in `processSilentBlockFrames` (lines 99-103):

```typescript
      // Off the JS thread: native copies the buffer, scans on a worker thread, resolves
      // via the CallInvoker. ponytail: falls back to sync global on older native binaries.
      const result: RustBatchScanResult = await spScanSilentBlockRangeAsync(
        this.scanPrivkeyHex,
        this.spendPubkeyHex,
        frames.buffer as ArrayBuffer,
      );
```

(`spScanSilentBlockRange` remains imported only if still referenced elsewhere; if the import becomes unused, remove `spScanSilentBlockRange` from the import list to satisfy lint.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest tests/unit/rustScanAsync.test.ts`
Expected: PASS (3 passing).

- [ ] **Step 6: Run the existing scan/wallet tests to confirm no regression**

Run: `npx jest tests/unit/silentPaymentIndexerScan.test.ts tests/unit/scannable-wallet.test.ts`
Expected: PASS (unchanged — they mock at the indexer level).

- [ ] **Step 7: Commit**

```bash
git add modules/RustJsiBridge.ts helpers/silent-payments/RustTransactionProcessor.ts tests/unit/rustScanAsync.test.ts
git commit -m "feat(scan): add async off-thread binary scan wrapper with sync fallback"
```

---

## Task 2: iOS — plumb CallInvoker and add the async host function

**Files:**
- Modify: `ios/RustJsiBridge/RustJsiBridge.h`
- Modify: `ios/RustJsiBridge/RustJsiBridge.cpp`
- Modify: `ios/RustJsiBridge/RustJsiBridgeModule.mm`

**Interfaces:**
- Consumes: existing Rust FFI `sp_scan_silent_block_range`, `free_rust_string`; RN `RCTCxxBridge.jsCallInvoker`.
- Produces: a `global.spScanSilentBlockRangeAsync(scanPriv, spendPub, framesBuffer)` host function returning a JS `Promise<string>`, resolved on the JS thread via the CallInvoker.

- [ ] **Step 1: Update the install signature in `ios/RustJsiBridge/RustJsiBridge.h`**

```cpp
#ifndef RUSTJSIBRIDGE_H
#define RUSTJSIBRIDGE_H

#include <jsi/jsi.h>
#include <ReactCommon/CallInvoker.h>
#include <memory>

using namespace facebook::jsi;

namespace rustjsibridge {
    void installJSIBindings(Runtime &jsiRuntime, std::shared_ptr<facebook::react::CallInvoker> callInvoker);
}

#endif /* RUSTJSIBRIDGE_H */
```

- [ ] **Step 2: Pass the CallInvoker from `ios/RustJsiBridge/RustJsiBridgeModule.mm`**

Replace the `install` body so it captures and forwards `jsCallInvoker`:

```objc
#import "RustJsiBridgeModule.h"
#import "RustJsiBridge.h"
#import <React/RCTBridge+Private.h>
#import <ReactCommon/CallInvoker.h>
#import <jsi/jsi.h>

using namespace facebook::jsi;

@implementation RustJsiBridgeModule

RCT_EXPORT_MODULE(RustJsiBridge)

+ (BOOL)requiresMainQueueSetup {
    return YES;
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(install) {
    RCTBridge* bridge = [RCTBridge currentBridge];
    RCTCxxBridge* cxxBridge = (RCTCxxBridge*)bridge;

    if (!cxxBridge.runtime) {
        return @false;
    }

    auto callInvoker = cxxBridge.jsCallInvoker;
    Runtime *jsiRuntime = (Runtime *)cxxBridge.runtime;

    rustjsibridge::installJSIBindings(*jsiRuntime, callInvoker);

    return @true;
}

@end
```

- [ ] **Step 3: Capture the CallInvoker and add the async host function in `ios/RustJsiBridge/RustJsiBridge.cpp`**

Add the include and a `<thread>`/`<vector>`/`<memory>` include near the top:

```cpp
#include "RustJsiBridge.h"
#include <string>
#include <thread>
#include <vector>
#include <memory>
#include <ReactCommon/CallInvoker.h>

using facebook::react::CallInvoker;
```

Change the function signature line to:

```cpp
void installJSIBindings(Runtime &jsiRuntime, std::shared_ptr<CallInvoker> callInvoker) {
```

Then, **inside** `installJSIBindings`, after the existing `spScanSilentBlockRange` is installed (after its `setProperty`, ~line 151), add:

```cpp
    // Async variant: copies inputs on the JS thread, runs the scan on a detached
    // worker thread, and resolves a JS Promise on the JS thread via the CallInvoker.
    auto spScanSilentBlockRangeAsync = Function::createFromHostFunction(
        jsiRuntime,
        PropNameID::forAscii(jsiRuntime, "spScanSilentBlockRangeAsync"),
        3,
        [callInvoker](Runtime &runtime,
                      const Value &thisValue,
                      const Value *arguments,
                      size_t count) -> Value {

            if (count < 3) {
                throw JSError(runtime, "spScanSilentBlockRangeAsync() expects 3 arguments");
            }

            // --- copy everything off the JSI objects on the JS thread ---
            auto scanPrivkeyHex = std::make_shared<std::string>(arguments[0].asString(runtime).utf8(runtime));
            auto spendPubkeyHex = std::make_shared<std::string>(arguments[1].asString(runtime).utf8(runtime));

            if (!arguments[2].isObject() || !arguments[2].asObject(runtime).isArrayBuffer(runtime)) {
                throw JSError(runtime, "spScanSilentBlockRangeAsync() arg 3 must be an ArrayBuffer");
            }
            auto arrayBuffer = arguments[2].asObject(runtime).getArrayBuffer(runtime);
            auto frames = std::make_shared<std::vector<uint8_t>>(
                arrayBuffer.data(runtime),
                arrayBuffer.data(runtime) + arrayBuffer.size(runtime));

            // --- build the Promise ---
            auto promiseCtor = runtime.global().getPropertyAsFunction(runtime, "Promise");
            auto executor = Function::createFromHostFunction(
                runtime,
                PropNameID::forAscii(runtime, "executor"),
                2,
                [callInvoker, scanPrivkeyHex, spendPubkeyHex, frames](
                    Runtime &rt, const Value &, const Value *execArgs, size_t) -> Value {

                    auto resolve = std::make_shared<Value>(rt, execArgs[0]);
                    auto reject = std::make_shared<Value>(rt, execArgs[1]);
                    // Capture the Runtime by pointer (its address is stable for the app
                    // lifetime), NOT by reference to `rt` — `rt` is a stack-bound reference
                    // parameter that dies when this executor returns, before the detached
                    // thread and its invokeAsync callback dereference it.
                    Runtime *rtPtr = &rt;

                    std::thread([callInvoker, scanPrivkeyHex, spendPubkeyHex, frames, resolve, reject, rtPtr]() {
                        const char* result = sp_scan_silent_block_range(
                            scanPrivkeyHex->c_str(),
                            spendPubkeyHex->c_str(),
                            frames->data(),
                            frames->size());

                        if (!result) {
                            callInvoker->invokeAsync([reject, rtPtr]() {
                                Runtime &rt = *rtPtr;
                                reject->asObject(rt).asFunction(rt).call(
                                    rt, String::createFromUtf8(rt, "sp_scan_silent_block_range returned null"));
                            });
                            return;
                        }

                        auto resultStr = std::make_shared<std::string>(result);
                        free_rust_string(const_cast<char*>(result));

                        callInvoker->invokeAsync([resultStr, resolve, rtPtr]() {
                            Runtime &rt = *rtPtr;
                            resolve->asObject(rt).asFunction(rt).call(
                                rt, String::createFromUtf8(rt, *resultStr));
                        });
                    }).detach();

                    return Value::undefined();
                });

            return promiseCtor.callAsConstructor(runtime, executor);
        });

    jsiRuntime.global().setProperty(
        jsiRuntime,
        "spScanSilentBlockRangeAsync",
        std::move(spScanSilentBlockRangeAsync));
```

> Note: the worker thread captures `Runtime *rtPtr` (the Runtime object outlives the app; its address is stable), NOT `Runtime &rt` — `rt` is a reference parameter whose stack slot is gone once the executor returns, so capturing `&rt` into the detached thread is a dangling reference (UB). `invokeAsync` runs the resolve/reject on the JS thread where the Runtime is valid. The null-result branch guards against `std::string(nullptr)` UB; the existing Rust FFI returns error JSON rather than null, but the guard costs nothing.

- [ ] **Step 4: Build the iOS app**

Run:
```bash
cd ios && pod install && cd ..
npx react-native run-ios
```
Expected: Compiles and links with no errors; app launches. The bridge installs (existing log: `✅ Rust JSI Bridge installed successfully`).

- [ ] **Step 5: Device/sim smoke — fallback path no longer freezes**

Trigger an HTTP-fallback scan (point the wallet at an indexer build without WS `sync`, or temporarily force the fallback). While a large range scans, scroll the wallet list and confirm the UI stays responsive and the progress bar advances. Confirm balances/matches are unchanged from before.
Expected: UI interactive throughout; scan results identical.

- [ ] **Step 6: Commit**

```bash
git add ios/RustJsiBridge/RustJsiBridge.h ios/RustJsiBridge/RustJsiBridge.cpp ios/RustJsiBridge/RustJsiBridgeModule.mm
git commit -m "feat(ios): off-thread async silent-block scan via CallInvoker"
```

---

## Task 3: Android — plumb CallInvoker and add the async host function

**Files:**
- Modify: `android/app/src/main/java/org/bitshala/shroud/RustJsiBridgeModule.java`
- Modify: `android/app/src/main/cpp/rust-jsi-bridge-jni.cpp`
- Modify: `android/app/src/main/cpp/RustJsiBridge.h`
- Modify: `android/app/src/main/cpp/RustJsiBridge.cpp`
- Modify: `android/CMakeLists.txt`

**Interfaces:**
- Consumes: `CallInvokerHolderImpl` from `reactContext.getCatalystInstance().getJSCallInvokerHolder()`; the same Rust FFI.
- Produces: the same `global.spScanSilentBlockRangeAsync` host function on Android.

- [ ] **Step 1: Pass the CallInvoker holder from Java**

Replace `android/app/src/main/java/org/bitshala/shroud/RustJsiBridgeModule.java`:

```java
package org.bitshala.shroud;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.module.annotations.ReactModule;
import com.facebook.react.turbomodule.core.CallInvokerHolderImpl;

@ReactModule(name = RustJsiBridgeModule.NAME)
public class RustJsiBridgeModule extends ReactContextBaseJavaModule {
    public static final String NAME = "RustJsiBridge";

    public RustJsiBridgeModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return NAME;
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    public boolean install() {
        try {
            System.loadLibrary("rust-jsi-bridge");
            ReactApplicationContext ctx = getReactApplicationContext();
            CallInvokerHolderImpl callInvokerHolder =
                (CallInvokerHolderImpl) ctx.getCatalystInstance().getJSCallInvokerHolder();
            nativeInstall(ctx.getJavaScriptContextHolder().get(), callInvokerHolder);
            return true;
        } catch (Exception exception) {
            return false;
        }
    }

    private native void nativeInstall(long jsiPtr, CallInvokerHolderImpl callInvokerHolder);
}
```

- [ ] **Step 2: Update the install signature in `android/app/src/main/cpp/RustJsiBridge.h`**

```cpp
#ifndef RUSTJSIBRIDGE_H
#define RUSTJSIBRIDGE_H

#include <jsi/jsi.h>
#include <ReactCommon/CallInvoker.h>
#include <memory>

using namespace facebook::jsi;

namespace rustjsibridge {
    void installJSIBindings(Runtime &jsiRuntime, std::shared_ptr<facebook::react::CallInvoker> callInvoker);
}

#endif /* RUSTJSIBRIDGE_H */
```

- [ ] **Step 3: Unwrap the holder in `android/app/src/main/cpp/rust-jsi-bridge-jni.cpp`**

```cpp
#include <jni.h>
#include <jsi/jsi.h>
#include <memory>
#include <ReactCommon/CallInvokerHolder.h>
#include <fbjni/fbjni.h>
#include "RustJsiBridge.h"

using namespace facebook::jsi;
using namespace facebook;

extern "C" JNIEXPORT void JNICALL
Java_org_bitshala_shroud_RustJsiBridgeModule_nativeInstall(
    JNIEnv *env,
    jobject thiz,
    jlong jsiRuntimePtr,
    jobject callInvokerHolderJobj
) {
    Runtime *jsiRuntime = reinterpret_cast<Runtime *>(jsiRuntimePtr);
    if (!jsiRuntime) {
        return;
    }

    auto holder = jni::alias_ref<react::CallInvokerHolder::javaobject>{
        reinterpret_cast<react::CallInvokerHolder::javaobject>(callInvokerHolderJobj)};
    std::shared_ptr<react::CallInvoker> callInvoker = holder->cthis()->getCallInvoker();

    rustjsibridge::installJSIBindings(*jsiRuntime, callInvoker);
}
```

- [ ] **Step 4: Mirror the async host function into `android/app/src/main/cpp/RustJsiBridge.cpp`**

Apply the **exact same** include additions, signature change, and async-host-function block from Task 2 Step 3 to the Android copy of `RustJsiBridge.cpp`. (The two files are duplicates; the binding code is identical.)

- [ ] **Step 5: Confirm CMake links the call-invoker symbols in `android/CMakeLists.txt`**

`ReactAndroid::reactnative` (already linked, line 40) is the RN 0.76+ consolidated target that includes `callinvoker` and `react_nativemodule_core`. No new link target is required. Add `fbjni::fbjni` is already present (line 41). If the link step reports undefined `react::CallInvokerHolder` symbols, add `ReactAndroid::jsi` is present; also add `ReactAndroid::react_nativemodule_core` to `target_link_libraries` and re-run.

- [ ] **Step 6: Build the Android app**

Run:
```bash
npx react-native run-android
```
Expected: CMake configures, `.so` links, app launches; bridge installs (`✅ Rust JSI Bridge installed successfully`).

- [ ] **Step 7: Device/emulator smoke — fallback path no longer freezes**

Same as Task 2 Step 5, on Android. Validate on an **`armv7`/32-bit** device or emulator image as well if available (the historically fragile ABI).
Expected: UI interactive throughout the fallback scan; results identical.

- [ ] **Step 8: Commit**

```bash
git add android/app/src/main/java/org/bitshala/shroud/RustJsiBridgeModule.java \
        android/app/src/main/cpp/rust-jsi-bridge-jni.cpp \
        android/app/src/main/cpp/RustJsiBridge.h \
        android/app/src/main/cpp/RustJsiBridge.cpp \
        android/CMakeLists.txt
git commit -m "feat(android): off-thread async silent-block scan via CallInvoker"
```

---

## Task 4: Cross-platform verification gate

**Files:** none (verification only).

- [ ] **Step 1: Full unit suite**

Run: `npx jest tests/unit`
Expected: PASS (including the new `rustScanAsync.test.ts`).

- [ ] **Step 2: Documented manual matrix**

Confirm and record (in the PR description) for **both** iOS and Android:
- Fallback scan over a large range keeps the UI responsive (scroll + animations during scan).
- Progress advances during the scan, not just at the end.
- Matched UTXOs and final balance match a pre-change baseline scan of the same wallet/range.
- Cancel during a fallback scan still stops it cleanly.

Expected: all four hold on both platforms.

- [ ] **Step 3: No commit** (verification only). Open the PR.

---

## Phase 1 self-review

- **CallInvoker plumbed (iOS + Android):** Tasks 2–3. ✓
- **Async off-thread binary scan:** Tasks 1–3. ✓
- **Fallback no longer freezes:** Tasks 2/3 Step 5, Task 4 Step 2. ✓
- **Sync fallback for older binaries (safe JS-first landing):** Task 1 Step 3. ✓
- **No Rust changes:** honored — only C++/JNI/Java/TS touched. ✓
- **Type consistency:** `spScanSilentBlockRangeAsync(scanPrivkeyHex, spendPubkeyHex, framesBuffer) → Promise<RustBatchScanResult>` used identically in TS wrapper, processor, and test; native global name `spScanSilentBlockRangeAsync` matches the TS lookup. ✓

---

## Out of scope — Phases 2–4 (each its own plan, authored after Phase 1)

These are deliberately **not** expanded into bite-sized steps here: their exact commands depend on the cross-compile/TLS toolchain that **Phase 1 proves** (CallInvoker working on-device on both platforms). Writing exact `ring` / `cargo-ndk` / `cargo-lipo` / Xcode-link commands before that would be guesswork and would violate the no-placeholder rule. Author each as its own `docs/superpowers/plans/` file once Phase 1 lands.

- **Phase 2 — Rust WS engine behind a flag.** Add `tokio` + `tokio-tungstenite` + `rustls` (`ring` backend) + `webpki-roots` to `rust_jsi_bridge`; implement the async session (state machine, bounded channel, `spawn_blocking` scan, throttled progress emit, heartbeat/timeouts, pause/resume/cancel); expose `sp_scan_start/pause/resume/cancel` FFI + an `emit_cb`; add `spScanStart/Pause/Resume/Cancel` host functions that bridge events to a JS `onEvent` via the CallInvoker from Phase 1; gate the JS path on a `useRustOwnedStream` flag. Validate the `armv7`/`ring` build and the first `wss://`-through-tunnel device handshake first.
- **Phase 3 — Flip the flag on.** Re-target `hd-bip352-wallet.performScan` from `streamForwardWithCallback`'s JS loop to the native engine's event stream: `progress` → `setScanState` + in-memory `lastScannedBlock` advance + **throttled** persist (≈3 s / N blocks, guaranteed flush on done/pause/cancel/background); `match` → `resolveMatchMetadata` + `commitUTXOs`; `error{unsupported|socket}` → existing HTTP fallback. JS + Rust unit tests for the event bridge and persistence throttle.
- **Phase 4 — Delete `modules/SilentBlockStreamClient.ts`** (the JS WS loop) and remove the flag once the engine is proven in production.
