/**
 * Banyan Metric™ — 6-dimension AI session scoring framework
 * CAI™ Core · SSPL-1.0 + Cooperative Patent Pledge #2260
 *
 * Banyan Metric™ Premier: 6-dimension composite scoring
 *   CW  — Context Window efficiency (substrate hits / total queries)
 *   WC  — Work Completed (LOC / artifacts / commits per session)
 *   SC  — Substrate Contribution (new Eblets™ written / records indexed)
 *   RR  — Retrieval Rate (substrate_hit_ratio · Caithedral™ performance)
 *   DR  — Drift Rate (canon drift events caught / session)
 *   CM  — Cost Mitigation (cloud_cost_avoided_usd / a_la_carte_baseline)
 *
 * Ledger: append-only JSONL at ~/.cai_core/banyan_metric/ledger.jsonl
 *
 * Canonical Premier score: 94.16/100 (BP049 · 6-dimension ratified)
 */

import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

// ─── Constants ────────────────────────────────────────────────────────────────

export const CAI_CORE_HOME =
  process.env.CAI_CORE_HOME ?? resolve(homedir(), '.cai_core');

const BM_DIR = resolve(CAI_CORE_HOME, 'banyan_metric');
const LEDGER_PATH = resolve(BM_DIR, 'ledger.jsonl');

function ensureDirs(): void {
  if (!existsSync(BM_DIR)) mkdirSync(BM_DIR, { recursive: true });
}

// ─── Types ────────────────────────────────────────────────────────────────────

/** Raw dimension inputs for a session */
export interface BanyanMetricInputs {
  /** Substrate queries that were hit by Caithedral™ (no LLM needed) */
  substrate_hits: number;
  /** Total substrate queries */
  total_queries: number;
  /** Artifacts produced (LOC, files, commits, Eblets™) */
  work_units: number;
  /** New Eblets™ written or records indexed */
  substrate_contributions: number;
  /** Total Eblets™ / records available */
  substrate_total: number;
  /** Cloud cost avoided USD */
  cloud_cost_avoided_usd: number;
  /** A-la-carte baseline (what it would cost without substrate) */
  ala_carte_baseline_usd: number;
  /** Canon drift events detected this session */
  drift_events_detected: number;
}

/** 6-dimension Banyan Metric™ score */
export interface BanyanMetricScore {
  /** Context Window efficiency (0–100) */
  CW: number;
  /** Work Completed (0–100) */
  WC: number;
  /** Substrate Contribution (0–100) */
  SC: number;
  /** Retrieval Rate (0–100) */
  RR: number;
  /** Drift Rate (inverse: 100 = zero drift) */
  DR: number;
  /** Cost Mitigation (0–100) */
  CM: number;
  /** Composite weighted average (0–100) */
  composite: number;
}

/** Ledger row — one row per session/build-cycle */
export interface BanyanMetricRow {
  session_id: string;
  bp_session: string;
  inputs: BanyanMetricInputs;
  score: BanyanMetricScore;
  timestamp: string;
  notes?: string;
}

// ─── Dimension weights ────────────────────────────────────────────────────────

const WEIGHTS: Record<keyof BanyanMetricScore, number> = {
  CW: 0.20,
  WC: 0.20,
  SC: 0.15,
  RR: 0.20,
  DR: 0.10,
  CM: 0.15,
  composite: 0, // computed
};

// ─── Scoring engine ───────────────────────────────────────────────────────────

export function scoreBanyanMetric(inputs: BanyanMetricInputs): BanyanMetricScore {
  const {
    substrate_hits,
    total_queries,
    work_units,
    substrate_contributions,
    substrate_total,
    cloud_cost_avoided_usd,
    ala_carte_baseline_usd,
    drift_events_detected,
  } = inputs;

  // CW: Context Window efficiency
  const CW = total_queries > 0 ? Math.min(100, (substrate_hits / total_queries) * 100) : 0;

  // WC: Work Completed — normalized against a 100-unit session baseline
  const WC = Math.min(100, (work_units / 100) * 100);

  // SC: Substrate Contribution — new records / total records (capped at 20% growth = 100)
  const SC = substrate_total > 0
    ? Math.min(100, (substrate_contributions / Math.max(substrate_total * 0.2, 1)) * 100)
    : 0;

  // RR: Retrieval Rate (same as CW but independent dimension)
  const RR = CW;

  // DR: Drift Rate — inverse of drift events (0 events = 100, 10+ events = 0)
  const DR = Math.max(0, 100 - drift_events_detected * 10);

  // CM: Cost Mitigation — avoided / baseline (capped at 100)
  const CM = ala_carte_baseline_usd > 0
    ? Math.min(100, (cloud_cost_avoided_usd / ala_carte_baseline_usd) * 100)
    : 0;

  const composite =
    CW * WEIGHTS.CW +
    WC * WEIGHTS.WC +
    SC * WEIGHTS.SC +
    RR * WEIGHTS.RR +
    DR * WEIGHTS.DR +
    CM * WEIGHTS.CM;

  return {
    CW: Math.round(CW * 100) / 100,
    WC: Math.round(WC * 100) / 100,
    SC: Math.round(SC * 100) / 100,
    RR: Math.round(RR * 100) / 100,
    DR: Math.round(DR * 100) / 100,
    CM: Math.round(CM * 100) / 100,
    composite: Math.round(composite * 100) / 100,
  };
}

// ─── Ledger ───────────────────────────────────────────────────────────────────

export class BanyanMetricLedger {
  appendRow(row: BanyanMetricRow): void {
    ensureDirs();
    appendFileSync(LEDGER_PATH, JSON.stringify(row) + '\n', 'utf8');
  }

  readAll(): BanyanMetricRow[] {
    if (!existsSync(LEDGER_PATH)) return [];
    try {
      return readFileSync(LEDGER_PATH, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as BanyanMetricRow);
    } catch {
      return [];
    }
  }

  getLatest(): BanyanMetricRow | null {
    const rows = this.readAll();
    return rows.length > 0 ? rows[rows.length - 1] : null;
  }

  getTrend(lastN = 5): BanyanMetricRow[] {
    const rows = this.readAll();
    return rows.slice(-lastN);
  }

  buildRow(
    sessionId: string,
    bpSession: string,
    inputs: BanyanMetricInputs,
    notes?: string,
  ): BanyanMetricRow {
    return {
      session_id: sessionId,
      bp_session: bpSession,
      inputs,
      score: scoreBanyanMetric(inputs),
      timestamp: new Date().toISOString(),
      notes,
    };
  }
}

// ─── Formatters ───────────────────────────────────────────────────────────────

export function formatScore(score: BanyanMetricScore): string {
  return [
    `Banyan Metric™ Premier Score: ${score.composite}/100`,
    `  CW (Context Window):    ${score.CW}`,
    `  WC (Work Completed):    ${score.WC}`,
    `  SC (Substrate Contrib): ${score.SC}`,
    `  RR (Retrieval Rate):    ${score.RR}`,
    `  DR (Drift Rate):        ${score.DR}`,
    `  CM (Cost Mitigation):   ${score.CM}`,
  ].join('\n');
}
