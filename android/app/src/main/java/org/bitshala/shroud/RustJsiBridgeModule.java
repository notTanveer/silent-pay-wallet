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
            nativeInstall(getReactApplicationContext().getJavaScriptContextHolder().get());
            return true;
        } catch (Exception exception) {
            return false;
        }
    }

    private native void nativeInstall(long jsiPtr);
}
