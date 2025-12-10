#include "RustJsiBridge.h"
#include <string>

// External Rust function declarations
extern "C" {
    const char* hello_from_rust();
    void free_rust_string(char* ptr);
    double rust_multiply(double a, double b);
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
}

} // namespace rustjsibridge

