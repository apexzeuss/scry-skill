---
name: scry-skill
description: Evaluate trust and novelty for Solana wallets and new on-chain deployments. Use this skill whenever the user wants to check if a Solana wallet is trustworthy, score wallet risk, monitor new token/program deployments, or flag potentially suspicious on-chain activity. Triggers on phrases like "is this wallet safe", "check this address", "scan this wallet", "watch for new deployments", "is this token a rug", even if the user doesn't use the exact word "risk" or "score".
---

# Solana On-Chain Intel

Gives an agent two related capabilities for judging trust and novelty on Solana,
using only standard Solana RPC (no paid API required to start):

1. **Wallet risk scoring** — score a wallet 0-100 from on-chain behaviour.
2. **Deployment watching** — watch new token mints / program deploys and flag
   the risky ones, automatically scoring each deployer with module 1.

## Routing

- Wallet trust / "is this address safe" / risk score
  → follow `skills/wallet-risk-scoring.md`
- Monitor new deployments / "watch for new tokens" / flag rugs at launch
  → follow `skills/deployment-watcher.md`

Both modules share the scoring logic in `scripts/scan_wallet.ts`. The scoring
weights and thresholds live in `rules/risk-thresholds.md` so they are easy to
review and tune.

## Setup (once)

```bash
bash installer.sh         # installs deps
# optional but recommended for full signal coverage:
export SOLANA_RPC_URL="https://mainnet.helius-rpc.com/?api-key=YOUR_KEY"
```

Without `SOLANA_RPC_URL` the skill uses the public Solana endpoint, which works
but rate-limits the richer calls (the scripts degrade gracefully and say so).

## Quick reference

```bash
# score a wallet
npx tsx scripts/scan_wallet.ts <ADDRESS> [--days N] [--json]

# watch deployments (Ctrl-C to stop)
npx tsx scripts/watch_deployments.ts [--tokens-only|--programs-only] [--min-score N]
npx tsx scripts/watch_deployments.ts --once   # one batch then exit (for testing)
```
