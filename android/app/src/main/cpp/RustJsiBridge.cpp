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

    const char* sp_scan_silent_block_range(
        const char* scan_privkey_hex,
        const char* spend_pubkey_hex,
        const char* frames_base64
    );
}

namespace rustjsibridge {

void installJSIBindings(Runtime &jsiRuntime) {
    auto spScanTransactions = Function::createFromHostFunction(
        jsiRuntime,
        PropNameID::forAscii(jsiRuntime, "spScanTransactions"),
        3, // scan_privkey_hex, spend_pubkey_hex, transactions_json
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
        3, // scan_privkey_hex, spend_pubkey_hex, transaction_json
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

    auto spScanSilentBlockRange = Function::createFromHostFunction(
        jsiRuntime,
        PropNameID::forAscii(jsiRuntime, "spScanSilentBlockRange"),
        3, // scan_privkey_hex, spend_pubkey_hex, frames_base64
        [](Runtime &runtime,
           const Value &thisValue,
           const Value *arguments,
           size_t count) -> Value {

            if (count < 3) {
                throw JSError(runtime, "spScanSilentBlockRange() expects 3 arguments: scanPrivkeyHex, spendPubkeyHex, framesBase64");
            }

            std::string scanPrivkeyHex = arguments[0].asString(runtime).utf8(runtime);
            std::string spendPubkeyHex = arguments[1].asString(runtime).utf8(runtime);
            std::string framesBase64 = arguments[2].asString(runtime).utf8(runtime);

            const char* result = sp_scan_silent_block_range(
                scanPrivkeyHex.c_str(),
                spendPubkeyHex.c_str(),
                framesBase64.c_str()
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
