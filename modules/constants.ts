/**
 * Let's keep config vars, constants and definitions here
 */

export const BIP352_ACTIVATION_HEIGHT = 842579; // May 8, 2024, when BIP-352 was merged

// Phase 2: when true, the silent-block stream is owned by the Rust engine.
// Default false until the engine is validated on-device (Phase 3 flips it).
export const useRustOwnedStream = false;
