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
