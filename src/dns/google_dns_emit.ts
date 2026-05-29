/**
 * google_dns_emit.ts — Soccerball SIDs as Google Cloud DNS TXT records
 * caithedral-core BP063 · POCKET-6 SOCCERBALL-OVER-DNS · PATH C (keyless)
 *
 * lianabanyan.com is authoritative on Google Cloud DNS (ns-cloud-a*.googledomains.com).
 * cloudflare_emit.ts is tombstoned — Cloudflare is NOT in the DNS path.
 * doh_resolve.ts is unchanged — DoH is provider-agnostic (kept as-is).
 *
 * KEYLESS AUTH (org policy iam.disableServiceAccountKeyCreation is active — no SA key files):
 *
 *   Path A (preferred — least-privilege):
 *     GOOGLE_CLOUD_DNS_IMPERSONATE_SA is set
 *     → get user ADC token (gcloud auth application-default print-access-token)
 *     → impersonate SA via IAM Credentials API generateAccessToken
 *     → use impersonated token for Cloud DNS API calls
 *     (SA soccerball-dns@lianabanyan-403dc.iam.gserviceaccount.com has roles/dns.admin)
 *
 *   Path B (fallback — direct ADC):
 *     GOOGLE_CLOUD_DNS_IMPERSONATE_SA not set
 *     → use user ADC token directly
 *     (user identity must itself have dns.admin on the project)
 *
 * ⚠  CREDENTIAL SHADOWING GOTCHA:
 *     If GOOGLE_APPLICATION_CREDENTIALS is set in the environment, gcloud will warn
 *     "unset this variable before running your application." The legacy SA key file
 *     does NOT have dns.admin, so impersonation will fail if it intercepts first.
 *     Fix (session-only): $env:GOOGLE_APPLICATION_CREDENTIALS = $null
 *     The key file itself is preserved on disk — only the env var pointer is cleared.
 *
 * Config env vars:
 *   GOOGLE_CLOUD_DNS_IMPERSONATE_SA  — SA email to impersonate (recommended)
 *   GCP_PROJECT_ID                   — GCP project (default: lianabanyan-403dc)
 *   GCP_DNS_MANAGED_ZONE             — managed-zone name (default: auto-discovered)
 *
 * Canon: canon_dns_as_pocket_universe_resolver_re_use_existing_infrastructure_bp060
 */

import * as https from "https";
import { execSync } from "child_process";

// ---------------------------------------------------------------------------
// Types (interface mirrors cloudflare_emit.ts for drop-in swap)
// ---------------------------------------------------------------------------

export interface GcpEmitResult {
  ok: boolean;
  record_id: string;    // "${fqdn.}|TXT" — parsed by delete
  name: string;         // FQDN without trailing dot
  content: string;      // soccerball SID
  managed_zone: string;
  created_on?: string;
  cred_path?: string;   // "impersonated:<SA>" or "direct-adc"
  error?: string;
}

export interface GcpDeleteResult {
  ok: boolean;
  record_id: string;
  error?: string;
}

export interface GcpListResult {
  records: Array<{
    id: string;       // "${fqdn.}|TXT"
    name: string;
    content: string;
    ttl: number;
    modified_on?: string;
  }>;
  error?: string;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface GcpRrset {
  name: string;
  type: string;
  ttl: number;
  rrdatas: string[];
}

// ---------------------------------------------------------------------------
// HTTP helper (native https — no extra deps)
// ---------------------------------------------------------------------------

function httpsRaw(
  method: string,
  reqUrl: string,
  body: string | null,
  extraHeaders: Record<string, string> = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(reqUrl);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...extraHeaders,
      ...(body ? { "Content-Length": Buffer.byteLength(body).toString() } : {}),
    };
    const opts: https.RequestOptions = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method,
      headers,
    };

    const req = https.request(opts, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });

    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Auth — keyless ADC + optional SA impersonation
// ---------------------------------------------------------------------------

/** Get the base user ADC token via gcloud CLI. */
function adcTokenFromGcloud(): string {
  try {
    const out = execSync("gcloud auth application-default print-access-token 2>&1", {
      timeout: 10000,
    })
      .toString()
      .trim();
    if (out.startsWith("ya29.") || out.startsWith("eyJ")) return out;
    throw new Error(`Unexpected token format from gcloud: ${out.substring(0, 60)}`);
  } catch (e) {
    throw new Error(
      `ADC token unavailable — run \`gcloud auth application-default login\` first.\n` +
      `Also ensure GOOGLE_APPLICATION_CREDENTIALS is unset ($env:GOOGLE_APPLICATION_CREDENTIALS=$null)\n` +
      `gcloud error: ${String(e)}`
    );
  }
}

/**
 * Impersonate a SA via IAM Credentials API generateAccessToken.
 * Requires the base ADC identity to have roles/iam.serviceAccountTokenCreator on the SA.
 */
