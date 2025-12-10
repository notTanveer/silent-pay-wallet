require "json"

package = JSON.parse(File.read(File.join(__dir__, "../package.json")))

Pod::Spec.new do |s|
  s.name         = "RustJsiBridge"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]
  
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
