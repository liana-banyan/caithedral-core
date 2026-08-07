/**
 * SEG Return Celpane — caithedral-core BP148 D-BP148-016
 *
 * Implements SPEC_BP148_THE_SEG_RETURN_CELPANE_PROTOCOL.md: the SEG -> Bishop
 * compression leg (not the Bishop -> Founder leg, which HARDWIRE-11 already
 * ruled out as a losing trade -- the Founder reads with his eyes and the tokens
 * are spent generating the prose regardless of how it is handed back).
 *
 * Deliberately built directly on the two already-proven, cross-process-durable
 * primitives in this package -- crystal_store.ts (the Crystal log itself) via
 * soccerball_tools.ts's *_durable functions -- and nothing else. It does NOT
 * go through the live librarian-mcp MCP server (pearl_emit / soccerball_emit
 * tools), because that server's compiled dist is not guaranteed current until
 * restarted (see HARDWIRE-11 Section 4's disclosed staleness finding), and
 * this ticket was explicitly told not to restart it. Calling the durable
 * Crystal directly, in-process, is exactly the workaround HARDWIRE-11 itself
 * used for the same reason.
 *
 * CELPANE SHAPE, AND WHY IT DIVERGES FROM HARDWIRE-09's FIVE PROSE LINES:
 * HARDWIRE-09 Law 1's soul/heart/hands/hull/service celpane was designed as a
 * human-legible digest -- "the laser gun," meant to be read and spoken aloud
 * (see mnemosyne's speakAloud() call sites). A SEG return has exactly one
 * reader: Bishop, a model, never a human directly (Founder ruling relayed
 * mid-ticket, BP148: "if we can save on segs to bishop, do it - because I
 * never see what the segs say anyway"). Optimizing for a reader that does not
 * exist wastes tokens that could instead go toward making the four safety
 * signals structurally impossible to omit. So this celpane is a small
 * structured object, not five prose lines:
 *
 *   status           "COMPLETE" | "PARTIAL" | "BLOCKED"   (enum, not prose)
 *   headline         one short string, the actual result
 *   refuted          boolean -- a premise was refuted during the work
 *   regression       boolean -- something previously working broke
 *   decision_needed  boolean -- a Founder decision is pending
 *   note             optional short string for anything else Bishop should
 *                    see before deciding whether to fetch
 *
 * Four of six fields are booleans or enums specifically so that "the celpane
 * omitted PARTIAL" or "the celpane omitted a refuted premise" cannot happen
 * by prose drift -- mustFetch() below is a pure function of those four typed
 * fields, not a keyword scan over a paragraph. This was the single most
 * important design decision in this ticket; see the spec file for the full
 * justification and the Founder ruling that authorizes it.
 */

import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { soccerball_emit_durable, soccerball_decode_durable } from "./soccerball_tools.js";

// ─── Celpane shape ──────────────────────────────────────────────────────────

export type SegReturnStatus = "COMPLETE" | "PARTIAL" | "BLOCKED";

export interface SegReturnCelpane {
  status: SegReturnStatus;
  /** One short sentence: the actual result. Bishop-facing, not human-facing prose. */
  headline: string;
  /** A premise (ground truth, prior claim, prior report) was refuted during the work. */
  refuted: boolean;
  /** Something that previously worked broke. */
  regression: boolean;
  /** A Founder decision is pending and cannot be made by Bishop or the SEG. */
  decision_needed: boolean;
  /** Optional short qualifier for anything the four typed fields don't carry. */
  note?: string;
}

/**
 * mustFetch — the ONLY place this decision is made. Pure function of the four
 * typed signals, never a prose/keyword scan, so "the celpane looked fine but
 * should have forced a fetch" cannot happen from a phrasing miss.
 */
export function mustFetch(c: SegReturnCelpane): boolean {
  return c.status !== "COMPLETE" || c.refuted || c.regression || c.decision_needed;
}

function celpaneWireString(c: SegReturnCelpane): string {
  // Deterministic key order so repeated mints of an identical celpane produce
  // an identical wire string (does not affect the Crystal address, which is
  // pearls-only per Ruling 2, but keeps the binding itself stable for diffing).
  return JSON.stringify({
    status: c.status,
    headline: c.headline,
    refuted: c.refuted,
    regression: c.regression,
    decision_needed: c.decision_needed,
    note: c.note ?? null,
  });
}

