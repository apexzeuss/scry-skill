---
description: Rug-check a Solana token mint (honeypot, dilution, liquidity, holders, deployer).
argument-hint: <token-mint>
allowed-tools: Bash(npx tsx scripts/scan_token.ts:*)
---

Rug-check this Solana token: **$ARGUMENTS**

Run the token scanner from the skill root:

```bash
npx tsx scripts/scan_token.ts $ARGUMENTS --json
```

Then present the result to the user following `skill/token-rug-check.md`:

1. Lead with the risk level + score.
2. Cover the two rug switches first: can the creator freeze your tokens
   (honeypot) and can they mint more supply (dilution).
3. Then the market: liquidity, market cap, volume, age. Near-zero liquidity means
   "you may not be able to sell."
4. Then distribution + deployer: concentrated supply or a high-risk deployer are
   warnings even when authorities are revoked.
5. State plainly that this is on-chain facts, not financial advice.

If the scanner returns "not a token mint," the address is likely a wallet, score
it with `scripts/scan_wallet.ts` and `skill/wallet-risk-scoring.md` instead.
