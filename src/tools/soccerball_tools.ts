/**
 * Soccerball Tools — caithedral-core BP058 W15 V15.4
 *
 * Wrappers for Soccerball/Speckle Architecture operations.
 * Provides caithedral-core facing surface for hex codec operations.
 *
 * D-BP147-006 / KNIGHT / M1 / seg-m1a1 — durability pass:
 * Address derivation changed from the pearls+bindings scheme to the pearls-ONLY scheme
 * per Bishop's Ruling 2 (D-BP147-006, final, not re-opened here). This changes the
 * soccerball_id produced for any call with non-empty `bindings` — that is the intended
 * fix, not an accidental break; see the M1 return report for the full disclosure of
 * which downstream callers (eblit_tools.ts, substrace_tools.ts, quilt_tools.ts) are
 * affected. Calls with empty bindings are unaffected (the two schemes agree exactly
 * when bindings are empty).
 * A durable, append-only JSONL log now backs every mint — see crystal_store.ts for the
 * path-resolution rule (Ruling 1) and record format. The in-process Map below is kept
 * as the fallback substrate for pre-existing handles that predate this durable log
 * (Ruling 2 migration note: old in-memory-only handles age out naturally, they are not
 * migrated).
 */

export { pearl_emit, pearl_decode, pearl_crystal_size } from "./pearl_tools.js";

import {
  deriveMintAddress,
  mintChonkDurable,
  resolveChonkDurable,
} from "./crystal_store.js";

// ─── Local MassCrystal (caithedral-core internal) — pre-existing fallback substrate ──

interface PeanutRoll {
  v: 1;
  s: string;
  p: string[];
  b: Record<string, string>;
  ts: number;
}

const CAITHEDRAL_CRYSTAL = new Map<string, PeanutRoll>();

// ─── soccerball_emit ──────────────────────────────────────────────────────────

export interface SoccerballEmitResult {
  sid: string;
  durable: boolean;
  log_path: string | null;
  durable_reason: string | null;
}

/**
 * soccerball_emit_durable — RULINGS 1-3. Mints the pearls-only content address
 * (Ruling 2), attempts a durable JSONL mint+bind write (Ruling 1), and always keeps
 * the in-process Map populated (pre-existing fallback substrate). Never throws for
 * durability reasons — a durable-write failure is fail-open at this layer per Ruling 1
 * and is reported honestly via `durable: false` + `durable_reason`, never silently
 * (Ruling 3). This is the function the `soccerball_emit` MCP tool actually calls to get
 * the durability signal into its response.
 */
export function soccerball_emit_durable(
  pearls: string[],
  bindings: Record<string, string> = {}
): SoccerballEmitResult {
  if (!pearls || pearls.length === 0) throw new Error("soccerball_emit: pearls must be non-empty");

  const sortedB = Object.fromEntries(Object.entries(bindings).sort(([a], [b]) => a.localeCompare(b)));
  const sid = deriveMintAddress(pearls); // RULING 2: pearls-only, sorted-not-deduped

  CAITHEDRAL_CRYSTAL.set(sid, { v: 1, s: sid, p: [...pearls].sort(), b: sortedB, ts: Date.now() });

  const mint = mintChonkDurable(pearls, bindings);
  return { sid, durable: mint.durable, log_path: mint.logPath, durable_reason: mint.reason };
}

/**
 * soccerball_emit — legacy string-returning contract, preserved verbatim for
 * eblit_tools.ts / substrace_tools.ts / quilt_tools.ts, which only ever consumed the
 * sid string. Delegates to soccerball_emit_durable() for the actual mint + durable
 * write; the durability signal is simply not visible through this narrower return type.
 * Content-addressed: same `pearls` array always yields the same soccerball_id (Ruling 2:
 * bindings no longer participate in the address, only in the durable log's bind records).
 */
export function soccerball_emit(
  pearls: string[],
  bindings: Record<string, string> = {}
): string {
  return soccerball_emit_durable(pearls, bindings).sid;
}

// ─── soccerball_decode ────────────────────────────────────────────────────────

export interface SoccerballDecodeResult {
  pearls: string[];
  bindings: Record<string, string>;
  durable: boolean;
  source: "durable_log" | "in_process_map" | "not_found";
  log_path: string | null;
  durable_reason: string | null;
}

