# Split Payment Privacy Redesign

Date: 2026-06-18
Branch: feat/split-payments
Status: Design — approved decisions, pending spec review

## Background

This is a Silent Payments (BIP-352) wallet. When sending to a single reusable
`sp1…` address, the "split payment" feature partitions the payment into several
on-chain Taproot outputs (each a distinct BIP-352–derived `k`) instead of one.
The motivation is the **amount-correlation** countermeasure from the Bitcoin
wiki's *Change address detection* section: returning a single identifiable
amount `V` lets an adversary find the payment by scanning the chain for `V`;
splitting `V` into `w0, w1, …` that sum to `V` defeats that.

Reference: https://en.bitcoin.it/wiki/Privacy#Change_address_detection

### Current implementation (`helpers/silent-payments/splitPayment.ts`)

- `computeSplitCount(V)` → `n = round(V / 100_000)`, clamped to `[2, 5]`, then
  floored by feasibility (`floor(V / 25_000)`). **The count is a deterministic
  function of `V`.**
- `splitAmount(V, n)` → each output gets a fixed `25_000` floor; the remainder is
  distributed by uniform random weights; integer slack lands on a random output.
  Amounts sum to exactly `V`.
- Wired in `class/wallets/hd-bip352-wallet.ts::createTransaction`: when
  `splitPayment` is on and the single target is an `sp1…` address, targets are
  expanded **before** coin selection.
- The change output uses the wallet's normal change address. Because
  `HDSilentPaymentsWallet extends HDTaprootWallet`, change is **P2TR — the same
  script type as the split outputs.**

### How the wiki heuristics map onto the current code

| Wiki heuristic | Current status |
| --- | --- |
| Script type of change | ✅ Already consistent (change and payments both P2TR). No change needed. |
| Amount correlation | ⚠️ Feature addresses it, but the **deterministic count** lets an adversary confirm a Shroud split and recover `V`'s bucket from the output set — partially undoing the defense, and a wallet fingerprint. |
| Round numbers | ⚠️ Random splitting *usually* yields irregular amounts, but nothing guarantees an output never lands on a round value; roundness is not managed. |
| Equal-output / recognizable distribution | ⚠️ Uniform-weight proportional partition clusters around `V/n` and uses a fixed `25k` floor — a recognizable shape and a fingerprint. |
| Change blending | ⚠️ Change runs *before* coin selection, so the split can't see the change amount `C`; a `C` outside the split outputs' range still stands out as "the odd one." |

## Goals

1. **Decouple the output count from `V`** so the amount cannot be inferred from
   the number (or shape) of outputs. Strengthens amount-correlation resistance
   and removes a fingerprint.
2. **Draw amounts from a log-uniform distribution** so the output set looks like
   a natural mix of magnitudes rather than a uniform partition.
3. **Blend the change output** into the payment outputs so an adversary cannot
   identify which output is the change (the literal "change address detection"
   defense).
4. **Avoid round-number outputs** so no output looks like a "payment-shaped"
   round amount.

## Non-goals

- The mixed-UTXO (SP + regular) path remains unimplemented and out of scope.
- No empirical / baked-in real-world output-value model (considered and
  rejected as overkill for a mobile wallet — see Alternatives).
- No change to coin-selection input policy (the wiki's *unnecessary input /
  optimal change* heuristic is about input selection, not output splitting, and
  is out of scope here).
- Non-`sp1` recipients and multi-recipient sends are unaffected.

## Approved decisions

- **Scope:** comprehensive redesign (randomized count + non-recognizable
  distribution + change blending), not a minimal patch.
- **Change handling:** adaptive — a single change output by default, drawn from
  the same distribution; split into multiple in-range pieces only when a single
  change value would be an outlier.
- **Distribution:** log-uniform weighted partition (Approach A).
- **Max payment outputs:** keep the cap at **5** (change pieces are additional).
- **Count preview UX:** the `SendDetails` toggle shows an **estimated range**;
  `Confirm` shows the **actual** finalized count.

## Design

### Module boundaries

- **`helpers/silent-payments/splitPayment.ts`** — pure functions, `async` only
  because `randomBytes` is async in React Native. No wallet/network
  dependencies, so fully unit-testable. New public surface:
  - `planSplitOutputs(params) → { paymentAmounts: number[], changeAmounts: number[] }`
    — the unified planner. Picks the count, draws log-uniform amounts, blends
    change, and self-accounts for the fee of any extra change outputs.
  - Composed helpers (also exported for testing): `pickCount`,
    `logUniformPartition`, `deRound`, `economicFloor`, `planChangeOutputs`.
    `planChangeOutputs` receives the **realized** `pMax = max(paymentAmounts)` so
    its branch decision is deterministic and unit-testable in isolation.
  - `params`: `{ paymentValue, changeValue, feeRate, outputVBytes, dustThreshold }`.
  - **Testability:** every randomness-consuming function takes an optional
    `rng: (size: number) => Promise<Buffer>` argument that defaults to
    `randomBytes` from `class/rng`. Tests inject a deterministic `rng`; production
    uses the default.
