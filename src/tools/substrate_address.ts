/**
 * Substrate Address Tools — caithedral-core BP059 W1
 *
 * 9-hex-digit triangulating substrate-coordinate scheme.
 * Per canon_9_hex_digit_pheromone_fence_thorax_aligned_triangulating_substrate_address_bp059.
 *
 * Architecture:
 * - 6 sides × 9 hex digits × 4 bits = 216-bit address
 * - Triangle-A = sides 0, 2, 4 (interleaved at even indices)
 * - Triangle-B = sides 1, 3, 5 (interleaved at odd indices)
 * - Two triangles independently triangulate the same position → error-correcting redundancy
 * - Adjacent-side pheromone-fence: each side's digit-sum (mod 16) must equal
 *   its neighbor's digit-sum (mod 16) — Thorax-class reciprocal-accept handshake
 * - All 6 channels must pass → "bestie-open" (valid)
 * - Failed channel → thorax_phalanx enqueue (handled by MCP layer in server.ts)
 *
 * NOT a physical-spacetime coordinate system — substrate positions only.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SubstrateAddressResult {
  address: string;    // 54 lowercase hex chars = 216 bits
  length_bits: 216;
  sides: string[];    // [s0, s1, s2, s3, s4, s5] each 9 hex chars
  triangle_a: string[];  // [s0, s2, s4]
  triangle_b: string[];  // [s1, s3, s5]
}

export interface PhalanxEntry {
  channel_id: number;  // 1-6
  reason: string;
}

export interface ValidateResult {
  valid: boolean;
  handshakes: boolean[];     // [ch1, ch2, ch3, ch4, ch5, ch6] true = pass
  phalanx_flags: PhalanxEntry[];
  triangle_agreement: boolean;  // triangle-A vs triangle-B cross-check
  error_signal?: string;        // non-null if triangle disagreement detected
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function hexNibbleSum(s: string): number {
  let sum = 0;
  for (const c of s) sum += parseInt(c, 16);
  return sum;
}

function isHex9(s: string): boolean {
  return typeof s === "string" && /^[0-9a-f]{9}$/.test(s);
}

// ─── substrate_address_emit ───────────────────────────────────────────────────

/**
 * substrate_address_emit — assemble a 216-bit substrate address from two triangles.
 *
 * Both triangles must be provided with CONSISTENT digit-sum parity across all 6 sides
 * for the address to pass validation. Caller is responsible for constructing valid triangles.
 *
 * For deterministic valid addresses, use gen_valid_address_pair() below.
 * Interleaving: [a0, b0, a1, b1, a2, b2] = sides [0..5].
 */
export function substrate_address_emit(
  triangle_a: [string, string, string],
  triangle_b: [string, string, string],
): SubstrateAddressResult {
  const all = [...triangle_a, ...triangle_b];
  for (const coord of all) {
    if (!isHex9(coord)) {
      throw new Error(
        `substrate_address_emit: each coordinate must be exactly 9 lowercase hex chars, got: "${coord}"`,
      );
    }
  }

  // Interleave: sides[2i] = triangle_a[i], sides[2i+1] = triangle_b[i]
  const sides: string[] = [
    triangle_a[0], triangle_b[0],
    triangle_a[1], triangle_b[1],
    triangle_a[2], triangle_b[2],
  ];
  const address = sides.join("");

  return {
    address,
    length_bits: 216,
    sides,
    triangle_a: [...triangle_a],
    triangle_b: [...triangle_b],
  };
}

// ─── substrate_address_validate ───────────────────────────────────────────────

/**
 * substrate_address_validate — validate a 216-bit substrate address via pheromone fence.
 *
 * Thorax-aligned handshake for each of the 6 adjacent channel pairs:
 *   Channel 1: sides[0] ↔ sides[1]
 *   Channel 2: sides[1] ↔ sides[2]
 *   Channel 3: sides[2] ↔ sides[3]
 *   Channel 4: sides[3] ↔ sides[4]
 *   Channel 5: sides[4] ↔ sides[5]
 *   Channel 6: sides[5] ↔ sides[0]
 *
 * Handshake passes if digit-sum(sideN) % 16 == digit-sum(sideN+1) % 16.
 * Failed handshake → thorax_phalanx({action:"enqueue", channel_id, reason:"handshake_failed"})
 *   (actual phalanx enqueue is performed by the MCP tool wrapper in server.ts).
 *
 * triangle_agreement: triangle-A position (sha256 of a0+a1+a2) must agree with
 * triangle-B position (sha256 of b0+b1+b2) — error-correcting cross-check.
 */
