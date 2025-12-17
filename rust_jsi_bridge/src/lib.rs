//! Rust JSI Bridge for silent-pay-wallet
//! High-performance Silent Payment transaction scanning via JSI

use std::ffi::{CStr, CString};
use std::os::raw::c_char;

use bitcoin_hashes::{sha256t_hash_newtype, Hash, HashEngine};
use rayon::prelude::*;
use secp256k1::{PublicKey, Scalar, Secp256k1, SecretKey};
use serde::{Deserialize, Serialize};

// ============================================================================
// Tagged Hash for BIP-352 SharedSecret
// ============================================================================

sha256t_hash_newtype! {
    /// Tag for BIP-352 SharedSecret hash
    pub struct SharedSecretTag = hash_str("BIP0352/SharedSecret");

    /// BIP-352 SharedSecret tagged hash
    #[hash_newtype(forward)]
    pub struct SharedSecretHash(_);
}

// ============================================================================
// Data Types for FFI
// ============================================================================

/// Output from the indexer (matches TypeScript IndexerOutput)
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexerOutput {
    pub transaction_id: String,
    pub vout: u32,
    pub pub_key: String, // x-only pubkey hex (32 bytes)
    pub value: u64,
    #[serde(default)]
    pub is_spent: bool,
}

/// Transaction from the indexer (matches TypeScript IndexerTransaction)
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexerTransaction {
    pub id: String,
    pub block_height: u32,
    pub block_hash: String,
    pub block_time: u64,
    pub scan_tweak: String, // 33-byte compressed pubkey hex
    pub outputs: Vec<IndexerOutput>,
}

/// Matched UTXO result (matches TypeScript SilentPaymentUTXO)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchedUTXO {
    pub txid: String,
    pub vout: u32,
    pub value: u64,
    pub height: u32,
    pub pub_key: String,       // x-only pubkey hex
    pub tweak_hex: String,     // tweak as hex for spending
    pub block_hash: String,
    pub block_time: u64,
    pub is_spent: bool,
}

/// Result from batch processing
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchScanResult {
    pub matched_utxos: Vec<MatchedUTXO>,
    pub transactions_scanned: usize,
    pub outputs_scanned: usize,
}

// ============================================================================
// Silent Payment Scanning Core
// ============================================================================

/// Compute the BIP-352 SharedSecret tagged hash
fn compute_shared_secret_hash(shared_secret: &[u8; 33], output_index: u32) -> [u8; 32] {
    let mut engine = SharedSecretHash::engine();
    engine.input(shared_secret);
    engine.input(&output_index.to_be_bytes());
    SharedSecretHash::from_engine(engine).to_byte_array()
}

/// Scan a single transaction for matching Silent Payment outputs
/// 
/// Algorithm (BIP-352):
/// 1. ECDH: shared_secret = scan_private_key * scan_tweak (public key from sender)
/// 2. For each output index k:
///    - t_k = SHA256_tag("BIP0352/SharedSecret", shared_secret || ser32(k))
///    - P_k = B_spend + t_k * G
///    - If P_k matches output pubkey, we own this output
fn scan_transaction(
    secp: &Secp256k1<secp256k1::All>,
    scan_privkey: &SecretKey,
    spend_pubkey: &PublicKey,
    tx: &IndexerTransaction,
) -> Vec<MatchedUTXO> {
    let mut matched = Vec::new();

    // Parse scan tweak (33-byte compressed pubkey from indexer)
    let scan_tweak_bytes = match hex::decode(&tx.scan_tweak) {
        Ok(bytes) if bytes.len() == 33 => bytes,
        _ => return matched, // Invalid scan tweak
    };

    let scan_tweak_pubkey = match PublicKey::from_slice(&scan_tweak_bytes) {
        Ok(pk) => pk,
        Err(_) => return matched, // Invalid pubkey
    };

    // ECDH: shared_secret = scan_privkey * scan_tweak_pubkey
    // Use the ecdh module for proper shared secret computation
    let shared_secret = secp256k1::ecdh::shared_secret_point(&scan_tweak_pubkey, scan_privkey);
    // shared_secret_point returns 64 bytes (uncompressed x,y without prefix)
    // We need to compress it to 33 bytes for the tagged hash
    let shared_secret_pubkey = match PublicKey::from_slice(&[&[0x04], shared_secret.as_slice()].concat()) {
        Ok(pk) => pk.serialize(), // Returns 33-byte compressed form
        Err(_) => return matched,
    };

    // Build a map of output x-only pubkeys for fast lookup
    let output_map: std::collections::HashMap<String, &IndexerOutput> = tx
        .outputs
        .iter()
        .map(|o| (o.pub_key.to_lowercase(), o))
        .collect();

    // Check each possible output index
    for k in 0..tx.outputs.len() as u32 {
        // t_k = tagged_hash("BIP0352/SharedSecret", shared_secret || k)
        let tweak_hash = compute_shared_secret_hash(&shared_secret_pubkey, k);

        // Convert tweak to scalar
        let tweak_scalar = match Scalar::from_be_bytes(tweak_hash) {
            Ok(s) => s,
            Err(_) => continue, // Invalid scalar (extremely rare)
        };

        // P_k = B_spend + t_k * G
        let expected_pubkey = spend_pubkey.add_exp_tweak(secp, &tweak_scalar);
        let expected_pubkey = match expected_pubkey {
            Ok(pk) => pk,
            Err(_) => continue,
        };

        // Get x-only representation (drop the prefix byte)
        let expected_xonly = hex::encode(&expected_pubkey.serialize()[1..33]);

        // Check if this matches any output
        if let Some(output) = output_map.get(&expected_xonly) {
            matched.push(MatchedUTXO {
                txid: tx.id.clone(),
                vout: output.vout,
                value: output.value,
                height: tx.block_height,
                pub_key: output.pub_key.clone(),
                tweak_hex: hex::encode(tweak_hash),
                block_hash: tx.block_hash.clone(),
                block_time: tx.block_time,
                is_spent: output.is_spent,
            });
        }
    }

    matched
}

