# Token Rug Check

Scan a specific Solana **token mint** and report whether it looks like a rug or
honeypot, in the terms a trader actually cares about.

## When to use

User asks any of: "is this token a rug?", "is this coin safe?", "check this
token", "should I buy this?", "is this a honeypot?", or pastes a token mint
address. If the address turns out to be a wallet (not a mint), fall back to
`wallet-risk-scoring.md`.

## How to run

```bash
npx tsx scripts/scan_token.ts <MINT> [--json]
```

- `<MINT>` — base58 token mint address (required).
- `--json` — emit the structured report instead of the formatted view.

Set `SOLANA_RPC_URL` to a Helius URL for holder counts (Helius DAS) and reliable
deployer scoring. On the public endpoint those degrade to `null` gracefully.

## What it checks

| Question a trader asks | Signal |
| --- | --- |
| Can I get out, or am I trapped? | `freeze_authority_active` (honeypot) |
| Will they dilute me? | `mint_authority_active` |
| Is there money here? | `liquidity_usd`, `market_cap_usd`, `volume_24h_usd`, `age_days` (DexScreener) |
| Will I get dumped on? | `top_holder_pct`, `top10_pct`, `holder_count` |
| Is the dev a known rugger? | `deployer` scored with `scan_wallet.ts` |

`risk_score` 0-100 weights freeze authority highest (honeypot), then mint
authority, a high-risk deployer, near-zero liquidity, and extreme supply
concentration. `risk_level`: `low` (<34), `medium` (34-66), `high` (>66).

The key insight to convey: a token can have **both authorities revoked** (passes
the basic check) and still be dangerous if it is brand-new, thinly held,
concentrated, or launched by a high-risk wallet. This scan surfaces all of that.

## Output shape (`--json`)

```json
{
  "mint": "...",
  "mint_authority_active": false,
  "freeze_authority_active": false,
  "top_holder_pct": 0.5,
  "top10_pct": 0.72,
  "holder_count": 71,
  "has_market": true,
  "liquidity_usd": 6300,
  "market_cap_usd": 6342,
  "volume_24h_usd": 1200,
  "age_days": 0.1,
  "deployer": "...",
  "deployer_risk_score": 76,
  "deployer_risk_level": "high",
  "risk_score": 20,
  "risk_level": "low"
}
```

## How to present results to the user

1. Lead with `risk_level` + `risk_score`.
2. Hit the two binary rug switches first: can it freeze you, can it mint more.
3. Then the market reality: liquidity, market cap, age. Near-zero liquidity means
   "you may not be able to sell" even if nothing else is wrong.
4. Then distribution + deployer: concentrated supply or a high-risk deployer are
   warnings even when authorities are revoked.
5. State plainly: on-chain facts, not financial advice.

## Important caveats

- `top10_pct` may include the liquidity pool's account, so very high values right
  after launch are partly expected. Say so.
- A few legit tokens (regulated stablecoins) keep mint/freeze authority on
  purpose; for a random new token those are red flags. Note this if flagged.
- `holder_count` needs a Helius RPC; on other endpoints it is `null` (unknown),
  not zero.
