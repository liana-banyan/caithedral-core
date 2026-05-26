/**
 * Eblit Tools — caithedral-core BP059 W1
 *
 * Eblit = the blink-emit moment captured as its own BETWEEN-class artifact.
 * Per canon_eblit_blink_emit_transient_trace_substrate_primitive_bp059.
 * Distinct from Eblet (stable anchor-class) — Eblit is the null-line shape
 * left in the substrate during the emission act itself.
 */

import { createHash } from "crypto";
import { soccerball_emit } from "./soccerball_tools.js";

// ─── Eblit schema (per canon §5) ─────────────────────────────────────────────

export interface Eblit {
  v: 1;
  eblit_id: string;          // sha256(pearl_id + ts + source).slice(0,16)
  pearl_id: string;          // the Pearl this Eblit witnesses
  source_cathedral: string;  // bishop | knight | member-<id> | etc.
  ts: number;                // emit moment epoch-ms
  decay_class: "BETWEEN" | "promoted-to-eblet";
  null_line: string;         // 32-char shape-trace = soccerball_emit([pearl_id], {ts,src})
  promoted_eblet?: string;   // canonical_ref if anchor-promoted
}

// ─── In-process BETWEEN registry (ephemeral · not persisted) ─────────────────

const BETWEEN_EBLITS = new Map<string, Eblit>();

/**
 * eblit_emit — capture the emission-moment trace for a Pearl.
 * Returns an Eblit that lives in BETWEEN until decay or anchor-promotion.
 * Per Substrace Theorem: eblit_id and null_line are deterministic over inputs.
 */
export function eblit_emit(
  pearl_id: string,
  source_cathedral: string,
  ts?: number,
): Eblit {
  const emit_ts = ts ?? Date.now();

  const eblit_id = createHash("sha256")
    .update(pearl_id + String(emit_ts) + source_cathedral)
    .digest("hex")
    .slice(0, 16);

  // null_line IS a Soccerball SID composed from the Eblit's witness data.
  // This is the bridge to Substrace composition (per canon §5).
  const null_line = soccerball_emit([pearl_id], {
    ts: String(emit_ts),
    src: source_cathedral,
  });

  const eblit: Eblit = {
    v: 1,
    eblit_id,
    pearl_id,
    source_cathedral,
    ts: emit_ts,
    decay_class: "BETWEEN",
    null_line,
  };

  BETWEEN_EBLITS.set(eblit_id, eblit);
  return eblit;
}

/**
 * eblit_lookup — retrieve an Eblit from BETWEEN by eblit_id.
 * Returns null if already decayed or never emitted.
 */
export function eblit_lookup(eblit_id: string): Eblit | null {
  return BETWEEN_EBLITS.get(eblit_id) ?? null;
}

/**
 * eblit_between_size — diagnostic: current BETWEEN population.
 */
export function eblit_between_size(): number {
  return BETWEEN_EBLITS.size;
}