/// Process a batch of transactions in parallel using rayon
fn process_transactions_parallel(
    scan_privkey: &SecretKey,
    spend_pubkey: &PublicKey,
    transactions: &[IndexerTransaction],
) -> BatchScanResult {
    let secp = Secp256k1::new();

    let total_outputs: usize = transactions.iter().map(|tx| tx.outputs.len()).sum();

    // Use par_iter for parallel processing across all CPU cores
    let matched_utxos: Vec<MatchedUTXO> = transactions
        .par_iter()
        .flat_map(|tx| scan_transaction(&secp, scan_privkey, spend_pubkey, tx))
        .collect();

    BatchScanResult {
        matched_utxos,
        transactions_scanned: transactions.len(),
        outputs_scanned: total_outputs,
    }
}

// ============================================================================
// FFI Exports
// ============================================================================

/// Process transactions and scan for Silent Payment outputs
/// 
/// # Arguments
/// * `scan_privkey_hex` - 32-byte scan private key as hex string
/// * `spend_pubkey_hex` - 33-byte compressed spend public key as hex string
/// * `transactions_json` - JSON array of IndexerTransaction objects
/// 
/// # Returns
/// JSON string containing BatchScanResult with matched UTXOs
#[unsafe(no_mangle)]
pub extern "C" fn sp_scan_transactions(
    scan_privkey_hex: *const c_char,
    spend_pubkey_hex: *const c_char,
    transactions_json: *const c_char,
) -> *const c_char {
    let result = (|| -> Result<String, String> {
        // Parse scan private key
        let scan_privkey_str = unsafe {
            CStr::from_ptr(scan_privkey_hex)
                .to_str()
                .map_err(|_| "Invalid UTF-8 in scan_privkey")?
        };
        let scan_privkey_bytes =
            hex::decode(scan_privkey_str).map_err(|e| format!("Invalid scan_privkey hex: {}", e))?;
        let scan_privkey = SecretKey::from_slice(&scan_privkey_bytes)
            .map_err(|e| format!("Invalid scan_privkey: {}", e))?;

        // Parse spend public key
        let spend_pubkey_str = unsafe {
            CStr::from_ptr(spend_pubkey_hex)
                .to_str()
                .map_err(|_| "Invalid UTF-8 in spend_pubkey")?
        };
        let spend_pubkey_bytes =
            hex::decode(spend_pubkey_str).map_err(|e| format!("Invalid spend_pubkey hex: {}", e))?;
        let spend_pubkey = PublicKey::from_slice(&spend_pubkey_bytes)
            .map_err(|e| format!("Invalid spend_pubkey: {}", e))?;

        // Parse transactions JSON
        let transactions_str = unsafe {
            CStr::from_ptr(transactions_json)
                .to_str()
                .map_err(|_| "Invalid UTF-8 in transactions_json")?
        };
        let transactions: Vec<IndexerTransaction> = serde_json::from_str(transactions_str)
            .map_err(|e| format!("Invalid transactions JSON: {}", e))?;

        // Process transactions in parallel
        let result = process_transactions_parallel(&scan_privkey, &spend_pubkey, &transactions);

        // Serialize result to JSON
        serde_json::to_string(&result).map_err(|e| format!("Failed to serialize result: {}", e))
    })();

    let response = match result {
        Ok(json) => json,
        Err(error) => serde_json::json!({ "error": error }).to_string(),
    };

    CString::new(response).unwrap().into_raw()
}

