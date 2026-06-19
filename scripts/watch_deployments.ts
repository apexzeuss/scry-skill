/**
 * watch_deployments.ts — watch new Solana deployments and flag risky ones.
 *
 * Polls recent blocks for two kinds of "deployments":
 *   1. New SPL token mints  (Token / Token-2022 `initializeMint` instructions)
 *   2. New on-chain programs (BPF Upgradeable Loader `DeployWithMaxDataLen`)
 *
 * For each, it resolves the deployer (transaction fee payer), scores that wallet
 * with scan_wallet.ts, and emits a flag when the deployer is risky.
 *
 * Usage:
 *   tsx scripts/watch_deployments.ts            # poll continuously
 *   tsx scripts/watch_deployments.ts --once     # scan one batch and exit (test)
 *   tsx scripts/watch_deployments.ts --once --blocks 3 --tokens-only
 *
 * Flags:
 *   --once           scan one batch of recent blocks and exit
 *   --blocks N       how many recent blocks to scan per poll (default 1)
 *   --interval N     seconds between polls in continuous mode (default 10)
 *   --tokens-only    only watch token mints
 *   --programs-only  only watch program deploys
 *   --min-score N    only flag deployers with risk_score >= N (default 67 = high)
 *   --json           emit raw JSON lines instead of formatted output
 *
 * RPC: set SOLANA_RPC_URL (Helius recommended). Public RPC works for --once
 * but rate-limits the per-deployer wallet scans.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { scanWallet, WalletRiskReport } from "./scan_wallet.js";

// getParsedBlock's response type is awkward to name across web3 versions; we
// only touch a few fields, so treat the block as a loose shape.
type ParsedBlock = {
  transactions: any[];
};

const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";
const TOKEN_PROGRAMS = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
]);
const BPF_UPGRADEABLE_LOADER = "BPFLoaderUpgradeab1e11111111111111111111111";

interface WatchOptions {
  blocks: number;
  intervalSec: number;
  tokensOnly: boolean;
  programsOnly: boolean;
  minScore: number;
  json: boolean;
}

interface Deployment {
  kind: "token-mint" | "program";
  deployment_address: string;
  deployer: string;
  signature: string;
  slot: number;
}

export interface FlaggedDeployment extends Deployment {
  deployer_risk_score: number;
  deployer_risk_level: string;
  flag_reason: string;
  timestamp: string;
  token_risk?: TokenRisk;
}

/** Hard, on-chain rug signals for a token mint (not heuristics). */
export interface TokenRisk {
  mint_authority_active: boolean; // deployer can mint unlimited supply
  freeze_authority_active: boolean; // deployer can freeze your tokens (honeypot)
  top_holder_pct: number; // share of supply held by the single largest account
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Inspect a token mint for hard rug signals using single RPC calls:
 *  - mint authority still set    -> supply can be inflated at will
 *  - freeze authority still set  -> holders' tokens can be frozen (honeypot)
 *  - supply concentration        -> one wallet holds most of the supply
 */
async function inspectToken(
  conn: Connection,
  mint: string,
): Promise<TokenRisk | null> {
  try {
    const mintKey = new PublicKey(mint);
    const info: any = await conn.getParsedAccountInfo(mintKey);
    const parsed = info.value?.data?.parsed?.info;
    if (!parsed) return null;

    const supply = Number(parsed.supply ?? 0);
    let topHolderPct = 0;
    try {
      const largest = await conn.getTokenLargestAccounts(mintKey);
      const top = largest.value?.[0]?.amount;
      if (top && supply > 0) topHolderPct = Number(top) / supply;
    } catch {
      /* concentration optional */
    }

    return {
      mint_authority_active: parsed.mintAuthority != null,
      freeze_authority_active: parsed.freezeAuthority != null,
      top_holder_pct: Math.round(topHolderPct * 100) / 100,
    };
  } catch {
    return null;
  }
}

/** Pull token-mint + program deployments out of one parsed block. */
function extractDeployments(
  block: ParsedBlock,
  slot: number,
  opts: WatchOptions,
): Deployment[] {
  const out: Deployment[] = [];
  for (const tx of block.transactions) {
    if (tx.meta?.err) continue; // ignore failed txns
    const msg: any = tx.transaction.message;
    const sig = tx.transaction.signatures[0];
    // Fee payer = first account key (the deployer for these instruction types).
    const accountKeys: any[] =
      msg.accountKeys ?? msg.staticAccountKeys ?? [];
    const feePayer = keyToStr(accountKeys[0]);
    if (!feePayer) continue;

    // Most mints are created via CPI, so the initializeMint shows up as an
    // INNER instruction. Scan both top-level and inner instructions.
    const innerIxs: any[] = (tx.meta?.innerInstructions ?? []).flatMap(
      (g: any) => g.instructions ?? [],
    );
    const instructions: any[] = [...(msg.instructions ?? []), ...innerIxs];
    for (const ix of instructions) {
      const program = ix.program as string | undefined;
      const programId = keyToStr(ix.programId);

      // 1. New token mint
      if (
        !opts.programsOnly &&
        ix.parsed &&
        (program === "spl-token" || TOKEN_PROGRAMS.has(programId ?? "")) &&
        (ix.parsed.type === "initializeMint" ||
          ix.parsed.type === "initializeMint2")
      ) {
        const mint = ix.parsed.info?.mint;
        if (mint) {
          out.push({
            kind: "token-mint",
            deployment_address: mint,
            deployer: feePayer,
            signature: sig,
            slot,
          });
        }
      }

      // 2. New program deploy (BPF Upgradeable Loader)
      if (
        !opts.tokensOnly &&
        programId === BPF_UPGRADEABLE_LOADER &&
        instructionMentionsDeploy(ix)
      ) {
        out.push({
          kind: "program",
          deployment_address: keyToStr(accountKeys[1]) ?? feePayer,
          deployer: feePayer,
          signature: sig,
          slot,
        });
      }
    }
  }
  return out;
}

function instructionMentionsDeploy(ix: any): boolean {
  // Parsed form exposes `type`; raw form we can't cheaply decode, so treat any
  // upgradeable-loader instruction in a fresh block as a candidate deploy.
  if (ix.parsed?.type) {
    return /deploy/i.test(ix.parsed.type);
  }
  return true;
}

function keyToStr(k: any): string | undefined {
  if (!k) return undefined;
  if (typeof k === "string") return k;
  if (k.pubkey) return k.pubkey.toString();
  if (k instanceof PublicKey) return k.toBase58();
  if (typeof k.toBase58 === "function") return k.toBase58();
  if (typeof k.toString === "function") return k.toString();
  return undefined;
}

async function evaluate(
  conn: Connection,
  dep: Deployment,
  opts: WatchOptions,
): Promise<FlaggedDeployment | null> {
  let report: WalletRiskReport;
  try {
    report = await scanWallet(dep.deployer, { connection: conn });
  } catch (err: any) {
    return null; // can't score deployer (e.g. RPC limit) -> skip rather than crash
  }

  const reasons: string[] = [];
  if (report.risk_score >= opts.minScore) {
    reasons.push(`deployer risk ${report.risk_score}/100 (${report.risk_level})`);
  }
  if (report.signals.rug_history_flag) reasons.push("deployer matches rug proxy");
  if (report.signals.wash_trading_score >= 0.6)
    reasons.push("deployer counterparty concentration high");

  // Hard on-chain rug checks on the token itself (token mints only).
  let token_risk: TokenRisk | undefined;
  if (dep.kind === "token-mint") {
    const t = await inspectToken(conn, dep.deployment_address);
    if (t) {
      token_risk = t;
      if (t.mint_authority_active)
        reasons.push("mint authority still active (supply can be inflated)");
      if (t.freeze_authority_active)
        reasons.push("freeze authority still active (tokens can be frozen)");
      if (t.top_holder_pct >= 0.5)
        reasons.push(
          `${Math.round(t.top_holder_pct * 100)}% of supply in one wallet`,
        );
    }
  }

  if (reasons.length === 0) return null; // not noteworthy

  return {
    ...dep,
    deployer_risk_score: report.risk_score,
    deployer_risk_level: report.risk_level,
    flag_reason: reasons.join("; "),
    timestamp: new Date().toISOString(),
    token_risk,
  };
}

function emit(flag: FlaggedDeployment, json: boolean) {
  if (json) {
    console.log(JSON.stringify(flag));
    return;
  }
  console.log(
    `🚩 [${flag.kind}] ${flag.deployment_address}\n` +
      `   deployer ${flag.deployer} — ${flag.deployer_risk_level.toUpperCase()} ${flag.deployer_risk_score}/100\n` +
      `   reason: ${flag.flag_reason}\n` +
      `   slot ${flag.slot}  sig ${flag.signature}\n`,
  );
}

async function scanBatch(
  conn: Connection,
  fromSlot: number,
  toSlot: number,
  opts: WatchOptions,
  seen: Set<string>,
): Promise<number> {
  let flaggedCount = 0;
  for (let slot = fromSlot; slot <= toSlot; slot++) {
    let block: ParsedBlock | null = null;
    try {
      block = (await conn.getParsedBlock(slot, {
        maxSupportedTransactionVersion: 0,
        transactionDetails: "full",
        rewards: false,
      })) as unknown as ParsedBlock;
    } catch {
      continue; // skipped/missing slot
    }
    if (!block) continue;

    const deployments = extractDeployments(block, slot, opts).filter(
      (d) => !seen.has(d.deployment_address),
    );
    for (const dep of deployments) {
      seen.add(dep.deployment_address);
      if (!opts.json) {
        console.error(
          `  · found ${dep.kind} ${dep.deployment_address} (deployer ${dep.deployer.slice(0, 8)}…) — scoring deployer`,
        );
      }
      const flag = await evaluate(conn, dep, opts);
      if (flag) {
        emit(flag, opts.json);
        flaggedCount++;
      }
    }
  }
  return flaggedCount;
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => args.includes(`--${name}`);
  const val = (name: string, def: number) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? Number(args[i + 1]) : def;
  };

