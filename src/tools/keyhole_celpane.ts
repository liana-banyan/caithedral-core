/**
 * Keyhole Celpane — caithedral-core D-BP158-008
 *
 * D-BP158-008 / BISHOP / seg-wire-celpane-emitter-and-accumulator
 *
 * Phase 0 (D-BP158-007) verdict: seg_return_celpane.ts is the strongest
 * prior art for a celpane emitter in this estate -- a real, durable,
 * cross-process-proven two-tier mint/fetch/mustFetch pattern -- but its
 * celpane shape ({status,headline,refuted,regression,decision_needed}) is
 * SEG-return-specific. MEMORY.md's twelve-connector KEYHOLE
 * (C:\Users\Administrator\.claude\projects\C--Users-Administrator-Documents\memory\MEMORY.md)
 * needs its own shape: connectors resolve today by a human or agent
 * READING WHOLE KEEPER FILES (measured, this ticket: 8 of the 12 live
 * KEEPER files total ~103KB on disk before even following their onward
 * links), which is exactly the behavior celpanes exist to prevent.
 *
 * This module is a direct sibling of seg_return_celpane.ts: same
 * mint-full-text-first / threshold-gate / durable-handle-via-
 * soccerball_emit_durable structure, copied deliberately rather than
 * reinvented, per HARDWIRE-26 limb 2 ("find what exists before you
 * build"). Only the celpane TYPE and the field-authoring step differ.
 *
 * KEYHOLE CELPANE SHAPE, each field justified in one line:
 *   connector      which of the twelve hex connectors this is (e.g. "STATE")
 *                  -- lets a caller confirm the fetch resolved the one it asked for.
 *   holds          one short clause: what topics/facts this KEEPER actually holds
 *                  -- the payload itself, the reason to fetch this celpane at all.
 *   status         "LIVE" | "STALE" | "SUPERSEDED" (enum, not prose) -- a pure,
 *                  typed freshness signal, same discipline as seg_return_celpane's
 *                  mustFetch(): "the celpane looked fine but was actually stale"
 *                  cannot happen from a phrasing miss.
 *   keeper_path    full absolute path to the KEEPER file -- the must-fetch
 *                  fallback target, exactly as seg_return_celpane keeps
 *                  return_path as ITS fallback.
 * Four fields, no more -- each one earns its place against the 50-token
 * ceiling; a fifth "why fetch more" field was considered and cut because
 * `status !== "LIVE"` already IS the "must fetch more" signal (mirrors
 * mustFetch()'s minimalism, not soul/heart/hands/hull/service's five lines,
 * which HARDWIRE-09 designed for a human reader this connector does not have
 * either -- MEMORY.md's own reader is Bishop, a model, same reasoning
 * seg_return_celpane.ts's header already applied to SEG returns).
 */

import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { soccerball_emit_durable, soccerball_decode_durable } from "./soccerball_tools";

// ─── Celpane shape ──────────────────────────────────────────────────────────

export type KeyholeConnectorStatus = "LIVE" | "STALE" | "SUPERSEDED";

export interface KeyholeCelpane {
  connector: string;
  holds: string;
  status: KeyholeConnectorStatus;
  keeper_path: string;
}

/**
 * mustFetchKeeper — the ONLY place this decision is made. Pure function of
 * the one typed status field, never a prose scan, mirroring
 * seg_return_celpane.ts's mustFetch().
 */
export function mustFetchKeeper(c: KeyholeCelpane): boolean {
  return c.status !== "LIVE";
}

function celpaneWireString(c: KeyholeCelpane): string {
  return JSON.stringify({
    connector: c.connector,
    holds: c.holds,
    status: c.status,
    keeper_path: c.keeper_path,
  });
}

function parseCelpaneWireString(s: string): KeyholeCelpane | null {
  try {
    const p = JSON.parse(s);
    if (
      typeof p !== "object" || p === null ||
      typeof p.connector !== "string" ||
      typeof p.holds !== "string" ||
      (p.status !== "LIVE" && p.status !== "STALE" && p.status !== "SUPERSEDED") ||
      typeof p.keeper_path !== "string"
    ) {
      return null;
    }
    return { connector: p.connector, holds: p.holds, status: p.status, keeper_path: p.keeper_path };
  } catch {
    return null;
  }
}

// ─── Keyhole-side: mint ─────────────────────────────────────────────────────

export interface MintKeyholeCelpaneResult {
  handle: string | null;
  celpane: KeyholeCelpane | null;
  must_fetch: boolean;
  durable: boolean;
  durable_reason: string | null;
}