async function impersonateSA(baseToken: string, saEmail: string): Promise<string> {
  const url =
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/` +
    `${encodeURIComponent(saEmail)}:generateAccessToken`;

  const body = JSON.stringify({
    scope: ["https://www.googleapis.com/auth/ndev.clouddns.readwrite"],
    lifetime: "3600s",
  });

  const raw = await httpsRaw("POST", url, body, {
    Authorization: `Bearer ${baseToken}`,
  });

  const resp = JSON.parse(raw) as {
    accessToken?: string;
    expireTime?: string;
    error?: { message: string; code: number };
  };

  if (resp.error) {
    throw new Error(
      `SA impersonation failed for ${saEmail}: ${resp.error.code} ${resp.error.message}\n` +
      `Ensure the ADC identity has roles/iam.serviceAccountTokenCreator on that SA.`
    );
  }

  if (!resp.accessToken) {
    throw new Error(`SA impersonation returned no accessToken for ${saEmail}`);
  }

  return resp.accessToken;
}

// Token cache: { token, expiry, credPath }
let _tokenCache: { token: string; expiry: number; credPath: string } | null = null;

async function getToken(): Promise<{ token: string; credPath: string }> {
  const now = Date.now();
  if (_tokenCache && now < _tokenCache.expiry) {
    return { token: _tokenCache.token, credPath: _tokenCache.credPath };
  }

  const impersonateSaEmail = process.env["GOOGLE_CLOUD_DNS_IMPERSONATE_SA"];

  // Get base ADC token (fails fast with clear error if not set up)
  const baseToken = adcTokenFromGcloud();

  let token: string;
  let credPath: string;

  if (impersonateSaEmail) {
    // Path A — impersonate the DNS-scoped SA (least privilege)
    token = await impersonateSA(baseToken, impersonateSaEmail);
    credPath = `impersonated:${impersonateSaEmail}`;
  } else {
    // Path B — direct ADC (user identity needs dns.admin)
    token = baseToken;
    credPath = "direct-adc";
  }

  _tokenCache = { token, expiry: now + 55 * 60 * 1000, credPath };
  return { token, credPath };
}

// ---------------------------------------------------------------------------
// Managed-zone discovery
// ---------------------------------------------------------------------------

let _zoneCache: string | null = null;

async function getManagedZone(
  project: string,
  dnsName: string,
  token: string
): Promise<string> {
  if (_zoneCache) return _zoneCache;

  const envZone = process.env["GCP_DNS_MANAGED_ZONE"];
  if (envZone) {
    _zoneCache = envZone;
    return _zoneCache;
  }

  const url =
    `https://dns.googleapis.com/dns/v1/projects/${project}/managedZones` +
    `?dnsName=${encodeURIComponent(dnsName + ".")}`;

  const raw = await httpsRaw("GET", url, null, { Authorization: `Bearer ${token}` });
  const resp = JSON.parse(raw) as {
    managedZones?: Array<{ name: string; dnsName: string }>;
    error?: { message: string; code: number };
  };

  if (resp.error) {
    throw new Error(`getManagedZone: ${resp.error.code} ${resp.error.message}`);
  }

  const zones = resp.managedZones ?? [];
  if (zones.length === 0) {
    throw new Error(
      `No managed zone for "${dnsName}" in project "${project}". ` +
      `Set GCP_DNS_MANAGED_ZONE to the zone name.`
    );
  }

  _zoneCache = zones[0].name;
  return _zoneCache;
}

// ---------------------------------------------------------------------------
// Rrset helpers (Cloud DNS v1 REST)
// ---------------------------------------------------------------------------

async function getRrset(
  project: string,
  managedZone: string,
  fqdnDot: string,
  token: string
): Promise<GcpRrset | null> {
  const url =
    `https://dns.googleapis.com/dns/v1/projects/${project}` +
    `/managedZones/${managedZone}/rrsets` +
    `?name=${encodeURIComponent(fqdnDot)}&type=TXT`;

  const raw = await httpsRaw("GET", url, null, { Authorization: `Bearer ${token}` });
  const resp = JSON.parse(raw) as {
    rrsets?: GcpRrset[];
    error?: { message: string; code: number };
  };

  if (resp.error && resp.error.code !== 404) {
    throw new Error(`getRrset: ${resp.error.code} ${resp.error.message}`);
  }

  const sets = resp.rrsets ?? [];
  return sets.find((r) => r.name === fqdnDot && r.type === "TXT") ?? null;
}

async function submitChange(
  project: string,
  managedZone: string,
  additions: GcpRrset[],
  deletions: GcpRrset[],
  token: string
): Promise<{ id: string; status: string; error?: string }> {
  const url =
    `https://dns.googleapis.com/dns/v1/projects/${project}` +
    `/managedZones/${managedZone}/changes`;

  const body = JSON.stringify({ additions, deletions });
  const raw = await httpsRaw("POST", url, body, { Authorization: `Bearer ${token}` });
  const resp = JSON.parse(raw) as {
    id?: string;
    status?: string;
    error?: { message: string; code: number };
  };

  if (resp.error) {
    return { id: "", status: "error", error: `${resp.error.code} ${resp.error.message}` };
  }

  return { id: resp.id ?? "", status: resp.status ?? "unknown" };
}

