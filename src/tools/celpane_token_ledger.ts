/**
 * Celpane Token Ledger — THE ACCUMULATOR — caithedral-core D-BP158-008
 *
 * D-BP158-008 / BISHOP / seg-wire-celpane-emitter-and-accumulator
 *
 * D-BP158-011 / BISHOP / seg-eblet-todo-ledger ADDENDUM (this pass):
 * Founder ruling, verbatim: "Yes fix to be eblets. Always." The estate's own
 * cost instrument was the one record that was not an eblet -- raw JSONL only,
 * no chrono tag beyond `ts`, no hex connector, unreadable as doctrine by
 * anything that walks the KEEPER/eblet substrate. This pass adds
 * `emitMeasurementEblet()`, called from `measureAndRecord()`, which writes
 * one `.eblet.md` file per measurement (real schema, verified against
 * `HARDWIRE\LEDGER\EBLETS\D-BP148-*.eblet.md` and
 * `Asteroid-ProofVault\state\eblets\CANON\*.eblet.md` before a single line
 * was written here -- YAML frontmatter with name/description/metadata, a
 * `# ... EBLET` markdown body, a chrono tag, a SOURCES section) into a new
 * sibling directory, `<resolveCrystalDir()>\celpane_token_ledger_eblets\`.
 * The raw JSONL append is UNCHANGED and kept running in parallel -- it is
 * downgraded in role from "the record" to a fast machine-readable index
 * that `readLedger()`/`summarizeLedger()` still read, per HARDWIRE-26
 * (reuse what exists) and to avoid breaking `keyhole_celpane_mint_and_measure_twelve.mjs`,
 * the only external caller found (it calls `measureAndRecord` only, never
 * touches the JSONL file directly). The eblet file is the canonical,
 * doctrine-legible record from this pass forward; the JSONL is a derived
 * cache of it. This role-swap is an INFERRED design choice by this SEG, not
 * a literal Founder instruction on JSONL retention -- flagged for Founder
 * review in the D-BP158-011 return.
 *
 * Phase 0 (D-BP158-007) found the real measuring code that produced the
 * Founder-cited numbers (2994->121, 5642->146, 4535->157 tokens, real
 * tiktoken cl100k_base) buried inside two one-off, manually-invoked
 * librarian-mcp/scripts/*.mjs files with the actual token counting done by
 * a THIRD file, librarian-mcp/scripts/seg_return_celpane_tiktoken_count.py
 * (function: the module-level script body, `enc.encode(...)` calls at its
 * lines 45-46). That script only ever counted 3 hardcoded SEG reports off
 * a manifest written by its caller, and its own result file
 * (.seg_celpane_scratch/measure_results.json) is OVERWRITTEN on every run
 * -- a measurement that prints once and vanishes, exactly the gap this
 * ticket was told to close.
 *
 * This module generalizes that measuring code (same tokenizer, same
 * "never estimate from character counts" discipline) into a reusable
 * function ANY celpane mint or fetch can call on itself, and makes the
 * result APPEND rather than overwrite, so the record accumulates across
 * calls, across sessions, across process restarts.
 *
 * PERSISTENCE: the ledger is a JSONL file living in the same durable
 * directory this estate's own Crystal log already uses --
 * `resolveCrystalDir()` (crystal_store.ts, D-BP147-006 Ruling 1: an
 * MNEM_CRYSTAL_DIR override, else %APPDATA%\MnemosyneC\crystal on
 * Windows, else a hard error -- never a silent cwd-relative fallback).
 * This is deliberate reuse of "the machinery we have," per instruction,
 * not a new persistence convention: the ledger sits as a sibling file,
 *   <resolveCrystalDir()>\celpane_token_ledger.jsonl
 * which on this machine resolves to
 *   %APPDATA%\MnemosyneC\crystal\celpane_token_ledger.jsonl
 * MEASURED (this ticket, D-BP158-008): that resolves to
 *   C:\Users\Administrator\AppData\Roaming\MnemosyneC\crystal\celpane_token_ledger.jsonl
 * It is durable (survives process death — same file, same directory, same
 * append-only discipline as crystal_log.jsonl) and shared (any process on
 * this machine that imports this module accumulates into the same file).
 *
 * HONEST CAVEAT: real tiktoken has no JS port among this package's
 * dependencies (confirmed absent, D-BP158-007 Phase-0 corroboration —
 * grep of package.json + src for tiktoken/gpt-tokenizer/js-tiktoken
 * returned nothing in either caithedral-core or librarian-mcp). This
 * module therefore shells out to a separate Python process running real
 * tiktoken (cl100k_base), exactly the division of labor
 * seg_return_celpane_measure_real_reports.mjs already used ("this Node
 * process ... hands off to a SEPARATE Python process running real
 * tiktoken to do the actual token counting"). That makes this module
 * unsuitable for a sub-second hot path, which is fine — it is a
 * measurement/accumulator leg, not the mint-time transparent-mode gate
 * (that gate already has its own fast chars/4 proxy in
 * seg_return_celpane.ts's estimateTokens(), unchanged by this file). If no
 * candidate Python interpreter has tiktoken importable, this throws
 * loudly rather than silently degrading to a character-count guess —
 * "a wrong cost number is the one lie this estate cannot afford."
 */
