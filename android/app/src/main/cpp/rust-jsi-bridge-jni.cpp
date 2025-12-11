#include <jni.h>
#include <jsi/jsi.h>
#include "RustJsiBridge.h"

using namespace facebook::jsi;

extern "C" JNIEXPORT void JNICALL
Java_org_bitshala_shroud_RustJsiBridgeModule_nativeInstall(
    JNIEnv *env,
    jobject thiz,
    jlong jsiRuntimePtr
) {
    Runtime *jsiRuntime = reinterpret_cast<Runtime *>(jsiRuntimePtr);
    
    if (jsiRuntime) {
        rustjsibridge::installJSIBindings(*jsiRuntime);
    }
}