/**
 * soccerball_decode_durable — resolves from the durable JSONL log FIRST (Ruling 2
 * migration note); if the handle isn't there, falls back to the pre-existing in-process
 * Map (covers handles minted before the durable log existed, or in a different
 * process's still-running memory within THIS process). Never throws; always reports an
 * honest `durable` + `source` (Ruling 3).
 */
export function soccerball_decode_durable(soccerball_id: string): SoccerballDecodeResult {
  const fromLog = resolveChonkDurable(soccerball_id);
  if (fromLog.durable && fromLog.found) {
    return {
      pearls: fromLog.pearls,
      bindings: fromLog.bindings,
      durable: true,
      source: "durable_log",
      log_path: fromLog.logPath,
      durable_reason: null,
    };
  }
  const roll = CAITHEDRAL_CRYSTAL.get(soccerball_id);
  if (roll) {
    return {
      pearls: [...roll.p],
      bindings: { ...roll.b },
      durable: false,
      source: "in_process_map",
      log_path: fromLog.logPath,
      durable_reason: fromLog.durable
        ? "handle not present in durable log; served from pre-existing in-process Map"
        : fromLog.reason,
    };
  }
  return {
    pearls: [],
    bindings: {},
    durable: false,
    source: "not_found",
    log_path: fromLog.logPath,
    durable_reason: fromLog.reason ?? "handle not present in durable log or in-process Map",
  };
}

/**
 * soccerball_decode — legacy `{pearls,bindings}|null` contract, preserved for any
 * caller that only wants the plain shape. Delegates to soccerball_decode_durable().
 */
export function soccerball_decode(
  soccerball_id: string
): { pearls: string[]; bindings: Record<string, string> } | null {
  const result = soccerball_decode_durable(soccerball_id);
  if (result.source === "not_found") return null;
  return { pearls: result.pearls, bindings: result.bindings };
}

// ─── soccerball_lookup ────────────────────────────────────────────────────────

export interface SoccerballLookupResult {
  roll: PeanutRoll | null;
  durable: boolean;
  source: "durable_log" | "in_process_map" | "not_found";
  log_path: string | null;
  durable_reason: string | null;
}

/**
 * soccerball_lookup_durable — same durable-log-first / in-process-Map-fallback
 * resolution as soccerball_decode_durable, but returns the full wire-format PeanutRoll.
 */
export function soccerball_lookup_durable(soccerball_id: string): SoccerballLookupResult {
  const fromLog = resolveChonkDurable(soccerball_id);
  if (fromLog.durable && fromLog.found) {
    return {
      roll: {
        v: 1,
        s: soccerball_id,
        p: fromLog.pearls,
        b: fromLog.bindings,
        ts: fromLog.mintTs ? Date.parse(fromLog.mintTs) : Date.now(),
      },
      durable: true,
      source: "durable_log",
      log_path: fromLog.logPath,
      durable_reason: null,
    };
  }
  const roll = CAITHEDRAL_CRYSTAL.get(soccerball_id) ?? null;
  if (roll) {
    return {
      roll,
      durable: false,
      source: "in_process_map",
      log_path: fromLog.logPath,
      durable_reason: fromLog.durable
        ? "handle not present in durable log; served from pre-existing in-process Map"
        : fromLog.reason,
    };
  }
  return {
    roll: null,
    durable: false,
    source: "not_found",
    log_path: fromLog.logPath,
    durable_reason: fromLog.reason ?? "handle not present in durable log or in-process Map",
  };
}

/**
 * soccerball_lookup — legacy `PeanutRoll | null` contract, preserved verbatim.
 * Delegates to soccerball_lookup_durable().
 */
export function soccerball_lookup(soccerball_id: string): PeanutRoll | null {
  return soccerball_lookup_durable(soccerball_id).roll;
}

// ─── speckle_nibble ────────────────────────────────────────────────────────────

/**
 * speckle_nibble — extract single Speckle (4-bit nibble) at position 0-31.
 */
export function speckle_nibble(soccerball_id: string, position: number): string {
  if (position < 0 || position > 31) throw new Error("Position must be 0-31");
  return soccerball_id[position];
}

// ─── Substrate Diagnostics ────────────────────────────────────────────────────

/**
 * caithedral_substrate_stats — current caithedral MassCrystal stats.
 */
export function caithedral_substrate_stats(): { count: number; estimatedBytes: number } {
  return { count: CAITHEDRAL_CRYSTAL.size, estimatedBytes: CAITHEDRAL_CRYSTAL.size * 200 };
}
