/**
 * CAI™ Core — Smoke Tests
 * v0.1.7 · BP051 NOVACULA SEG-CC-8
 *
 * Basic smoke tests verifying core substrate modules load and function correctly.
 * No external dependencies (no Electron, no network) — pure Node.js.
 */

import * as assert from 'assert';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

// Use a temp dir for all tests
const SMOKE_HOME = path.join(os.tmpdir(), `cai_core_smoke_${Date.now()}`);
process.env['CAI_CORE_HOME'] = SMOKE_HOME;

// ─── Import substrate modules ─────────────────────────────────────────────────

import { sha256Hex, EbletStore } from '../src/eblet/index.js';
import { CaithedralLocalIndex, CaithedralRouter } from '../src/caithedral/index.js';
import { PheromoneEntityStore, PheromoneEngine } from '../src/pheromone/index.js';
import { WrasseTriggerRegistry, WrasseEngine } from '../src/wrasse/index.js';
import { MCPRouter } from '../src/mcp/index.js';
import { AutoBatonCVT, planNOVACULA } from '../src/autobaton/index.js';
import { scoreBanyanMetric, BanyanMetricLedger, formatScore } from '../src/banyan_metric/index.js';
import { MoneyPennyMeter } from '../src/banyan_metric/money_penny.js';
import { stampString } from '../src/provenance/index.js';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void | Promise<void>): void {
  Promise.resolve(fn()).then(() => {
    console.log(`  ✓ ${name}`);
    passed++;
  }).catch((err) => {
    console.error(`  ✗ ${name}: ${(err as Error).message}`);
    failures.push(name);
    failed++;
  });
}

console.log('\n=== CAI™ Core Smoke Tests ===\n');

// ─── Eblet™ ───────────────────────────────────────────────────────────────────

console.log('Eblet™:');
test('sha256Hex produces 64-char hex', () => {
  const h = sha256Hex('hello CAI™ Core');
  assert.strictEqual(h.length, 64);
  assert.ok(/^[0-9a-f]+$/.test(h));
});

test('EbletStore write+read round-trip', async () => {
  const store = new EbletStore(
    path.join(SMOKE_HOME, 'test_eblets'),
    path.join(SMOKE_HOME, 'test_eblets_vault'),
  );
  await store.load();

  const result = store.write(
    'This is a test Eblet™ body.',
    { id: 'test-001', tier: 'stone', source: 'smoke-test' },
  );

  assert.strictEqual(result.id, 'test-001');
  assert.ok(result.sha256.length > 0);
  assert.ok(fs.existsSync(result.path_primary));

  const e = store.get('test-001');
  assert.ok(e !== undefined);
  assert.strictEqual(e!.body, 'This is a test Eblet™ body.');
});

test('EbletStore verify integrity', async () => {
  const store = new EbletStore(path.join(SMOKE_HOME, 'test_eblets'));
  await store.load();
  const v = store.verify('test-001');
  assert.strictEqual(v.valid, true);
});

// ─── Caithedral™ ──────────────────────────────────────────────────────────────

console.log('\nCaithedral™:');
test('CaithedralLocalIndex loads empty', async () => {
  const idx = new CaithedralLocalIndex();
  await idx.load();
  assert.ok(idx.size >= 0);
});

test('CaithedralLocalIndex write+query', async () => {
  const idx = new CaithedralLocalIndex();
  await idx.load();
  idx.writeRecord({
    id: 'smoke-rec-001',
    text: 'cooperative AI memory substrate Caithedral retrieval',
    source: 'smoke-test',
    keywords: ['cooperative', 'memory', 'substrate', 'caithedral'],
    ts: new Date().toISOString(),
  });
  const results = idx.query('cooperative memory substrate');
  assert.ok(results.length > 0);
  assert.ok(results[0].score > 0);
});

test('CaithedralRouter normal mode returns miss on empty index', async () => {
  const idx = new CaithedralLocalIndex();
  // Don't load existing data — fresh instance
  const router = new CaithedralRouter(idx);
  const result = await router.query('xyzzy-nonexistent-query');
  assert.strictEqual(result.hit, false);
  assert.ok(result.latency_ms >= 0);
});

// ─── Pheromone ────────────────────────────────────────────────────────────────

console.log('\nPheromone:');
test('PheromoneEntityStore upsert+get', async () => {
  const store = new PheromoneEntityStore();
  await store.load();
  const e = store.upsert({
    id: 'cai-core',
    label: 'CAI™ Core',
    aliases: ['cai core', 'cooperative ai'],
    strength: 'strong',
    body: 'CAI™ Core — Cooperative AI Memory Architecture',
    source: 'smoke-test',
  });
  assert.strictEqual(e.id, 'cai-core');
  assert.ok(e.sha256.length > 0);

  const found = store.resolveAlias('cai core');
  assert.ok(found !== undefined);
  assert.strictEqual(found!.id, 'cai-core');
});

