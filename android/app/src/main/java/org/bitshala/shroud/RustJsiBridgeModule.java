package org.bitshala.shroud;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.module.annotations.ReactModule;

@ReactModule(name = RustJsiBridgeModule.NAME)
public class RustJsiBridgeModule extends ReactContextBaseJavaModule {
    public static final String NAME = "RustJsiBridge";

    public RustJsiBridgeModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return NAME;
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    public boolean install() {
        try {
            System.loadLibrary("rust-jsi-bridge");

            // Hermes/JSI required: if pointer is 0, we're running JSC or remote debug
            long jsiPtr = getReactApplicationContext().getJavaScriptContextHolder().get();
            if (jsiPtr == 0) {
                // Avoid false "installed" state when JSI runtime is unavailable
                android.util.Log.e(NAME, "JSI runtime pointer is 0. Enable Hermes and disable Remote Debugging.");
                return false;
            }

            nativeInstall(jsiPtr);
            return true;
        } catch (Exception exception) {
            android.util.Log.e(NAME, "Failed to install Rust JSI Bridge", exception);
            return false;
        }
    }

    private native void nativeInstall(long jsiPtr);
}
