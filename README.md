# scry-skill

A Claude Code skill that gives AI agents three on-chain intelligence capabilities
for **Solana**:

1. **Wallet risk scoring** — score any wallet `0-100` from its on-chain
   behaviour (account age, activity, program diversity, wash/counterparty
   concentration, dump behaviour), with an explainable breakdown and confidence
   level.
2. **Token rug check** — scan a token mint for honeypot/dilution authorities,
   liquidity, market cap, supply concentration, holder count, and the deployer's
   risk score, so a token can pass the basic check and still get flagged for
   being thin, concentrated, or dev-rugged.
3. **Deployment watching** — watch new token mints and program deploys, resolve
   each deployer, score it with capability 1, and flag the risky ones.

Built for the **Ship Useful Agent Skills** bounty (Superteam Brasil). Solana
only. Explainable heuristics over opaque models, so the scoring is easy to
verify. When RPC data is incomplete, Scry reports degraded confidence instead of
pretending the score is complete.

## Why

Agents acting on Solana (copy-trading, airdrop farming, alpha-hunting) have no
reusable way to ask "is this wallet / this new launch trustworthy?" This skill
provides that signal from plain Solana RPC, with no paid API required to start.

## Does it actually work?

Every row below is a real mainnet address, scored by the command shown. Scores
move as wallets keep acting and public RPC data availability changes, but the
verdicts are reproducible: new+thin scores high, deep+organic scores low, and
unknown sits in the middle.

| Address | Real profile | Scry verdict | Why |
| --- | --- | --- | --- |
| `8VRnS42EtHKv2xLvTeABZypUjjAdbJ6KHZciB1RoWbLy` | Very active, 1000+ recent txns | 🟢 LOW (~6-10) | Deep, organic history |
| `DTSUkYHd2e9P2HLyZfbLarsbDdPhQUhZnWjRYuJZQRC8` | High-frequency bot, one app | 🟢 LOW (~30) | Established, just concentrated |
| _any unused address_ | No history at all | 🟡 MEDIUM (54) | Unknown ≠ safe; not vouched for |
| `7i1ggLj7RHFf4TqrzEax9fNihKPzhBXQZkpUc4R3n8Zn` | Brand-new deployer, 10 txns | 🔴 HIGH (~73) | Young + thin history |
| `DSRTDRbo71L4K3SiKisdHKoZKzJRruBQkbhiFsqcvcax` | Brand-new deployer, 7 txns | 🔴 HIGH (~72) | Young + thin history |

**Why deployer reputation alone isn't enough.** Wallet `23QKRDUw6ayNoF2HSgLMNityrEMZ6BFaTiVNYKMUHbcU`
scores 🟢 LOW (16) on its own (297 days old, 5 apps) yet it deployed a **honeypot
token**: freeze authority still active (it can freeze your tokens) and 100% of
supply in one wallet. The deployment watcher's token-level checks catch this even
when the deployer looks clean. That composition is the point of the skill.

> Scores reflect on-chain state at the time of writing and will evolve as these
> wallets keep acting. The point is the discrimination: new+thin scores high,
> deep+organic scores low, unknown sits in the middle.

## Install

```bash
bash install.sh
```

Requires Node 18+. Optionally set a faster RPC for the full signal set:

```bash
export SOLANA_RPC_URL="https://mainnet.helius-rpc.com/?api-key=YOUR_KEY"
```

Without it, the public Solana endpoint is used; the richer transaction-level
signals are skipped and the scripts say so (graceful degradation).

## Usage

### Score a wallet

```bash
npx tsx scripts/scan_wallet.ts <SOLANA_ADDRESS> [--days N] [--json]
```

```
Wallet:     DTSUkYHd2e9P2HLyZfbLarsbDdPhQUhZnWjRYuJZQRC8
Risk:       LOW (11/100)
Confidence: HIGH (5/5 signals)

Signals:
  account age:        0d+
  sampled txns:       1000
  distinct programs:  0
  wash concentration: 0
  dump behaviour:     0.19
  ...
```

### Rug-check a token

```bash
npx tsx scripts/scan_token.ts <TOKEN_MINT> [--json]
```

