---
name: scry-skill
description: Evaluate trust and novelty for Solana wallets and new on-chain deployments. Use this skill whenever the user wants to check if a Solana wallet is trustworthy, score wallet risk, monitor new token/program deployments, or flag potentially suspicious on-chain activity. Triggers on phrases like "is this wallet safe", "check this address", "scan this wallet", "watch for new deployments", "is this token a rug", even if the user doesn't use the exact word "risk" or "score".
---

# Scry — Solana On-Chain Intel

Gives an agent three related capabilities for judging trust and novelty on
Solana, using standard Solana RPC (a free Helius URL unlocks the richer signals):

1. **Wallet risk scoring** — score a wallet 0-100 from on-chain behaviour.
2. **Token rug check** — scan a token mint for honeypot/dilution authorities,
   liquidity, supply concentration, holder count, and deployer reputation.
3. **Deployment watching** — watch new token mints / program deploys and flag
   the risky ones, automatically scoring each deployer with capability 1.

## Routing

- Wallet trust / "is this address safe" / risk score
  → follow `wallet-risk-scoring.md`
- "is this token a rug" / "is this coin safe" / a pasted token mint
  → follow `token-rug-check.md`
- Monitor new deployments / "watch for new tokens" / flag rugs at launch
  → follow `deployment-watcher.md`

The capabilities share the wallet scorer in `scripts/scan_wallet.ts` (repo root):
the token check and the watcher both reuse it to score deployers. Scoring weights
and thresholds live in `rules/risk-thresholds.md` so they are easy to review and
tune. If a pasted address is a wallet, the token scanner returns "not a mint" so
you can fall back to wallet scoring.

## Setup (once)

```bash
bash install.sh           # installs deps
# optional but recommended for full signal coverage:
export SOLANA_RPC_URL="https://mainnet.helius-rpc.com/?api-key=YOUR_KEY"
```

Without `SOLANA_RPC_URL` the skill uses the public Solana endpoint, which works
but rate-limits the richer calls (the scripts degrade gracefully and say so).

## Quick reference

```bash
# score a wallet
npx tsx scripts/scan_wallet.ts <ADDRESS> [--days N] [--json]

# rug-check a token mint
npx tsx scripts/scan_token.ts <MINT> [--json]

# watch deployments (Ctrl-C to stop)
npx tsx scripts/watch_deployments.ts [--tokens-only|--programs-only] [--min-score N]
npx tsx scripts/watch_deployments.ts --once   # one batch then exit (for testing)
```
