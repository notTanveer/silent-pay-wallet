//! BIP-352 Silent Payment transaction scanner with JSI bridge
//! Provides high-performance parallel scanning via FFI

use std::collections::HashMap;
use std::ffi::{CStr, CString};
use std::os::raw::c_char;

use bitcoin_hashes::{sha256t_hash_newtype, Hash, HashEngine};
use rayon::prelude::*;
use secp256k1::{PublicKey, Scalar, Secp256k1, SecretKey};
use serde::{Deserialize, Serialize};

// ============================================================================
// BIP-352 Tagged Hash
// ============================================================================

sha256t_hash_newtype! {
    pub struct SharedSecretTag = hash_str("BIP0352/SharedSecret");
    #[hash_newtype(forward)]
    pub struct SharedSecretHash(_);
}

// ============================================================================
// Data Types
// ============================================================================

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexerOutput {
    pub transaction_id: String,
    pub vout: u32,
    pub pub_key: String,
    pub value: u64,
    #[serde(default)]
    pub is_spent: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexerTransaction {
    pub id: String,
    pub block_height: u32,
    pub block_hash: String,
    pub block_time: u64,
    pub scan_tweak: String,
    pub outputs: Vec<IndexerOutput>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchedUTXO {
    pub txid: String,
    pub vout: u32,
    pub value: u64,
    pub height: u32,
    pub pub_key: String,
    pub tweak_hex: String,
    pub block_hash: String,
    pub block_time: u64,
    pub is_spent: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchScanResult {
    pub matched_utxos: Vec<MatchedUTXO>,
    pub transactions_scanned: usize,
    pub outputs_scanned: usize,
}

// ============================================================================
// Core Cryptographic Operations
// ============================================================================

fn compute_shared_secret_hash(shared_secret: &[u8; 33], output_index: u32) -> [u8; 32] {
    let mut engine = SharedSecretHash::engine();
    engine.input(shared_secret);
    engine.input(&output_index.to_be_bytes());
    SharedSecretHash::from_engine(engine).to_byte_array()
}

fn ecdh_shared_secret(
    scan_privkey: &SecretKey,
    scan_tweak_pubkey: &PublicKey,
) -> Result<[u8; 33], &'static str> {
    let shared_secret = secp256k1::ecdh::shared_secret_point(scan_tweak_pubkey, scan_privkey);
    let shared_secret_pubkey = PublicKey::from_slice(&[&[0x04], shared_secret.as_slice()].concat())
        .map_err(|_| "Failed to create pubkey from shared secret")?;
    Ok(shared_secret_pubkey.serialize())
}

fn derive_expected_pubkey(
    secp: &Secp256k1<secp256k1::VerifyOnly>,
    spend_pubkey: &PublicKey,
    tweak_hash: &[u8; 32],
) -> Result<String, &'static str> {
    let tweak_scalar = Scalar::from_be_bytes(*tweak_hash)
        .map_err(|_| "Invalid tweak scalar")?;
    let expected_pubkey = spend_pubkey
        .add_exp_tweak(secp, &tweak_scalar)
        .map_err(|_| "Tweak addition failed")?;
    Ok(hex::encode(&expected_pubkey.serialize()[1..33]))
}

// ============================================================================
// Transaction Scanning
// ============================================================================

fn build_output_map(outputs: &[IndexerOutput]) -> HashMap<String, &IndexerOutput> {
    outputs
        .iter()
        .map(|o| (o.pub_key.to_lowercase(), o))
        .collect()
}

fn scan_transaction(
    secp: &Secp256k1<secp256k1::VerifyOnly>,
    scan_privkey: &SecretKey,
    spend_pubkey: &PublicKey,
    tx: &IndexerTransaction,
) -> Vec<MatchedUTXO> {
    let scan_tweak_pubkey = match parse_scan_tweak(&tx.scan_tweak) {
        Ok(pk) => pk,
        Err(_) => return Vec::new(),
    };

    let shared_secret = match ecdh_shared_secret(scan_privkey, &scan_tweak_pubkey) {
        Ok(secret) => secret,
        Err(_) => return Vec::new(),
    };

    let output_map = build_output_map(&tx.outputs);
    scan_outputs(secp, spend_pubkey, &shared_secret, &output_map, tx)
}

fn parse_scan_tweak(scan_tweak_hex: &str) -> Result<PublicKey, &'static str> {
    let bytes = hex::decode(scan_tweak_hex)
        .map_err(|_| "Invalid hex in scan tweak")?;
    if bytes.len() != 33 {
        return Err("Scan tweak must be 33 bytes");
    }
    PublicKey::from_slice(&bytes)
        .map_err(|_| "Invalid public key in scan tweak")
}

fn scan_outputs(
    secp: &Secp256k1<secp256k1::VerifyOnly>,
    spend_pubkey: &PublicKey,
    shared_secret: &[u8; 33],
    output_map: &HashMap<String, &IndexerOutput>,
    tx: &IndexerTransaction,
) -> Vec<MatchedUTXO> {
    let mut matches = Vec::new();

    for k in 0..tx.outputs.len() as u32 {
        let tweak_hash = compute_shared_secret_hash(shared_secret, k);
        
        let expected_xonly = match derive_expected_pubkey(secp, spend_pubkey, &tweak_hash) {
            Ok(xonly) => xonly,
            Err(_) => continue,
        };

        if let Some(output) = output_map.get(&expected_xonly) {
            matches.push(create_matched_utxo(output, tx, tweak_hash));
        }
    }

    matches
}

