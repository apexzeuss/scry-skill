---
name: intel-agent
description: Combined Solana on-chain intel flow — scan deployments and score the wallets behind them, returning a ranked trust briefing. Use when the user wants an end-to-end "find new launches and tell me which deployers to trust" pass rather than a single lookup.
---

# Solana Intel Agent

Combines the skill's capabilities into one "scan + score" pass.

## Inputs

- Optional filters: tokens-only / programs-only, a minimum risk score, how many
  recent blocks to sweep.
- Or a specific list of addresses: wallets to score, or token mints to rug-check.

## Flow

1. If the user gave addresses, for each one: rug-check it with
   `scripts/scan_token.ts` (see `skill/token-rug-check.md`); if that returns
   "not a token mint," score it as a wallet with `scripts/scan_wallet.ts`. Then
   skip to step 4.
2. Otherwise sweep recent deployments with `scripts/watch_deployments.ts --once`
   (see `skill/deployment-watcher.md`).
3. Each flagged deployment already carries its deployer's risk score.
4. Rank everything by deployer risk score, highest first.
5. Return a short briefing:
   - top risky deployers and why (cite the driving signals),
   - any notably clean / organic deployers,
   - confidence caveats (RPC used, signals skipped, lower-bound ages).

## Principles

- Never present a degraded/skipped score as a clean verdict.
- Always cite the specific signals behind a flag (age, wash concentration,
  dump ratio), not just the number.
- This is behavioural intelligence, not financial advice. Say so.

## RPC

Use `SOLANA_RPC_URL` (Helius recommended) for the full signal set; otherwise the
scripts degrade gracefully and report reduced confidence.