- **`class/wallets/hd-bip352-wallet.ts`** — `createSPTransaction` reordered to
  coin-select first, then call the planner, then fetch N distinct change
  addresses and shuffle outputs.
- **UI** (`screen/send/SendDetails.tsx`, `screen/send/Confirm.tsx`) — count
  preview adjustments.

### 1. Count selection (`pickCount`)

```
maxFeasible = min(SPLIT_MAX_OUTPUTS, floor(paymentValue / floor))
n           = uniform random integer in [2, maxFeasible]      // inclusive
```

The magnitude of `V` no longer determines the count; only feasibility caps it,
so `V` is not recoverable from the output count. `SPLIT_MAX_OUTPUTS = 5`.

### 2. Amount distribution (`logUniformPartition`)

For a value `S` to be split into `n` parts, each `≥ floor`:

```
for i in 0..n-1:
    u_i      = uniform in [0, 1)                 // from randomBytes
    weight_i = exp(u_i * ln(R))                  // R = SPLIT_SPREAD_RATIO ≈ 8
sumW   = Σ weight_i
budget = S - n * floor                            // ≥ 0 by feasibility
part_i = floor + integerFloor((weight_i / sumW) * budget)
slack  = S - Σ part_i                             // rounding remainder
part[randomIndex] += slack                        // exact sum
```

Result: every part `≥ floor`, parts span a range of magnitudes (ratio up to ~R),
and `Σ part = S` exactly. Used for both the payment split (`S = V`) and the
change split when change is an outlier (`S = C − extraFee`).

#### Economic floor (`economicFloor`)

Replaces the fixed `25_000` constant:

```
inputCost = SPEND_INPUT_VBYTES * feeRate           // cost to later spend a P2TR input
floor     = max(SPLIT_MIN_OUTPUT_SATS, FLOOR_K * inputCost) + jitter
```

`FLOOR_K ≈ 3` keeps outputs economically spendable; `jitter` is a small random
delta so the floor is not a constant fingerprint. `SPLIT_MIN_OUTPUT_SATS`
(25_000) is retained only as an absolute lower bound.

#### Round-number guard (`deRound`)

Any amount that lands on a round value (`amount % SPLIT_ROUND_MODULUS == 0`,
`SPLIT_ROUND_MODULUS = 1000`) is nudged by a small random delta and the delta is
compensated on **another element of the same array**, preserving the exact sum.
It therefore applies only to multi-element arrays — the payment parts (always
`n ≥ 2`) and multi-piece change. A lone change output is **not** de-rounded: its
value is fixed by the transaction balance, so nudging it would either shortchange
the recipient or silently inflate the fee. Round change is rare (it is
`inputs − V − fee`) and acceptable.

### 3. Adaptive change blending

**Fee baseline.** Coin selection (step 1) prices a 2-output transaction
(1 payment + 1 change). The plan adds outputs, each adding `outputVBytes` of
vsize. The planner reduces the raw change `C` by the fee of **every output added
beyond that baseline** — extra payment outputs *and* extra change outputs alike:

```
pricedOutputs   = 2                         // coinselect baseline (1 pay + 1 change)
totalOutputs    = n + m                      // n payment parts, m change pieces (m ≥ 0)
extraFee        = max(0, totalOutputs - pricedOutputs) * outputVBytes * feeRate
distributable   = C - extraFee               // spendable change after added-output fees
```

Then, given the payment parts' per-output range `[pMin, pMax]`:

```
if distributable < dustThreshold:
    m = 0; changeAmounts = []                  // no change output (fold into fee)
elif distributable <= pMax:
    m = 1; changeAmounts = [distributable]     // single, in-distribution
else:  // distributable > pMax — a single change output would be an outlier
    m = ceil(distributable / pMax)            // number of change pieces
    changeAmounts = logUniformPartition(distributable, m, floor)
```

Because `m` and `extraFee` are mutually dependent (more pieces → higher
`extraFee` → smaller `distributable`), the planner solves them together: start
from `m` implied by `C`, recompute `extraFee` and `distributable`, and if any
resulting piece would fall below `dustThreshold`, decrement `m` and recompute
until stable (monotonic, converges in a few steps). Change pieces are drawn from
the same log-uniform partition as payments, so they are indistinguishable from
payment outputs.

### 4. Transaction-builder reorder (`createSPTransaction`)

Current order expands the split **before** coin selection. New order:

1. Coin-select the **single** `V` target → selected inputs, `fee`, change `C`.
2. `planSplitOutputs({ paymentValue: V, changeValue: C, feeRate, outputVBytes, dustThreshold })`
   → `paymentAmounts` (sum `V`) and `changeAmounts` (sum `C − extraFee`).
3. Build outputs:
   - `paymentAmounts.length` targets to the `sp1…` address — the SP library
     increments `k` per output in the recipient group, yielding that many
     distinct P2TR scripts.
   - one output per change piece, each to a **distinct** internal change address
     (the wallet derives several sequential change addresses — **no address
     reuse**).