export function substrate_address_validate(address: string): ValidateResult {
  if (address.length !== 54 || !/^[0-9a-f]{54}$/.test(address)) {
    return {
      valid: false,
      handshakes: [false, false, false, false, false, false],
      phalanx_flags: [1, 2, 3, 4, 5, 6].map(ch => ({
        channel_id: ch,
        reason: "invalid_address_format",
      })),
      triangle_agreement: false,
      error_signal: `address must be 54 lowercase hex chars, got length=${address.length}`,
    };
  }

  const sides: string[] = [];
  for (let i = 0; i < 6; i++) {
    sides.push(address.slice(i * 9, (i + 1) * 9));
  }

  const sums = sides.map(hexNibbleSum);
  const handshakes: boolean[] = [];
  const phalanx_flags: PhalanxEntry[] = [];

  for (let ch = 0; ch < 6; ch++) {
    const pass = (sums[ch] % 16) === (sums[(ch + 1) % 6] % 16);
    handshakes.push(pass);
    if (!pass) {
      phalanx_flags.push({ channel_id: ch + 1, reason: "handshake_failed" });
    }
  }

  // Triangle-A vs Triangle-B cross-check: sum of triangle-A sides must equal
  // sum of triangle-B sides (mod 16) — structural agreement check.
  const sumA = (sums[0] + sums[2] + sums[4]) % 16;
  const sumB = (sums[1] + sums[3] + sums[5]) % 16;
  const triangle_agreement = sumA === sumB;
  const error_signal = triangle_agreement
    ? undefined
    : `triangle-A sum%16=${sumA} disagrees with triangle-B sum%16=${sumB}`;

  const valid = phalanx_flags.length === 0 && triangle_agreement;

  return { valid, handshakes, phalanx_flags, triangle_agreement, error_signal };
}

// ─── Generator helpers (for testing) ─────────────────────────────────────────

/**
 * gen_coord_with_sum — generate a 9-hex-digit coordinate whose digit-sum % 16
 * equals target_mod16. Uses a provided rng (returns [0,1)).
 */
export function gen_coord_with_sum(target_mod16: number, rng: () => number): string {
  const digits: number[] = [];
  let running = 0;
  for (let i = 0; i < 8; i++) {
    const d = Math.floor(rng() * 16);
    digits.push(d);
    running += d;
  }
  const last = ((target_mod16 - (running % 16)) + 16) % 16;
  digits.push(last);
  return digits.map(d => d.toString(16)).join("");
}

/**
 * gen_valid_address — generate a valid 216-bit address deterministically.
 * All 6 sides share the same digit-sum mod 16 (S), ensuring all 6 handshakes pass.
 * S is derived from the first rng call.
 */
export function gen_valid_address(rng: () => number): SubstrateAddressResult {
  const target = Math.floor(rng() * 16);
  const coords: string[] = [];
  for (let i = 0; i < 6; i++) {
    coords.push(gen_coord_with_sum(target, rng));
  }
  return substrate_address_emit(
    [coords[0], coords[2], coords[4]],
    [coords[1], coords[3], coords[5]],
  );
}

/**
 * corrupt_address — flip a few hex digits to create an invalid address.
 * Guaranteed to change at least one digit-sum, breaking at least one handshake.
 */
export function corrupt_address(address: string, rng: () => number): string {
  const chars = address.split("");
  // Corrupt position in first side (chars 0-8): change digit to a different value
  const pos = Math.floor(rng() * 9);
  const orig = parseInt(chars[pos], 16);
  const replacement = (orig + 1 + Math.floor(rng() * 14)) % 16;
  chars[pos] = replacement.toString(16);
  return chars.join("");
}
