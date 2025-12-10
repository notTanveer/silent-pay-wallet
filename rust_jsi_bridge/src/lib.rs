//! Rust JSI Bridge for silent-pay-wallet
//! Minimal example with helloFromRust() function

use std::ffi::CString;
use std::os::raw::c_char;

#[unsafe(no_mangle)]
pub extern "C" fn hello_from_rust() -> *const c_char {
    let message = CString::new("Hello from Rust! 🦀").unwrap();
    message.into_raw()
}

#[unsafe(no_mangle)]
pub extern "C" fn free_rust_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        unsafe {
            let _ = CString::from_raw(ptr);
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn rust_multiply(a: f64, b: f64) -> f64 {
    a * b
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_multiply() {
        assert_eq!(rust_multiply(3.0, 7.0), 21.0);
    }
}

