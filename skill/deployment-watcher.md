# Deployment Watcher

Watch new Solana deployments (token mints and program deploys) and flag the ones
whose deployer wallet is risky, by scoring each deployer with the wallet-risk
module.

## When to use

User asks any of: "watch for new tokens", "alert me to new deployments", "flag
sketchy launches", "monitor new mints and tell me which are rugs".

## How to run

```bash
# continuous (Ctrl-C to stop)
npx tsx scripts/watch_deployments.ts [flags]

# one batch over recent blocks, then exit — use this to test
npx tsx scripts/watch_deployments.ts --once --blocks 3
```

Flags:

- `--once` — scan one batch of recent blocks and exit.
- `--blocks N` — blocks to scan per poll (default 1).
- `--interval N` — seconds between polls in continuous mode (default 10).
- `--tokens-only` / `--programs-only` — restrict what is watched.
- `--min-score N` — only flag deployers scoring >= N (default 67 = high).
- `--json` — emit one JSON object per flagged deployment (for piping).

Set `SOLANA_RPC_URL` to a Helius endpoint. The public endpoint works for `--once`
but rate-limits the per-deployer wallet scans, so some deployers are skipped.

## Logic

1. Poll recent blocks via `getParsedBlock`.
2. Extract deployments:
   - **Token mints** — `initializeMint` / `initializeMint2` (top-level *and*
     inner instructions, since most mints are created via CPI).
   - **Programs** — BPF Upgradeable Loader deploy instructions.
3. Resolve the deployer = transaction fee payer.
4. Score the deployer with `scripts/scan_wallet.ts` (shared RPC connection).
5. Flag when the deployer score >= `--min-score`, OR the deployer matches the
   rug proxy, OR counterparty concentration is high.

## Output shape (`--json`)

```json
{
  "kind": "token-mint",
  "deployment_address": "...",
  "deployer": "...",
  "signature": "...",
  "slot": 427705162,
  "deployer_risk_score": 82,
  "deployer_risk_level": "high",
  "flag_reason": "deployer risk 82/100 (high); deployer matches rug proxy",
  "timestamp": "2026-06-19T..."
}
```

## How to present results to the user

1. For each flag, state what was deployed (token vs program), the deployer score,
   and the `flag_reason`.
2. Group or rank by `deployer_risk_score` if there are many.
3. Remind the user that a low-risk deployer is not a safety guarantee, and a
   skipped deployer (public-RPC limit) is "unscored," not "clean."

## Notes

- Deduplicates by `deployment_address` within a run.
- For a live demo, prefer `--once --blocks 3 --tokens-only` against a Helius URL:
  pump.fun mints appear in most recent blocks, so you will reliably get hits.
