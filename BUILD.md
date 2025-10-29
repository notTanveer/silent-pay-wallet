# Build Instructions for Shroud Wallet (Android)

### Prerequisites
- React Native CLI and dependencies are installed.

- ANDROID_HOME environment variable is set correctly.

- Android SDK and platform tools are installed at $HOME/Android/Sdk.

## Steps to Build

### Set up Android Environment Variables

For Linux :
``` bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools:$ANDROID_HOME/tools/bin:$PATH
```

For Mac :
``` bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools:$PATH
```

Verify ANDROID_HOME is set:
``` bash
echo $ANDROID_HOME
```

###  Generate JavaScript Bundle
``` bash
npx react-native bundle \
  --platform android \
  --dev false \
  --entry-file index.js \
  --bundle-output android/app/src/main/assets/index.android.bundle
```

### Build the Debug APK
``` bash
npm run e2e:debug-build
```

### Find your APK at
```
android/app/build/outputs/apk/debug/app-debug.apk
```