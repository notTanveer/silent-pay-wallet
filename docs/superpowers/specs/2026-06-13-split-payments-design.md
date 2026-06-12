# Split Payments — Design

**Date:** 2026-06-13
**Branch:** `feat/split-payments`
**Status:** Approved (design); pending implementation plan

## 1. Summary

Add a **Split payment** toggle to the send flow. When a payment is sent to a single
silent-payment recipient (`sp1...`), enabling the toggle splits it into multiple Taproot
outputs in **one transaction**, using the BIP-352 output counter `k` (k = 0, 1, 2, …):

```
P_k = B_spend + hash(ecdh_shared_secret || k) · G
```

The recipient's wallet scans and claims all `k` outputs, but on-chain each output is an
independent-looking Taproot key. An observer cannot distinguish "one recipient paid N times"
from "N distinct recipients," and no output reveals the recipient's SP address.

The wallet decides everything: the user only flips the toggle. The number of outputs scales
with the amount and the per-output amounts are randomized.

## 2. Background — current state of the code

Two facts from the codebase drive this design:

1. **The `k`-counter crypto already exists.** The `silent-payments` npm package's
   `SilentPayment.createTransaction(utxos, targets)` (node_modules/silent-payments/src/index.ts,
   ~lines 47–106) already groups targets by recipient and, for each output in a group, computes
   `taggedHash("BIP0352/SharedSecret", ecdh_shared_secret || ser32(k))` then `k += 1`. So
   **passing N targets with the same `sp1...` address automatically produces P₀, P₁, P₂ …** —
   no new ECC math is required if outputs flow through this path.

2. **The SP-UTXO spend path does NOT use that path.** `HDSilentPaymentsWallet`
   (`class/wallets/hd-bip352-wallet.ts`) holds SP UTXOs. Its `createTransaction` (line ~757)
   routes:
   - only SP UTXOs → `createSPTransaction` (line ~794) — adds outputs via
     `psbt.addOutput({ address })` directly and **never** invokes sender-side SP derivation.
   - only regular UTXOs → `super.createTransaction` (the parent
     `abstract-hd-electrum-wallet.ts`, line ~905) — **does** run `sp.createTransaction` for
     `sp1` outputs (line ~942).
   - mixed → throws (not implemented).

   The Rust JSI bridge (`modules/RustJsiBridge.ts`) only does **scanning** (receiver side), not
   sender derivation.

**Consequence:** spending SP UTXOs *to* an `sp1...` recipient is currently unwired — it would
call `psbt.addOutput({ address: 'sp1...' })`, which bitcoinjs rejects. So this feature has two
layers: (a) a foundational fix to enable SP→SP sending at all, and (b) the split feature on top.

## 3. Goals / Non-goals

**Goals**
- A toggle that, for a single `sp1` recipient, produces N Taproot outputs (k = 0…N-1) in one tx.
- Wire sender-side SP derivation into the SP-UTXO spend path (foundational; required regardless).
- N and the per-output amounts are chosen automatically by the wallet.

**Non-goals (v1)**
- Mixed SP + regular UTXO spends (still throws — unchanged).
- MAX send combined with split (disabled — see §7).
- User-tunable split parameters (count / per-output amounts).
- Splitting across **separate** transactions. The BIP-352 `k` counter is specifically for
  multiple outputs to the same recipient **in one transaction**; separate-tx unlinkability is a
  different feature and out of scope.

## 4. Split algorithm — pure helper

New module `helpers/silent-payments/splitPayment.ts`. Pure, no I/O, fully unit-tested.

**Constants**

| Name | Value | Meaning |
|------|-------|---------|
| `SPLIT_OUTPUT_THRESHOLD_SATS` | `100_000` | ~1 output per 0.001 BTC |
| `SPLIT_MAX_OUTPUTS` | `5` | Fee ceiling: at most +4 outputs (~172 vBytes) |
| `SPLIT_MIN_OUTPUT_SATS` | `25_000` | Per-output dust floor (keeps pieces from looking like dust) |

**`computeSplitCount(totalSats: number): number`**
- `n = clamp(round(totalSats / SPLIT_OUTPUT_THRESHOLD_SATS), 2, SPLIT_MAX_OUTPUTS)`
- Feasibility clamp: `n = min(n, floor(totalSats / SPLIT_MIN_OUTPUT_SATS))`
- If `totalSats < 2 * SPLIT_MIN_OUTPUT_SATS` (i.e. `< 50_000`) → return `1` (no split).

**`splitAmount(totalSats: number, n: number): number[]`**
- Returns `n` integer-sat amounts, each `>= SPLIT_MIN_OUTPUT_SATS`, summing **exactly** to
  `totalSats`.
- Method: seed each part at `SPLIT_MIN_OUTPUT_SATS`; distribute the remainder
  `totalSats - n * SPLIT_MIN_OUTPUT_SATS` across the parts using random weights; assign any
  integer-rounding slack to one randomly chosen part so the sum is exact.
