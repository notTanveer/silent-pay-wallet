# Helpers Folder Structure

This document describes the modular helper structure for Silent Payments functionality.

## 📁 Directory Structure

```
helpers/
└── silent-payments/
    ├── index.ts                          # Public API exports
    ├── types.ts                          # Type definitions
    ├── SilentPaymentKeyDerivation.ts    # Key management
    ├── UTXORepository.ts                 # UTXO storage
    ├── TransactionProcessor.ts          # Transaction scanning
    └── IndexerHttpClient.ts             # HTTP communication
```

## 📦 Modules

### `types.ts` - Type Definitions
**Purpose**: Centralized type definitions for the entire Silent Payments system

**Exports**:
- **Configuration Types**
  - `SilentPaymentIndexerConfig` - Indexer configuration
  
- **Indexer Response Types**
  - `TweakData` - Tweak data structure
  - `SilentBlock` - Block with tweaks
  - `HealthResponse` - Health check response
  - `IndexerOutput` - Output from indexer
  - `IndexerTransactionData` - Transaction data from indexer
  - `TransactionResponse` - Batch transaction response
  - `TransactionResponseLegacy` - Legacy format (backward compatibility)
  
- **Wallet Transaction Types**
  - `IndexerTransaction` - Processed transaction for wallet
  
- **UTXO Types**
  - `SilentPaymentUTXOBase` - Base UTXO fields
  - `SilentPaymentUTXO` - Runtime UTXO with Uint8Array tweak
  - `SilentPaymentUTXOSerializable` - Serializable UTXO with hex tweak

---

### `SilentPaymentKeyDerivation.ts` - Key Management
**Purpose**: Handle BIP-352 key derivation for Silent Payments

**Responsibilities**:
- Derive scan and spend keys from seed using BIP-32
- Generate Silent Payment addresses
- Provide key access methods
- Lazy initialization for performance

**Key Methods**:
```typescript
getScanPrivateKey(): Uint8Array
getSpendPrivateKey(): Uint8Array
getScanPublicKey(): Uint8Array
getSpendPublicKey(): Uint8Array
getSilentPaymentAddress(): string
clear(): void
```

**Derivation Paths**:
- Spend key: `m/352'/0'/0'/0'/0`
- Scan key: `m/352'/0'/0'/1'/0`

---

### `UTXORepository.ts` - UTXO Storage
**Purpose**: Manage UTXO storage, retrieval, and serialization

**Responsibilities**:
- Add UTXOs with automatic deduplication
- Query unspent UTXOs
- Calculate balance
- Handle serialization for persistence
- Convert between runtime and serializable formats

**Key Methods**:
```typescript
add(utxo: SilentPaymentUTXO): boolean
getAll(): SilentPaymentUTXO[]
getBalance(): number
getSerializable(): SilentPaymentUTXOSerializable[]
loadFromSerializable(serializable: SilentPaymentUTXOSerializable[]): void
clear(): void
```

**Features**:
- Automatic deduplication by `txid:vout`
- Filters out spent UTXOs
- Maintains both runtime and serializable formats

---

### `TransactionProcessor.ts` - Transaction Scanning
**Purpose**: Process transactions to find matching Silent Payment outputs

**Responsibilities**:
- Scan transaction outputs for matches
- Use `@silent-pay/core` for ECDH and tweak derivation
- Validate scan tweaks
- Build UTXO objects from matches

**Key Methods**:
```typescript
process(tx: IndexerTransaction): SilentPaymentUTXO[]
```

**Algorithm** (using `@silent-pay/core`):
1. Compute ECDH shared secret: `b_scan * scanTweak`
2. Derive tweaks using BIP-352/SharedSecret tagged hash
3. Check if outputs match: `P = B_spend + tweak*G`
4. Return matched UTXOs with tweaks

**Strategy Pattern**: Can be swapped with alternative implementations

---

### `IndexerHttpClient.ts` - HTTP Communication
**Purpose**: Handle HTTP communication with the Silent Payment indexer

**Responsibilities**:
- Execute GET requests with timeout
- Error handling and logging
- Response parsing
- Base URL management

**Key Methods**:
```typescript
get<T>(endpoint: string, errorContext: string): Promise<T>
getBaseUrl(): string
setBaseUrl(url: string): void
```

**Design Pattern**: Template Method
- All GET requests use common `executeGet<T>()` method
- Eliminates ~120 lines of code duplication

---

## 🔧 Usage Examples

### Import Everything from Index
```typescript
import {
  SilentPaymentKeyDerivation,
  UTXORepository,
  TransactionProcessor,
  IndexerHttpClient,
  type SilentPaymentUTXO,
  type IndexerTransaction,
} from '../helpers/silent-payments';
```

