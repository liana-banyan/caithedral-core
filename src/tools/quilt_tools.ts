/**
 * Quilt Tools — caithedral-core BP059 W1
 *
 * QuiltOfSubstrace = the Kipling Effect artifact: N Substrace sheets composed
 * by a Soccerball into a coherent narrative-class artifact.
 * Per canon_kipling_effect_quilt_of_substrace_soccerball_composed_just_so_story_class_bp059.
 *
 * Formal name (papers/Provs/USPTO): The Substrace Theorem
 * Umbrella public name (Cephas/talks): Kipling Effect
 * NEVER "wormhole" — per Founder direct ratify.
 */

import { soccerball_emit } from "./soccerball_tools.js";

// ─── QuiltOfSubstrace schema (per canon §2) ───────────────────────────────────

export interface QuiltOfSubstrace {
  v: 1;
  quilt_id: string;            // soccerball_emit(substrace_ids, {weaver, ts, narrative_tag})
  substraces: string[];        // ordered Substrace SIDs (the sheets)
  narrative_tag: string;       // human-readable just-so handle
  weaver: string;
  ts: number;
  decay_class: "BETWEEN" | "anchor-class";
  child_quilts?: string[];     // Quilts can compose Quilts (Kipling-fractal)
}

// ─── In-process BETWEEN registry ─────────────────────────────────────────────

const BETWEEN_QUILTS = new Map<string, QuiltOfSubstrace>();

/**
 * quilt_compose — compose N Substrace SIDs into a QuiltOfSubstrace.
 * Per Substrace Theorem: identical substrace_ids + weaver + narrative_tag + ts
 * → identical quilt_id at any independent endpoint. No transmission required.
 */
export function quilt_compose(
  substrace_ids: string[],
  narrative_tag: string,
  weaver: string,
  ts?: number,
): QuiltOfSubstrace {
  if (substrace_ids.length === 0) {
    throw new Error("quilt_compose: at least one substrace_id required");
  }

  const compose_ts = ts ?? Date.now();

  const quilt_id = soccerball_emit(substrace_ids, {
    weaver,
    ts: String(compose_ts),
    narrative_tag,
  });

  const quilt: QuiltOfSubstrace = {
    v: 1,
    quilt_id,
    substraces: [...substrace_ids],
    narrative_tag,
    weaver,
    ts: compose_ts,
    decay_class: "BETWEEN",
  };

  BETWEEN_QUILTS.set(quilt_id, quilt);
  return quilt;
}

/**
 * quilt_lookup — retrieve a Quilt from BETWEEN by quilt_id.
 */
export function quilt_lookup(quilt_id: string): QuiltOfSubstrace | null {
  return BETWEEN_QUILTS.get(quilt_id) ?? null;
}

/**
 * quilt_between_size — diagnostic.
 */
export function quilt_between_size(): number {
  return BETWEEN_QUILTS.size;
}