4. **Shuffle** all outputs (Fisher–Yates over `randomBytes`) so the change is not
   positionally identifiable (e.g. never "always last").
5. Resolve `sp1` targets and sign exactly as today.
6. **Recompute the reported fee** as `sum(selected input values) − sum(all output
   values)`. Because added outputs and de-rounding take their cost out of change,
   the coin-selection `fee` no longer matches the built transaction; the in−out
   identity is the source of truth and covers every branch (extra outputs, dropped
   change). Selected inputs always cover the payments (which sum to exactly `V`)
   plus whatever change remains, so the fee stays positive.
7. Return the list of change addresses used (`changeAddresses: string[]`) in
   `CreateTransactionResult` so the UI can filter all change outputs, not just one.

#### Fee / output-count dependency

The planner subtracts the fee for every output added beyond the 2-output
coin-selection baseline (`extraFee` in §3) from the change before partitioning
it, and reduces the change-piece count if that would push a piece below dust.
One residual case: extra fees come out of *change*, so the payment outputs are
always fully funded — but if `C` is small and `extraFee` exceeds it, change is
simply dropped (folded into fee) rather than going negative. The selected inputs
already cover `V + fee` for the baseline, and added outputs are paid from change,
so a second coin-selection pass is only needed if change is dropped *and* the
wallet wants to reclaim the now-unspent surplus; in that case coin selection is
re-run with the final target list and the plan recomputed (converges in one
extra pass).

### 5. UX: count preview

The final count depends on `C`/fee, known only at build time. Therefore:

- `SendDetails` toggle: show an **estimated range** (e.g. "splits into ~3–6
  outputs"), derived from `[2, maxFeasible]` for the entered amount.
- `Confirm`: show the **actual** finalized output count from the built
  transaction.

## Constants

| Constant | Value | Role |
| --- | --- | --- |
| `SPLIT_MAX_OUTPUTS` | 5 | Cap on payment outputs. |
| `SPLIT_MIN_OUTPUT_SATS` | 25_000 | Absolute lower bound for the economic floor. |
| `SPLIT_SPREAD_RATIO` (R) | ~8 | Max magnitude ratio across log-uniform parts. |
| `FLOOR_K` | ~3 | Economic-floor multiple of input spend cost. |
| `SPEND_INPUT_VBYTES` | 58 | Approx. vbytes to spend a P2TR input (floor sizing). |
| `OUTPUT_VBYTES` | 43 | Approx. vbytes of one P2TR output (added-output fee accounting). |
| `SPLIT_ROUND_MODULUS` | 1000 | Amounts divisible by this are de-rounded. |

`SPLIT_OUTPUT_THRESHOLD_SATS` (100_000) is **removed** — it only fed the old
deterministic count.

## Testing

- **Pure planner unit tests (seeded RNG):**
  - payment amounts sum to exactly `V`;
  - change amounts sum to exactly `C − extraFee`;
  - every output `≥ floor`;
  - no amount is divisible by `SPLIT_ROUND_MODULUS`;
  - count within `[2, maxFeasible]`;
  - log-uniform spread sanity (parts span more than a trivial range).
- **Property tests** over many random `(V, C, feeRate)`: all invariants hold; no
  dust outputs; fee accounting is correct (inputs − outputs − fee == 0).
- **Wallet-level test (`createSPTransaction`):** recipient receives exactly `V`
  across `n` outputs; change addresses are all distinct; outputs are shuffled
  (not in deterministic target order); transaction balances.
- **Edge cases:** `C < dust` (no change output); `C` very large (many change
  pieces, fee-accounted); `V` barely feasible (`n = 2`); high `feeRate` (floor
  rises → fewer outputs); coin-selection re-run path when extra fees exceed the
  first selection.

## Alternatives considered

- **Uniform partition, hardened (Approach B):** keep the uniform split, add only
  randomized count + round-number jitter + fee-relative floor. Lowest risk but
  uniform partitions still cluster around `V/n` and blend large change poorly.
  Rejected in favor of the stronger camouflage of log-uniform.
- **Empirical-distribution sampling (Approach C):** sample from a baked-in model
  of real Bitcoin output values. Best camouflage but needs reference data and is
  the heaviest to build/test. Rejected as YAGNI for a mobile wallet.
- **Always multiple change outputs:** the wiki's explicit "multiple change
  outputs" advice. Rejected in favor of the adaptive rule, which gets
  indistinguishability at lower fees/UTXO bloat by only splitting change when a
  single value would be an outlier.

## Risks

- **Fee increase / UTXO bloat:** more outputs cost more and create more UTXOs for
  the sender. Bounded by `SPLIT_MAX_OUTPUTS` and the adaptive change rule.
- **Coin-selection coupling:** the reorder introduces a possible second
  selection pass; must be verified to converge and to keep the SP library's
  per-recipient `k` increment intact.
- **Change-address derivation:** splitting change requires several distinct
  internal addresses; reuse would be a glaring privacy regression and must be
  tested.
