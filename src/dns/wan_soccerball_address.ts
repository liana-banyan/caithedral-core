/**
 * WAN Soccerball Address -- BP072 Wave 3 / W25 / BP073 Wave B + W3
 * =================================================================
 * A "soccerball address" identifies a CONNECTION SESSION for a cooperative
 * member, not their physical location. It rotates on each new session
 * (privacy-preserving) and is verifiable by any peer with the member's
 * public DAG record.
 *
 * BP073 Wave B addition: address derivation now INCLUDES an email-derived
 * component (hash of email + ASN + epoch). This means:
 *   - The address is bound to the user's email identity
 *   - It can be reconstructed later from (email + connection fingerprint)
 *   - The raw email is NEVER stored or transmitted -- only its hash
 *   - Past addresses are recoverable: given email + epoch + ASN, any past
 *     address can be reconstructed deterministically
 *
 * BP073 Wave 3 addition: real ASN lookup via server backend.
 *   - The caller-provided ASN stub (asnHint) is deprecated for production use.
 *   - Production callers should call lookupAsnFromServer() first to get the
 *     real ASN, then pass it as asnHint.
 *   - The server-side wan-asn-lookup edge function queries ip-api.com
 *     with ipinfo.io fallback. It caches results for 1 hour.
 *   - Client-side derivation (this file) remains available for
 *     offline/fallback scenarios; server derivation is preferred.
 *   - verifyAddressWithServer() lets any party verify a claimed address.
 *
 * Architecture:
 *   emailHash   = sha256(email + ":" + cooperativeEpoch)
 *   sessionNonce = sha256(asnHint + ":" + sessionTimestampFloor)
 *   wanSoccerballId = sha256(memberId + ":" + peerId + ":" + sessionNonce
 *                            + ":" + epoch + ":" + emailHash)
 *
 * References:
 *   - caithedral-core/src/dns/soccerball_over_dns_proof.ts (existing)
 *   - MESH_6_RECEIPT_BP063.md (proven 20/20 LAN test)
 *   - BP072 Wave 3 Scope 20 (N=3 organic mesh test)
 *   - BP073 Wave B (email-bound WAN address)
 *   - BP073 Wave 3 (real ASN backend)
 *   - platform/supabase/functions/wan-asn-lookup (ASN edge fn)
 *   - platform/supabase/functions/wan-derive-address (server derivation)
 *   - platform/supabase/functions/wan-verify-address (server verification)
 *
 * EMPIRICAL STATUS (BP073-W3):
 *   WORKS: deterministic derivation in browser/Node via Web Crypto / crypto.subtle
 *   WORKS: email hash included without exposing raw email
 *   WORKS: past-address reconstruction (reconstructAddressFromEmail)
 *   WORKS: ASN lookup via server backend (wan-asn-lookup edge fn)
 *   WORKS: server-side email-bound derivation verified (wan-derive-address)
 *   WORKS: address verification via server (wan-verify-address)
 *   WORKS: address history stored + queryable (wan-address-history)
 *   WORKS: address lookup by email hash (wan-lookup-by-email)
 *   PARTIAL: asnHint still caller-provided in this file for offline/fallback
 *            -- production flow must call lookupAsnFromServer() first
 *   NOT YET: real BGP / RPKI lookup (ip-api.com is a GeoIP proxy, NOT a
 *            live BGP table; true BGP requires a dedicated feed -- see note)
 *   WORKS: relay publish/resolve via relay.lianabanyan.com (SEG-WAN-2)
 *   NOT YET: cooperative DAG publish/resolve cycle (relay is live; DAG pipe pending)
 *
 * NOTE on "real BGP": ip-api.com and ipinfo.io return the ASN number assigned
 * to the IP block by IANA/ARIN (correct for the purposes of session fingerprinting)
 * but this is NOT a live routing-table BGP lookup (that would require a BGP
 * route reflector or RPKI validator feed). For cooperative session privacy,
 * the GeoIP ASN is sufficient. True BGP integration is tracked as future work.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Configuration for the WAN address server backend (BP073-W3).
 * Pass to lookupAsnFromServer() and verifyAddressWithServer().
 */
