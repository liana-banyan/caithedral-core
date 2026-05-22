# CAI™ Core — Architecture

**v0.1.7 · Designed to Be Copied · SSPL-1.0 + Cooperative Patent Pledge #2260**

## Overview

CAI™ Core is a complete, self-contained cooperative AI memory substrate. Eight subsystems
compose into a coherent architecture where no single vendor acts as privileged orchestrator.

## Subsystem Reference

### Eblet™ (`src/eblet/`)

The atomic context unit of the CAI™ substrate.

- **Format:** YAML frontmatter + prose body
- **Integrity:** sha256 dual-write (primary path + optional vault mirror)
- **Three-tier hierarchy:** Stone Tablet → Iron Tablet → Gold Tablet → canonical Eblet™
- **ROM-class entities:** permanent · non-evictable · cross-scale-homomorphic
- **Pheromone-eligible:** strength field (weak · medium · strong · rom) drives propagation weight
- **Ledger:** append-only JSONL for every Eblet™ write event (audit trail + patent evidence chain)

### Caithedral™ (`src/caithedral/`)

CPU-only Tier-1 substrate retrieval. Zero LLM inference on substrate hit path.

- **Algorithm:** BM25-lite keyword overlap scoring
- **Latency target:** sub-millisecond for cached index
- **Three modes:**
  - `normal` — substrate hit or miss (read-only, no AI cost)
  - `ai_burst` — substrate hit → Ollama inference → cloud escalation
  - `fallback` — substrate + peer-sync only (zero cloud, zero Ollama)
- **Confidence threshold:** 2.0 BM25-lite score (tunable)
- **Cold index:** persists to `~/.cai_core/substrate/caithedral_cache.jsonl`

### Pheromone (`src/pheromone/`)

Multi-strength canonical-entity propagation across the substrate.

- **Strength classes:** weak · medium · strong · rom (ROM = always inject)
- **Alias resolution:** entity lookup by canonical ID or any registered alias
- **Trail log:** append-only JSONL emission record for substrate growth tracking
- **ROM propagation:** session-open ROM injection (all ROM entities always available)
- **Wrasse integration:** Pheromone entities serve as injection payloads for Wrasse

### Wrasse (`src/wrasse/`)

Trigger-phrase pre-injection context retrieval mechanism.

- **Named after:** the Wrasse fish that removes parasites — Wrasse removes context gaps
- **Mechanism:** scans incoming text for registered trigger phrases; pre-injects matching entities
- **Registry:** persistent `~/.cai_core/wrasse/triggers.json`
- **Injection log:** append-only JSONL for substrate feedback (Pheromone strength growth)
- **Case sensitivity:** configurable per trigger entry

### Cross-Vendor MCP (`src/mcp/`)

Symmetric multi-vendor dispatch substrate.

- **Vendors:** cpu_only · ollama · claude · (all_in_conjunction)
- **No privileged orchestrator:** all vendors receive the same prompt depth
- **all_in_conjunction:** parallel fan-out to all backends + first-result synthesis
- **Dispatch log:** every dispatch recorded with sha256 prompt hash
- **State persistence:** vendor selection survives app restart

### AutoBaton CVT (`src/autobaton/`)

Continuously-variable-transmission orchestration primitive.

- **Wave modes:** standard · drekaskip · novacula
- **Six-step wave protocol:**
  1. Receive → 2. Decompose SEGs → 3. Parallel dispatch → 4. Watch progress →
  5. Synthesize (first-success) → 6. HMAC-bound receipt Eblet™
- **Crash-restart resilience:** wave_active/ scan on init; aborts mid-flight waves
- **NOVACULA planner:** `planNOVACULA()` splits large SEG sets into batched waves
- **Filesystem layout:** wave_queue/ · wave_active/ · wave_archive/

### Banyan Metric™ (`src/banyan_metric/index.ts`)

6-dimension AI session scoring framework.

| Dimension | Symbol | Description |
|---|---|---|
| Context Window efficiency | CW | substrate_hits / total_queries |
| Work Completed | WC | artifacts / LOC / commits per session |
| Substrate Contribution | SC | new Eblets™ / total records (growth rate) |
| Retrieval Rate | RR | Caithedral™ hit ratio |
| Drift Rate | DR | inverse of canon drift events (100 = zero drift) |
| Cost Mitigation | CM | cloud_cost_avoided / a_la_carte_baseline |

**Weights:** CW 20% · WC 20% · SC 15% · RR 20% · DR 10% · CM 15%

**Canonical Premier score:** 94.16/100 (BP049 · 6-dimension ratified)

### MoneyPenny™ (`src/banyan_metric/money_penny.ts`)

Dual-view cloud-cost avoidance meter.

- **Subscription throttle view:** cost-per-query × substrate hits (avoided subscription throttle)
- **A-la-carte view:** cloud-API-rate × substrate hits (avoided pay-per-query)
- **Session close:** appends session record to `~/.cai_core/money_penny/sessions.jsonl`
- **All-time totals:** cumulative across all sessions

### Provenance (`src/provenance/`)

sha256 dual-write · RFC 3161 TSA co-timestamp · HMAC integrity signatures.

- **Primary TSA:** DigiCert (FREE · WebTrust-audited · US federal admissibility)
- **Backup TSA:** GlobalSign (enterprise · eIDAS QTSP · EU evidence chain)
- **Court verification:** `openssl ts -verify -in <tst> -data <original> -CAfile <ca-bundle>`

## Data Flow

```
User prompt
    │
    ▼
Wrasse™ pre-injection ──── trigger match? → inject Pheromone entity body
    │
    ▼
Caithedral™ query ──────── substrate hit? → return record (zero LLM cost)
    │                                               │
    │ miss                                          ▼
    ▼                                      MoneyPenny™ records avoided cost
Cross-Vendor MCP dispatch
    │
    ├── cpu_only (always available)
    ├── ollama (local inference)
    ├── claude (Anthropic API)
    └── all_in_conjunction (parallel fan-out)
    │
    ▼
AutoBaton CVT synthesis → HMAC-bound receipt Eblet™
    │
    ▼
Banyan Metric™ ledger row
```

## Substrate Filesystem Layout

```
~/.cai_core/
├── substrate/
│   └── caithedral_cache.jsonl    # Caithedral™ index
├── pheromone/
│   ├── entities/                  # Per-entity JSON snapshots
│   └── trails.jsonl              # Emission trail log
├── wrasse/
│   ├── triggers.json              # Trigger registry
│   └── injection_log.jsonl        # Injection events
├── mcp/
│   ├── state.json                 # Vendor selection
│   └── dispatch_log.jsonl         # Dispatch receipts
├── autobaton/
│   ├── wave_queue/                # Queued waves
│   ├── wave_active/               # In-flight waves
│   └── wave_archive/              # Completed waves + HMAC receipts
├── banyan_metric/
│   └── ledger.jsonl               # Session scoring rows
├── money_penny/
│   └── sessions.jsonl             # Cost-avoidance sessions
└── pane_leases/                   # CelPane™ blink-phase leases
```
