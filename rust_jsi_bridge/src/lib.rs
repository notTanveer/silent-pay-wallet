//! BIP-352 Silent Payment transaction scanner with JSI bridge
//! Provides high-performance parallel scanning via FFI

use std::collections::HashMap;
use std::ffi::{CStr, CString};
use std::os::raw::c_char;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
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

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
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
// Binary Silent-Block Parsing
//
// Mirror of the indexer's `encodeSilentBlock` / `getSilentBlocksRange`
// (silent-pay-indexer: src/silent-blocks/silent-block-encoder.ts and
// silent-blocks.service.ts). The wire format is:
//
//   frames        := frame*
//   frame         := height (u32 BE) | byteLength (u32 BE) | silentBlock[byteLength]
//   silentBlock   := type (u8) | varInt(txCount) | tx*
//   tx            := txid (32B) | varInt(outputCount) | output* | scanTweak (33B)
//   output        := value (u64 BE) | pubKey (32B) | vout (u32 BE)
//
// The binary format carries no isSpent / blockHash / blockTime — those are
// resolved by the wallet after a match via the /transactions/txid endpoint.
// block_height comes from the enclosing frame.
// ============================================================================

const SILENT_PAYMENT_BLOCK_TYPE: u8 = 0x00;

/// Bounds-checked sequential reader over a byte slice. Every accessor returns
/// `Err` instead of panicking on a short read, so malformed input from the
/// network can never crash the scan.
struct ByteReader<'a> {
    buf: &'a [u8],
    pos: usize,
}

impl<'a> ByteReader<'a> {
    fn new(buf: &'a [u8]) -> Self {
        Self { buf, pos: 0 }
    }

    fn remaining(&self) -> usize {
        self.buf.len() - self.pos
    }

    fn take(&mut self, n: usize) -> Result<&'a [u8], String> {
        if self.pos + n > self.buf.len() {
            return Err(format!(
                "Unexpected end of buffer: need {} byte(s), have {}",
                n,
                self.remaining()
            ));
        }
        let slice = &self.buf[self.pos..self.pos + n];
        self.pos += n;
        Ok(slice)
    }

    fn u8(&mut self) -> Result<u8, String> {
        Ok(self.take(1)?[0])
    }

    fn u32_be(&mut self) -> Result<u32, String> {
        let b = self.take(4)?;
        Ok(u32::from_be_bytes([b[0], b[1], b[2], b[3]]))
    }

    fn u64_be(&mut self) -> Result<u64, String> {
        let b = self.take(8)?;
        Ok(u64::from_be_bytes([
            b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7],
        ]))
    }

    /// Bitcoin CompactSize varint (little-endian payload).
    fn var_int(&mut self) -> Result<u64, String> {
        match self.u8()? {
            0xff => {
                let b = self.take(8)?;
                Ok(u64::from_le_bytes([
                    b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7],
                ]))
            }
            0xfe => {
                let b = self.take(4)?;
                Ok(u32::from_le_bytes([b[0], b[1], b[2], b[3]]) as u64)
            }
            0xfd => {
                let b = self.take(2)?;
                Ok(u16::from_le_bytes([b[0], b[1]]) as u64)
            }
            n => Ok(n as u64),
        }
    }

    fn hex(&mut self, n: usize) -> Result<String, String> {
        Ok(hex::encode(self.take(n)?))
    }
}

fn parse_silent_block(
    bytes: &[u8],
    block_height: u32,
    out: &mut Vec<IndexerTransaction>,
) -> Result<(), String> {
    let mut r = ByteReader::new(bytes);

    let block_type = r.u8()?;
    if block_type != SILENT_PAYMENT_BLOCK_TYPE {
        return Err(format!("Unsupported silent block type: {block_type}"));
    }

    let tx_count = r.var_int()?;
    for _ in 0..tx_count {
        let id = r.hex(32)?;
        let output_count = r.var_int()?;

        let mut outputs = Vec::with_capacity(output_count as usize);
        for _ in 0..output_count {
            let value = r.u64_be()?;
            let pub_key = r.hex(32)?;
            let vout = r.u32_be()?;
            outputs.push(IndexerOutput {
                transaction_id: id.clone(),
                vout,
                pub_key,
                value,
                is_spent: false,
            });
        }

        let scan_tweak = r.hex(33)?;
        out.push(IndexerTransaction {
            id,
            block_height,
            block_hash: String::new(),
            block_time: 0,
            scan_tweak,
            outputs,
        });
    }

    Ok(())
}

