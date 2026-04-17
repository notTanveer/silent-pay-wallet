require "json"

package = JSON.parse(File.read(File.join(__dir__, "../package.json")))

Pod::Spec.new do |s|
  s.name         = "RustJsiBridge"
  s.version      = package["version"]
  s.summary      = "Rust JSI bridge for silent-pay-wallet"
  s.homepage     = "https://github.com/Bitshala-Incubator/silent-pay-wallet"
  s.license      = package["license"] || "MIT"
  s.authors      = { "bitshala" => "dev@bitshala.org" }
  
  s.platforms    = { :ios => "13.0" }
  s.source       = { :git => ".git", :tag => "#{s.version}" }
  
  s.source_files = "RustJsiBridge/**/*.{h,m,mm,cpp}"
  s.public_header_files = "RustJsiBridge/**/*.h"
  
  # Link Rust static libraries
  s.vendored_frameworks = "rust_jsi_bridge/ios/RustJsiBridge.xcframework"
  # OR if using fat binaries:
  # s.vendored_libraries = "rust_jsi_bridge/ios/librust_jsi_bridge_device.a",
  #                        "rust_jsi_bridge/ios/librust_jsi_bridge_sim.a"
  
  s.dependency "React-Core"
  
  # install_modules_dependencies(s) # This helper is usually for Podfile, not podspec.
end
