/**
 * Crystal Store — durable, append-only Soccerball mint/bind log — caithedral-core side.
 *
 * D-BP147-006 / KNIGHT / M1 / seg-m1a1
 *
 * Independent reimplementation, scoped entirely to caithedral-core, of the record
 * format and address-derivation algorithm READ (read-only, per dispatch) from:
 *   C:\Users\Administrator\Documents\mnemosyne\src\main\crystal\crystal_store.ts
 *   C:\Users\Administrator\Documents\mnemosyne\src\main\crystal\crystal_types.ts
 * This file does not import, require, symlink, or copy either of those files. Every
 * line below was written from scratch against this ticket's two rulings, verified by
 * reading the reference module's source (not by reasoning about what it "should" do).
 * The point of matching bit-for-bit is that BOTH sides -- mnemosyne's Electron app and
 * this MCP server -- resolve to, and can safely share, the SAME on-disk file:
 *   %APPDATA%\amplify-computer\crystal\crystal_log.jsonl
 *
 * RULING 1 (path resolution) and RULING 2 (pearls-only address) are Bishop's, final,
 * and are not re-opened here — see the D-BP147-006 dispatch text for the ruling itself.
 *
 * Scope note: this module implements `mint` (address derivation + durable record) and
 * additive-only `bind`, plus `resolve` (replay of mint + bind/supersede records). It does
 * NOT implement the reference's reason-gated `mutateChonkBinding` / `supersede` WRITE path
 * — this ticket's task was "make soccerball_emit/pearl_emit durable + honest", not "port
 * the full change-gate API". `resolveChonk` still folds in `supersede` records on READ
 * (so this module correctly interoperates if the Electron-side app ever writes one to the
 * shared log), it just never originates one itself. See the M1 return report for the
 * explicit disclosure of this scoping choice.
 */
import { existsSync, mkdirSync, appendFileSync, readFileSync } from "fs";
import { resolve, join } from "path";
import { createHash } from "crypto";

const USERDATA_APP_NAME = "amplify-computer";

export interface BindingTarget {
  targetType: string;
  ref: string;
  meta?: Record<string, unknown>;
}

export interface CrystalLogRecord {
  v: 1;
  op: "mint" | "bind" | "supersede";
  sid: string;
  ts: string; // ISO-8601 UTC
  pearls?: string[]; // present on 'mint' only
  key?: string; // present on 'bind' / 'supersede'
  target?: BindingTarget; // present on 'bind' / 'supersede'
  reason?: string; // present on 'supersede' only (not written by this module)
  note?: string; // present on 'supersede' only (not written by this module)
}

export interface ResolvedChonk {
  sid: string;
  pearls: string[];
  bindings: Record<string, BindingTarget>;
  mintTs: string;
}

/** Distinguishes a hard path-resolution failure (RULING 1) from any other I/O failure. */
export class CrystalPathError extends Error {}

/**
 * resolveCrystalDir — RULING 1, the exact 3-step rule:
 *   1. process.env.MNEM_CRYSTAL_DIR — absolute override, wins outright if set.
 *   2. Windows: %APPDATA%\amplify-computer\crystal, computed directly from
 *      process.env.APPDATA — no Electron dependency required or used.
 *   3. HARD ERROR. Never a silent cwd-relative fallback.
 * This function itself throws/fails loudly. It does not swallow the error — fail-open
 * belongs at the CALLER (mintChonkDurable / resolveChonkDurable below), not here.
 */
export function resolveCrystalDir(): string {
  const envOverride = process.env.MNEM_CRYSTAL_DIR;
  if (envOverride && envOverride.trim() !== "") {
    return resolve(envOverride);
  }

  const attempted: string[] = [];
  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    if (appData) {
      return resolve(appData, USERDATA_APP_NAME, "crystal");
    }
    attempted.push("Windows computed path -- %APPDATA% is not set in this process's environment");
  } else {
    attempted.push(
      `No verified non-Electron userData computation for process.platform === "${process.platform}" ` +
        `-- Electron's convention differs by platform and this ticket's Phase-0 evidence is Windows-only`
    );
  }

  throw new CrystalPathError(
    "[caithedral-core/crystal_store] could not resolve a crystal storage directory. Tried, in order:\n" +
      attempted.map((a) => `  - ${a}`).join("\n") +
      "\nFix: set MNEM_CRYSTAL_DIR to an absolute directory path -- it is an override and wins " +
      "outright over everything above. " +
      `Expected default location on Windows: %APPDATA%\\${USERDATA_APP_NAME}\\crystal.`
  );
}

/**
 * deriveMintAddress — RULING 2, pearls-only content address.
 * SORTED BUT NOT DE-DUPLICATED: order does not affect the address, but duplicate pearl
 * entries are NOT collapsed and DO change the resulting address. Do not "fix" this to
 * dedupe — that would silently mint different addresses than the reference for the same
 * conceptual pearl set. Verify against crystal_store.ts's own deriveMintAddress before
 * changing a single character of this function.
 */
export function deriveMintAddress(pearls: string[]): string {
  if (!pearls || pearls.length === 0) {
    throw new Error("deriveMintAddress: pearls must be non-empty");
  }
  const sorted = [...pearls].sort();
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex").slice(0, 32);
}

function ensureDir(p: string): void {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function utcTs(): string {
  return new Date().toISOString();
}

function crystalPaths(): { dir: string; logPath: string } {
  const dir = resolveCrystalDir();
  return { dir, logPath: join(dir, "crystal_log.jsonl") };
}

function readAllRecords(logPath: string): CrystalLogRecord[] {
  if (!existsSync(logPath)) return [];
  const raw = readFileSync(logPath, "utf-8");
  const out: CrystalLogRecord[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as CrystalLogRecord);
    } catch {
      continue; // a corrupt line is skipped, never thrown, on read
    }
  }
  return out;
}