### Using Key Derivation
```typescript
const seed = mnemonicToSeedSync(mnemonic, '');
const keyDerivation = new SilentPaymentKeyDerivation(seed);
const address = keyDerivation.getSilentPaymentAddress();
```

### Using UTXO Repository
```typescript
const repository = new UTXORepository();
const added = repository.add(utxo); // Returns false if duplicate
const balance = repository.getBalance();
const unspentUTXOs = repository.getAll();
```

### Using Transaction Processor
```typescript
const processor = new TransactionProcessor(keyDerivation);
const matchedUTXOs = processor.process(transaction);
```

### Using HTTP Client
```typescript
const client = new IndexerHttpClient('https://indexer.example.com', 30000);
const health = await client.get<HealthResponse>('/health', 'Health check failed');
```

---

## ✨ Benefits of This Structure

### 1. **Modularity**
- Each module has a single, clear responsibility
- Can be imported independently
- Easy to understand and modify

### 2. **Reusability**
- Components can be used in other projects
- No tight coupling to wallet implementation
- Easy to test in isolation

### 3. **Maintainability**
- Changes are isolated to specific modules
- Clear boundaries between concerns
- Self-contained documentation

### 4. **Testability**
- Each module can be unit tested independently
- Easy to mock dependencies
- Clear interfaces

### 5. **Type Safety**
- Centralized type definitions
- Single source of truth
- TypeScript ensures correctness

### 6. **Discoverability**
- Single index.ts export file
- Organized by functionality
- Easy to navigate

---

## 🔄 How Files Work Together

```
┌─────────────────────────────────────────────────────────┐
│                    HDSilentPaymentsWallet               │
│                     (Orchestrator)                      │
└─────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐  ┌──────────────────┐  ┌─────────────┐
│ KeyDerivation│  │TransactionProcessor│  │UTXORepository│
└──────────────┘  └──────────────────┘  └─────────────┘
                            │
                            │ uses
                            ▼
                  ┌──────────────────┐
                  │  KeyDerivation   │
                  └──────────────────┘

┌─────────────────────────────────────────────────────────┐
│              SilentPaymentIndexer                       │
│                 (Coordinator)                           │
└─────────────────────────────────────────────────────────┘
                            │
                            │ uses
                            ▼
                  ┌──────────────────┐
                  │IndexerHttpClient │
                  └──────────────────┘
```

---

## 📋 Import/Export Flow

```typescript
// types.ts - Defines all types
export interface SilentPaymentUTXO { ... }

// SilentPaymentKeyDerivation.ts - Uses types
import { ... } from './types';

// index.ts - Re-exports everything
export { SilentPaymentKeyDerivation } from './SilentPaymentKeyDerivation';
export type { SilentPaymentUTXO } from './types';

// Consumer (wallet or indexer) - Imports from index
import { SilentPaymentKeyDerivation, type SilentPaymentUTXO } from '../helpers/silent-payments';
```

---

## 🎯 Design Principles Applied

1. **Single Responsibility** - Each file has one purpose
2. **Dependency Inversion** - Depend on abstractions (types)
3. **Open/Closed** - Easy to extend without modifying
4. **DRY** - No duplication across modules
5. **Separation of Concerns** - Clear boundaries

---

## 📈 Comparison: Before vs After

### Before
- 500+ line wallet file with everything mixed together
- 230+ line indexer file with duplicated HTTP logic
- Hard to test individual components
- Tightly coupled code

### After
- **Wallet**: ~200 lines (orchestration only)
- **Indexer**: ~200 lines (coordination only)
- **5 focused helper modules**: ~400 lines total
- Each component independently testable
- Clear separation of concerns

---

## 🚀 Future Extensions

This modular structure makes it easy to add:

1. **Different Transaction Processors**
   ```typescript
   class OptimizedTransactionProcessor extends TransactionProcessor { ... }
   ```

2. **Different Storage Backends**
   ```typescript
   class DatabaseUTXORepository extends UTXORepository { ... }
   ```

3. **Alternative Key Derivation**
   ```typescript
   class HardwareWalletKeyDerivation { ... }
   ```

4. **Caching Layers**
   ```typescript
   class CachedIndexerHttpClient extends IndexerHttpClient { ... }
   ```

All without modifying existing code!

---

## ✅ Summary

The `helpers/silent-payments` folder provides a clean, modular, and maintainable structure for Silent Payments functionality. Each module follows SOLID principles and can be understood, tested, and modified independently. This architecture scales well and makes the codebase much easier to work with.
