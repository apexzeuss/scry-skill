/**
 * scan_token.ts — token rug check (core logic + CLI).
 *
 * Answers what a trader actually asks about a token:
 *   - Can I get out?          -> freeze authority (honeypot)
 *   - Will they dilute me?    -> mint authority
 *   - Is there money here?    -> liquidity / market cap / volume / age (DexScreener)
 *   - Will I get dumped on?   -> top-holder concentration + holder count
 *   - Is the dev a rugger?    -> score the deployer wallet with scan_wallet.ts
 *
 * Every source is best-effort and runs in parallel; one failure leaves that
 * field null rather than failing the whole report.
 *
 * Usage:
 *   npx tsx scripts/scan_token.ts <MINT> [--json]
 *
 * RPC: set SOLANA_RPC_URL to a Helius URL for holder counts (Helius DAS) and
 * reliable deployer scoring. Falls back to the public endpoint otherwise.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { scanWallet } from "./scan_wallet.js";

const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";

export interface TokenReport {
  mint: string;
  decimals: number;
  mint_authority_active: boolean;
  freeze_authority_active: boolean;
  top_holder_pct: number;
  top10_pct: number;
  holder_count: number | null;
  has_market: boolean;
  liquidity_usd: number | null;
  market_cap_usd: number | null;
  volume_24h_usd: number | null;
  age_days: number | null;
  deployer: string | null;
  deployer_risk_score: number | null;
  deployer_risk_level: string | null;
  risk_score: number; // 0-100
  risk_level: "low" | "medium" | "high";
}

/** Returns null if the address is not a token mint (caller can wallet-scan it). */
export async function scanToken(
  mint: string,
  rpcUrl?: string,
): Promise<TokenReport | null> {
  const conn = new Connection(
    rpcUrl || process.env.SOLANA_RPC_URL || DEFAULT_RPC,
    "confirmed",
  );
  let mintKey: PublicKey;
  try {
    mintKey = new PublicKey(mint);
  } catch {
    return null;
  }

  const info: any = await conn.getParsedAccountInfo(mintKey).catch(() => null);
  const data = info?.value?.data;
  if (data?.parsed?.type !== "mint") return null;
  const parsed = data.parsed.info;
  const supply = Number(parsed.supply ?? 0);

  const report: TokenReport = {
    mint: mintKey.toBase58(),
    decimals: Number(parsed.decimals ?? 0),
    mint_authority_active: parsed.mintAuthority != null,
    freeze_authority_active: parsed.freezeAuthority != null,
    top_holder_pct: 0,
    top10_pct: 0,
    holder_count: null,
    has_market: false,
    liquidity_usd: null,
    market_cap_usd: null,
    volume_24h_usd: null,
    age_days: null,
    deployer: null,
    deployer_risk_score: null,
    deployer_risk_level: null,
    risk_score: 0,
    risk_level: "low",
  };

  await Promise.allSettled([
    concentration(conn, mintKey, supply, report),
    market(mintKey.toBase58(), report),
    holderCount(rpcUrl || process.env.SOLANA_RPC_URL, mintKey.toBase58(), report),
    deployer(conn, mintKey, report),
  ]);

  scoreToken(report);
  return report;
}

function scoreToken(r: TokenReport) {
  let score = 0;
  if (r.freeze_authority_active) score += 50;
  if (r.mint_authority_active) score += 25;
  if ((r.deployer_risk_score ?? 0) >= 67) score += 20;
  if (r.has_market && r.liquidity_usd != null && r.liquidity_usd < 1000) score += 15;
  if (r.has_market && r.top10_pct >= 0.9) score += 10;
  r.risk_score = Math.min(100, score);
  r.risk_level = score >= 50 ? "high" : score >= 25 ? "medium" : "low";
}

async function concentration(
  conn: Connection,
  mintKey: PublicKey,
  supply: number,
  report: TokenReport,
) {
  if (supply <= 0) return;
  const largest = await conn.getTokenLargestAccounts(mintKey);
  const amounts = largest.value.map((a) => Number(a.amount));
  if (amounts.length === 0) return;
  report.top_holder_pct = round2(amounts[0] / supply);
  report.top10_pct = round2(
    amounts.slice(0, 10).reduce((s, n) => s + n, 0) / supply,
  );
}