```
Token:      <mint>
Risk:       MEDIUM (20/100)

Rug checks:
  can freeze your tokens:  no (revoked)
  can mint more supply:    no (capped)

Market:
  liquidity:   $6.3k
  market cap:  $6.3k
  age:         today

Holders:
  holder count:  71
  top holder:    50% of supply
  top 10:        72% of supply (may include the pool)

Deployer:
  9kW6LfK1… — HIGH 76/100
```

Note: a token with both authorities revoked can still flag, brand-new, thinly
held, concentrated, or launched by a high-risk deployer.

### Watch deployments

```bash
# one batch over recent blocks, then exit (good for testing/demo)
npx tsx scripts/watch_deployments.ts --once --blocks 3 --tokens-only

# continuous (Ctrl-C to stop)
npx tsx scripts/watch_deployments.ts --min-score 67
```

```
🚩 [token-mint] EyNaeuFJMbcofwTLxPGMPqC9Ds9Tjc8RBqQ7fSsdpump
   deployer GYMwbqdj…BiLz — MEDIUM 54/100
   reason: deployer risk 54/100 (medium)
```

## Try it live

A Telegram demo bot wraps the same scoring logic so you can test it in chat
without installing anything. Open **[@scry_intel_bot](https://t.me/scry_intel_bot)**
and send `/demo`, or paste any Solana wallet address.

Source + deploy steps: [`scry-bot`](https://github.com/apexzeuss/scry-bot).

## Judge demo

The fastest reproducible walkthrough is in [`DEMO.md`](DEMO.md). It covers
typecheck, tests, a healthy wallet, a risky deployer, degraded-RPC confidence,
deployment watching, and the Telegram bot.

## How the score works

It is a documented weighted sum, not ML. Full breakdown of every weight and
threshold is in [`rules/risk-thresholds.md`](rules/risk-thresholds.md). Summary:

| Signal | Weight | Higher = riskier when |
| --- | --- | --- |
| account age | 0.30 | wallet is new |
| activity | 0.15 | history is thin or spammy |
| program diversity | 0.15 | interacts with a narrow set of programs |
| wash concentration | 0.20 | loops with a few counterparties |
| dump behaviour | 0.20 | acquires then empties token accounts |

Wallet `risk_level`: low `0-33`, medium `34-66`, high `67-100`. The **token**
rug check uses its own additive score (freeze authority weighted highest); both
are documented in [`rules/risk-thresholds.md`](rules/risk-thresholds.md).

Every wallet report also includes:

- `confidence`: `high`, `medium`, or `low`
- `signals_available` / `signals_total`
- `rpc_degraded`: whether any scored signal had to be excluded

## Repo layout

```
skill/
  SKILL.md                    entry point / router (progressive loading)
  wallet-risk-scoring.md      capability 1 instructions
  token-rug-check.md          capability 2 instructions
  deployment-watcher.md       capability 3 instructions
scripts/
  scan_wallet.ts              wallet scoring (RPC + scoring math)
  scan_token.ts               token rug check (authorities, market, holders, deployer)
  watch_deployments.ts        deployment polling + deployer scoring
agents/
  intel-agent.md              combined scan + score flow
commands/
  scan-wallet.md              /scan-wallet <address>
  scan-token.md               /scan-token <mint>
  watch-deployments.md        /watch-deployments
rules/
  risk-thresholds.md          scoring weights + thresholds (tune here)
tests/                        unit tests for the scorer
CLAUDE.md  DEMO.md  install.sh  README.md  LICENSE (MIT)
```

## Limitations & roadmap

- The wallet `rug_history_flag` is a cheap heuristic proxy, not a definitive rug
  verdict. Confidence measures data completeness, not whether the verdict is
  guaranteed correct.
- The token rug check already covers mint/freeze authority, liquidity, market
  cap, holder count, supply concentration, and deployer reputation. Still on the
  v2 list: detecting whether the **liquidity pool itself** is locked or burned,
  Token-2022 transfer-fee / transfer-hook honeypots, and bundle/sniper analysis.
- `top10_pct` can include the liquidity-pool account, so high values right after
  launch are partly expected; the report says so.
- Public RPC rate-limits the transaction-level wallet signals, and holder count
  needs a Helius (DAS) endpoint; a Helius URL restores the full signal set.

## Disclaimer

This is behavioural intelligence to assist agents and humans, **not financial
advice**. A low score is not a safety guarantee; an unscored wallet is "unknown,"
not "clean."

## License

MIT — see [LICENSE](LICENSE).
