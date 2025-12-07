cmake_minimum_required(VERSION 3.13)
project(rust-jsi-bridge)

set(CMAKE_VERBOSE_MAKEFILE ON)
set(CMAKE_CXX_STANDARD 17)

# Source files
add_library(
    rust-jsi-bridge
    SHARED
    app/src/main/cpp/RustJsiBridge.cpp
    app/src/main/cpp/rust-jsi-bridge-jni.cpp
)

# Include directories
target_include_directories(
    rust-jsi-bridge
    PRIVATE
    app/src/main/cpp
)

# Find React Native packages (prefab)
find_package(ReactAndroid REQUIRED CONFIG)
find_package(fbjni REQUIRED CONFIG)

# Import Rust static library
add_library(rust_jsi_bridge_static STATIC IMPORTED)
set_target_properties(
    rust_jsi_bridge_static
    PROPERTIES IMPORTED_LOCATION
    ${CMAKE_SOURCE_DIR}/app/src/main/jniLibs/${ANDROID_ABI}/librust_jsi_bridge.a
)

# Link libraries
# Note: React Native 0.76+ uses ReactAndroid::reactnative (consolidated target)
# instead of the old ReactAndroid::react_nativejni
target_link_libraries(
    rust-jsi-bridge
    ReactAndroid::jsi
    ReactAndroid::reactnative
    fbjni::fbjni
    rust_jsi_bridge_static
    android
    log
)
