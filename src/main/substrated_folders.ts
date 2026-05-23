/**
 * CAI™ Core — Substrated Folders Manager
 * v0.1.8 · KniPr006
 *
 * Substrated folders are user-designated directories that CAI™ Core mines for
 * context. Only Substrated folders are read — non-substrated folders are
 * invisible to CAI™ Core (Library-of-Congress discipline: files are never
 * modified, only read; deleted-source Eblet™ records are preserved with
 * source_deleted: true).
 *
 * Storage: ~/.cai_core/substrated_folders.json (simple JSON array of abs paths)
 * IPC channels:
 *   cai-core:add-substrated-folder(path) → { ok, paths }
 *   cai-core:remove-substrated-folder(path) → { ok, paths }
 *   cai-core:list-substrated-folders() → string[]
 *
 * File watcher: native fs.watch (recursive) — writes Eblet™ records to the
 * CaithedralLocalIndex on new/changed files; marks source_deleted on deletion.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  watch,
  stat,
  statSync,
} from 'fs';
import { resolve, join, relative } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';
import type { CaithedralLocalIndex } from '../caithedral/index.js';

// ─── Constants ─────────────────────────────────────────────────────────────────

const CAI_CORE_HOME =
  process.env.CAI_CORE_HOME ?? resolve(homedir(), '.cai_core');

const FOLDERS_PATH = join(CAI_CORE_HOME, 'substrated_folders.json');
const EBLET_LEDGER_PATH = join(CAI_CORE_HOME, 'substrated_eblet_ledger.jsonl');

// Max content excerpt length stored in Eblet™ body
const MAX_EXCERPT_BYTES = 4096;

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SubstratedEbletRecord {
  id: string;
  source_path: string;
  sha256: string;
  excerpt: string;
  created_at: string;
  updated_at: string;
  source_deleted: boolean;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

function ensureHome(): void {
  if (!existsSync(CAI_CORE_HOME)) mkdirSync(CAI_CORE_HOME, { recursive: true });
}

function loadFolderList(): string[] {
  ensureHome();
  if (!existsSync(FOLDERS_PATH)) return [];
  try {
    const raw = readFileSync(FOLDERS_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveFolderList(paths: string[]): void {
  ensureHome();
  writeFileSync(FOLDERS_PATH, JSON.stringify(paths, null, 2), 'utf-8');
}

// ─── Eblet™ record helpers ────────────────────────────────────────────────────

function makeEbletId(filePath: string): string {
  return 'sf_' + createHash('sha256').update(filePath).digest('hex').slice(0, 24);
}

function fileToExcerpt(filePath: string): { sha256: string; excerpt: string } | null {
  try {
    const content = readFileSync(filePath);
    const sha256 = createHash('sha256').update(content).digest('hex');
    const text = content.slice(0, MAX_EXCERPT_BYTES).toString('utf-8');
    return { sha256, excerpt: text };
  } catch {
    return null;
  }
}

function appendLedgerRow(row: SubstratedEbletRecord): void {
  ensureHome();
  const line = JSON.stringify(row) + '\n';
  const fs = require('fs') as typeof import('fs');
  fs.appendFileSync(EBLET_LEDGER_PATH, line, 'utf-8');
}

// ─── Watcher state ────────────────────────────────────────────────────────────

const activeWatchers = new Map<string, ReturnType<typeof watch>>();
const ebletIndex = new Map<string, SubstratedEbletRecord>();

function upsertEblet(
  filePath: string,
  caithedralIndex: CaithedralLocalIndex | null,
): void {
  const id = makeEbletId(filePath);
  const fileData = fileToExcerpt(filePath);
  if (!fileData) return;

  const now = new Date().toISOString();
  const existing = ebletIndex.get(id);

  if (existing && existing.sha256 === fileData.sha256) return; // no change

  const record: SubstratedEbletRecord = {
    id,
    source_path: filePath,
    sha256: fileData.sha256,
    excerpt: fileData.excerpt,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    source_deleted: false,
  };

  ebletIndex.set(id, record);
  appendLedgerRow(record);

  // Write into Caithedral™ index if available
  if (caithedralIndex) {
    caithedralIndex.writeRecord({
      id,
      text: fileData.excerpt,
      source: `substrated:${filePath}`,
      keywords: caithedralIndex.extractKeywords(fileData.excerpt),
      ts: now,
    });
  }
}

function markDeleted(filePath: string): void {
  const id = makeEbletId(filePath);
  const existing = ebletIndex.get(id);
  if (!existing) return;

  const updated: SubstratedEbletRecord = {
    ...existing,
    source_deleted: true,
    updated_at: new Date().toISOString(),
  };
  ebletIndex.set(id, updated);
  appendLedgerRow(updated);
}

// Text-like file extensions to index
const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp',
  '.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.xml', '.html', '.htm',
  '.css', '.scss', '.sass', '.less',
  '.sh', '.bash', '.zsh', '.fish',
  '.sql', '.graphql',
  '.env.example', // .env files excluded per secrets hygiene
]);

function isIndexable(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  // Never index secret-adjacent files
  if (lower.endsWith('.env') || lower.endsWith('.key') || lower.endsWith('.pem')) return false;
  if (lower.includes('node_modules')) return false;
  if (lower.includes('.git/')) return false;

  const dot = filePath.lastIndexOf('.');
  if (dot < 0) return false;
  return TEXT_EXTENSIONS.has(filePath.slice(dot).toLowerCase());
}

function initFolderWatch(
  folderPath: string,
  caithedralIndex: CaithedralLocalIndex | null,
): void {
  if (activeWatchers.has(folderPath)) return;
  if (!existsSync(folderPath)) return;

  let debounce: ReturnType<typeof setTimeout>;
  try {
    const watcher = watch(folderPath, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const full = join(folderPath, filename);
        if (!isIndexable(full)) return;
        if (existsSync(full)) {
          upsertEblet(full, caithedralIndex);
        } else {
          markDeleted(full);
        }
      }, 200);
    });

    activeWatchers.set(folderPath, watcher);
    console.log(`[SubstratedFolders] Watching: ${folderPath}`);
  } catch (err) {
    console.warn(`[SubstratedFolders] Watch failed for ${folderPath}:`, err);
  }
}

function stopFolderWatch(folderPath: string): void {
  const w = activeWatchers.get(folderPath);
  if (w) {
    try { w.close(); } catch { /* non-fatal */ }
    activeWatchers.delete(folderPath);
    console.log(`[SubstratedFolders] Stopped watching: ${folderPath}`);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export class SubstratedFoldersManager {
  private folders: string[];
  private caithedralIndex: CaithedralLocalIndex | null = null;

  constructor() {
    this.folders = loadFolderList();
  }

  setIndex(idx: CaithedralLocalIndex): void {
    this.caithedralIndex = idx;
  }

  /** Start watching all persisted folders (called at app init). */
  startAll(): void {
    for (const f of this.folders) {
      initFolderWatch(f, this.caithedralIndex);
    }
  }

  list(): string[] {
    return [...this.folders];
  }

  add(folderPath: string): { ok: boolean; paths: string[] } {
    const abs = resolve(folderPath);
    if (this.folders.includes(abs)) return { ok: true, paths: this.folders };
    this.folders.push(abs);
    saveFolderList(this.folders);
    initFolderWatch(abs, this.caithedralIndex);
    console.log(`[SubstratedFolders] Added: ${abs}`);
    return { ok: true, paths: [...this.folders] };
  }

  remove(folderPath: string): { ok: boolean; paths: string[] } {
    const abs = resolve(folderPath);
    const before = this.folders.length;
    this.folders = this.folders.filter((f) => f !== abs);
    if (this.folders.length !== before) {
      saveFolderList(this.folders);
      stopFolderWatch(abs);
    }
    return { ok: true, paths: [...this.folders] };
  }

  /** Manifest: list of all Eblet™ IDs + sha256 hashes (no body content). */
  getManifest(): Array<{ id: string; source_path: string; sha256: string; source_deleted: boolean; updated_at: string }> {
    return Array.from(ebletIndex.values()).map(({ id, source_path, sha256, source_deleted, updated_at }) => ({
      id,
      source_path,
      sha256,
      source_deleted,
      updated_at,
    }));
  }

  stopAll(): void {
    for (const f of this.folders) stopFolderWatch(f);
  }
}