function appendRecord(dir: string, logPath: string, rec: CrystalLogRecord): void {
  ensureDir(dir);
  appendFileSync(logPath, JSON.stringify(rec) + "\n", "utf-8");
}

// ─── Pure log operations (no fail-open here — callers below own that) ────────────────

function mintChonk(dir: string, logPath: string, pearls: string[]): string {
  const sid = deriveMintAddress(pearls);
  const existing = readAllRecords(logPath);
  const alreadyMinted = existing.some((r) => r.op === "mint" && r.sid === sid);
  if (!alreadyMinted) {
    appendRecord(dir, logPath, { v: 1, op: "mint", sid, ts: utcTs(), pearls: [...pearls].sort() });
  }
  return sid;
}

function resolveChonk(logPath: string, sid: string): ResolvedChonk | null {
  const records = readAllRecords(logPath).filter((r) => r.sid === sid);
  const mintRec = records.find((r) => r.op === "mint");
  if (!mintRec || !mintRec.pearls) return null;

  const bindings: Record<string, BindingTarget> = {};
  for (const r of records) {
    if ((r.op === "bind" || r.op === "supersede") && r.key && r.target) {
      bindings[r.key] = r.target;
    }
  }
  return { sid, pearls: mintRec.pearls, bindings, mintTs: mintRec.ts };
}

/**
 * bindChonk — additive-only, matching the reference's change-gate semantics:
 *   - new key on this sid            -> appended
 *   - existing key, identical value  -> idempotent no-op
 *   - existing key, different value  -> rejected (silently, at this scope; full
 *     reason-gated mutation is out of scope for this ticket, see file header)
 */
function bindChonk(
  dir: string,
  logPath: string,
  sid: string,
  key: string,
  target: BindingTarget
): "appended" | "idempotent-noop" | "rejected-additive-only" {
  const current = resolveChonk(logPath, sid);
  if (!current) return "rejected-additive-only";
  const existing = current.bindings[key];
  if (!existing) {
    appendRecord(dir, logPath, { v: 1, op: "bind", sid, ts: utcTs(), key, target });
    return "appended";
  }
  if (JSON.stringify(existing) === JSON.stringify(target)) {
    return "idempotent-noop";
  }
  return "rejected-additive-only";
}

// ─── Caller-facing, fail-open wrappers — RULING 1's fail-open-at-caller clause,
//     RULING 3's durability-signal contract ─────────────────────────────────────────

export interface MintDurableResult {
  sid: string;
  durable: boolean;
  logPath: string | null;
  reason: string | null;
}

/**
 * mintChonkDurable — mints (or idempotently re-confirms) the pearls-only address, then
 * additively binds every supplied binding key. NEVER throws: a path-resolution failure
 * (RULING 1) or any other durable-write failure is caught here and reported honestly via
 * `durable: false` + a named `reason` — never a silent success (RULING 3).
 */
export function mintChonkDurable(
  pearls: string[],
  bindings: Record<string, string> = {}
): MintDurableResult {
  const sid = deriveMintAddress(pearls); // validation failures (empty pearls) propagate — not a durability concern
  try {
    const { dir, logPath } = crystalPaths();
    mintChonk(dir, logPath, pearls);
    for (const [key, value] of Object.entries(bindings)) {
      bindChonk(dir, logPath, sid, key, { targetType: "opaque", ref: value });
    }
    return { sid, durable: true, logPath, reason: null };
  } catch (err) {
    const isPathError = err instanceof CrystalPathError;
    return {
      sid,
      durable: false,
      logPath: null,
      reason: isPathError
        ? `path resolution failed: ${(err as Error).message}`
        : `durable write failed: ${(err as Error).message}`,
    };
  }
}

export interface ResolveDurableResult {
  found: boolean;
  pearls: string[];
  bindings: Record<string, string>;
  mintTs: string | null;
  durable: boolean;
  logPath: string | null;
  reason: string | null;
}

/**
 * resolveChonkDurable — resolves a Soccerball handle from the durable log ONLY. Does
 * NOT fall back to any in-process Map — that fallback is owned by the caithedral-core
 * caller (soccerball_tools.ts), which already holds the pre-existing Map and knows how
 * to consult it for handles minted before this durable log existed (RULING 2 migration
 * note). NEVER throws.
 */
export function resolveChonkDurable(sid: string): ResolveDurableResult {
  let logPath: string;
  try {
    ({ logPath } = crystalPaths());
  } catch (err) {
    return {
      found: false,
      pearls: [],
      bindings: {},
      mintTs: null,
      durable: false,
      logPath: null,
      reason: `path resolution failed: ${(err as Error).message}`,
    };
  }
  try {
    const resolved = resolveChonk(logPath, sid);
    if (!resolved) {
      return { found: false, pearls: [], bindings: {}, mintTs: null, durable: true, logPath, reason: null };
    }
    const flatBindings: Record<string, string> = {};
    for (const [k, v] of Object.entries(resolved.bindings)) flatBindings[k] = v.ref;
    return {
      found: true,
      pearls: resolved.pearls,
      bindings: flatBindings,
      mintTs: resolved.mintTs,
      durable: true,
      logPath,
      reason: null,
    };
  } catch (err) {
    return {
      found: false,
      pearls: [],
      bindings: {},
      mintTs: null,
      durable: false,
      logPath,
      reason: `durable read failed: ${(err as Error).message}`,
    };
  }
}