async function market(mint: string, report: TokenReport) {
  const res = await fetch(
    `https://api.dexscreener.com/latest/dex/tokens/${mint}`,
    { signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) return;
  const json: any = await res.json();
  const pairs: any[] = json?.pairs ?? [];
  if (pairs.length === 0) return;
  const best = pairs.sort(
    (a, b) => (b?.liquidity?.usd ?? 0) - (a?.liquidity?.usd ?? 0),
  )[0];
  report.has_market = true;
  report.liquidity_usd = numOrNull(best?.liquidity?.usd);
  report.market_cap_usd = numOrNull(best?.marketCap ?? best?.fdv);
  report.volume_24h_usd = numOrNull(best?.volume?.h24);
  if (best?.pairCreatedAt)
    report.age_days = round1((Date.now() - best.pairCreatedAt) / 86_400_000);
}

async function holderCount(
  rpcUrl: string | undefined,
  mint: string,
  report: TokenReport,
) {
  if (!rpcUrl || !/helius/i.test(rpcUrl)) return; // DAS is Helius-specific
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "scry",
      method: "getTokenAccounts",
      params: { mint, limit: 1000, options: { showZeroBalance: false } },
    }),
  });
  if (!res.ok) return;
  const json: any = await res.json();
  const accts: any[] = json?.result?.token_accounts ?? [];
  if (accts.length === 0) return;
  report.holder_count = accts.length >= 1000 ? 1000 : accts.length;
}

async function deployer(
  conn: Connection,
  mintKey: PublicKey,
  report: TokenReport,
) {
  let before: string | undefined;
  let oldest: string | undefined;
  let reachedStart = false;
  for (let page = 0; page < 3; page++) {
    const sigs = await conn.getSignaturesForAddress(mintKey, {
      limit: 1000,
      before,
    });
    if (sigs.length === 0) {
      reachedStart = true;
      break;
    }
    oldest = sigs[sigs.length - 1].signature;
    before = oldest;
    if (sigs.length < 1000) {
      reachedStart = true;
      break;
    }
  }
  if (!oldest || !reachedStart) return;
  const tx = await conn.getParsedTransaction(oldest, {
    maxSupportedTransactionVersion: 0,
  });
  const keys: any[] = tx?.transaction.message.accountKeys ?? [];
  const feePayer = keys.find((k) => k.signer)?.pubkey?.toBase58();
  if (!feePayer) return;
  report.deployer = feePayer;
  const scored = await scanWallet(feePayer, { connection: conn });
  report.deployer_risk_score = scored.risk_score;
  report.deployer_risk_level = scored.risk_level;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;
const numOrNull = (n: any): number | null =>
  typeof n === "number" && isFinite(n) ? n : null;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("scan_token.ts");

if (isMain) {
  const args = process.argv.slice(2);
  const mint = args.find((a) => !a.startsWith("--"));
  const jsonOut = args.includes("--json");
  if (!mint) {
    console.error("Usage: tsx scripts/scan_token.ts <MINT> [--json]");
    process.exit(1);
  }
  scanToken(mint)
    .then((r) => {
      if (!r) {
        console.error(
          "Not a token mint (it may be a wallet — try scan_wallet.ts instead).",
        );
        process.exit(1);
      }
      if (jsonOut) console.log(JSON.stringify(r, null, 2));
      else printHuman(r);
    })
    .catch((err) => {
      console.error("Token scan failed:", err.message ?? err);
      process.exit(1);
    });
}

function usd(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

function printHuman(r: TokenReport) {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  console.log("");
  console.log(`Token:      ${r.mint}`);
  console.log(`Risk:       ${r.risk_level.toUpperCase()} (${r.risk_score}/100)`);
  console.log("");
  console.log("Rug checks:");
  console.log(`  can freeze your tokens:  ${r.freeze_authority_active ? "YES (honeypot risk)" : "no (revoked)"}`);
  console.log(`  can mint more supply:    ${r.mint_authority_active ? "YES (dilution risk)" : "no (capped)"}`);
  console.log("");
  console.log("Market:");
  console.log(`  liquidity:   ${r.has_market ? usd(r.liquidity_usd) : "no market found"}`);
  console.log(`  market cap:  ${usd(r.market_cap_usd)}`);
  console.log(`  24h volume:  ${usd(r.volume_24h_usd)}`);
  console.log(`  age:         ${r.age_days == null ? "—" : r.age_days < 1 ? "today" : `${r.age_days} days`}`);
  console.log("");
  console.log("Holders:");
  console.log(`  holder count:  ${r.holder_count == null ? "—" : r.holder_count >= 1000 ? "1000+" : r.holder_count}`);
  console.log(`  top holder:    ${pct(r.top_holder_pct)} of supply`);
  console.log(`  top 10:        ${pct(r.top10_pct)} of supply (may include the pool)`);
  console.log("");
  console.log("Deployer:");
  if (r.deployer)
    console.log(`  ${r.deployer} — ${r.deployer_risk_level?.toUpperCase()} ${r.deployer_risk_score}/100`);
  else console.log("  (couldn't resolve the creator — likely an old/very active mint)");
  if (r.freeze_authority_active || r.mint_authority_active) {
    console.log("");
    console.log("Note: a few legit tokens (e.g. regulated stablecoins) keep these");
    console.log("powers on purpose. For a random new token, they are red flags.");
  }
  console.log("");
}