function parseCelpaneWireString(s: string): SegReturnCelpane | null {
  try {
    const p = JSON.parse(s);
    if (
      typeof p !== "object" || p === null ||
      (p.status !== "COMPLETE" && p.status !== "PARTIAL" && p.status !== "BLOCKED") ||
      typeof p.headline !== "string" ||
      typeof p.refuted !== "boolean" ||
      typeof p.regression !== "boolean" ||
      typeof p.decision_needed !== "boolean"
    ) {
      return null;
    }
    return {
      status: p.status,
      headline: p.headline,
      refuted: p.refuted,
      regression: p.regression,
      decision_needed: p.decision_needed,
      note: typeof p.note === "string" ? p.note : undefined,
    };
  } catch {
    return null;
  }
}

// ─── v.42bis transparent-mode threshold ────────────────────────────────────
// NOTE ON THE ESTIMATE BASIS: this runtime gate uses a fast chars/4 proxy for
// cl100k_base's observed average English/JSON ratio, NOT a real tokenizer --
// deliberately, because this function is on the hot path of every SEG return
// and a per-mint subprocess tokenizer call would cost more latency than the
// decision it protects. This is a DIFFERENT use than Deliverable 3's real
// measurement (which uses actual tiktoken and never estimates from character
// counts, per instruction) -- HARDWIRE-11 itself drew this same line, running
// its real-tokenizer measurement as a separate offline script rather than
// inline in the live tool call path. Every result below carries its
// `estimate.basis` field so a caller never mistakes this proxy for a measured
// number.
const CHARS_PER_TOKEN_ESTIMATE = 4;

function estimateTokens(s: string): number {
  return Math.ceil(s.length / CHARS_PER_TOKEN_ESTIMATE);
}

export interface TokenEstimate {
  M: number; // one-time mint-call overhead, this exchange
  H: number; // handle + celpane, on the wire, this exchange
  P: number; // full prose, this exchange
  basis: "char4_estimate";
}

// ─── SEG-side: mint ─────────────────────────────────────────────────────────

export interface MintSegReturnResult {
  mode: "HANDLE_MODE" | "TRANSPARENT_MODE";
  /** soccerball_id. Null in TRANSPARENT_MODE (nothing was minted). */
  handle: string | null;
  /** Null in TRANSPARENT_MODE -- the prose field carries everything instead. */
  celpane: SegReturnCelpane | null;
  must_fetch: boolean;
  /** Populated only in TRANSPARENT_MODE, or when the durable path failed outright. */
  prose: string | null;
  return_path: string;
  durable: boolean;
  durable_reason: string | null;
  estimate: TokenEstimate;
}

/**
 * mintSegReturn — SEG-side call at the end of its work.
 *
 * Step 1 (always, unconditionally): write the full return text to `returnPath`
 * if it is not already there. This is durable evidence and is NEVER deleted,
 * NEVER conditional on what happens next -- "compress the transmission, never
 * the record" (Founder ruling, relayed mid-ticket).
 *
 * Step 2: evaluate the v.42bis threshold. If M + H >= P, stop here and hand
 * back the prose directly (TRANSPARENT_MODE) -- do not mint.
 *
 * Step 3: mint a durable Crystal handle whose bindings carry the celpane JSON
 * and the return path, exactly the HARDWIRE-11 pattern (celpane_ssps /
 * return_path bindings on a soccerball). Return only {handle, celpane}.
 *
 * NEVER THROWS. Any failure at any step (disk write, durable mint) degrades to
 * TRANSPARENT_MODE with the full prose attached -- a compression layer that
 * can lose a dispatch return is worse than no compression, per instruction.
 */