  const opts: WatchOptions = {
    blocks: val("blocks", 1),
    intervalSec: val("interval", 10),
    tokensOnly: flag("tokens-only"),
    programsOnly: flag("programs-only"),
    minScore: val("min-score", 67),
    json: flag("json"),
  };
  const once = flag("once");

  const conn = new Connection(process.env.SOLANA_RPC_URL || DEFAULT_RPC, {
    commitment: "confirmed",
  });
  const seen = new Set<string>();

  if (!opts.json) {
    console.error(
      `Watching Solana deployments (${describeFilter(opts)}), flagging deployers >= ${opts.minScore}/100. RPC: ${process.env.SOLANA_RPC_URL ? "custom" : "public"}.\n`,
    );
  }

  let lastSlot = await conn.getSlot("confirmed");

  do {
    const tip = await conn.getSlot("confirmed");
    const from = once ? Math.max(tip - opts.blocks + 1, 0) : lastSlot + 1;
    const to = tip;
    if (to >= from) {
      const n = await scanBatch(conn, from, to, opts, seen);
      if (!opts.json && !once) {
        console.error(`  (scanned slots ${from}-${to}, ${n} flagged)`);
      }
      lastSlot = to;
    }
    if (!once) await sleep(opts.intervalSec * 1000);
  } while (!once);

  if (!opts.json) console.error("Done.");
}

function describeFilter(o: WatchOptions): string {
  if (o.tokensOnly) return "token mints only";
  if (o.programsOnly) return "program deploys only";
  return "token mints + program deploys";
}

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("watch_deployments.ts");

if (isMain) {
  main().catch((err) => {
    console.error("Watcher failed:", err.message ?? err);
    process.exit(1);
  });
}
