# Caithedral™ CPU-Only Retrieval

**Canonical source:** `src/caithedral/index.ts`

## What is Caithedral™?

Caithedral™ is the zero-LLM-inference retrieval path of CAI™ Core.
It indexes substrate records and retrieves them using BM25-lite keyword scoring —
no model inference required for cache hits.

**Target latency:** sub-millisecond for indexed queries.

## Three-Mode Operation

| Mode | Behavior |
|---|---|
| `normal` | Substrate hit (free) or miss (no escalation). Read-only. |
| `ai_burst` | Substrate hit → Local Ollama → Cloud escalation (full path) |
| `fallback` | Substrate + peer-sync only. Zero cloud. Zero Ollama. |

## BM25-Lite Scoring

Keyword overlap scoring with IDF weighting:

```
for each query keyword k:
    idf(k) = log(1 + total_records / records_containing_k)
    score += idf(k)
```

Hits above `CONFIDENCE_THRESHOLD = 2.0` are returned as substrate hits.

## Data Persistence

Index is loaded from and persisted to:
```
~/.cai_core/substrate/caithedral_cache.jsonl
```

JSONL format — one `SubstrateRecord` per line. Append-only writes.
Loaded into memory on `CaithedralLocalIndex.load()`.

## Ingest Sources

- **Own cache:** `caithedral_cache.jsonl` (primary)
- **External JSONL:** `ingestJSONL(path, sourceLabel)` for gold tablets and other sources

## Example

```typescript
const index = new CaithedralLocalIndex();
await index.load();

const router = new CaithedralRouter(index);
const result = await router.query('cooperative AI memory substrate');

if (result.hit) {
  console.log(`[${result.routing}] ${result.record?.text}`);
  console.log(`Avoided: $${result.cloud_cost_avoided_usd}`);
}
```

## Trademark

Caithedral™ is a trademark of Liana Banyan Corporation.
"Powered by Caithedral™" attribution is explicitly permitted per
`TRADEMARK_USE_POLICY.md`.
