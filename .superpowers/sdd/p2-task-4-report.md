# Task 4 Report: WS Transport + FFI

## Status
DONE — all gates passed.

## Host test output (pristine)
```
running 10 tests
test stream_engine::tests::config_parses_with_defaults ... ok
test stream_engine::tests::done_and_error_serialize ... ok
test stream_engine::tests::progress_event_serializes_to_expected_shape ... ok
test tests::rejects_truncated_frame ... ok
test tests::round_trips_multi_height_frames ... ok
test stream_engine::session::tests::cancel_stops_before_done ... ok
test stream_engine::session::tests::flushes_remainder_on_channel_close ... ok
test stream_engine::session::tests::emits_progress_and_done_for_empty_stream ... ok
test tests::no_match_for_unrelated_keys ... ok
test tests::scans_known_match_through_ffi ... ok
test result: ok. 10 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```
Zero warnings. Zero failures.

## ws_engine integration test output
```
running 1 test
test mock_server_drives_engine_to_done ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s
```
Mock server: accept → read sync → send 2 empty binary frames (heights 1000, 1001) → send `{"event":"synced"}`. Asserted: last event is Done, last progress percent_complete == 100.0.

## 4-ABI cross-compile
```
Building arm64-v8a  (aarch64-linux-android)  → Finished
Building armeabi-v7a (armv7-linux-androideabi) → Finished
Building x86_64     (x86_64-linux-android)   → Finished
Building x86        (i686-linux-android)     → Finished
```
All 4 linked cleanly. Zero warnings.

## jniLibs refresh
Staticlibs copied to:
- `android/app/src/main/jniLibs/arm64-v8a/librust_jsi_bridge.a`  (36 MB)
- `android/app/src/main/jniLibs/armeabi-v7a/librust_jsi_bridge.a` (31 MB)
- `android/app/src/main/jniLibs/x86_64/librust_jsi_bridge.a`      (36 MB)
- `android/app/src/main/jniLibs/x86/librust_jsi_bridge.a`         (29 MB)

Force-added to git (the directory is gitignored; `-f` is required).

## Session-lifecycle ordering chosen

> **sp_scan_cancel:** lock → take handle → **release lock** → signal cancel → join thread.
> **Thread self-clear:** after `run_scan_loop` + `ws_task` complete, lock → set None (drops `JoinHandle`, detaching thread) → release lock → thread exits.

Cancel releases the mutex before `join()`, so the thread can always acquire it for self-clear without deadlock. Whichever wins the `take()` races sees `Some`; the loser sees `None` and is a no-op. Dropping a `JoinHandle` from inside the thread is safe — Rust calls `pthread_detach`, not `pthread_join`.

## Key zeroization

- `impl Drop for ScanConfig` calls `self.scan_privkey_hex.zeroize()` (from the `zeroize = "1"` crate).
- The raw JSON string (`cfg_str`) that contained the key is zeroized immediately after `serde_json::from_str` returns in `sp_scan_start`.
- `cfg_arc` (the `Arc<ScanConfig>`) is owned by the thread closure; it drops (and zeroizes) at session end when `rt.block_on` returns.
- The key is never logged.

## ctx pointer Send+Sync

The Rust 2024 edition precise-capture rules decompose struct fields: a `CtxPtr(*mut c_void)` newtype captured via `.0` in a closure still exposes the raw pointer. Fixed by converting `ctx` to `usize` (inherently `Send + Sync`) before the closure and casting back to `*mut c_void` at the call site.

## Commit
`707372b12` — `feat(rust): WS transport + sp_scan_start/pause/resume/cancel FFI with single-session manager`

## Fix: cancel stall + null guard

### Host tests (green, zero warnings)
```
test result: ok. 10 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```
Zero warnings.

### ws_engine integration test
```
running 1 test
test mock_server_drives_engine_to_done ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

### 4-ABI re-build result
```
✅ Android ARM64 built and deployed    (aarch64-linux-android   → arm64-v8a)
✅ Android ARMv7 built and deployed    (armv7-linux-androideabi → armeabi-v7a)
✅ Android x86_64 built and deployed   (x86_64-linux-android   → x86_64)
✅ Android x86 built and deployed      (i686-linux-android     → x86)
```
All 4 ABIs compiled from the post-fix source. Zero errors.

### jniLibs refreshed
- `android/app/src/main/jniLibs/arm64-v8a/librust_jsi_bridge.a`   (36 MB)
- `android/app/src/main/jniLibs/armeabi-v7a/librust_jsi_bridge.a` (31 MB)
- `android/app/src/main/jniLibs/x86_64/librust_jsi_bridge.a`      (36 MB)
- `android/app/src/main/jniLibs/x86/librust_jsi_bridge.a`         (29 MB)

Copied by `rust-native-setup.sh` from the post-fix release build.
