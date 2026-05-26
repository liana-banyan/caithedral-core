/**
 * Substrace Tools — caithedral-core BP059 W1
 *
 * Substrace = substrate-lace · N Eblit null-lines woven into a coherent
 * aftereffect-pattern. Per canon_substrace_substrate_lace_eblit_trace_weave_bp059.
 *
 * substrace_id is itself a Soccerball composing Eblit null_lines — making
 * Substraces Pearl-equivalents at the next layer up. This enables Quilts.
 */

import { soccerball_emit } from "./soccerball_tools.js";

// ─── Substrace schema (per canon §2) ─────────────────────────────────────────

export interface Substrace {
  v: 1;
  substrace_id: string;       // soccerball_emit(eblit_null_lines, {weave_ts, weaver})
  eblits: string[];           // ordered list of Eblit null_line SIDs (lace pattern)
  weaver: string;             // cathedral or member that wove this sheet
  weave_ts: number;
  decay_class: "BETWEEN" | "anchor-promoted";
  bp_session: string;
}

// ─── In-process BETWEEN registry ─────────────────────────────────────────────

const BETWEEN_SUBSTRACES = new Map<string, Substrace>();

/**
 * substrace_weave — weave N Eblit null_lines into a Substrace sheet.
 * Per Substrace Theorem: same eblit_null_lines + weaver + weave_ts → identical substrace_id.
 * This is the empirically testable claim: independent emissions of same inputs = same SID.
 */
export function substrace_weave(
  eblit_null_lines: string[],
  weaver: string,
  weave_ts?: number,
): Substrace {
  if (eblit_null_lines.length === 0) {
    throw new Error("substrace_weave: at least one eblit null_line required");
  }

  const ts = weave_ts ?? Date.now();

  // substrace_id = soccerball_emit over the null_lines with weave context
  const substrace_id = soccerball_emit(eblit_null_lines, {
    weaver,
    weave_ts: String(ts),
  });

  const substrace: Substrace = {
    v: 1,
    substrace_id,
    eblits: [...eblit_null_lines],
    weaver,
    weave_ts: ts,
    decay_class: "BETWEEN",
    bp_session: "BP059",
  };

  BETWEEN_SUBSTRACES.set(substrace_id, substrace);
  return substrace;
}

/**
 * substrace_lookup — retrieve a Substrace from BETWEEN by substrace_id.
 */
export function substrace_lookup(substrace_id: string): Substrace | null {
  return BETWEEN_SUBSTRACES.get(substrace_id) ?? null;
}

/**
 * substrace_between_size — diagnostic.
 */
export function substrace_between_size(): number {
  return BETWEEN_SUBSTRACES.size;
}
