/**
 * MoneyPenny™ — Dual-view cloud-cost avoidance meter
 * CAI™ Core · SSPL-1.0 + Cooperative Patent Pledge #2260
 *
 * MoneyPenny™ tracks two complementary cost avoidance views:
 *   - Subscription throttle avoided: cost-per-query * substrate hits
 *   - A-la-carte avoided: would-pay-cloud * substrate hits
 *
 * Named after Miss Moneypenny — keeping the accounts straight.
 * Lean-skinned: no cooperative member reward hooks.
 *
 * Data: ~/.cai_core/money_penny/sessions.jsonl
 */

import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

// ─── Constants ────────────────────────────────────────────────────────────────

export const CAI_CORE_HOME =
  process.env.CAI_CORE_HOME ?? resolve(homedir(), '.cai_core');

const MP_DIR = resolve(CAI_CORE_HOME, 'money_penny');
const SESSIONS_LOG = resolve(MP_DIR, 'sessions.jsonl');

const CLOUD_COST_PER_QUERY_USD = 0.000003 * 800; // ~$0.0024/query (800 token response)
const SUBSCRIPTION_COST_PER_QUERY_USD = 0.0001; // estimated subscription-plan rate

function ensureDirs(): void {
  if (!existsSync(MP_DIR)) mkdirSync(MP_DIR, { recursive: true });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MoneyPennySession {
  session_id: string;
  bp_session: string;
  started_at: string;
  ended_at?: string;
  substrate_hits: number;
  cloud_escalations: number;
  total_queries: number;
  subscription_throttle_avoided_usd: number;
  ala_carte_avoided_usd: number;
}

export interface MoneyPennyDualView {
  subscription_view: {
    label: string;
    amount_usd: number;
    query_count: number;
    rate_per_query_usd: number;
  };
  ala_carte_view: {
    label: string;
    amount_usd: number;
    query_count: number;
    rate_per_query_usd: number;
  };
  combined_usd: number;
  session_id: string;
  as_of: string;
}

// ─── MoneyPenny™ meter ────────────────────────────────────────────────────────

export class MoneyPennyMeter {
  private sessionId: string;
  private bpSession: string;
  private substrateHits = 0;
  private cloudEscalations = 0;
  private totalQueries = 0;
  private startedAt: string;

  constructor(sessionId: string, bpSession: string) {
    this.sessionId = sessionId;
    this.bpSession = bpSession;
    this.startedAt = new Date().toISOString();
  }

  recordHit(routing: 'substrate_hit' | 'local_ollama' | 'cloud_escalation' | 'peer_sync' | 'miss'): void {
    this.totalQueries++;
    if (routing === 'substrate_hit' || routing === 'local_ollama') {
      this.substrateHits++;
    } else if (routing === 'cloud_escalation') {
      this.cloudEscalations++;
    }
  }

  getDualView(): MoneyPennyDualView {
    const subscriptionAvoided = this.substrateHits * SUBSCRIPTION_COST_PER_QUERY_USD;
    const alaCarteAvoided = this.substrateHits * CLOUD_COST_PER_QUERY_USD;

    return {
      subscription_view: {
        label: 'Subscription throttle avoided',
        amount_usd: Math.round(subscriptionAvoided * 10000) / 10000,
        query_count: this.substrateHits,
        rate_per_query_usd: SUBSCRIPTION_COST_PER_QUERY_USD,
      },
      ala_carte_view: {
        label: 'A-la-carte cloud cost avoided',
        amount_usd: Math.round(alaCarteAvoided * 10000) / 10000,
        query_count: this.substrateHits,
        rate_per_query_usd: CLOUD_COST_PER_QUERY_USD,
      },
      combined_usd: Math.round((subscriptionAvoided + alaCarteAvoided) * 10000) / 10000,
      session_id: this.sessionId,
      as_of: new Date().toISOString(),
    };
  }

  closeSession(): MoneyPennySession {
    ensureDirs();

    const dv = this.getDualView();
    const session: MoneyPennySession = {
      session_id: this.sessionId,
      bp_session: this.bpSession,
      started_at: this.startedAt,
      ended_at: new Date().toISOString(),
      substrate_hits: this.substrateHits,
      cloud_escalations: this.cloudEscalations,
      total_queries: this.totalQueries,
      subscription_throttle_avoided_usd: dv.subscription_view.amount_usd,
      ala_carte_avoided_usd: dv.ala_carte_view.amount_usd,
    };

    appendFileSync(SESSIONS_LOG, JSON.stringify(session) + '\n', 'utf8');
    return session;
  }

  static getTotals(): {
    all_time_subscription_usd: number;
    all_time_ala_carte_usd: number;
    all_time_combined_usd: number;
    session_count: number;
  } {
    if (!existsSync(SESSIONS_LOG)) {
      return { all_time_subscription_usd: 0, all_time_ala_carte_usd: 0, all_time_combined_usd: 0, session_count: 0 };
    }

    let sub = 0;
    let alc = 0;
    let count = 0;

    try {
      const lines = readFileSync(SESSIONS_LOG, 'utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const s = JSON.parse(line) as MoneyPennySession;
          sub += s.subscription_throttle_avoided_usd;
          alc += s.ala_carte_avoided_usd;
          count++;
        } catch { /* skip */ }
      }
    } catch { /* non-fatal */ }

    return {
      all_time_subscription_usd: Math.round(sub * 10000) / 10000,
      all_time_ala_carte_usd: Math.round(alc * 10000) / 10000,
      all_time_combined_usd: Math.round((sub + alc) * 10000) / 10000,
      session_count: count,
    };
  }
}