// ---------------------------------------------------------------------------
// GCP project default
// ---------------------------------------------------------------------------

function gcpProject(): string {
  return process.env["GCP_PROJECT_ID"] ?? "lianabanyan-403dc";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * gcp_emit_soccerball — write a soccerball SID as a TXT record in Google Cloud DNS.
 *
 * Uses keyless ADC (Path A: impersonation, Path B: direct) — no SA key file.
 * Cloud DNS replaces rrsets atomically (delete old + add new in one change).
 */
export async function gcp_emit_soccerball(
  sid: string,
  subdomain: string = "s",
  zone: string = "lianabanyan.com",
  ttl: number = 60
): Promise<GcpEmitResult> {
  const fqdn = `${subdomain}.${zone}`;
  const fqdnDot = `${fqdn}.`;
  const project = gcpProject();

  let token: string;
  let credPath: string;
  try {
    ({ token, credPath } = await getToken());
  } catch (e) {
    return { ok: false, record_id: "", name: fqdn, content: sid, managed_zone: "", error: String(e) };
  }

  let managedZone: string;
  try {
    managedZone = await getManagedZone(project, zone, token);
  } catch (e) {
    return { ok: false, record_id: "", name: fqdn, content: sid, managed_zone: "", error: String(e) };
  }

  let existing: GcpRrset | null = null;
  try {
    existing = await getRrset(project, managedZone, fqdnDot, token);
  } catch (e) {
    return { ok: false, record_id: "", name: fqdn, content: sid, managed_zone: managedZone, error: String(e) };
  }

  const newRrset: GcpRrset = {
    name: fqdnDot,
    type: "TXT",
    ttl,
    rrdatas: [`"${sid}"`],
  };

  const result = await submitChange(project, managedZone, [newRrset], existing ? [existing] : [], token);

  if (result.error) {
    return { ok: false, record_id: "", name: fqdn, content: sid, managed_zone: managedZone, error: result.error };
  }

  return {
    ok: true,
    record_id: `${fqdnDot}|TXT`,
    name: fqdn,
    content: sid,
    managed_zone: managedZone,
    created_on: new Date().toISOString(),
    cred_path: credPath,
  };
}

/**
 * gcp_list_soccerball_records — list TXT rrset at `{subdomain}.{zone}`.
 * Returns only entries matching the 32-char soccerball SID format.
 */
export async function gcp_list_soccerball_records(
  subdomain: string = "s",
  zone: string = "lianabanyan.com"
): Promise<GcpListResult> {
  const fqdn = `${subdomain}.${zone}`;
  const fqdnDot = `${fqdn}.`;
  const project = gcpProject();

  let token: string;
  try {
    ({ token } = await getToken());
  } catch (e) {
    return { records: [], error: String(e) };
  }

  let managedZone: string;
  try {
    managedZone = await getManagedZone(project, zone, token);
  } catch (e) {
    return { records: [], error: String(e) };
  }

  let rrset: GcpRrset | null = null;
  try {
    rrset = await getRrset(project, managedZone, fqdnDot, token);
  } catch (e) {
    return { records: [], error: String(e) };
  }

  if (!rrset) return { records: [] };

  const sidPattern = /^[0-9a-f]{32}$/i;
  const records = rrset.rrdatas
    .map((r) => ({
      id: `${fqdnDot}|TXT`,
      name: fqdn,
      content: r.replace(/^"|"$/g, ""),
      ttl: rrset!.ttl,
    }))
    .filter((r) => sidPattern.test(r.content));

  return { records };
}

/**
 * gcp_delete_soccerball_record — delete a TXT rrset by record_id.
 * record_id format: "${fqdn.}|TXT" (from emit / list).
 * Idempotent: ok=true if record already absent.
 */
export async function gcp_delete_soccerball_record(
  record_id: string,
  zone: string = "lianabanyan.com"
): Promise<GcpDeleteResult> {
  const parts = record_id.split("|");
  const fqdnDot = parts[0];
  if (!fqdnDot || parts[1] !== "TXT") {
    return {
      ok: false,
      record_id,
      error: `Invalid record_id "${record_id}" — expected "{fqdn.}|TXT"`,
    };
  }

  const project = gcpProject();

  let token: string;
  try {
    ({ token } = await getToken());
  } catch (e) {
    return { ok: false, record_id, error: String(e) };
  }

  let managedZone: string;
  try {
    managedZone = await getManagedZone(project, zone, token);
  } catch (e) {
    return { ok: false, record_id, error: String(e) };
  }

  let existing: GcpRrset | null = null;
  try {
    existing = await getRrset(project, managedZone, fqdnDot, token);
  } catch (e) {
    return { ok: false, record_id, error: String(e) };
  }

  if (!existing) return { ok: true, record_id };

  const result = await submitChange(project, managedZone, [], [existing], token);
  if (result.error) return { ok: false, record_id, error: result.error };
  return { ok: true, record_id };
}
