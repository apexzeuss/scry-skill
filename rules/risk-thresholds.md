# Risk Thresholds & Scoring Weights

This file documents the scoring model implemented in `scripts/scan_wallet.ts`.
It is intentionally a simple, explainable weighted sum (no ML) so the output can
be verified by hand. If you change a number here, change it in `scan_wallet.ts`
too — the constants live in `WEIGHTS` and the `*Risk()` functions.

## Final score

```
risk_score = round( 100 * ( Σ component_i * weight_i ) / Σ weight_i )   // 0-100
```

`risk_level`:

| score | level |
| --- | --- |
| 0-33 | low |
| 34-66 | medium |
| 67-100 | high |

`confidence`:

| available signals | confidence |
| --- | --- |
| 5/5 | high |
| 3-4/5 | medium |
| 0-2/5 | low |

Confidence measures data completeness, not certainty that the verdict is right.
For example, public RPC may block transaction sampling; the score remains
explainable, but the report is marked as degraded.

Weights are renormalized over only the **available** components (see
"Graceful degradation" below), so a missing signal never silently drags the
score toward zero.

## Components and weights

Each component is normalized to 0-1 (1 = riskiest).

| Component | Weight | Definition |
| --- | --- | --- |
| `age` | 0.30 | Account age from the oldest seen signature. `1.0` at ≤7 days, linearly to `0` at ≥180 days. |
| `activity` | 0.15 | `0.6 * thin + 0.4 * failed_tx_ratio`, where `thin = clamp01(1 - tx_count / 50)`. Thin or spammy history is riskier. |
| `diversity` | 0.15 | Program diversity. `1.0` at ≤1 distinct program, linearly to `0` at ≥8. Narrow interaction set is riskier. |
| `wash` | 0.20 | Counterparty concentration = (txns involving the single most frequent counterparty) / (sampled txns). Loops with a few wallets are riskier. |
| `dump` | 0.20 | Emptied-token-account ratio = (0-balance token accounts) / (total token accounts). Acquire-then-dump pattern. |

Weights sum to `1.0`.

## Sampling bounds

| Constant | Value | Why |
| --- | --- | --- |
| `MAX_SIGNATURES` | 1000 | Cap on signature pagination for age + activity. Keeps public RPC happy. |
| `SAMPLE_TX` | 25 | Recent transactions parsed for `diversity` + `wash`. |

When the signature cap is hit, the wallet is highly active and its true age is
unknown, so **`age` is excluded** from the score and reported as a lower bound.

## `rug_history_flag` (heuristic proxy)

Set when **all** of:

- `account_age_days <= 14`, AND
- `tx_count_sampled <= 25`, AND
- `wash_trading_score >= 0.5`.

This is a cheap "young + thin + concentrated" proxy at the **wallet** level. The
hard rug evidence is computed at the **token** level instead (see next section).

## Token-level rug checks (deployment watcher)

When the watcher finds a new token mint, `inspectToken()` adds hard on-chain
signals (single RPC calls, not heuristics) that flag a deployment even if the
deployer wallet itself scores low:

| Check | Source | Why it matters |
| --- | --- | --- |
| Mint authority still active | mint account `mintAuthority != null` | Supply can be inflated at will |
| Freeze authority still active | mint account `freezeAuthority != null` | Holders' tokens can be frozen (honeypot) |
| Top-holder concentration ≥ 50% | `getTokenLargestAccounts` vs supply | One wallet controls the token |

This is why a clean-looking deployer can still get its token flagged.

## Token rug-check score (`scan_token.ts`)

The standalone token scan turns the same hard signals (plus market + deployer
data) into a 0-100 `risk_score`. Additive weights, capped at 100:

| Condition | Points | Why |
| --- | --- | --- |
| Freeze authority active | +50 | Honeypot: holders can be frozen out |
| Mint authority active | +25 | Supply can be inflated |
| Deployer wallet scores ≥ 67 | +20 | Launched by a high-risk wallet |
| Has a market but liquidity < $1k | +15 | Effectively can't sell |
| Has a market and top-10 holders ≥ 90% | +10 | Extreme concentration |

`risk_level`: low `<25`, medium `25-49`, high `≥50` (so a lone freeze-authority
honeypot flag is already HIGH). Liquidity / market cap / volume / age come from
DexScreener; holder count from Helius DAS (`null` on other RPCs). `top10_pct` may
include the liquidity-pool account, so high values right after launch are partly
expected, the report says so.

## Maturity dampener

For clearly established/high-volume wallets (signature cap hit, or ≥ 200 sampled
txns) the `wash` and `diversity` components are multiplied by `0.5`. Those two
signals are read from only a 25-tx sample and false-positive on legit bots and
power users who lean on one app. A deep history already proves the wallet is not
a throwaway. The report `notes` flag when this applies.

## Graceful degradation

The model only scores what the RPC can deliver:

- **Public RPC refuses `getParsedTransactions`** → `diversity` and `wash` are
  dropped and weights renormalized over `{age, activity, dump}`. The report's
  `notes` say so, and `rpc_degraded` is set.
- **Signature cap hit** → `age` is dropped (see above).

A degraded score must never be presented as a full-confidence one. The scripts
emit the relevant `notes`; surface them.

## Tuning guidance

- Raising the `age` weight makes the model stricter on new wallets (good for
  copy-trading, noisy for airdrop farming where new wallets are normal).
- The `wash` and `dump` weights carry the "manipulation" signal; raise them if
  you care more about market behaviour than novelty.
- Thresholds (`low/medium/high` cutoffs) are deliberately wide; tighten them for
  a higher-precision, lower-recall flagging policy.
