---
description: Watch new Solana token mints / program deploys and flag risky deployers.
argument-hint: [--once] [--tokens-only] [--min-score N]
allowed-tools: Bash(npx tsx scripts/watch_deployments.ts:*)
---

Watch new Solana deployments and flag the risky ones: **$ARGUMENTS**

Run the watcher from the skill root. For an interactive session, default to a
single batch so it returns promptly:

```bash
npx tsx scripts/watch_deployments.ts --once --blocks 3 $ARGUMENTS --json
```

For continuous monitoring (user explicitly wants it to keep running), drop
`--once` and let it poll; remind the user it runs until Ctrl-C.

Then present results following `skills/deployment-watcher.md`:

1. For each flagged deployment, state kind (token vs program), deployer score,
   and the flag reason.
2. Rank by deployer risk score if there are several.
3. Note that an unscored deployer (public-RPC limit) is "unknown," not "clean,"
   and that a low score is not a safety guarantee.

Recommend setting `SOLANA_RPC_URL` to a Helius endpoint for reliable deployer
scoring.
