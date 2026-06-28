#import "RustJsiBridgeModule.h"
#import "RustJsiBridge.h"
#import <React/RCTBridge+Private.h>
#import <ReactCommon/CallInvoker.h>
#import <jsi/jsi.h>

using namespace facebook::jsi;

@implementation RustJsiBridgeModule

RCT_EXPORT_MODULE(RustJsiBridge)

// Ensure JSI functions installed on main thread
+ (BOOL)requiresMainQueueSetup {
    return YES;
}

// Synchronous installation of JSI functions
RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(install) {
    RCTBridge* bridge = [RCTBridge currentBridge];
    RCTCxxBridge* cxxBridge = (RCTCxxBridge*)bridge;

    if (!cxxBridge.runtime) {
        return @false;
    }

    // jsCallInvoker hops work back onto the JS thread from the Rust worker/engine
    // threads (used by spScanSilentBlockRangeAsync and the streaming scan engine).
    auto callInvoker = cxxBridge.jsCallInvoker;
    Runtime *jsiRuntime = (Runtime *)cxxBridge.runtime;

    rustjsibridge::installJSIBindings(*jsiRuntime, callInvoker);

    return @true;
}

@end