export function mintSegReturn(
  celpaneFields: SegReturnCelpane,
  fullReturnText: string,
  returnPath: string
): MintSegReturnResult {
  // Step 1 -- durable record, unconditional, first.
  try {
    const dir = resolve(returnPath, "..");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    if (!existsSync(returnPath)) {
      writeFileSync(returnPath, fullReturnText, "utf-8");
    }
  } catch (e) {
    return {
      mode: "TRANSPARENT_MODE",
      handle: null,
      celpane: null,
      must_fetch: true,
      prose: fullReturnText,
      return_path: returnPath,
      durable: false,
      durable_reason: `full-return write failed: ${(e as Error).message}`,
      estimate: { M: 0, H: 0, P: estimateTokens(fullReturnText), basis: "char4_estimate" },
    };
  }

  // Step 2 -- v.42bis threshold, evaluated before minting anything.
  const celpaneJson = celpaneWireString(celpaneFields);
  const H = estimateTokens(celpaneJson) + 6; // celpane JSON + a 32-hex-char handle string
  const M = estimateTokens(celpaneJson) + estimateTokens(returnPath) + 24; // mint call's own small request/response
  const P = estimateTokens(fullReturnText);
  const estimate: TokenEstimate = { M, H, P, basis: "char4_estimate" };

  if (M + H >= P) {
    return {
      mode: "TRANSPARENT_MODE",
      handle: null,
      celpane: null,
      must_fetch: true,
      prose: fullReturnText,
      return_path: returnPath,
      durable: true, // the file write above did land
      durable_reason: null,
      estimate,
    };
  }

  // Step 3 -- mint. content-address on the full return text itself (a real
  // sha256 fragment standing in for "the pearl" -- this module does not call
  // the live pearl_emit MCP tool, per the file header), bind celpane + path.
  try {
    const contentId = createHash("sha256").update(fullReturnText, "utf-8").digest("hex").slice(0, 16);
    const returnSha256 = createHash("sha256").update(fullReturnText, "utf-8").digest("hex");
    const mint = soccerball_emit_durable([contentId], {
      celpane_json: celpaneJson,
      return_path: returnPath,
      return_sha256: returnSha256,
    });

    if (!mint.durable) {
      // Fail-open: the mint did not land durably. A handle that might not
      // resolve is worse than no handle -- degrade to prose.
      return {
        mode: "TRANSPARENT_MODE",
        handle: null,
        celpane: null,
        must_fetch: true,
        prose: fullReturnText,
        return_path: returnPath,
        durable: false,
        durable_reason: mint.durable_reason,
        estimate,
      };
    }

    return {
      mode: "HANDLE_MODE",
      handle: mint.sid,
      celpane: celpaneFields,
      must_fetch: mustFetch(celpaneFields),
      prose: null,
      return_path: returnPath,
      durable: true,
      durable_reason: null,
      estimate,
    };
  } catch (e) {
    return {
      mode: "TRANSPARENT_MODE",
      handle: null,
      celpane: null,
      must_fetch: true,
      prose: fullReturnText,
      return_path: returnPath,
      durable: false,
      durable_reason: `mint threw: ${(e as Error).message}`,
      estimate,
    };
  }
}

// ─── Bishop-side: fetch ─────────────────────────────────────────────────────

export interface FetchCelpaneResult {
  found: boolean;
  celpane: SegReturnCelpane | null;
  must_fetch: boolean;
  return_path: string | null;
  return_sha256: string | null;
  durable: boolean;
  durable_reason: string | null;
  source: "durable_log" | "in_process_map" | "not_found";
}

/**
 * fetchSegReturnCelpane — Bishop-side DEFAULT resolution. Resolves the handle
 * to its celpane only -- never touches the full-text file. Per HARDWIRE-09 Law
 * 1 / HARDWIRE-11 step 6, this is where default resolution terminates.
 */
export function fetchSegReturnCelpane(handle: string): FetchCelpaneResult {
  const resolved = soccerball_decode_durable(handle);
  if (resolved.source === "not_found") {
    return {
      found: false,
      celpane: null,
      must_fetch: true, // unresolvable handle -- Bishop cannot decide anything, treat as must-fetch/must-escalate
      return_path: null,
      return_sha256: null,
      durable: resolved.durable,
      durable_reason: resolved.durable_reason,
      source: "not_found",
    };
  }

  const celpaneJson = resolved.bindings["celpane_json"];
  const celpane = celpaneJson ? parseCelpaneWireString(celpaneJson) : null;

  return {
    found: true,
    celpane,
    must_fetch: celpane ? mustFetch(celpane) : true, // unparseable celpane is itself a must-fetch condition
    return_path: resolved.bindings["return_path"] ?? null,
    return_sha256: resolved.bindings["return_sha256"] ?? null,
    durable: resolved.durable,
    durable_reason: resolved.durable_reason,
    source: resolved.source,
  };
}

export interface FetchFullTextResult {
  found: boolean;
  text: string | null;
  /** true/false if return_sha256 binding was present and checked; null if there was nothing to check against. */
  sha256_verified: boolean | null;
  return_path: string | null;
}

/**
 * fetchSegReturnFullText — Bishop-side SECOND, EXPLICIT fetch. Only call this
 * when fetchSegReturnCelpane(...).must_fetch is true, or Bishop has decided it
 * needs the detail for some other reason. Never automatic, never folded into
 * the default resolution above (HARDWIRE-11 step 7).
 */
export function fetchSegReturnFullText(handle: string): FetchFullTextResult {
  const resolved = fetchSegReturnCelpane(handle);
  if (!resolved.found || !resolved.return_path) {
    return { found: false, text: null, sha256_verified: null, return_path: null };
  }
  if (!existsSync(resolved.return_path)) {
    return { found: false, text: null, sha256_verified: null, return_path: resolved.return_path };
  }
  const text = readFileSync(resolved.return_path, "utf-8");
  const actualSha = createHash("sha256").update(text, "utf-8").digest("hex");
  return {
    found: true,
    text,
    sha256_verified: resolved.return_sha256 ? actualSha === resolved.return_sha256 : null,
    return_path: resolved.return_path,
  };
}
