#include "RustJsiBridge.h"
#include <string>

// External Rust function declarations
extern "C" {
    const char* hello_from_rust();
    void free_rust_string(char* ptr);
    double rust_multiply(double a, double b);
    
    // Silent Payment transaction scanning
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
}

namespace rustjsibridge {

void installJSIBindings(Runtime &jsiRuntime) {
    // Install helloFromRust() JSI function
    auto helloFromRust = Function::createFromHostFunction(
        jsiRuntime,
        PropNameID::forAscii(jsiRuntime, "helloFromRust"),
        0, // no arguments
        [](Runtime &runtime,
           const Value &thisValue,
           const Value *arguments,
           size_t count) -> Value {
            
            const char* rustMessage = hello_from_rust();
            std::string message(rustMessage);
            free_rust_string(const_cast<char*>(rustMessage));
            
            return String::createFromUtf8(runtime, message);
        }
    );
    
    jsiRuntime.global().setProperty(
        jsiRuntime,
        "helloFromRust",
        std::move(helloFromRust)
    );
    
    // Install multiply() JSI function as example
    auto multiply = Function::createFromHostFunction(
        jsiRuntime,
        PropNameID::forAscii(jsiRuntime, "multiplyFromRust"),
        2, // two arguments
        [](Runtime &runtime,
           const Value &thisValue,
           const Value *arguments,
           size_t count) -> Value {
            
            if (count < 2) {
                throw JSError(runtime, "multiplyFromRust() expects 2 arguments");
            }
            
            double a = arguments[0].asNumber();
            double b = arguments[1].asNumber();
            double result = rust_multiply(a, b);
            
            return Value(result);
        }
    );
    
    jsiRuntime.global().setProperty(
        jsiRuntime,
        "multiplyFromRust",
        std::move(multiply)
    );
    
    // Install spScanTransactions() - batch transaction scanning with parallel processing
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
    
    // Install spScanSingleTransaction() - scan a single transaction
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
}

} // namespace rustjsibridge