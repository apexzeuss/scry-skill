#!/usr/bin/env bash
#
# install.sh — set up the scry-skill.
#
# Installs Node dependencies and prints next steps. Safe to re-run.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "==> scry-skill installer"

# 1. Check Node
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is required but not found. Install Node 18+ and re-run." >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "ERROR: Node 18+ required (found $(node -v))." >&2
  exit 1
fi
echo "    Node $(node -v) OK"

# 2. Install deps
echo "==> Installing dependencies (npm install)"
npm install --no-fund --no-audit

# 3. RPC reminder
echo ""
echo "==> Done."
echo ""
echo "Optional but recommended — set a faster RPC for full signal coverage:"
echo '    export SOLANA_RPC_URL="https://mainnet.helius-rpc.com/?api-key=YOUR_KEY"'
echo ""
echo "Try it:"
echo "    npx tsx scripts/scan_wallet.ts <SOLANA_ADDRESS>"
echo "    npx tsx scripts/watch_deployments.ts --once --blocks 3 --tokens-only"
echo ""