/// Scan a single transaction (for incremental scanning)
#[unsafe(no_mangle)]
pub extern "C" fn sp_scan_single_transaction(
    scan_privkey_hex: *const c_char,
    spend_pubkey_hex: *const c_char,
    transaction_json: *const c_char,
) -> *const c_char {
    let result = (|| -> Result<String, String> {
        // Parse scan private key
        let scan_privkey_str = unsafe {
            CStr::from_ptr(scan_privkey_hex)
                .to_str()
                .map_err(|_| "Invalid UTF-8 in scan_privkey")?
        };
        let scan_privkey_bytes =
            hex::decode(scan_privkey_str).map_err(|e| format!("Invalid scan_privkey hex: {}", e))?;
        let scan_privkey = SecretKey::from_slice(&scan_privkey_bytes)
            .map_err(|e| format!("Invalid scan_privkey: {}", e))?;

        // Parse spend public key
        let spend_pubkey_str = unsafe {
            CStr::from_ptr(spend_pubkey_hex)
                .to_str()
                .map_err(|_| "Invalid UTF-8 in spend_pubkey")?
        };
        let spend_pubkey_bytes =
            hex::decode(spend_pubkey_str).map_err(|e| format!("Invalid spend_pubkey hex: {}", e))?;
        let spend_pubkey = PublicKey::from_slice(&spend_pubkey_bytes)
            .map_err(|e| format!("Invalid spend_pubkey: {}", e))?;

        // Parse single transaction JSON
        let transaction_str = unsafe {
            CStr::from_ptr(transaction_json)
                .to_str()
                .map_err(|_| "Invalid UTF-8 in transaction_json")?
        };
        let transaction: IndexerTransaction = serde_json::from_str(transaction_str)
            .map_err(|e| format!("Invalid transaction JSON: {}", e))?;

        // Scan the transaction
        let secp = Secp256k1::new();
        let matched = scan_transaction(&secp, &scan_privkey, &spend_pubkey, &transaction);

        // Serialize result to JSON
        serde_json::to_string(&matched).map_err(|e| format!("Failed to serialize result: {}", e))
    })();

    let response = match result {
        Ok(json) => json,
        Err(error) => serde_json::json!({ "error": error }).to_string(),
    };

    CString::new(response).unwrap().into_raw()
}

// ============================================================================
// Original example functions (kept for backward compatibility)
// ============================================================================

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

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_multiply() {
        assert_eq!(rust_multiply(3.0, 7.0), 21.0);
    }

    #[test]
    fn test_shared_secret_hash() {
        // Test that the tagged hash is deterministic
        let shared_secret = [0u8; 33];
        let hash1 = compute_shared_secret_hash(&shared_secret, 0);
        let hash2 = compute_shared_secret_hash(&shared_secret, 0);
        assert_eq!(hash1, hash2);

        // Different index should produce different hash
        let hash3 = compute_shared_secret_hash(&shared_secret, 1);
        assert_ne!(hash1, hash3);
    }

    #[test]
    fn test_scan_empty_transactions() {
        let secp = Secp256k1::new();
        let scan_privkey = SecretKey::from_slice(&[1u8; 32]).unwrap();
        let spend_pubkey = PublicKey::from_secret_key(&secp, &scan_privkey);

        let result = process_transactions_parallel(&scan_privkey, &spend_pubkey, &[]);

        assert_eq!(result.matched_utxos.len(), 0);
        assert_eq!(result.transactions_scanned, 0);
        assert_eq!(result.outputs_scanned, 0);
    }

    #[test]
    fn test_invalid_scan_tweak() {
        let secp = Secp256k1::new();
        let scan_privkey = SecretKey::from_slice(&[1u8; 32]).unwrap();
        let spend_pubkey = PublicKey::from_secret_key(&secp, &scan_privkey);

        let tx = IndexerTransaction {
            id: "test_txid".to_string(),
            block_height: 100,
            block_hash: "blockhash".to_string(),
            block_time: 1234567890,
            scan_tweak: "invalid_hex".to_string(),
            outputs: vec![],
        };

        let matched = scan_transaction(&secp, &scan_privkey, &spend_pubkey, &tx);
        assert!(matched.is_empty());
    }
}


