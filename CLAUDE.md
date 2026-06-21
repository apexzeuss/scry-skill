# Scry — agent instructions

This repo is a Solana on-chain intelligence skill for the Solana AI Kit.

**Entry point:** load [`skill/SKILL.md`](skill/SKILL.md). It routes (progressively,
to keep context small) to three focused skill files:

- `skill/wallet-risk-scoring.md` — score a wallet's trust/risk 0-100.
- `skill/token-rug-check.md` — rug-check a token mint (honeypot, liquidity, holders, deployer).
- `skill/deployment-watcher.md` — watch new token/program deploys and flag rugs.

These call the runnable logic in `scripts/` (`scan_wallet.ts`, `scan_token.ts`,
`watch_deployments.ts`), with scoring weights documented in `rules/risk-thresholds.md`.
Run `bash install.sh` once to install dependencies. A faster RPC is optional: set
`SOLANA_RPC_URL` (Helius unlocks holder counts + the richer wallet signals).

Do not invent scores. The scripts read real Solana RPC and degrade gracefully when
data is incomplete (they report reduced confidence rather than guessing).
