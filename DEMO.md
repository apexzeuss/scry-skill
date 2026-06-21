# Scry Demo Script

Use this file when judging or presenting the project. It shows the product value
without requiring anyone to inspect the code first. Run everything from the repo
root.

## 1. Verify The Core

```bash
npm install
npm run typecheck
npm test
```

Expected result: TypeScript passes and the scoring tests pass.

## 2. Score A Healthy Wallet

```bash
npm run scan -- 8VRnS42EtHKv2xLvTeABZypUjjAdbJ6KHZciB1RoWbLy
```

Expected shape:

```text
Risk:       LOW
Confidence: HIGH or MEDIUM
Summary: deep/organic history, low risk
```

Why this matters: the score should not punish a real, active wallet just because
it has lots of transactions.

## 3. Score A Thin New Deployer

```bash
npm run scan -- 7i1ggLj7RHFf4TqrzEax9fNihKPzhBXQZkpUc4R3n8Zn
```

Expected shape:

```text
Risk:       HIGH
Summary: young wallet, thin history, concentrated behaviour
```

Why this matters: new throwaway deployers are exactly the kind of account agents
should treat cautiously.

## 4. Rug-Check A Token

```bash
npm run scan-token -- <TOKEN_MINT>
```

Paste any token mint (e.g. from pump.fun or DexScreener). Expected: a verdict plus
honeypot/dilution authorities, liquidity, market cap, age, holder count, supply
concentration, and the deployer's own risk score.

Why this matters: a token can have its authorities revoked and still be a trap if
it is brand-new, thinly held, concentrated, or launched by a high-risk wallet.

## 5. Show Honest Degradation

Run without a premium RPC:

```bash
unset SOLANA_RPC_URL
npm run scan -- DTSUkYHd2e9P2HLyZfbLarsbDdPhQUhZnWjRYuJZQRC8
```

Expected shape:

```text
Confidence: MEDIUM (... RPC degraded)
Notes:
  - Transaction sampling unavailable...
```

Why this matters: Scry does not pretend missing data is certainty. It
renormalizes the score over available components and tells the user.

## 6. Watch New Deployments

For a short terminal demo:

```bash
npm run watch -- --once --blocks 3 --tokens-only
```

For a richer live demo, use a Helius or similar RPC:

```bash
export SOLANA_RPC_URL="https://mainnet.helius-rpc.com/?api-key=YOUR_KEY"
npm run watch -- --tokens-only --min-score 50
```

What to look for:

- risky deployer score
- active mint authority
- active freeze authority
- top-holder concentration

Why this matters: deployer reputation alone is not enough. Scry also checks hard
token-level signals.

## 7. Try The Telegram Bot

Open [`@scry_intel_bot`](https://t.me/scry_intel_bot) and send:

```text
/demo
```

Then paste any Solana wallet address.

The bot is intentionally thin: it wraps the same scorer as `scry-skill`, turning
the technical report into plain English for judges and nontechnical users.
