# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**shroud** is a React Native Bitcoin wallet focused on Silent Payments ([BIP-352](https://github.com/bitcoin/bips/blob/master/bip-0352.mediawiki)). Silent Payments are a privacy-preserving payment protocol where the sender uses the recipient's public key to derive a one-time address, so on-chain observers cannot link payments to a known recipient address.

## Commands

```bash
# Start Metro bundler
npm run start

# Run on Android / iOS
npm run android
npm run ios

# Type check only
npm run tslint

# Lint (unused-loc check + eslint)
npm run lint
npm run lint:fix

# Tests
npm run unit                        # unit tests only
npm run integration                 # integration tests (hits real Electrum)
npm test                            # tslint + lint + unit + integration

# Run a single test file
npx jest tests/unit/bip352.test.ts

# Rust native library (must rebuild when rust_jsi_bridge/ changes)
npm run rust:build                  # build for current platform
npm run android:rust                # build Rust + clean Android + run
```

## Architecture

### Wallet Class Hierarchy

`AbstractWallet` → `AbstractHDWallet` → `AbstractHDElectrumWallet` → `HDTaprootWallet` → **`HDSilentPaymentsWallet`**

- `class/wallets/abstract-wallet.ts` — base state (label, secret, balance, UTXOs, metadata)
- `class/wallets/abstract-hd-electrum-wallet.ts` — HD derivation + Electrum protocol; handles PSBT construction, coin selection, and balance tracking per derivation index
- `class/wallets/hd-taproot-wallet.ts` — BIP-86 Taproot (`m/86'/0'/0'`)
- `class/wallets/hd-bip352-wallet.ts` — **primary wallet class**; owns the silent payment scan loop, SP UTXOs, and spending transaction tracking

### Silent Payments Internals

Silent payment scanning is performance-critical and split across several layers:

1. **`helpers/silent-payments/`** — pure-TS utilities: key derivation (`SilentPaymentKeyDerivation.ts`), UTXO processing (`RustTransactionProcessor.ts`), shared types
2. **`modules/SilentPaymentIndexer.ts`** — HTTP client for the SP indexer API (fetches raw transactions by block height/range for scanning)
3. **`modules/RustJsiBridge.ts`** — JSI bridge to the Rust native module; exposes `spScanTransactions` / `spScanSingleTransaction`
4. **`rust_jsi_bridge/`** — Rust crate that does the actual ECC math for tweak derivation and output matching

The indexer URL is hardcoded in `App.tsx` (the `ngrok` URL) — change it there when switching environments.

`BIP352_ACTIVATION_HEIGHT = 842579` (defined in `modules/constants.ts`) is the earliest block the wallet will scan from.

### App State & Storage

- **`class/shroud-app.ts`** — `ShroudApp` singleton; owns wallet list, tx metadata, and all persistence. Wallets are serialized to JSON and stored in Realm (`TRealmTransaction`) with encrypted secrets in Keychain/SecureKeyStore.
- **`components/Context/StorageProvider.tsx`** — React context that wraps `ShroudApp`; all screens access wallets and operations through `useStorage()`.
- **`components/Context/SettingsProvider.tsx`** — app-wide settings (currency, units, biometrics, etc.)

### Navigation

`App.tsx` → `MasterView` → `navigation/index.tsx` (root `NativeStackNavigator`)

All stacks except `UnlockWith` are lazy-loaded via `React.lazy`. The navigation root decides whether to show the unlock screen or the drawer based on wallet initialization state.

### Modules

`modules/` contains standalone utilities:
- `Electrum.ts` — Electrum TCP client integration
- `encryption.ts` — AES-based storage encryption
- `currency.ts` — fiat rate fetching
- `notifications.ts` — push notifications to Ground Control
- `noble_ecc.ts` — noble-secp256k1 ECC implementation (used with bitcoinjs-lib and bip32)

### Code Style

- Prettier: single quotes, 140-char print width, trailing commas, no parens for single arrow params
- No inline styles (`react-native/no-inline-styles` is an error)
- No unused StyleSheet entries (`react-native/no-unused-styles` is an error)
- `@ts-ignore` is allowed but must include a description of why

### Testing Notes

- Unit tests live in `tests/unit/` and are fully offline
- Integration tests in `tests/integration/` connect to real Electrum servers — set `RETRY=1` in env for CI
- E2E tests use Detox against an Android emulator (`npm run e2e:debug`)
