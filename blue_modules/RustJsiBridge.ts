import { NativeModules, Platform } from 'react-native';

const LINKING_ERROR =
  `The 'RustJsiBridge' module is not properly linked. ` +
  `Please ensure you've rebuilt the app after adding the native module.\n\n` +
  Platform.select({
    ios: "- Run 'cd ios && pod install && cd ..'\n",
    android: "- Ensure CMakeLists.txt is properly configured\n",
    default: ''
  }) +
  `- Rebuild the app (npx react-native run-ios or run-android)`;

const RustJsiBridgeModule = NativeModules.RustJsiBridge
  ? NativeModules.RustJsiBridge
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      }
    );

// Type definitions for global JSI functions
interface RustJsiBridgeGlobal {
  helloFromRust: () => string;
  multiplyFromRust: (a: number, b: number) => number;
}

// Initialize JSI bindings
let isInstalled = false;

export function initializeRustJsiBridge(): boolean {
  if (isInstalled) {
    return true;
  }
  
  try {
    const result = RustJsiBridgeModule.install();
    if (result) {
      isInstalled = true;
      console.log('✅ Rust JSI Bridge installed successfully');
    }
    return result;
  } catch (error) {
    console.error('❌ Failed to install Rust JSI Bridge:', error);
    return false;
  }
}

// Type-safe wrappers for JSI functions
const getGlobal = (): RustJsiBridgeGlobal => {
  return global as any as RustJsiBridgeGlobal;
};

export function helloFromRust(): string {
  if (!isInstalled) {
    throw new Error('RustJsiBridge not installed. Call initializeRustJsiBridge() first.');
  }
  return getGlobal().helloFromRust();
}

export function multiplyFromRust(a: number, b: number): number {
  if (!isInstalled) {
    throw new Error('RustJsiBridge not installed. Call initializeRustJsiBridge() first.');
  }
  return getGlobal().multiplyFromRust(a, b);
}

// Export module for advanced use cases
export { RustJsiBridgeModule };
