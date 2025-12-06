#ifndef RUSTJSIBRIDGE_H
#define RUSTJSIBRIDGE_H

#include <jsi/jsi.h>

using namespace facebook::jsi;

namespace rustjsibridge {
    void installJSIBindings(Runtime &jsiRuntime);
}

#endif /* RUSTJSIBRIDGE_H */