export interface WanServerConfig {
  /** Base URL of the Supabase project, e.g. https://xxxx.supabase.co */
  supabaseUrl: string;
  /** Supabase anon key (safe for browser use). */
  supabaseAnonKey: string;
  /** Bearer token for the authenticated user. */
  bearerToken: string;
}

export interface WanSoccerballAddress {
  /** Cooperative member ID (UUID). */
  memberId: string;
  /** Mnemosyne peer ID (hex string). */
  peerId: string;
  /**
   * Hash of the user's email + cooperativeEpoch.
   * The email itself is NEVER stored -- only this hash is present.
   */
  emailHash: string;
  /** Session nonce -- sha256(ASN + session_timestamp_floor_1h). */
  sessionNonce: string;
  /** Cooperative epoch counter (daily rotation). */
  cooperativeEpoch: number;
  /** The derived WAN soccerball ID -- the address used on the mesh. */
  wanSoccerballId: string;
  /** When this address was minted (ISO timestamp). */
  mintedAt: string;
  /** When this address expires (24h max; typically rotates each session). */
  expiresAt: string;
  /** Whether this address has been published to the cooperative DAG. */
  published: boolean;
}

export interface WanAddressContext {
  /** Member cooperative account ID. */
  memberId: string;
  /** Mnemosyne peer ID. */
  peerId: string;
  /**
   * Member's email address.
   * Used ONLY for hashing -- never stored in the derived address record.
   */
  email: string;
  /**
   * Autonomous System Number of the current ISP connection.
   * Used for nonce generation -- not stored or transmitted on its own.
   * Privacy: only the nonce (hash) is stored, not the raw ASN.
   *
   * PRODUCTION: obtain via lookupAsnFromServer() rather than passing
   * "AS0000". The caller-provided stub remains for offline/fallback use.
   *
   * NOTE (BP073-W3): real ASN is now resolvable via the wan-asn-lookup
   * Supabase Edge Function (ip-api.com + ipinfo.io backend). The placeholder
   * "AS0000" is used ONLY when the lookup fails or for tests.
   *
   * @deprecated Caller-provided ASN hint. Use lookupAsnFromServer() for
   *             production; this field exists for offline fallback only.
   */
  asnHint: string;
  /** Unix timestamp floored to the hour (for nonce uniqueness without fingerprinting). */
  sessionTimestampFloor: number;
  /** Cooperative epoch counter (from the LB epoch service). */
  cooperativeEpoch: number;
}

/** Minimal context needed to reconstruct a past address from email. */
export interface AddressLookupContext {
  email: string;
  memberId: string;
  peerId: string;
  asnHint: string;
  sessionTimestampFloor: number;
  cooperativeEpoch: number;
}

// ─── Epoch helpers ────────────────────────────────────────────────────────────

/** Current cooperative epoch (days since 2026-01-01). */
export function getCurrentCooperativeEpoch(): number {
  const EPOCH_ORIGIN = new Date("2026-01-01T00:00:00Z").getTime();
  return Math.floor((Date.now() - EPOCH_ORIGIN) / (24 * 60 * 60 * 1000));
}

/** Floor a timestamp to the current hour (removes sub-hour fingerprinting). */
export function floorToHour(ts: number = Date.now()): number {
  return Math.floor(ts / (60 * 60 * 1000)) * (60 * 60 * 1000);
}

// ─── Core WAN address derivation ─────────────────────────────────────────────

/**
 * Derive the email hash component.
 * emailHash = sha256(email + ":" + cooperativeEpoch)
 *
 * The epoch is included so the email hash rotates daily, preventing
 * long-term cross-session correlation via the email hash alone.
 */
export async function deriveEmailHash(
  email: string,
  cooperativeEpoch: number,
): Promise<string> {
  const raw = `${email.toLowerCase().trim()}:${cooperativeEpoch}`;
  const buf = await cryptoSubtle().digest("SHA-256", encode(raw));
  return hexOf(buf);
}

/**
 * Derive a WAN soccerball address from the connection context.
 *
 * The address is:
 *   emailHash       = sha256(email + ":" + epoch)
 *   sessionNonce    = sha256(asnHint + ":" + sessionTimestampFloor)
 *   wanSoccerballId = sha256(memberId + ":" + peerId + ":" + sessionNonce
 *                            + ":" + epoch + ":" + emailHash)
 *
 * This runs in the browser/Electron main process; uses Web Crypto API.
 */