/**
 * mintKeyholeCelpane — hand-authored celpane fields in, durable handle out.
 *
 * Unlike mintSegReturn, this does NOT write a "full return text" copy --
 * the KEEPER file at keeper_path already IS the durable full-text record
 * (it lives in the memory/keepers/ tree under Rule 66 versioning, not
 * something this mint call owns or should duplicate). The handle's
 * bindings carry the celpane JSON plus keeper_path + a sha256 of the
 * KEEPER file's CURRENT content at mint time, so a later fetch can detect
 * (not correct, per Rule 66 -- versioning corrects) if the KEEPER changed
 * underneath a stale minted celpane.
 *
 * NEVER THROWS. Any mint failure returns handle:null, must_fetch:true --
 * a celpane that might not resolve is worse than no celpane.
 */
export function mintKeyholeCelpane(celpaneFields: KeyholeCelpane): MintKeyholeCelpaneResult {
  try {
    const keeperSha256 = existsSync(celpaneFields.keeper_path)
      ? createHash("sha256").update(readFileSync(celpaneFields.keeper_path, "utf-8"), "utf-8").digest("hex")
      : null;
    const celpaneJson = celpaneWireString(celpaneFields);
    const contentId = createHash("sha256")
      .update(celpaneFields.connector + "|" + celpaneJson, "utf-8")
      .digest("hex")
      .slice(0, 16);

    const mint = soccerball_emit_durable([contentId], {
      celpane_json: celpaneJson,
      keeper_path: celpaneFields.keeper_path,
      keeper_sha256: keeperSha256 ?? "",
    });

    if (!mint.durable) {
      return { handle: null, celpane: null, must_fetch: true, durable: false, durable_reason: mint.durable_reason };
    }

    return {
      handle: mint.sid,
      celpane: celpaneFields,
      must_fetch: mustFetchKeeper(celpaneFields),
      durable: true,
      durable_reason: null,
    };
  } catch (e) {
    return { handle: null, celpane: null, must_fetch: true, durable: false, durable_reason: `mint threw: ${(e as Error).message}` };
  }
}

// ─── Bishop-side: fetch ─────────────────────────────────────────────────────

export interface FetchKeyholeCelpaneResult {
  found: boolean;
  celpane: KeyholeCelpane | null;
  must_fetch: boolean;
  keeper_sha256: string | null;
  durable: boolean;
  durable_reason: string | null;
  source: "durable_log" | "in_process_map" | "not_found";
}

/**
 * fetchKeyholeCelpane — Bishop-side DEFAULT resolution. Resolves the
 * handle to its celpane only -- never reads the KEEPER file. This is
 * where default resolution terminates, same discipline as
 * fetchSegReturnCelpane / HARDWIRE-09 Law 1.
 */
export function fetchKeyholeCelpane(handle: string): FetchKeyholeCelpaneResult {
  const resolved = soccerball_decode_durable(handle);
  if (resolved.source === "not_found") {
    return {
      found: false,
      celpane: null,
      must_fetch: true,
      keeper_sha256: null,
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
    must_fetch: celpane ? mustFetchKeeper(celpane) : true,
    keeper_sha256: resolved.bindings["keeper_sha256"] || null,
    durable: resolved.durable,
    durable_reason: resolved.durable_reason,
    source: resolved.source,
  };
}

export interface FetchKeeperFullTextResult {
  found: boolean;
  text: string | null;
  sha256_changed_since_mint: boolean | null;
  keeper_path: string | null;
}

/**
 * fetchKeeperFullText — Bishop-side SECOND, EXPLICIT fetch. Only call this
 * when fetchKeyholeCelpane(...).must_fetch is true, per MEMORY.md's own
 * RESOLUTION INSTRUCTIONS step 1 ("a connector resolves to a celpane, not
 * full content... a second, explicit fetch is required"). Never automatic.
 */
export function fetchKeeperFullText(handle: string): FetchKeeperFullTextResult {
  const resolved = fetchKeyholeCelpane(handle);
  if (!resolved.found || !resolved.celpane) {
    return { found: false, text: null, sha256_changed_since_mint: null, keeper_path: null };
  }
  const keeperPath = resolved.celpane.keeper_path;
  if (!existsSync(keeperPath)) {
    return { found: false, text: null, sha256_changed_since_mint: null, keeper_path: keeperPath };
  }
  const text = readFileSync(keeperPath, "utf-8");
  const actualSha = createHash("sha256").update(text, "utf-8").digest("hex");
  return {
    found: true,
    text,
    sha256_changed_since_mint: resolved.keeper_sha256 ? actualSha !== resolved.keeper_sha256 : null,
    keeper_path: keeperPath,
  };
}