fn parse_silent_block_frames(bytes: &[u8]) -> Result<Vec<IndexerTransaction>, String> {
    let mut r = ByteReader::new(bytes);
    let mut transactions = Vec::new();

    while r.remaining() > 0 {
        let height = r.u32_be()?;
        let byte_length = r.u32_be()? as usize;
        let block = r.take(byte_length)?;
        parse_silent_block(block, height, &mut transactions)?;
    }

    Ok(transactions)
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
pub extern "C" fn sp_scan_silent_block_range(
    scan_privkey_hex: *const c_char,
    spend_pubkey_hex: *const c_char,
    frames_base64: *const c_char,
) -> *const c_char {
    let result = scan_silent_block_range_impl(scan_privkey_hex, spend_pubkey_hex, frames_base64);
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

fn scan_silent_block_range_impl(
    scan_privkey_hex: *const c_char,
    spend_pubkey_hex: *const c_char,
    frames_base64: *const c_char,
) -> Result<String, String> {
    let scan_privkey = parse_privkey_from_ffi(scan_privkey_hex)?;
    let spend_pubkey = parse_pubkey_from_ffi(spend_pubkey_hex)?;
    let frames_b64 = read_ffi_str(frames_base64, "frames_base64")?;

    let bytes = BASE64
        .decode(frames_b64.trim())
        .map_err(|e| format!("Invalid base64: {}", e))?;
    let transactions = parse_silent_block_frames(&bytes)?;

    let result = process_transactions_parallel(&scan_privkey, &spend_pubkey, &transactions);
    serde_json::to_string(&result).map_err(|e| format!("Serialization failed: {}", e))
}

fn read_ffi_str<'a>(ptr: *const c_char, name: &str) -> Result<&'a str, String> {
    if ptr.is_null() {
        return Err(format!("Null pointer for {name}"));
    }
    unsafe {
        CStr::from_ptr(ptr)
            .to_str()
            .map_err(|_| format!("Invalid UTF-8 in {name}"))
    }
}

fn parse_privkey_from_ffi(ptr: *const c_char) -> Result<SecretKey, String> {
    let hex_str = read_ffi_str(ptr, "scan_privkey")?;
    let bytes = hex::decode(hex_str).map_err(|e| format!("Invalid hex: {}", e))?;
    SecretKey::from_slice(&bytes).map_err(|e| format!("Invalid private key: {}", e))
}

fn parse_pubkey_from_ffi(ptr: *const c_char) -> Result<PublicKey, String> {
    let hex_str = read_ffi_str(ptr, "spend_pubkey")?;
    let bytes = hex::decode(hex_str).map_err(|e| format!("Invalid hex: {}", e))?;
    PublicKey::from_slice(&bytes).map_err(|e| format!("Invalid public key: {}", e))
}

fn parse_transactions_from_ffi(ptr: *const c_char) -> Result<Vec<IndexerTransaction>, String> {
    let json_str = read_ffi_str(ptr, "transactions_json")?;
    serde_json::from_str(json_str).map_err(|e| format!("Invalid JSON: {}", e))
}

fn parse_single_transaction_from_ffi(ptr: *const c_char) -> Result<IndexerTransaction, String> {
    let json_str = read_ffi_str(ptr, "transaction_json")?;
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

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    /// Mirror of the indexer's `encodeVarInt` (CompactSize, little-endian payload).
    fn write_var_int(buf: &mut Vec<u8>, value: u64) {
        if value < 0xfd {
            buf.push(value as u8);
        } else if value <= 0xffff {
            buf.push(0xfd);
            buf.extend_from_slice(&(value as u16).to_le_bytes());
        } else if value <= 0xffff_ffff {
            buf.push(0xfe);
            buf.extend_from_slice(&(value as u32).to_le_bytes());
        } else {
            buf.push(0xff);
            buf.extend_from_slice(&value.to_le_bytes());
        }
    }

    /// Mirror of the indexer's `encodeSilentBlock` (silent-block-encoder.ts).
    fn encode_silent_block(transactions: &[IndexerTransaction]) -> Vec<u8> {
        let mut buf = vec![SILENT_PAYMENT_BLOCK_TYPE];
        write_var_int(&mut buf, transactions.len() as u64);

        for tx in transactions {
            buf.extend_from_slice(&hex::decode(&tx.id).unwrap());
            write_var_int(&mut buf, tx.outputs.len() as u64);
            for output in &tx.outputs {
                buf.extend_from_slice(&output.value.to_be_bytes());
                buf.extend_from_slice(&hex::decode(&output.pub_key).unwrap());
                buf.extend_from_slice(&output.vout.to_be_bytes());
            }
            buf.extend_from_slice(&hex::decode(&tx.scan_tweak).unwrap());
        }

        buf
    }

    /// Mirror of the indexer's `getSilentBlocksRange` framing:
    /// height (u32 BE) | byteLength (u32 BE) | silentBlockBytes.
    fn frame(height: u32, block: &[u8]) -> Vec<u8> {
        let mut f = Vec::with_capacity(8 + block.len());
        f.extend_from_slice(&height.to_be_bytes());
        f.extend_from_slice(&(block.len() as u32).to_be_bytes());
        f.extend_from_slice(block);
        f
    }

    fn make_tx(id_byte: u8, scan_tweak_hex: &str, outputs: Vec<IndexerOutput>) -> IndexerTransaction {
        IndexerTransaction {
            id: hex::encode([id_byte; 32]),
            block_height: 0, // overwritten by the enclosing frame on parse
            block_hash: String::new(),
            block_time: 0,
            scan_tweak: scan_tweak_hex.to_string(),
            outputs,
        }
    }

    #[test]
    fn round_trips_multi_height_frames() {
        let scan_tweak = hex::encode([0x02u8; 33]); // 33B placeholder (parse doesn't validate the point)
        let pubkey = hex::encode([0xaau8; 32]);

        let tx_a = make_tx(
            0x11,
            &scan_tweak,
            vec![
                IndexerOutput {
                    transaction_id: hex::encode([0x11u8; 32]),
                    vout: 0,
                    pub_key: pubkey.clone(),
                    value: 1_000,
                    is_spent: false,
                },
                IndexerOutput {
                    transaction_id: hex::encode([0x11u8; 32]),
                    vout: 3,
                    pub_key: pubkey.clone(),
                    value: 2_500,
                    is_spent: false,
                },
            ],
        );
        let tx_b = make_tx(
            0x22,
            &scan_tweak,
            vec![IndexerOutput {
                transaction_id: hex::encode([0x22u8; 32]),
                vout: 1,
                pub_key: pubkey.clone(),
                value: 9_999,
                is_spent: false,
            }],
        );

        let mut bytes = Vec::new();
        bytes.extend_from_slice(&frame(842_579, &encode_silent_block(&[tx_a.clone(), tx_b.clone()])));
        bytes.extend_from_slice(&frame(842_580, &encode_silent_block(&[]))); // empty block (2 bytes)
        bytes.extend_from_slice(&frame(842_581, &encode_silent_block(&[tx_b.clone()])));

        let parsed = parse_silent_block_frames(&bytes).unwrap();
        assert_eq!(parsed.len(), 3); // tx_a, tx_b (h=842579), tx_b (h=842581)

        assert_eq!(parsed[0].id, tx_a.id);
        assert_eq!(parsed[0].block_height, 842_579);
        assert_eq!(parsed[0].scan_tweak, scan_tweak);
        assert_eq!(parsed[0].outputs.len(), 2);
        assert_eq!(parsed[0].outputs[1].vout, 3);
        assert_eq!(parsed[0].outputs[1].value, 2_500);
        assert_eq!(parsed[0].outputs[0].pub_key, pubkey);

        assert_eq!(parsed[1].id, tx_b.id);
        assert_eq!(parsed[1].block_height, 842_579);

        assert_eq!(parsed[2].id, tx_b.id);
        assert_eq!(parsed[2].block_height, 842_581);
    }

    #[test]
    fn rejects_truncated_frame() {
        // height + a byteLength claiming more bytes than are present.
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&842_579u32.to_be_bytes());
        bytes.extend_from_slice(&100u32.to_be_bytes());
        bytes.extend_from_slice(&[0x00, 0x00]); // only 2 of the 100 promised bytes
        assert!(parse_silent_block_frames(&bytes).is_err());
    }

    #[test]
    fn scans_known_match_through_ffi() {
        let secp = Secp256k1::new();
        let verify = Secp256k1::verification_only();

        // Deterministic keys so the test is reproducible.
        let scan_privkey = SecretKey::from_slice(&[0x11u8; 32]).unwrap();
        let spend_privkey = SecretKey::from_slice(&[0x22u8; 32]).unwrap();
        let spend_pubkey = PublicKey::from_secret_key(&secp, &spend_privkey);
        // scan_tweak stands in for the transaction's summed input public key.
        let tweak_privkey = SecretKey::from_slice(&[0x33u8; 32]).unwrap();
        let scan_tweak_pubkey = PublicKey::from_secret_key(&secp, &tweak_privkey);

        // Construct the exact output pubkey the scanner will derive for vout's k index.
        let shared_secret = ecdh_shared_secret(&scan_privkey, &scan_tweak_pubkey).unwrap();
        let tweak_hash = compute_shared_secret_hash(&shared_secret, 0);
        let expected_xonly = derive_expected_pubkey(&verify, &spend_pubkey, &tweak_hash).unwrap();

        let tx = make_tx(
            0x44,
            &hex::encode(scan_tweak_pubkey.serialize()),
            vec![IndexerOutput {
                transaction_id: hex::encode([0x44u8; 32]),
                vout: 7,
                pub_key: expected_xonly.clone(),
                value: 123_456,
                is_spent: false,
            }],
        );

        let frames = frame(900_000, &encode_silent_block(&[tx]));
        let frames_b64 = BASE64.encode(&frames);

        let scan_hex = CString::new(hex::encode(scan_privkey.secret_bytes())).unwrap();
        let spend_hex = CString::new(hex::encode(spend_pubkey.serialize())).unwrap();
        let frames_c = CString::new(frames_b64).unwrap();

        let ptr = sp_scan_silent_block_range(scan_hex.as_ptr(), spend_hex.as_ptr(), frames_c.as_ptr());
        let json = unsafe { CStr::from_ptr(ptr).to_str().unwrap().to_owned() };
        free_rust_string(ptr as *mut c_char);

        let result: BatchScanResult = serde_json::from_str(&json).unwrap();
        assert_eq!(result.transactions_scanned, 1);
        assert_eq!(result.outputs_scanned, 1);
        assert_eq!(result.matched_utxos.len(), 1, "expected exactly one match");

        let m = &result.matched_utxos[0];
        assert_eq!(m.vout, 7);
        assert_eq!(m.value, 123_456);
        assert_eq!(m.height, 900_000, "height must come from the frame");
        assert_eq!(m.pub_key, expected_xonly);
        assert_eq!(m.tweak_hex, hex::encode(tweak_hash));
        // Binary format carries none of these — resolved later via /transactions/txid.
        assert!(!m.is_spent);
        assert_eq!(m.block_hash, "");
        assert_eq!(m.block_time, 0);
    }

    #[test]
    fn no_match_for_unrelated_keys() {
        let scan_tweak = hex::encode([0x02u8; 33]);
        let tx = make_tx(
            0x55,
            &scan_tweak,
            vec![IndexerOutput {
                transaction_id: hex::encode([0x55u8; 32]),
                vout: 0,
                pub_key: hex::encode([0xbbu8; 32]),
                value: 1,
                is_spent: false,
            }],
        );
        let frames_b64 = BASE64.encode(frame(900_000, &encode_silent_block(&[tx])));

        let scan_hex = CString::new(hex::encode([0x11u8; 32])).unwrap();
        let spend_pubkey = PublicKey::from_secret_key(
            &Secp256k1::new(),
            &SecretKey::from_slice(&[0x22u8; 32]).unwrap(),
        );
        let spend_hex = CString::new(hex::encode(spend_pubkey.serialize())).unwrap();
        let frames_c = CString::new(frames_b64).unwrap();

        let ptr = sp_scan_silent_block_range(scan_hex.as_ptr(), spend_hex.as_ptr(), frames_c.as_ptr());
        let json = unsafe { CStr::from_ptr(ptr).to_str().unwrap().to_owned() };
        free_rust_string(ptr as *mut c_char);

        let result: BatchScanResult = serde_json::from_str(&json).unwrap();
        assert_eq!(result.transactions_scanned, 1);
        assert_eq!(result.matched_utxos.len(), 0);
    }
}
