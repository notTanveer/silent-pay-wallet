#include "RustJsiBridge.h"
#include <string>
#include <thread>
#include <vector>
#include <memory>
#include <ReactCommon/CallInvoker.h>

using facebook::react::CallInvoker;

// External Rust function declarations
extern "C" {
    void free_rust_string(char* ptr);

    const char* sp_scan_transactions(
        const char* scan_privkey_hex,
        const char* spend_pubkey_hex,
        const char* transactions_json
    );

    const char* sp_scan_single_transaction(
        const char* scan_privkey_hex,
        const char* spend_pubkey_hex,
        const char* transaction_json
    );

    // Raw-bytes path: no base64 on either side of the bridge.
    const char* sp_scan_silent_block_range(
        const char* scan_privkey_hex,
        const char* spend_pubkey_hex,
        const uint8_t* frames_ptr,
        size_t frames_len
    );

    // Streaming async scan engine (Task 4 FFI).
    typedef void (*EmitCallback)(void* ctx, const uint8_t* json_ptr, size_t json_len);
    const char* sp_scan_start(const char* config_json, EmitCallback emit_cb, void* ctx);
    void sp_scan_pause();
    void sp_scan_resume();
    void sp_scan_cancel();
}

namespace rustjsibridge {

// --- EventCtx: holds the JS callback and invoker for the streaming scan engine ---

struct EventCtx : std::enable_shared_from_this<EventCtx> {
    std::shared_ptr<CallInvoker> callInvoker;
    std::shared_ptr<Function> onEvent;
    Runtime* rt; // stable for app lifetime; captured by pointer, NOT by ref
    EventCtx(std::shared_ptr<CallInvoker> ci, std::shared_ptr<Function> oe, Runtime* r)
        : callInvoker(std::move(ci)), onEvent(std::move(oe)), rt(r) {}
};

// ponytail: single-session static — one active scan at a time per process.
// Per-runtime map would be needed if multiple runtimes ever coexist.
static std::shared_ptr<EventCtx> gEventCtx;

// Non-capturing C trampoline: hops the emit to the JS thread via callInvoker.
// Captures json by value (shared_ptr<string>) so the Rust buffer can be freed
// before invokeAsync runs. Captures a shared_ptr to the EventCtx (via
// shared_from_this) so a still-queued event lambda keeps the EventCtx alive even
// if gEventCtx.reset() runs first (cancel/restart) — without this, the reset would
// free the EventCtx out from under a pending callback (use-after-free).
static void sp_emit_trampoline(void* ctx, const uint8_t* json_ptr, size_t json_len) {
    auto ec = static_cast<EventCtx*>(ctx)->shared_from_this();
    auto json = std::make_shared<std::string>(reinterpret_cast<const char*>(json_ptr), json_len);
    ec->callInvoker->invokeAsync([ec, json]() {
        Runtime& rt = *ec->rt; // dereference stable Runtime* inside the lambda
        ec->onEvent->call(rt, String::createFromUtf8(rt, *json));
    });
}

// ---------------------------------------------------------------------------------

void installJSIBindings(Runtime &jsiRuntime, std::shared_ptr<CallInvoker> callInvoker) {
    auto spScanTransactions = Function::createFromHostFunction(
        jsiRuntime,
        PropNameID::forAscii(jsiRuntime, "spScanTransactions"),
        3,
        [](Runtime &runtime,
           const Value &thisValue,
           const Value *arguments,
           size_t count) -> Value {
            
            if (count < 3) {
                throw JSError(runtime, "spScanTransactions() expects 3 arguments: scanPrivkeyHex, spendPubkeyHex, transactionsJson");
            }
            
            std::string scanPrivkeyHex = arguments[0].asString(runtime).utf8(runtime);
            std::string spendPubkeyHex = arguments[1].asString(runtime).utf8(runtime);
            std::string transactionsJson = arguments[2].asString(runtime).utf8(runtime);
            
            const char* result = sp_scan_transactions(
                scanPrivkeyHex.c_str(),
                spendPubkeyHex.c_str(),
                transactionsJson.c_str()
            );
            
            std::string resultStr(result);
            free_rust_string(const_cast<char*>(result));
            
            return String::createFromUtf8(runtime, resultStr);
        }
    );
    
    jsiRuntime.global().setProperty(
        jsiRuntime,
        "spScanTransactions",
        std::move(spScanTransactions)
    );
    
    auto spScanSingleTransaction = Function::createFromHostFunction(
        jsiRuntime,
        PropNameID::forAscii(jsiRuntime, "spScanSingleTransaction"),
        3,
        [](Runtime &runtime,
           const Value &thisValue,
           const Value *arguments,
           size_t count) -> Value {
            
            if (count < 3) {
                throw JSError(runtime, "spScanSingleTransaction() expects 3 arguments: scanPrivkeyHex, spendPubkeyHex, transactionJson");
            }
            
            std::string scanPrivkeyHex = arguments[0].asString(runtime).utf8(runtime);
            std::string spendPubkeyHex = arguments[1].asString(runtime).utf8(runtime);
            std::string transactionJson = arguments[2].asString(runtime).utf8(runtime);
            
            const char* result = sp_scan_single_transaction(
                scanPrivkeyHex.c_str(),
                spendPubkeyHex.c_str(),
                transactionJson.c_str()
            );
            
            std::string resultStr(result);
            free_rust_string(const_cast<char*>(result));
            
            return String::createFromUtf8(runtime, resultStr);
        }
    );
    
    jsiRuntime.global().setProperty(
        jsiRuntime,
        "spScanSingleTransaction",
        std::move(spScanSingleTransaction)
    );

    // spScanSilentBlockRange: accepts an ArrayBuffer directly — no base64.
    // JS signature: spScanSilentBlockRange(scanPrivkeyHex, spendPubkeyHex, framesBuffer)
    auto spScanSilentBlockRange = Function::createFromHostFunction(
        jsiRuntime,
        PropNameID::forAscii(jsiRuntime, "spScanSilentBlockRange"),
        3,
        [](Runtime &runtime,
           const Value &thisValue,
           const Value *arguments,
           size_t count) -> Value {

            if (count < 3) {
                throw JSError(runtime, "spScanSilentBlockRange() expects 3 arguments: scanPrivkeyHex, spendPubkeyHex, framesBuffer");
            }

            std::string scanPrivkeyHex = arguments[0].asString(runtime).utf8(runtime);
            std::string spendPubkeyHex = arguments[1].asString(runtime).utf8(runtime);

            if (!arguments[2].isObject()) {
                throw JSError(runtime, "spScanSilentBlockRange() arg 3 must be an ArrayBuffer");
            }
            auto obj = arguments[2].asObject(runtime);
            if (!obj.isArrayBuffer(runtime)) {
                throw JSError(runtime, "spScanSilentBlockRange() arg 3 must be an ArrayBuffer");
            }
            auto arrayBuffer = obj.getArrayBuffer(runtime);
            const uint8_t* framesPtr = arrayBuffer.data(runtime);
            size_t framesLen = arrayBuffer.size(runtime);

            const char* result = sp_scan_silent_block_range(
                scanPrivkeyHex.c_str(),
                spendPubkeyHex.c_str(),
                framesPtr,
                framesLen
            );

            std::string resultStr(result);
            free_rust_string(const_cast<char*>(result));

            return String::createFromUtf8(runtime, resultStr);
        }
    );

    jsiRuntime.global().setProperty(
        jsiRuntime,
        "spScanSilentBlockRange",
        std::move(spScanSilentBlockRange)
    );

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
                    // Capture the Runtime by pointer (stable for the app lifetime), NOT by
                    // reference to `rt` — `rt` is a stack-bound reference parameter that dies
                    // when this executor returns, before the detached thread dereferences it.
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

    // --- Streaming scan engine host functions ---

    // spScanStart(configJson: string, onEvent: (eventJson: string) => void)
    // Starts the Rust scan engine. The onEvent callback is retained in gEventCtx
    // for the session lifetime. spScanStart resets gEventCtx (freeing the previous
    // session's EventCtx) before starting — safe because Rust guarantees no emits
    // after a terminal done/error event or after sp_scan_cancel returns.
    auto spScanStart = Function::createFromHostFunction(
        jsiRuntime,
        PropNameID::forAscii(jsiRuntime, "spScanStart"),
        2,
        [callInvoker](Runtime &runtime,
                      const Value &,
                      const Value *args,
                      size_t count) -> Value {
            if (count < 2) {
                throw JSError(runtime, "spScanStart() expects (configJson, onEvent)");
            }
            std::string configJson = args[0].asString(runtime).utf8(runtime);
            auto onEvent = std::make_shared<Function>(args[1].asObject(runtime).asFunction(runtime));

            // ponytail: reset-then-check — old session EventCtx freed here;
            // safe because Rust guarantees no emits after terminal/cancel.
            gEventCtx = std::make_shared<EventCtx>(callInvoker, onEvent, &runtime);

            const char* res = sp_scan_start(configJson.c_str(), &sp_emit_trampoline, gEventCtx.get());
            std::string r(res);
            free_rust_string(const_cast<char*>(res));

            if (r.rfind("error", 0) == 0) {
                // Rust returned error — no worker was started, no pending emits — free ctx.
                gEventCtx.reset();
                throw JSError(runtime, r.c_str());
            }
            return Value::undefined();
        });
    jsiRuntime.global().setProperty(jsiRuntime, "spScanStart", std::move(spScanStart));

    auto spScanPause = Function::createFromHostFunction(
        jsiRuntime,
        PropNameID::forAscii(jsiRuntime, "spScanPause"),
        0,
        [](Runtime &, const Value &, const Value *, size_t) -> Value {
            sp_scan_pause();
            return Value::undefined();
        });
    jsiRuntime.global().setProperty(jsiRuntime, "spScanPause", std::move(spScanPause));

    auto spScanResume = Function::createFromHostFunction(
        jsiRuntime,
        PropNameID::forAscii(jsiRuntime, "spScanResume"),
        0,
        [](Runtime &, const Value &, const Value *, size_t) -> Value {
            sp_scan_resume();
            return Value::undefined();
        });
    jsiRuntime.global().setProperty(jsiRuntime, "spScanResume", std::move(spScanResume));

    auto spScanCancel = Function::createFromHostFunction(
        jsiRuntime,
        PropNameID::forAscii(jsiRuntime, "spScanCancel"),
        0,
        [](Runtime &, const Value &, const Value *, size_t) -> Value {
            sp_scan_cancel();
            // Rust joins the worker before returning from sp_scan_cancel, so no
            // emits are in flight after this point — safe to free the EventCtx.
            gEventCtx.reset();
            return Value::undefined();
        });
    jsiRuntime.global().setProperty(jsiRuntime, "spScanCancel", std::move(spScanCancel));
}

} // namespace rustjsibridge
