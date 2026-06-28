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