- Randomness from a CSPRNG (the project's crypto random / noble `randomBytes`), **not**
  `Math.random` — this is a privacy feature.

## 5. Sender-side SP derivation (foundational fix)

In `createSPTransaction` (`class/wallets/hd-bip352-wallet.ts`), after `coinselect`, when any
output address starts with `sp1`:

1. Build `silent-payments` library UTXO objects from the **selected inputs**, each with:
   - `utxoType: 'p2tr'`
   - `wif`: WIF encoding of the tweaked private key `spendPrivKey + tweak` (already computed
     for signing at ~line 874). The library handles taproot key-parity negation internally.
   - `txid`, `vout` (used for the BIP-352 outpoint hash).
2. `outputs = sp.createTransaction(libUtxos, outputs)` — replaces each `sp1` target with its
   real Taproot address (k counter handled by the library); change / non-`sp1` outputs pass
   through unchanged.
3. Add outputs and sign exactly as today.

This mirrors the ordering the parent class already uses (`coinselect` → `sp.createTransaction`),
so coin-selection fee estimation for `sp1` outputs is unchanged and already exercised.

## 6. Flow & integration

- `HDSilentPaymentsWallet.createTransaction` and `createSPTransaction` gain an optional
  `splitPayment = false` parameter, threaded from the UI.
- When `splitPayment === true` and the single target is `sp1`-eligible: **before `coinselect`**,
  expand the one target into `N = computeSplitCount(total)` same-address `sp1` targets with
  `splitAmount(total, N)` values. Splitting before coinselect ensures the fee covers all N
  outputs.
- After coinselect, §5 derivation maps the N `sp1` targets to N Taproot outputs with k = 0…N-1.
- Split amounts are computed once at PSBT-build time (random per build; determinism within a
  send is not required — the PSBT is built once before Confirm).

## 7. UI (minimal)

- **`screen/send/SendDetails.tsx`**: a "Split payment" toggle/button, **visible and enabled only
  when**:
  - the recipient is a valid `sp1` address (`SilentPayment.isPaymentCodeValid`), and
  - the entered amount ≥ `2 * SPLIT_MIN_OUTPUT_SATS` (50_000 sats), and
  - it is not a MAX send.

  Its boolean state is passed into `createPsbtTransaction` → `wallet.createTransaction(...)`.
- **`screen/send/Confirm.tsx`**: when split is on, show the resulting output count (read from
  `result.outputs`, excluding change) so the user sees that N outputs are created and that the
  fee reflects them, before broadcasting.

## 8. Edge cases / constraints

| Case | Behavior |
|------|----------|
| Regular (non-`sp1`) recipient | Toggle hidden. Splitting a reused address is self-defeating. |
| `total < 50_000` sats | Toggle disabled; wallet defensively falls back to 1 output. |
| MAX send + split | Disabled in v1 (spendable total depends on fee, which depends on N — circular). |
| Mixed SP + regular UTXOs | Still throws (unchanged, out of scope). |
| N resolves to 1 | Single normal output (k = 0). |

## 9. Privacy properties (expectation-setting)

All N outputs live in **one transaction** sharing the same inputs, so an observer sees one tx
with N Taproot outputs plus change. What is gained:
- No output reveals the recipient's SP address (SP never reuses addresses).
- An observer cannot distinguish "one recipient paid N times" from "N distinct recipients."

What is **not** hidden: that these N outputs were co-created in the same transaction. True
separate-transaction unlinkability is out of scope (§3).

## 10. Testing

- **Unit — `splitPayment` helper:** count scaling at boundaries using `Math.round` semantics
  (`<50k`→1, `50k`→2, `150k`→2, `250k`→3, `450k`→5, `>500k`→5 cap); each piece ≥
  `SPLIT_MIN_OUTPUT_SATS`; exact sum equals total; N parts returned.
- **Unit / round-trip — derivation:** N same-`sp1` targets → N **distinct** Taproot output
  addresses with values matching the split; reuse `silent-payments` / BIP-352 test vectors
  where possible. Strongest check: a send-derive → Rust-scan round-trip proving the receiver
  recovers all N outputs (offline if feasible).
- **Regression:** existing send unit/integration tests stay green.

## 11. Affected files (anticipated)

- `helpers/silent-payments/splitPayment.ts` (new) + `helpers/silent-payments/index.ts` export.
- `class/wallets/hd-bip352-wallet.ts` — `createTransaction` / `createSPTransaction`: thread
  `splitPayment`, add pre-coinselect split expansion and post-coinselect SP derivation.
- `screen/send/SendDetails.tsx` — toggle + state threading.
- `screen/send/Confirm.tsx` — output-count display when split is on.
- `tests/unit/splitPayment.test.ts` (new) and derivation/round-trip test.
