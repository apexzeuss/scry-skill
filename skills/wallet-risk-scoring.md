# Wallet Risk Scoring

Score a Solana wallet 0-100 (higher = riskier) from its on-chain behaviour, with
an explainable breakdown the user can verify.

## When to use

User asks any of: "is this wallet safe?", "check this address", "scan this
wallet", "should I copy-trade this trader?", "is this deployer sketchy?".

## How to run

```bash
npx tsx scripts/scan_wallet.ts <ADDRESS> [--days N] [--json]
```

- `<ADDRESS>` — base58 Solana wallet address (required).
- `--days N` — only count activity in the last N days (default: full history).
- `--json` — emit the structured report instead of the formatted view.

Set `SOLANA_RPC_URL` to a Helius (or other) endpoint for the full signal set.
On the public endpoint the transaction-level signals (program diversity, wash
concentration) are skipped and the weights are renormalized; the script reports
this in its `notes`.

## What it computes

Five explainable signals, each normalized 0-1, combined by the weights in
`rules/risk-thresholds.md`:

| Signal | Meaning | Higher score means |
| --- | --- | --- |
| `age` | account age from first seen signature | newer wallet = riskier |
| `activity` | history depth + failed-tx ratio | thin / spammy = riskier |
| `diversity` | distinct programs interacted with | narrow set = riskier |
| `wash` | counterparty concentration | loops with few wallets = riskier |
| `dump` | share of emptied token accounts | acquire-then-dump = riskier |

`rug_history_flag` is a heuristic proxy (very young + thin + concentrated), not a
definitive rug verdict. Definitive rug detection needs enriched data (Helius
enhanced transactions / DAS); this is documented as a v2 path.

## Output shape (`--json`)

```json
{
  "address": "...",
  "risk_score": 54,
  "risk_level": "medium",
  "signals": {
    "account_age_days": 12,
    "account_age_is_lower_bound": false,
    "tx_count_sampled": 8,
    "failed_tx_ratio": 0,
    "distinct_programs": 2,
    "wash_trading_score": 0.0,
    "dump_behavior_score": 0.19,
    "rug_history_flag": false
  },
  "components": { "age": 1, "activity": 0.6, "diversity": 1, "wash": 0, "dump": 0.19 },
  "summary": "MEDIUM risk (54/100). ~12d old, 8 sampled txns across 2 distinct programs.",
  "notes": ["..."]
}
```

`risk_level`: `low` (<34), `medium` (34-66), `high` (>66).

## How to present results to the user

1. Lead with `risk_level` + `risk_score` and the one-line `summary`.
2. Call out the specific signals that drove it (e.g. "flagged because the wallet
   is 3 days old and 80% of its token accounts are already emptied").
3. Surface any `notes` that affect confidence (e.g. running on public RPC, or
   age being a lower bound). Do not present a degraded score as if it were full.
4. Be explicit that this is a behavioural heuristic, not financial advice.

## Important caveats

- A brand-new / unused wallet scores MEDIUM because absence of history is
  "unknown," not "safe." Say so.
- A very high-activity wallet can hit the signature cap; when it does, age is
  excluded from scoring and reported as a lower bound.
