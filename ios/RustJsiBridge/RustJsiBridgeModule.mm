#import "RustJsiBridgeModule.h"
#import "RustJsiBridge.h"
#import <React/RCTBridge+Private.h>
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
    
    Runtime *jsiRuntime = (Runtime *)cxxBridge.runtime;
    
    rustjsibridge::installJSIBindings(*jsiRuntime);
    
    return @true;
}

@end
