# Silent Payments Libraries - Implementation Guide

This document explains the two Silent Payment libraries used in this wallet and when to use each one.

## Overview

We use a **hybrid approach** combining two libraries:

1. **BlueWallet Silent Payments** (`silent-payments` package)
2. **@silent-pay/core** (npm package)

## Library Comparison

### 1. BlueWallet Silent Payments Library
**GitHub:** https://github.com/BlueWallet/SilentPayments

#### Strengths ✅
- **Sending TO Silent Payment addresses**: Excellent at converting SP addresses to Taproot outputs
- **UTXO type detection**: Supports multiple input types (p2wpkh, p2sh-p2wpkh, p2pkh, p2tr)
- **Transaction creation**: `createTransaction()` method for processing targets
- **Tweak computation**: `computeTweakForTx()` for receivers
- **UTXO detection**: `detectOurUtxos()` for scanning received payments
- **Custom-built**: Designed specifically for this wallet ecosystem

#### Limitations ⚠️
- **Limited spending support**: Primarily focused on creating transactions TO SP addresses
- **Not designed for spending FROM SP UTXOs**: Doesn't handle tweaked key signing

#### Use Cases
```typescript
import { SilentPayment } from 'silent-payments';

// ✅ Good: Converting SP addresses to Taproot addresses
const sp = new SilentPayment();
const targets = [
  { address: 'sp1...', value: 10000 },
  { address: 'bc1...', value: 5000 }
];
const processedTargets = sp.createTransaction(utxos, targets);

// ✅ Good: Computing tweaks for received transactions
const tweak = SilentPayment.computeTweakForTx(tx);

// ✅ Good: Detecting our UTXOs in a transaction
const myUtxos = SilentPayment.detectOurUtxos(tx, seed, tweakHex);

// ❌ Bad: Spending FROM SP UTXOs (not supported properly)
```

---

### 2. @silent-pay/core Library
**NPM:** https://www.npmjs.com/package/@silent-pay/core

#### Strengths ✅
- **Full spending implementation**: Complete Schnorr signing for Taproot
- **Correct tweaked key derivation**: Uses `privateAdd()` for proper secp256k1 arithmetic
- **Proper x-only point handling**: Correct Taproot key handling
- **Well-tested**: Industry-standard implementation
- **Active maintenance**: Regular updates and bug fixes

#### Limitations ⚠️
- **Generic implementation**: Not customized for BlueWallet specifics
- **Heavier dependency**: Includes full wallet implementation

#### Use Cases
```typescript
import { SilentPaymentSpender } from './helpers/silent-payments';

// ✅ Good: Creating tweaked keypairs for spending
const tweakedKeyPair = SilentPaymentSpender.createTweakedKeyPair(
  spendPrivKey,
  utxo.tweak
);

// ✅ Good: Signing Taproot inputs with Schnorr
SilentPaymentSpender.signTaprootInput(psbt, idx, utxo, spendPrivKey);

// ✅ Good: Verifying tweaked keys
const isValid = SilentPaymentSpender.verifyTweakedKey(utxo, spendPrivKey);
```

---

## Recommended Architecture: Hybrid Approach 🎯

### Use Both Libraries Together

We've created `SilentPaymentTransactionBuilder` that combines the strengths of both:

```typescript
import { SilentPaymentTransactionBuilder } from './helpers/silent-payments';

// Initialize builder with your keys
const builder = new SilentPaymentTransactionBuilder(
  spendPrivKey,
  spendPubKey
);

// Create complete transaction
// - Uses BlueWallet library for target processing (SP address → Taproot)
// - Uses @silent-pay/core for input signing
const psbt = builder.createCompletePSBT(
  spUtxos,        // Your SP UTXOs to spend
  targets,        // Can include SP addresses!
  feeRate,
  changeAddress,  // Can be an SP address!
  sequence
);

// Finalize and broadcast
psbt.finalizeAllInputs();
const tx = psbt.extractTransaction();
```

---

## Implementation Details