test('PheromoneEngine propagates strong entity', async () => {
  const store = new PheromoneEntityStore();
  await store.load();
  const engine = new PheromoneEngine(store, 'medium');
  const result = engine.propagate('cai-core', 'smoke-session');
  assert.strictEqual(result.entity_id, 'cai-core');
  assert.strictEqual(result.injected, true);
});

// ─── Wrasse ───────────────────────────────────────────────────────────────────

console.log('\nWrasse:');
test('WrasseTriggerRegistry register+findMatches', () => {
  const registry = new WrasseTriggerRegistry();
  registry.load();
  registry.register('cooperative ai', 'cai-core');
  const matches = registry.findMatches('Tell me about cooperative ai memory systems');
  assert.ok(matches.some((m) => m.entity_id === 'cai-core'));
});

// ─── Banyan Metric™ ───────────────────────────────────────────────────────────

console.log('\nBanyan Metric™:');
test('scoreBanyanMetric produces 0–100 composite', () => {
  const score = scoreBanyanMetric({
    substrate_hits: 48,
    total_queries: 50,
    work_units: 95,
    substrate_contributions: 12,
    substrate_total: 200,
    cloud_cost_avoided_usd: 0.45,
    ala_carte_baseline_usd: 0.50,
    drift_events_detected: 0,
  });
  assert.ok(score.composite >= 0 && score.composite <= 100);
  assert.ok(score.CW >= 0 && score.CW <= 100);
  assert.ok(score.DR === 100); // 0 drift events → DR = 100
});

test('BanyanMetricLedger appendRow+readAll', () => {
  const ledger = new BanyanMetricLedger();
  const inputs = {
    substrate_hits: 48, total_queries: 50, work_units: 95,
    substrate_contributions: 12, substrate_total: 200,
    cloud_cost_avoided_usd: 0.45, ala_carte_baseline_usd: 0.50,
    drift_events_detected: 0,
  };
  const row = ledger.buildRow('smoke-001', 'BP051-smoke', inputs, 'smoke test row');
  ledger.appendRow(row);
  const rows = ledger.readAll();
  assert.ok(rows.some((r) => r.session_id === 'smoke-001'));
});

// ─── MoneyPenny™ ──────────────────────────────────────────────────────────────

console.log('\nMoneyPenny™:');
test('MoneyPennyMeter records hits and produces dual view', () => {
  const meter = new MoneyPennyMeter('smoke-mp-001', 'BP051-smoke');
  for (let i = 0; i < 10; i++) meter.recordHit('substrate_hit');
  for (let i = 0; i < 2; i++) meter.recordHit('cloud_escalation');

  const dv = meter.getDualView();
  assert.ok(dv.ala_carte_view.amount_usd > 0);
  assert.ok(dv.subscription_view.amount_usd > 0);
  assert.strictEqual(dv.subscription_view.query_count, 10);
  meter.closeSession();
});

// ─── Provenance ───────────────────────────────────────────────────────────────

console.log('\nProvenance:');
test('stampString produces sha256 without TSA', async () => {
  const result = await stampString('test content for provenance', { tsaEnabled: false });
  assert.ok(result.sha256.length === 64);
  assert.ok(result.tsa_result === undefined);
});

// ─── AutoBaton / NOVACULA planner ─────────────────────────────────────────────

console.log('\nAutoBaton CVT:');
test('planNOVACULA batches SEGs correctly', () => {
  const segs = Array.from({ length: 20 }, (_, i) => ({
    recipient: 'cpu_only' as const,
    prompt: `SEG-${i + 1}: test prompt`,
  }));
  const plan = planNOVACULA('smoke test plan', segs);
  assert.ok(plan.waves.length > 0);
  assert.strictEqual(plan.total_segs, 20);
  assert.ok(plan.waves.every((w) => w.segs.length <= 8));
});

// ─── Summary ─────────────────────────────────────────────────────────────────

setTimeout(() => {
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failures.length > 0) {
    console.error('Failed tests:', failures.join(', '));
    process.exit(1);
  } else {
    console.log('✓ All smoke tests passed\n');
  }

  // Cleanup temp dir
  try {
    fs.rmSync(SMOKE_HOME, { recursive: true, force: true });
  } catch {
    // Non-fatal
  }
}, 2000);