import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "fs";
import { join, resolve } from "path";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { resolveCrystalDir } from "./crystal_store";

// Candidates tried in order. The first (env override) lets a caller pin a
// known-good interpreter; the second is the interpreter Phase 0 confirmed
// has tiktoken 0.8.0 importable on this machine (MEASURED, D-BP158-007/008);
// the last two are generic fallbacks for other machines.
const PYTHON_CANDIDATES: string[] = [
  process.env.CELPANE_PYTHON,
  "C:\\Users\\Administrator\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe",
  "python3",
  "python",
].filter((p): p is string => !!p && p.trim() !== "");

// src/tools/celpane_token_ledger.ts compiles to dist/main/tools/celpane_token_ledger.js
// (tsconfig outDir "./dist/main", rootDir "./src") -- three levels up from there is the
// caithedral-core package root, where the scripts/ sibling directory lives.
const TIKTOKEN_COUNT_SCRIPT = resolve(__dirname, "..", "..", "..", "scripts", "celpane_tiktoken_count_pair.py");

export interface CelpaneTokenMeasurement {
  ts: string;
  label: string;
  original_tokens: number;
  wire_tokens: number;
  ratio_wire_over_original: number;
  savings_pct: number;
  tokenizer: "tiktoken_cl100k_base_real";
}

export interface CelpaneLedgerSummary {
  entries: number;
  total_original_tokens: number;
  total_wire_tokens: number;
  aggregate_ratio: number;
  aggregate_savings_pct: number;
  earliest: string | null;
  latest: string | null;
  ledger_path: string;
}

function ledgerPath(): string {
  const dir = resolveCrystalDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "celpane_token_ledger.jsonl");
}

