#include "RustJsiBridge.h"
#include <string>

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
}

namespace rustjsibridge {

void installJSIBindings(Runtime &jsiRuntime) {
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
}

} // namespace rustjsibridge
