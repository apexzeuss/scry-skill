---
description: Score the on-chain risk of a Solana wallet (0-100) with an explainable breakdown.
argument-hint: <solana-address> [--days N]
allowed-tools: Bash(npx tsx scripts/scan_wallet.ts:*)
---

Score the risk of this Solana wallet: **$ARGUMENTS**

Run the scanner from the skill root:

```bash
npx tsx scripts/scan_wallet.ts $ARGUMENTS --json
```

Then present the result to the user following `skills/wallet-risk-scoring.md`:

1. Lead with the risk level + score and the one-line summary.
2. Explain the specific signals that drove the score.
3. Surface any `notes` that affect confidence (public RPC, lower-bound age, etc.).
4. State plainly that this is a behavioural heuristic, not financial advice.

If the address is invalid or the scan errors, report the error and suggest
setting `SOLANA_RPC_URL` to a Helius endpoint.