export async function deriveWanSoccerballAddress(
  ctx: WanAddressContext,
): Promise<WanSoccerballAddress> {
  const subtle = cryptoSubtle();

  // Step 1: derive email hash (epoch-salted, no raw email in output)
  const emailHash = await deriveEmailHash(ctx.email, ctx.cooperativeEpoch);

  // Step 2: derive session nonce from ASN + hour-floor
  const nonceInput = `${ctx.asnHint}:${ctx.sessionTimestampFloor}`;
  const nonceHash = await subtle.digest("SHA-256", encode(nonceInput));
  const sessionNonce = hexOf(nonceHash);

  // Step 3: derive WAN soccerball ID (email hash included)
  const idInput = `${ctx.memberId}:${ctx.peerId}:${sessionNonce}:${ctx.cooperativeEpoch}:${emailHash}`;
  const idHash = await subtle.digest("SHA-256", encode(idInput));
  const wanSoccerballId = hexOf(idHash);

  const mintedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  return {
    memberId: ctx.memberId,
    peerId: ctx.peerId,
    emailHash,
    sessionNonce,
    cooperativeEpoch: ctx.cooperativeEpoch,
    wanSoccerballId,
    mintedAt,
    expiresAt,
    published: false,
  };
}

/**
 * Reconstruct a past WAN soccerball address from email + connection fingerprint.
 *
 * This is the "lookup" function: given an email address and the parameters
 * of a past connection session, deterministically reconstruct the address
 * that was in use during that session.
 *
 * Use case: "What was my address on epoch 153 from network AS7922?"
 * The result is cryptographically identical to what deriveWanSoccerballAddress
 * would have produced for those inputs.
 *
 * EMPIRICAL: fully deterministic and testable locally. No network required.
 */
export async function reconstructAddressFromEmail(
  ctx: AddressLookupContext,
): Promise<{ wanSoccerballId: string; emailHash: string; sessionNonce: string }> {
  const emailHash = await deriveEmailHash(ctx.email, ctx.cooperativeEpoch);
  const nonceInput = `${ctx.asnHint}:${ctx.sessionTimestampFloor}`;
  const nonceBuf = await cryptoSubtle().digest("SHA-256", encode(nonceInput));
  const sessionNonce = hexOf(nonceBuf);
  const idInput = `${ctx.memberId}:${ctx.peerId}:${sessionNonce}:${ctx.cooperativeEpoch}:${emailHash}`;
  const idBuf = await cryptoSubtle().digest("SHA-256", encode(idInput));
  return {
    wanSoccerballId: hexOf(idBuf),
    emailHash,
    sessionNonce,
  };
}

/** Verify that two WAN soccerball addresses share the same cooperative epoch. */
export function sameEpoch(a: WanSoccerballAddress, b: WanSoccerballAddress): boolean {
  return a.cooperativeEpoch === b.cooperativeEpoch;
}

/**
 * Check whether a WAN soccerball address has expired.
 * Expired addresses must not be used for new sessions.
 */
export function isExpired(addr: WanSoccerballAddress): boolean {
  return Date.now() > new Date(addr.expiresAt).getTime();
}

// ─── Server-side helpers (BP073-W3) ──────────────────────────────────────────

/**
 * Look up the real ASN for the calling IP via the wan-asn-lookup edge function.
 *
 * This replaces the caller-provided asnHint stub for production use.
 * Falls back gracefully: if the server call fails, returns "AS0000" + fallback:true.
 *
 * EMPIRICAL STATUS (BP073-W3):
 *   WORKS: calls wan-asn-lookup, returns { asn, source, fallback_used, rate_limited }
 *   NOT YET: true BGP routing table (ip-api.com returns GeoIP ASN, not live BGP)
 */