fn create_matched_utxo(
    output: &IndexerOutput,
    tx: &IndexerTransaction,
    tweak_hash: [u8; 32],
) -> MatchedUTXO {
    MatchedUTXO {
        txid: tx.id.clone(),
        vout: output.vout,
        value: output.value,
        height: tx.block_height,
        pub_key: output.pub_key.clone(),
        tweak_hex: hex::encode(tweak_hash),
        block_hash: tx.block_hash.clone(),
        block_time: tx.block_time,
        is_spent: output.is_spent,
    }
}

// ============================================================================
// Batch Processing
// ============================================================================

fn process_transactions_parallel(
    scan_privkey: &SecretKey,
    spend_pubkey: &PublicKey,
    transactions: &[IndexerTransaction],
) -> BatchScanResult {
    let secp = Secp256k1::verification_only();
    let total_outputs: usize = transactions.iter().map(|tx| tx.outputs.len()).sum();

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
// FFI Interface
// ============================================================================

#[unsafe(no_mangle)]
pub extern "C" fn sp_scan_transactions(
    scan_privkey_hex: *const c_char,
    spend_pubkey_hex: *const c_char,
    transactions_json: *const c_char,
) -> *const c_char {
    let result = scan_transactions_impl(scan_privkey_hex, spend_pubkey_hex, transactions_json);
    serialize_ffi_response(result)
}

#[unsafe(no_mangle)]
pub extern "C" fn sp_scan_single_transaction(
    scan_privkey_hex: *const c_char,
    spend_pubkey_hex: *const c_char,
    transaction_json: *const c_char,
) -> *const c_char {
    let result = scan_single_transaction_impl(scan_privkey_hex, spend_pubkey_hex, transaction_json);
    serialize_ffi_response(result)
}

#[unsafe(no_mangle)]
pub extern "C" fn free_rust_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        unsafe {
            let _ = CString::from_raw(ptr);
        }
    }
}

// ============================================================================
// FFI Implementation Details
// ============================================================================

fn scan_transactions_impl(
    scan_privkey_hex: *const c_char,
    spend_pubkey_hex: *const c_char,
    transactions_json: *const c_char,
) -> Result<String, String> {
    let scan_privkey = parse_privkey_from_ffi(scan_privkey_hex)?;
    let spend_pubkey = parse_pubkey_from_ffi(spend_pubkey_hex)?;
    let transactions = parse_transactions_from_ffi(transactions_json)?;

    let result = process_transactions_parallel(&scan_privkey, &spend_pubkey, &transactions);
    serde_json::to_string(&result).map_err(|e| format!("Serialization failed: {}", e))
}

fn scan_single_transaction_impl(
    scan_privkey_hex: *const c_char,
    spend_pubkey_hex: *const c_char,
    transaction_json: *const c_char,
) -> Result<String, String> {
    let scan_privkey = parse_privkey_from_ffi(scan_privkey_hex)?;
    let spend_pubkey = parse_pubkey_from_ffi(spend_pubkey_hex)?;
    let transaction = parse_single_transaction_from_ffi(transaction_json)?;

    let secp = Secp256k1::verification_only();
    let matched = scan_transaction(&secp, &scan_privkey, &spend_pubkey, &transaction);
    serde_json::to_string(&matched).map_err(|e| format!("Serialization failed: {}", e))
}

fn parse_privkey_from_ffi(ptr: *const c_char) -> Result<SecretKey, String> {
    if ptr.is_null() {
        return Err("Null pointer for scan_privkey".to_string());
    }
    let hex_str = unsafe {
        CStr::from_ptr(ptr)
            .to_str()
            .map_err(|_| "Invalid UTF-8 in scan_privkey")?
    };
    let bytes = hex::decode(hex_str).map_err(|e| format!("Invalid hex: {}", e))?;
    SecretKey::from_slice(&bytes).map_err(|e| format!("Invalid private key: {}", e))
}

fn parse_pubkey_from_ffi(ptr: *const c_char) -> Result<PublicKey, String> {
    if ptr.is_null() {
        return Err("Null pointer for spend_pubkey".to_string());
    }
    let hex_str = unsafe {
        CStr::from_ptr(ptr)
            .to_str()
            .map_err(|_| "Invalid UTF-8 in spend_pubkey")?
    };
    let bytes = hex::decode(hex_str).map_err(|e| format!("Invalid hex: {}", e))?;
    PublicKey::from_slice(&bytes).map_err(|e| format!("Invalid public key: {}", e))
}

fn parse_transactions_from_ffi(ptr: *const c_char) -> Result<Vec<IndexerTransaction>, String> {
    if ptr.is_null() {
        return Err("Null pointer for transactions_json".to_string());
    }
    let json_str = unsafe {
        CStr::from_ptr(ptr)
            .to_str()
            .map_err(|_| "Invalid UTF-8 in transactions_json")?
    };
    serde_json::from_str(json_str).map_err(|e| format!("Invalid JSON: {}", e))
}

fn parse_single_transaction_from_ffi(ptr: *const c_char) -> Result<IndexerTransaction, String> {
    if ptr.is_null() {
        return Err("Null pointer for transaction_json".to_string());
    }
    let json_str = unsafe {
        CStr::from_ptr(ptr)
            .to_str()
            .map_err(|_| "Invalid UTF-8 in transaction_json")?
    };
    serde_json::from_str(json_str).map_err(|e| format!("Invalid JSON: {}", e))
}

fn serialize_ffi_response(result: Result<String, String>) -> *const c_char {
    let response = match result {
        Ok(json) => json,
        Err(error) => serde_json::json!({ "error": error }).to_string(),
    };
    match CString::new(response) {
        Ok(cstring) => cstring.into_raw(),
        Err(_) => {
            // Response contained a NUL byte; return a safe fallback error
            CString::new(r#"{"error":"Response serialization failed"}"#)
                .expect("Fallback error string is valid")
                .into_raw()
        }
    }
}