function ebletDirPath(): string {
  const dir = join(resolveCrystalDir(), "celpane_token_ledger_eblets");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/** Filesystem-safe slug for a chrono tag or label, used only in filenames. */
function slugForFilename(s: string): string {
  return s.replace(/[:.]/g, "-").replace(/[^A-Za-z0-9_-]/g, "_");
}

/**
 * emitMeasurementEblet — writes one `.eblet.md` file per measurement.
 * Schema verified (D-BP158-011, before writing this function) against real
 * files on disk: `HARDWIRE\LEDGER\EBLETS\D-BP148-001.eblet.md`,
 * `HARDWIRE\LEDGER\EBLETS\D-BP148-007.eblet.md`, and
 * `Asteroid-ProofVault\state\eblets\CANON\canon_agreement_raises_confidence_it_does_not_terminate_adjudication_bp148.eblet.md`.
 * Common shape taken from those three: YAML frontmatter (`name`,
 * `description`, `metadata` block), then a markdown body opening with a
 * `# ... EBLET` / `## `id` -- TITLE` header pair, a chrono tag, a hex
 * connector cross-reference, and a `## SOURCES` section. This function is
 * NOT a byte-for-byte clone of either example (those are hand-authored
 * dispatch/canon narratives; this is a machine-emitted per-measurement
 * record) -- it follows the same frontmatter/section discipline at a scale
 * appropriate to one accumulator entry.
 */
function emitMeasurementEblet(
  measurement: CelpaneTokenMeasurement,
  opts: { migrated?: boolean } = {}
): string {
  const dir = ebletDirPath();
  const tsSlug = slugForFilename(measurement.ts);
  const labelSlug = slugForFilename(measurement.label);
  const filename = `${tsSlug}__${labelSlug}.eblet.md`;
  const filePath = join(dir, filename);
  const nameSlug = `celpane-token-ledger-${labelSlug.toLowerCase()}-${tsSlug.toLowerCase()}`;
  const migratedNote = opts.migrated
    ? " MIGRATED from legacy raw-JSONL-only storage by D-BP158-011; original measurement data preserved unchanged."
    : "";
  const description =
    `Celpane token-ledger measurement for label "${measurement.label}": ` +
    `${measurement.original_tokens} original tokens -> ${measurement.wire_tokens} wire tokens ` +
    `(${measurement.savings_pct}% savings, real ${measurement.tokenizer}).${migratedNote}`;

  const frontmatter = [
    "---",
    `name: ${nameSlug}`,
    `description: "${description.replace(/"/g, '\\"')}"`,
    "metadata:",
    "  type: measurement",
    `  chrono: "${measurement.ts}"`,
    "  hex_connector: PROOF",
    `  migrated: ${opts.migrated ? "true" : "false"}`,
    "---",
    "",
  ].join("\n");

  const body = [
    "# CELPANE TOKEN LEDGER EBLET",
    `## \`${measurement.label}\` -- ${measurement.ts}`,
    "",
    `**Chrono tag:** ${measurement.ts}`,
    "**Hex connector:** PROOF (`keeper_proof_and_measurement.md` -- cascade/plow measurement discipline, MMLU-Pro receipts, rooting rule)",
    `**Migrated from legacy JSONL:** ${opts.migrated ? "YES" : "no"}`,
    "",
    "## MEASUREMENT",
    "",
    `- **label:** \`${measurement.label}\``,
    `- **original_tokens:** ${measurement.original_tokens}`,
    `- **wire_tokens:** ${measurement.wire_tokens}`,
    `- **ratio_wire_over_original:** ${measurement.ratio_wire_over_original}`,
    `- **savings_pct:** ${measurement.savings_pct}`,
    `- **tokenizer:** ${measurement.tokenizer} (real tiktoken cl100k_base, never a chars/4 estimate)`,
    "",
    "## SOURCES",
    "",
    "- `C:\\Users\\Administrator\\Documents\\LianaBanyanPlatform\\caithedral-core\\src\\tools\\celpane_token_ledger.ts` -- `measureAndRecord()` / `emitMeasurementEblet()`, the accumulator that produced this record.",
    "- Parallel raw index (derived, not canonical as of D-BP158-011): `<resolveCrystalDir()>\\celpane_token_ledger.jsonl`.",
    opts.migrated
      ? "- This record's original form: a raw JSONL line in the pre-D-BP158-011 ledger, migrated verbatim (all fields preserved) rather than discarded."
      : "- This record was emitted directly as an eblet at measurement time (post D-BP158-011).",
    "",
    "---",
    "",
    "*Filed D-BP158-011 · Bishop · Sonnet 5 · accumulator auto-emission, not hand-authored narrative.*",
    "",
  ].join("\n");

  writeFileSync(filePath, frontmatter + body, "utf-8");
  return filePath;
}

/**
 * migrateLegacyJsonlEntriesToEblets — one-time (idempotent) backfill: for
 * every measurement already in the raw JSONL ledger that does not yet have
 * a corresponding eblet file on disk, emit one now via `emitMeasurementEblet`
 * with `migrated: true`. Never discards or rewrites the JSONL. Safe to call
 * more than once -- re-checks the eblet directory each time and only emits
 * for entries still missing.
 */
export function migrateLegacyJsonlEntriesToEblets(): { migrated: number; alreadyPresent: number; paths: string[] } {
  const all = readLedger();
  const dir = ebletDirPath();
  let migrated = 0;
  let alreadyPresent = 0;
  const paths: string[] = [];
  for (const m of all) {
    const tsSlug = slugForFilename(m.ts);
    const labelSlug = slugForFilename(m.label);
    const expected = join(dir, `${tsSlug}__${labelSlug}.eblet.md`);
    if (existsSync(expected)) {
      alreadyPresent++;
      continue;
    }
    const p = emitMeasurementEblet(m, { migrated: true });
    paths.push(p);
    migrated++;
  }
  return { migrated, alreadyPresent, paths };
}

function runPythonPairCount(originalPath: string, wirePath: string): { original_tokens: number; wire_tokens: number } {
  const errors: string[] = [];
  for (const py of PYTHON_CANDIDATES) {
    try {
      const out = execFileSync(py, [TIKTOKEN_COUNT_SCRIPT, originalPath, wirePath], { encoding: "utf-8" });
      const lastLine = out.trim().split("\n").pop() as string;
      const parsed = JSON.parse(lastLine);
      if (parsed && typeof parsed.original_tokens === "number" && typeof parsed.wire_tokens === "number") {
        return { original_tokens: parsed.original_tokens, wire_tokens: parsed.wire_tokens };
      }
      errors.push(`${py}: ${parsed?.error ?? "unexpected output: " + out}`);
    } catch (e) {
      errors.push(`${py}: ${(e as Error).message}`);
    }
  }
  throw new Error(
    `[celpane_token_ledger] could not get a REAL tiktoken count from any candidate Python ` +
    `interpreter. Refusing to fall back to a chars/4 estimate for this accumulator -- a wrong ` +
    `cost number is the one lie this estate cannot afford. Attempts:\n  ${errors.join("\n  ")}`
  );
}

/**
 * measureAndRecord — the Accumulator's one entry point.
 *
 * Given the original (full) text and the wire (celpane) text for one
 * mint/fetch exchange, gets REAL tiktoken counts (never estimates),
 * APPENDS the measurement to the persistent ledger (never overwrites —
 * this is the fix for "prints once and vanishes"), and returns both the
 * single measurement and the running accumulated totals so a caller never
 * needs a second call to see the accumulation take effect.
 */
export function measureAndRecord(
  label: string,
  originalText: string,
  wireText: string
): { measurement: CelpaneTokenMeasurement; running_summary: CelpaneLedgerSummary } {
  const scratchDir = mkdtempSync(join(tmpdir(), "celpane_ledger_"));
  try {
    const originalPath = join(scratchDir, "original.txt");
    const wirePath = join(scratchDir, "wire.txt");
    writeFileSync(originalPath, originalText, "utf-8");
    writeFileSync(wirePath, wireText, "utf-8");

    const { original_tokens, wire_tokens } = runPythonPairCount(originalPath, wirePath);
    const ratio = original_tokens > 0 ? wire_tokens / original_tokens : 0;
    const measurement: CelpaneTokenMeasurement = {
      ts: new Date().toISOString(),
      label,
      original_tokens,
      wire_tokens,
      ratio_wire_over_original: ratio,
      savings_pct: Math.round((1 - ratio) * 10000) / 100,
      tokenizer: "tiktoken_cl100k_base_real",
    };

    appendFileSync(ledgerPath(), JSON.stringify(measurement) + "\n", "utf-8");
    emitMeasurementEblet(measurement, { migrated: false });
    return { measurement, running_summary: summarizeLedger() };
  } finally {
    try {
      rmSync(scratchDir, { recursive: true, force: true });
    } catch {
      /* best-effort scratch cleanup; the ledger append already landed */
    }
  }
}

/** readLedger — every measurement ever accumulated, oldest first. */
export function readLedger(): CelpaneTokenMeasurement[] {
  const p = ledgerPath();
  if (!existsSync(p)) return [];
  const raw = readFileSync(p, "utf-8").trim();
  if (!raw) return [];
  return raw.split("\n").map((l) => JSON.parse(l) as CelpaneTokenMeasurement);
}

/** summarizeLedger — running totals across every accumulated measurement. */
export function summarizeLedger(): CelpaneLedgerSummary {
  const all = readLedger();
  const path = ledgerPath();
  if (all.length === 0) {
    return {
      entries: 0,
      total_original_tokens: 0,
      total_wire_tokens: 0,
      aggregate_ratio: 0,
      aggregate_savings_pct: 0,
      earliest: null,
      latest: null,
      ledger_path: path,
    };
  }
  const total_original_tokens = all.reduce((s, r) => s + r.original_tokens, 0);
  const total_wire_tokens = all.reduce((s, r) => s + r.wire_tokens, 0);
  const aggregate_ratio = total_original_tokens > 0 ? total_wire_tokens / total_original_tokens : 0;
  return {
    entries: all.length,
    total_original_tokens,
    total_wire_tokens,
    aggregate_ratio,
    aggregate_savings_pct: Math.round((1 - aggregate_ratio) * 10000) / 100,
    earliest: all[0].ts,
    latest: all[all.length - 1].ts,
    ledger_path: path,
  };
}

export function ledgerFilePath(): string {
  return ledgerPath();
}