### For Spending SP UTXOs

**Use:** `@silent-pay/core` via `SilentPaymentSpender`

```typescript
// Step 1: Create Taproot input
const taprootInput = SilentPaymentSpender.createTaprootInput(
  spUtxo,
  spendPubKey
);

// Step 2: Add to PSBT
psbt.addInput({
  hash: taprootInput.hash,
  index: taprootInput.index,
  sequence,
  witnessUtxo: {
    script: taprootInput.witnessUtxo.script,
    value: BigInt(taprootInput.witnessUtxo.value),
  },
  tapInternalKey: taprootInput.tapInternalKey,
});

// Step 3: Sign with tweaked key
SilentPaymentSpender.signTaprootInput(psbt, inputIndex, spUtxo, spendPrivKey);
```

### For Sending TO SP Addresses

**Use:** BlueWallet `silent-payments` library

```typescript
import { SilentPayment } from 'silent-payments';

const sp = new SilentPayment();

// Convert SP addresses to Taproot addresses
const processedTargets = sp.createTransaction(utxos, targets);

// Now add as outputs to your PSBT
processedTargets.forEach(target => {
  if (target.address && target.value) {
    psbt.addOutput({
      address: target.address,  // Now a regular Taproot address
      value: BigInt(target.value),
    });
  }
});
```

### For Mixed Transactions (SP inputs → SP outputs)

**Use:** `SilentPaymentTransactionBuilder` (hybrid)

```typescript
import { SilentPaymentTransactionBuilder } from './helpers/silent-payments';

const builder = new SilentPaymentTransactionBuilder(spendPrivKey, spendPubKey);

// Handles everything automatically:
// - SP UTXOs as inputs (signed with tweaked keys)
// - SP addresses as outputs (converted to Taproot)
// - Regular Bitcoin addresses as outputs
const psbt = builder.createCompletePSBT(
  spUtxos,
  [
    { address: 'sp1...', value: 10000 },  // SP recipient
    { address: 'bc1...', value: 5000 },   // Regular recipient
  ],
  feeRate,
  'sp1...',  // SP change address
  sequence
);
```

---

## Transaction Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Transaction Creation                      │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    ┌─────────────────┐
                    │  Input UTXOs    │
                    │  (SP UTXOs)     │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  @silent-pay/core│
                    │  SilentPayment   │
                    │  Spender         │
                    │  - Tweak keys    │
                    │  - Sign Schnorr  │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │      PSBT        │
                    │   (with inputs)  │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  Output Targets  │
                    │  (SP addresses)  │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  BlueWallet      │
                    │  SilentPayment   │
                    │  - Convert SP    │
                    │    to Taproot    │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │      PSBT        │
                    │  (with outputs)  │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  Finalize & Sign │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  Broadcast Tx    │
                    └───────────────────┘
```

---

## Code Examples

### Example 1: Simple SP UTXO Spend (Regular BTC Address)

```typescript
import { SilentPaymentSpender } from './helpers/silent-payments';
import * as bitcoin from 'bitcoinjs-lib';

// Your SP UTXOs
const spUtxos: SilentPaymentUTXO[] = getMySpUtxos();

// Create PSBT
const psbt = new bitcoin.Psbt();

// Add inputs (using @silent-pay/core)
for (const utxo of spUtxos) {
  const input = SilentPaymentSpender.createTaprootInput(utxo, spendPubKey);
  psbt.addInput({
    hash: input.hash,
    index: input.index,
    witnessUtxo: {
      script: input.witnessUtxo.script,
      value: BigInt(input.witnessUtxo.value),
    },
    tapInternalKey: input.tapInternalKey,
  });
}

// Add regular output
psbt.addOutput({
  address: 'bc1q...',  // Regular Bitcoin address
  value: BigInt(50000),
});

// Sign inputs
spUtxos.forEach((utxo, idx) => {
  SilentPaymentSpender.signTaprootInput(psbt, idx, utxo, spendPrivKey);
});

