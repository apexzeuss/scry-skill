import assert from "node:assert/strict";
import test from "node:test";
import { scanWallet, scoreWalletSignals } from "../scripts/scan_wallet.ts";

test("rejects invalid Solana addresses before RPC calls", async () => {
  await assert.rejects(
    () => scanWallet("not-a-wallet"),
    /Invalid Solana address/,
  );
});

test("scores brand-new thin concentrated wallets as high risk", () => {
  const score = scoreWalletSignals({
    ageDays: 1,
    isLowerBound: false,
    txCount: 3,
    failedRatio: 0,
    distinctPrograms: 1,
    washScore: 0.8,
    dumpScore: 0.75,
    txSamplingAvailable: true,
  });

  assert.equal(score.risk_level, "high");
  assert.equal(score.confidence, "high");
  assert.equal(score.signals_available, 5);
  assert.equal(score.rpc_degraded, false);
  assert.ok(score.risk_score >= 67);
});

test("scores mature organic wallets as low risk", () => {
  const score = scoreWalletSignals({
    ageDays: 365,
    isLowerBound: false,
    txCount: 120,
    failedRatio: 0,
    distinctPrograms: 10,
    washScore: 0.05,
    dumpScore: 0,
    txSamplingAvailable: true,
  });

  assert.equal(score.risk_level, "low");
  assert.ok(score.risk_score <= 33);
});

test("renormalizes when transaction sampling is unavailable", () => {
  const score = scoreWalletSignals({
    ageDays: 2,
    isLowerBound: false,
    txCount: 0,
    failedRatio: 0,
    distinctPrograms: 0,
    washScore: 0,
    dumpScore: 0,
    txSamplingAvailable: false,
  });

  assert.deepEqual(score.active_components, ["age", "activity", "dump"]);
  assert.equal(score.signals_available, 3);
  assert.equal(score.confidence, "medium");
  assert.equal(score.rpc_degraded, true);
  assert.equal(score.risk_score, 60);
});

test("excludes age when signature cap makes age only a lower bound", () => {
  const score = scoreWalletSignals({
    ageDays: 0,
    isLowerBound: true,
    txCount: 1000,
    failedRatio: 0,
    distinctPrograms: 1,
    washScore: 0.8,
    dumpScore: 0,
    txSamplingAvailable: true,
  });

  assert.equal(score.active_components.includes("age"), false);
  assert.equal(score.signals_available, 4);
  assert.equal(score.confidence, "medium");
  assert.equal(score.rpc_degraded, true);
  assert.equal(score.components.wash, 0.4);
  assert.equal(score.components.diversity, 0.5);
});

test("component values stay inside normalized bounds", () => {
  const score = scoreWalletSignals({
    ageDays: 9999,
    isLowerBound: false,
    txCount: 9999,
    failedRatio: 5,
    distinctPrograms: 999,
    washScore: 3,
    dumpScore: -1,
    txSamplingAvailable: true,
  });

  for (const value of Object.values(score.components)) {
    assert.ok(value >= 0);
    assert.ok(value <= 1);
  }
});
