# Banyan Metric™ — 6-Dimension Scoring Framework

**Canonical source:** `src/banyan_metric/index.ts`

## Overview

Banyan Metric™ Premier is the canonical framework for measuring AI session effectiveness
across six orthogonal dimensions. Each dimension captures a distinct axis of value.

**Canonical Premier composite:** 94.16/100 (BP049 · Founder-ratified)

## Dimensions

| Symbol | Name | Formula | Weight |
|---|---|---|---|
| **CW** | Context Window efficiency | substrate_hits / total_queries × 100 | 20% |
| **WC** | Work Completed | work_units / 100 × 100 (capped at 100) | 20% |
| **SC** | Substrate Contribution | new_records / (total × 0.2) × 100 | 15% |
| **RR** | Retrieval Rate | same as CW (independent dimension) | 20% |
| **DR** | Drift Rate | max(0, 100 − drift_events × 10) | 10% |
| **CM** | Cost Mitigation | cloud_avoided / ala_carte_baseline × 100 | 15% |

## Composite

```
composite = CW×0.20 + WC×0.20 + SC×0.15 + RR×0.20 + DR×0.10 + CM×0.15
```

## Ledger Discipline

One row per session or build-cycle close. Append-only. Never edit historical rows.

```typescript
const ledger = new BanyanMetricLedger();
const row = ledger.buildRow('session_001', 'BP051', {
  substrate_hits: 48,
  total_queries: 50,
  work_units: 95,
  substrate_contributions: 12,
  substrate_total: 200,
  cloud_cost_avoided_usd: 0.45,
  ala_carte_baseline_usd: 0.50,
  drift_events_detected: 0,
});
ledger.appendRow(row);
console.log(formatScore(row.score));
```

## MoneyPenny™ Dual-View Meter

MoneyPenny™ tracks two complementary cost-avoidance views per session:

- **Subscription throttle avoided** — at subscription-plan per-query rate
- **A-la-carte avoided** — at cloud API per-query rate

Both views are summed as `combined_usd` for the composite avoidance figure.

## Trademark

Banyan Metric™ is a trademark of Liana Banyan Corporation.
Use in attribution ("scored with Banyan Metric™") is explicitly permitted per
`TRADEMARK_USE_POLICY.md`.