// Broadcast
psbt.finalizeAllInputs();
const tx = psbt.extractTransaction();
```

### Example 2: SP UTXO → SP Address (Using Hybrid)

```typescript
import { SilentPaymentTransactionBuilder } from './helpers/silent-payments';

const builder = new SilentPaymentTransactionBuilder(spendPrivKey, spendPubKey);

const psbt = builder.createCompletePSBT(
  spUtxos,
  [{ address: 'sp1...receiver...', value: 50000 }],
  2, // fee rate
  'sp1...change...', // SP change address
);

psbt.finalizeAllInputs();
const tx = psbt.extractTransaction();
```

### Example 3: Validating UTXOs Before Spending

```typescript
import { SilentPaymentSpender } from './helpers/silent-payments';

const spUtxos: SilentPaymentUTXO[] = getMySpUtxos();

// Verify all UTXOs are spendable
const validationResults = SilentPaymentSpender.batchVerify(
  spUtxos,
  spendPrivKey
);

validationResults.forEach((isValid, idx) => {
  if (!isValid) {
    console.error(`UTXO ${spUtxos[idx].txid}:${spUtxos[idx].vout} is invalid!`);
  }
});

// Or use the transaction builder's validation
const builder = new SilentPaymentTransactionBuilder(spendPrivKey, spendPubKey);
const { valid, errors } = builder.validateUTXOs(spUtxos);

if (!valid) {
  console.error('UTXO validation errors:', errors);
}
```

---

## Fee Estimation

```typescript
import { SilentPaymentSpender, SilentPaymentTransactionBuilder } from './helpers/silent-payments';

// Method 1: Manual calculation
const inputSize = SilentPaymentSpender.getTaprootInputSize(); // 58.5 vB
const outputSize = SilentPaymentSpender.getTaprootOutputSize(); // 43 vB

const txSize = (inputSize * numInputs) + (outputSize * numOutputs) + 10.5;
const fee = Math.ceil(txSize * feeRate);

// Method 2: Using transaction builder
const builder = new SilentPaymentTransactionBuilder(spendPrivKey, spendPubKey);
const estimatedSize = builder.estimateTransactionSize(
  numInputs,
  numOutputs,
  hasSilentPaymentOutput
);
const fee = Math.ceil(estimatedSize * feeRate);
```

---

## Summary: When to Use What

| Use Case | Library | Component |
|----------|---------|-----------|
| **Spending SP UTXOs** | @silent-pay/core | `SilentPaymentSpender` |
| **Sending TO SP addresses** | BlueWallet silent-payments | `SilentPayment.createTransaction()` |
| **Mixed transactions** | Both (hybrid) | `SilentPaymentTransactionBuilder` |
| **Receiving SP payments** | BlueWallet silent-payments | `SilentPayment.detectOurUtxos()` |
| **Computing tweaks** | BlueWallet silent-payments | `SilentPayment.computeTweakForTx()` |
| **Validating UTXOs** | @silent-pay/core | `SilentPaymentSpender.verifyTweakedKey()` |
| **Fee estimation** | @silent-pay/core | `SilentPaymentSpender.getTaprootInputSize()` |

---

## Key Takeaways

1. ✅ **Keep @silent-pay/core** for spending - it's essential for proper Schnorr signing
2. ✅ **Use BlueWallet library** for target processing - it handles SP address conversion
3. ✅ **Use the hybrid approach** (`SilentPaymentTransactionBuilder`) for complete transactions
4. ⚠️ **Don't try to spend with BlueWallet library alone** - it's not designed for that
5. 🎯 **The hybrid approach gives you the best of both worlds**

---

## Additional Resources

- [BIP-352 Specification](https://github.com/bitcoin/bips/blob/master/bip-0352.mediawiki)
- [BlueWallet Silent Payments Repo](https://github.com/BlueWallet/SilentPayments)
- [@silent-pay/core NPM](https://www.npmjs.com/package/@silent-pay/core)
- [Taproot Signing Documentation](https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki)
