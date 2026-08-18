/**
 * userdata_guard.ts — D-BP158-012/BISHOP/seg-path-guard-and-prefix
 *
 * BP158 Founder ruling: MnemosyneC is the canonical userData app-name segment
 * (the pre-migration name was amplify-computer). This module is the single
 * place in caithedral-core that knows what "correct" looks like for a
 * userData-anchored path, so that check cannot silently drift out of sync
 * with the constant it is meant to police.
 *
 * Two call sites, deliberately both wired (BP158 Order 1b: "sweeping alone
 * does not hold"):
 *   1. assertUserDataAppName() is called from resolveCrystalDir() in
 *      crystal_store.ts, at the exact point a path is resolved — this fires
 *      on every real resolution, not just once at boot.
 *   2. assertUserDataAppNameAtStartup() is called explicitly from
 *      src/main/index.ts near process start, so a drift is caught even if
 *      resolveCrystalDir() is not the first consumer to run, and the failure
 *      is loud and immediate rather than deferred to first use.
 */

const FORBIDDEN_LITERAL = "amplify-computer";
export const EXPECTED_USERDATA_APP_NAME = "MnemosyneC";

export class UserDataAppNameDriftError extends Error {}

/**
 * Extracts the path segment immediately after the given base directory
 * (exact-segment match, not a raw substring scan — a directory named e.g.
 * "SomeOther-amplify-computer-Tool" would be a false positive under
 * substring-only matching of the *segment*, though the raw-literal check
 * below still catches it independently).
 */
function segmentAfter(resolvedPath: string, baseDir: string): string | null {
  const norm = resolvedPath.replace(/\\/g, "/");
  const normBase = baseDir.replace(/\\/g, "/").replace(/\/$/, "");
  if (!norm.toLowerCase().startsWith(normBase.toLowerCase() + "/")) return null;
  const rest = norm.slice(normBase.length + 1);
  return rest.split("/")[0] || null;
}

function driftBanner(resolvedPath: string, detail: string): string {
  const bar = "=".repeat(74);
  return (
    "\n" + bar + "\n" +
    " STARTUP ASSERTION FAILED -- userData app-name segment DRIFT\n" +
    bar + "\n" +
    ` Resolved path: ${resolvedPath}\n` +
    ` ${detail}\n` +
    ` BP158 Founder ruling: the canonical userData app-name segment is\n` +
    ` "${EXPECTED_USERDATA_APP_NAME}". This resolution did not match it.\n` +
    bar + "\n"
  );
}

/**
 * Fails LOUDLY (throws) if `resolvedPath` is not anchored under
 * `${appData}/${EXPECTED_USERDATA_APP_NAME}`, or if it contains the
 * forbidden legacy literal anywhere at all (belt-and-suspenders: catches
 * paths built by string concatenation that never went through a clean
 * segment join).
 */
export function assertUserDataAppName(resolvedPath: string, appData: string): void {
  if (resolvedPath.toLowerCase().includes(FORBIDDEN_LITERAL)) {
    throw new UserDataAppNameDriftError(
      driftBanner(resolvedPath, `Contains the forbidden legacy literal "${FORBIDDEN_LITERAL}".`)
    );
  }
  const seg = segmentAfter(resolvedPath, appData);
  if (seg && seg !== EXPECTED_USERDATA_APP_NAME) {
    throw new UserDataAppNameDriftError(
      driftBanner(resolvedPath, `App-name segment is "${seg}", expected "${EXPECTED_USERDATA_APP_NAME}".`)
    );
  }
}

/**
 * Explicit startup check for src/main/index.ts. Safe to call in any
 * environment: if no crystal directory is resolvable here (non-Windows, no
 * APPDATA, CI), that is resolveCrystalDir's own concern and is not treated
 * as drift — this function only judges a path that DID resolve.
 */
export function assertUserDataAppNameAtStartup(
  resolveCrystalDir: () => string
): void {
  let resolved: string;
  try {
    resolved = resolveCrystalDir();
  } catch {
    return;
  }
  const appData = process.env.APPDATA;
  if (!appData) return;
  assertUserDataAppName(resolved, appData);
  // eslint-disable-next-line no-console
  console.log(`[userdata_guard] OK -- userData app-name segment verified as "${EXPECTED_USERDATA_APP_NAME}".`);
}