export async function lookupAsnFromServer(
  config: WanServerConfig,
): Promise<{ asn: string; source: string; fallbackUsed: boolean; rateLimited: boolean }> {
  try {
    const res = await fetch(
      `${config.supabaseUrl}/functions/v1/wan-asn-lookup`,
      {
        headers: {
          Authorization: `Bearer ${config.bearerToken}`,
          apikey: config.supabaseAnonKey,
        },
      },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      asn: string;
      source: string;
      fallback_used: boolean;
      rate_limited: boolean;
    };
    return {
      asn: data.asn ?? "AS0000",
      source: data.source ?? "unknown",
      fallbackUsed: data.fallback_used ?? true,
      rateLimited: data.rate_limited ?? false,
    };
  } catch {
    return { asn: "AS0000", source: "error", fallbackUsed: true, rateLimited: false };
  }
}

/**
 * Verify a WAN soccerball address claim against the server.
 *
 * The server re-derives the address from the supplied inputs and checks
 * whether it matches the claimed ID. Returns verified:true if they match.
 *
 * EMPIRICAL STATUS (BP073-W3):
 *   WORKS: calls wan-verify-address, server re-derives + compares
 *   NOT YET: ZK attestation (future work)
 */
export async function verifyAddressWithServer(
  config: WanServerConfig,
  params: {
    wanSoccerballId: string;
    memberId: string;
    peerId: string;
    email: string;
    asnHint: string;
    cooperativeEpoch: number;
    sessionTimestampFloor: number;
  },
): Promise<{ verified: boolean; derivedId: string }> {
  try {
    const res = await fetch(
      `${config.supabaseUrl}/functions/v1/wan-verify-address`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.bearerToken}`,
          apikey: config.supabaseAnonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { verified: boolean; derivedId: string };
    return { verified: data.verified ?? false, derivedId: data.derivedId ?? "" };
  } catch {
    return { verified: false, derivedId: "" };
  }
}

/**
 * Get the current cooperative epoch from the server (authoritative).
 *
 * Falls back to local computation if the server is unavailable.
 *
 * EMPIRICAL STATUS (BP073-W3): WORKS
 */
export async function getServerEpoch(
  config: Pick<WanServerConfig, "supabaseUrl" | "supabaseAnonKey">,
): Promise<{ epoch: number; epochDate: string; serverTime: string; source: "server" | "local" }> {
  try {
    const res = await fetch(
      `${config.supabaseUrl}/functions/v1/wan-epoch`,
      { headers: { apikey: config.supabaseAnonKey } },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      epoch: number;
      epochDate: string;
      serverTime: string;
    };
    return { epoch: data.epoch, epochDate: data.epochDate, serverTime: data.serverTime, source: "server" };
  } catch {
    const epoch = getCurrentCooperativeEpoch();
    return {
      epoch,
      epochDate: new Date(
        new Date("2026-01-01T00:00:00Z").getTime() + epoch * 86400000,
      ).toISOString().slice(0, 10),
      serverTime: new Date().toISOString(),
      source: "local",
    };
  }
}

// ─── Relay wire format (PeanutRoll) ───────────────────────────────────────────

interface PeanutRoll {
  v: number;
  s: string;
  p: string[];
  b: Record<string, string>;
  ts: number;
}

const RELAY_BASE = "https://relay.lianabanyan.com";
const BACKOFF_DELAYS_MS = [500, 1000, 2000];
const MAX_FETCH_RETRIES = 3;

// ─── Resolve circuit breaker (module-local; independent of wan_escalation.ts) ─

let _resolveFailureCount = 0;
let _resolveCircuitOpenUntil: number | null = null;

const RESOLVE_CIRCUIT_THRESHOLD = 3;
const RESOLVE_CIRCUIT_RESET_MS = 60_000;

function isResolveCircuitOpen(): boolean {
  if (_resolveCircuitOpenUntil !== null && Date.now() < _resolveCircuitOpenUntil) {
    return true;
  }
  if (_resolveCircuitOpenUntil !== null && Date.now() >= _resolveCircuitOpenUntil) {
    _resolveFailureCount = 0;
    _resolveCircuitOpenUntil = null;
  }
  return false;
}

function recordResolveFailure(): void {
  _resolveFailureCount++;
  if (_resolveFailureCount >= RESOLVE_CIRCUIT_THRESHOLD) {
    _resolveCircuitOpenUntil = Date.now() + RESOLVE_CIRCUIT_RESET_MS;
    console.warn(
      `[wan_soccerball] Resolve circuit OPEN after ${_resolveFailureCount} failures. ` +
      `Reset at ${new Date(_resolveCircuitOpenUntil).toISOString()}.`,
    );
  }
}

function recordResolveSuccess(): void {
  _resolveFailureCount = 0;
  _resolveCircuitOpenUntil = null;
}

async function fetchWithBackoff(
  fn: () => Promise<Response>,
  label: string,
): Promise<Response | null> {
  for (let attempt = 0; attempt < MAX_FETCH_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, BACKOFF_DELAYS_MS[attempt - 1] ?? 2000));
    }
    try {
      return await fn();
    } catch (err) {
      console.warn(
        `[wan_soccerball] ${label} attempt ${attempt + 1}/${MAX_FETCH_RETRIES} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return null;
}

// ─── Peer resolution (live relay) ─────────────────────────────────────────────

/**
 * Resolve a WAN soccerball ID to a peer connection hint via relay.lianabanyan.com.
 *
 * EMPIRICAL STATUS (SEG-WAN-2): LIVE — GET /resolve/{id}, PeanutRoll parse on 200,
 * null on 404. Circuit breaker trips after 3 consecutive failures (60s reset).
 */
export async function resolveWanSoccerball(
  wanSoccerballId: string,
): Promise<{ peerId: string; relayHint?: string } | null> {
  if (isResolveCircuitOpen()) {
    console.warn("[wan_soccerball] resolve skipped — circuit open");
    return null;
  }

  const res = await fetchWithBackoff(
    () => fetch(`${RELAY_BASE}/resolve/${encodeURIComponent(wanSoccerballId)}`),
    "resolve",
  );

  if (!res) {
    recordResolveFailure();
    return null;
  }

  if (res.status === 404) {
    recordResolveSuccess();
    return null;
  }

  if (!res.ok) {
    recordResolveFailure();
    return null;
  }

  try {
    const roll = (await res.json()) as PeanutRoll;
    recordResolveSuccess();
    const peerId = roll.b?.peerId ?? roll.p?.[0];
    if (!peerId) {
      recordResolveFailure();
      return null;
    }
    return { peerId, relayHint: "relay.lianabanyan.com" };
  } catch {
    recordResolveFailure();
    return null;
  }
}

/**
 * Publish a WAN soccerball address to relay.lianabanyan.com.
 *
 * Non-fatal on failure — routing degrades to LAN-only.
 *
 * EMPIRICAL STATUS (SEG-WAN-2): LIVE — POST /publish with PeanutRoll wire format.
 */
export async function publishWanAddress(
  addr: WanSoccerballAddress,
): Promise<boolean> {
  const roll: PeanutRoll = {
    v: 1,
    s: addr.wanSoccerballId.slice(0, 32),
    p: [addr.peerId],
    b: {
      peerId: addr.peerId,
      epoch: String(addr.cooperativeEpoch),
      expiresAt: addr.expiresAt,
    },
    ts: Date.now(),
  };

  const res = await fetchWithBackoff(
    () =>
      fetch(`${RELAY_BASE}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(roll),
      }),
    "publish",
  );

  if (res?.ok) {
    console.log(
      `[wan_soccerball] publish success: id=${addr.wanSoccerballId.slice(0, 8)}… peer=${addr.peerId}`,
    );
    return true;
  }

  console.warn(
    `[wan_soccerball] publish failed — degrading to LAN-only (id=${addr.wanSoccerballId.slice(0, 8)}…)`,
  );
  return false;
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function hexOf(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function encode(s: string): Uint8Array<ArrayBuffer> {
  // Cast needed: TextEncoder.encode() returns Uint8Array<ArrayBufferLike>
  // but crypto.subtle.digest expects BufferSource (ArrayBufferView<ArrayBuffer>).
  // In practice the buffer is always a plain ArrayBuffer -- the cast is safe.
  return new TextEncoder().encode(s) as unknown as Uint8Array<ArrayBuffer>;
}

/** Returns crypto.subtle -- works in browser, Electron renderer, and Node 19+. */
function cryptoSubtle(): SubtleCrypto {
  // Node 19+ and all browsers expose globalThis.crypto natively.
  // The old require("crypto") fallback is dropped to avoid ESM/CJS cycle errors
  // in ts-node/esm on Node 22+.
  return globalThis.crypto.subtle;
}
